/*
 * @Author      : Rafli
 * @Feature     : Register, Unregister & Serial Number Verification
 * @Description : Sistem pendaftaran akun terpusat (Nama & Umur/Tgl Lahir), serial number unik, dan update limit pendaftaran.
 * @Version     : 3.0 (Age Mandatory in .daftar, Increased Limits & Clean Format)
 */

import moment from 'moment-timezone'
import { createHash, randomBytes } from 'crypto'
import { sendButtons } from '../function/media/button.js'

const DATE_FORMATS = [
    'DD-MM-YYYY', 'D-M-YYYY',
    'DD/MM/YYYY', 'D/M/YYYY',
    'DD.MM.YYYY', 'D.M.YYYY',
    'YYYY-MM-DD', 'YYYY/MM/DD',
    'DDMMYYYY',
    'DD-MMMM-YYYY', 'D-MMMM-YYYY',
    'DD MMMM YYYY', 'D MMMM YYYY',
    'DD-MMM-YYYY',  'D-MMM-YYYY',
    'DD MMM YYYY',  'D MMM YYYY',
]

function isSNExists(sn) {
    if (!sn) return false
    const upperSN = sn.toUpperCase()
    for (const u of Object.values(global.db?.data?.users || {})) {
        if (u?.sn && u.sn.toUpperCase() === upperSN) return true
    }
    try {
        if (global.sqlite && global.sqlite.open) {
            const row = global.sqlite.prepare('SELECT jid FROM users WHERE data LIKE ? LIMIT 1').get(`%"sn":"${upperSN}"%`)
            if (row) return true
        }
    } catch {}
    return false
}

function generateSN(jid) {
    let sn = ''
    do {
        const entropy = `${jid}_${Date.now()}_${process.hrtime.bigint()}_${randomBytes(16).toString('hex')}`
        sn = createHash('sha256')
            .update(entropy)
            .digest('hex')
            .slice(0, 16)
            .toUpperCase()
    } while (isSNExists(sn))
    return sn
}

function extractNameAndDate(rawText) {
    if (!rawText) return null
    const text = rawText.trim()

    // 1. Pemisah eksplisit (| , /)
    if (text.includes('|')) {
        const [n, ...d] = text.split('|')
        return { name: n.trim(), dateStr: d.join('|').trim() }
    }
    if (text.includes(',')) {
        const [n, ...d] = text.split(',')
        return { name: n.trim(), dateStr: d.join(',').trim() }
    }

    // 2. Pemisah titik jika setelah titik adalah angka tanggal atau umur (misal Rafli.18 atau Rafli.14-06-2006)
    const dotMatch = text.match(/^(.+?)\s*\.\s*(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}|\d{8}|\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{1,3})$/)
    if (dotMatch) {
        return { name: dotMatch[1].trim(), dateStr: dotMatch[2].trim() }
    }

    // 3. Pemisah spasi sebelum pola tanggal atau umur (misal Rafli 18 atau Rafli 14-06-2006)
    const spaceMatch = text.match(/^(.+?)\s+(\d{1,2}[\-\/\.]\d{1,2}[\-\/\.]\d{2,4}|\d{8}|\d{1,2}\s+[a-zA-Z]+\s+\d{4}|\d{1,3})$/)
    if (spaceMatch) {
        return { name: spaceMatch[1].trim(), dateStr: spaceMatch[2].trim() }
    }

    return null
}

function parseBirthDateOrAge(input) {
    if (!input) return null
    const clean = input.trim()

    // Jika input berupa angka umur langsung (misal "18" atau "25")
    if (/^\d{1,3}$/.test(clean)) {
        const ageNum = parseInt(clean, 10)
        if (ageNum < 5 || ageNum > 100) {
            return { error: `Umur (${ageNum} tahun) di luar batas wajar (5–100 tahun).` }
        }
        const now = moment().tz('Asia/Jakarta')
        const estimatedBirth = now.clone().subtract(ageNum, 'years').startOf('year')
        return {
            birthDate: estimatedBirth,
            age: ageNum,
            isAgeOnly: true
        }
    }

    // Jika input berupa format tanggal lahir lengkap
    moment.locale('id')
    let parsed = null
    for (const fmt of DATE_FORMATS) {
        const p = moment(clean, fmt, 'id', true).tz('Asia/Jakarta')
        if (p.isValid()) {
            parsed = p
            break
        }
    }
    if (!parsed) {
        const fallback = moment(clean, DATE_FORMATS, 'id', false).tz('Asia/Jakarta')
        if (fallback.isValid()) parsed = fallback
    }

    if (!parsed || !parsed.isValid()) return null

    const now = moment().tz('Asia/Jakarta')
    if (parsed.isAfter(now)) {
        return { error: 'Tanggal lahir tidak boleh berada di masa depan.' }
    }

    const calculatedAge = now.diff(parsed, 'years')
    if (calculatedAge < 5 || calculatedAge > 100) {
        return { error: `Umur terhitung (${calculatedAge} tahun) di luar batas wajar (5–100 tahun). Pastikan tahun lahir sudah benar.` }
    }

    return {
        birthDate: parsed,
        age: calculatedAge,
        isAgeOnly: false
    }
}

function getPhoneNumber(conn, jid) {
    if (!jid) return ''
    if (jid.endsWith('@s.whatsapp.net')) return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
    if (conn.storeNumber?.[jid]) return conn.storeNumber[jid].replace(/[^0-9]/g, '')
    if (conn.storeLid?.[jid]) return conn.storeLid[jid].replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')

    try {
        if (global.sqlite && global.sqlite.open) {
            const row = global.sqlite.prepare('SELECT pn FROM storeLid WHERE lid = ? LIMIT 1').get(jid)
            if (row?.pn) return row.pn.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
        }
    } catch {}

    const num = conn.getNumber?.(jid)
    if (num && !num.endsWith('@lid') && /^\d{5,}$/.test(num)) return num.replace(/[^0-9]/g, '')

    return jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
}

function resolveUserAndKey(m, conn) {
    const sender = m.sender
    let targetKey = sender
    let pnJid = ''

    if (sender.endsWith('@lid')) {
        if (conn.storeLid?.[sender]) {
            pnJid = conn.storeLid[sender]
        } else {
            try {
                const resolved = conn.getLidPN?.(sender)
                if (resolved && resolved.endsWith('@s.whatsapp.net')) pnJid = resolved
            } catch {}
        }
    } else {
        pnJid = sender
        if (conn.storeLid?.[sender]) {
            targetKey = conn.storeLid[sender]
        } else if (conn.getLid) {
            const l = conn.getLid(sender)
            if (l && l.endsWith('@lid')) targetKey = l
        }
    }

    const phone = getPhoneNumber(conn, sender) || (pnJid ? pnJid.replace(/[^0-9]/g, '') : sender.replace(/[^0-9]/g, ''))

    let user = global.db?.data?.users?.[targetKey] || global.db?.data?.users?.[sender] || (pnJid ? global.db?.data?.users?.[pnJid] : null)
    if (!user || typeof user !== 'object') {
        if (!global.db.data.users) global.db.data.users = {}
        global.db.data.users[targetKey] = {}
        user = global.db.data.users[targetKey]
    }

    return { user, targetKey, sender, pnJid, phone }
}

const DATE_HINT =
    `*Format Umur / Tanggal Lahir yang didukung:*\n` +
    `• Angka Umur Langsung: \`18\`, \`20\`, \`25\`\n` +
    `• Tanggal Lengkap: \`14-06-2006\`, \`14/06/2006\`, \`14.06.2006\`, \`14 Juni 2006\``

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const { user, targetKey, sender, pnJid, phone } = resolveUserAndKey(m, conn)
    const rawNumber = phone || sender.replace(/[^0-9]/g, '')

    // ── CEK SERIAL NUMBER (SN) ────────────────────────────────────────────────
    if (/^(ceksn|mysn|sn)$/i.test(command)) {
        if (!user.register) {
            return m.reply(
                `╭── ✦ *SERIAL NUMBER* ✦\n` +
                `• Kamu belum terdaftar.\n` +
                `• Daftar terlebih dahulu dengan:\n` +
                `  \`${usedPrefix}daftar <nama> | <umur / tgl lahir>\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
        if (!user.sn) {
            user.sn = generateSN(targetKey)
            global.saveData('users', targetKey)
        }

        const snText =
            `╭── ✦ *SERIAL NUMBER AKUN* ✦\n` +
            `• *Nama:* ${user.name}\n` +
            `• *Umur:* ${user.age} Tahun\n` +
            `• *SN:* \`${user.sn}\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`

        const buttons = [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Salin SN',
                    copy_code: user.sn
                })
            }
        ]

        try {
            return await sendButtons(conn, m.chat, {
                text: snText,
                footer: 'Joy WhatsApp Bot',
                buttons
            }, { quoted: m })
        } catch {
            return m.reply(snText)
        }
    }

    // ── UNREGISTER ────────────────────────────────────────────────────────────
    if (/^(unreg|unregister|hapusakun|logout)$/i.test(command)) {
        if (!user.register) {
            return m.reply(
                `╭── ✦ *HAPUS AKUN* ✦\n` +
                `• Kamu belum terdaftar.\n` +
                `• Daftar dengan: \`${usedPrefix}daftar <nama> | <umur / tgl lahir>\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        // Unreg cepat menggunakan Serial Number: .unreg <SN>
        if (text && text.trim()) {
            const inputSN = text.trim().toUpperCase()
            if (user.sn && inputSN === user.sn.toUpperCase()) {
                const oldName = user.name
                const wasPrem = user.premium === true

                Object.assign(user, {
                    name: '', birthdate: '', age: -1,
                    register: false, regTime: -1, sn: '',
                    premium: false, premiumDate: -1,
                    exp: 0, level: 0,
                    limit: 25
                })

                global.saveData('users', targetKey)
                if (targetKey !== sender) global.saveData('users', sender)

                return m.reply(
                    `╭── ✦ *AKUN BERHASIL DIHAPUS* ✦\n` +
                    `• Akun atas nama *${oldName}* telah direset.\n` +
                    (wasPrem ? `• Akses premium telah dinonaktifkan.\n` : '') +
                    `• Kamu dapat mendaftar kembali kapan saja dengan \`${usedPrefix}daftar\`.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
            } else {
                return m.reply(`*Serial Number salah!* Ketik \`${usedPrefix}ceksn\` untuk melihat SN kamu.`)
            }
        }

        // Unreg interaktif dengan konfirmasi Y / N
        if (!conn.unregConfirm) conn.unregConfirm = new Map()

        if (!conn.unregConfirm.has(sender)) {
            conn.unregConfirm.set(sender, {
                targetKey,
                timeout: setTimeout(() => {
                    conn.unregConfirm?.delete(sender)
                }, 60000)
            })

            return m.reply(
                `╭── ✦ *KONFIRMASI HAPUS AKUN* ✦\n` +
                `• *Nama:* ${user.name}\n` +
                `• *Tanggal Lahir:* ${user.birthdate || '-'}\n` +
                `• *Umur:* ${user.age} Tahun\n` +
                `• *Status:* ${user.premium ? '⭐ Premium' : 'Standar'}\n` +
                `• *SN:* \`${user.sn || '-'}\`\n\n` +
                `• Balas *Y* untuk melanjutkan penghapusan akun.\n` +
                `• Balas *N* untuk membatalkan.\n` +
                `• _Waktu konfirmasi: 60 detik_\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const session = conn.unregConfirm.get(sender)
        clearTimeout(session.timeout)
        conn.unregConfirm.delete(sender)
        return m.reply('Penghapusan akun dibatalkan.')
    }

    // ── REGISTER ──────────────────────────────────────────────────────────────
    if (user.register) {
        return m.reply(
            `╭── ✦ *STATUS PENDAFTARAN* ✦\n` +
            `• Kamu sudah terdaftar!\n` +
            `• *Nama:* ${user.name}\n` +
            `• *Umur:* ${user.age} Tahun\n` +
            `• *Tanggal Lahir:* ${user.birthdate || '-'}\n` +
            `• *SN:* \`${user.sn || '-'}\`\n\n` +
            `• Gunakan \`${usedPrefix}unreg\` jika ingin mendaftar ulang.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (!text || !text.trim()) {
        return m.reply(
            `╭── ✦ *FORMULIR PENDAFTARAN AKUN* ✦\n` +
            `• Daftarkan akun & umurmu untuk membuka akses penuh seluruh fitur bot.\n\n` +
            `• *Format:* \`${usedPrefix + command} <nama> | <umur / tgl lahir>\`\n\n` +
            `• *Contoh Penggunaan:*\n` +
            `  › \`${usedPrefix + command} Rafli | 18\`\n` +
            `  › \`${usedPrefix + command} Rafli | 14-06-2006\`\n` +
            `  › \`${usedPrefix + command} Rafli.18\`\n` +
            `  › \`${usedPrefix + command} Rafli.14/06/2006\`\n` +
            `  › \`${usedPrefix + command} Rafli 14 Juni 2006\`\n\n` +
            `• *Bonus Langsung:*\n` +
            `  › +50 Limit Pengguna\n` +
            `  › +2.500 EXP (Level 1)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const parsedInput = extractNameAndDate(text)
    if (!parsedInput || !parsedInput.name || !parsedInput.dateStr) {
        return m.reply(
            `╭── ✦ *FORMAT PENDAFTARAN SALAH* ✦\n` +
            `• Gunakan format: \`${usedPrefix + command} <nama> | <umur / tgl lahir>\`\n` +
            `• Contoh: \`${usedPrefix + command} Rafli | 18\` atau \`${usedPrefix + command} Rafli | 14-06-2006\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const cleanName = parsedInput.name.replace(/[\r\n\t]+/g, ' ').trim()
    if (cleanName.length < 3 || cleanName.length > 30) {
        return m.reply('Nama harus memiliki panjang antara 3 sampai 30 karakter.')
    }

    if (/^[0-9]+$/.test(cleanName)) {
        return m.reply('Nama tidak boleh hanya berisi angka.')
    }

    const birthData = parseBirthDateOrAge(parsedInput.dateStr)
    if (!birthData) {
        return m.reply(`Format umur / tanggal lahir tidak valid!\n\n${DATE_HINT}`)
    }

    if (birthData.error) {
        return m.reply(birthData.error)
    }

    const sn = generateSN(targetKey)
    const { birthDate, age } = birthData

    // Simpan data pendaftaran baru & berikan bonus limit 50
    user.name      = cleanName
    user.birthdate = birthDate.format('DD-MM-YYYY')
    user.age       = age
    user.register  = true
    user.regTime   = Date.now()
    user.sn        = sn
    user.limit       = 50
    user.exp         = 2500
    user.level       = 1
    user.money       = 50
    user.badge       = '🌱 Early Adventurer'
    user.badgeExpire = -1

    global.saveData('users', targetKey)
    if (targetKey !== sender) global.saveData('users', sender)

    const formattedDate = birthDate.format('DD MMMM YYYY')

    const successMessage =
        `╭── ✦ *PENDAFTARAN BERHASIL* ✦\n` +
        `• Selamat datang di Joy, *${cleanName}*!\n\n` +
        `• *Data Akun:*\n` +
        `  › *Nama:* ${cleanName}\n` +
        `  › *Umur:* ${age} Tahun\n` +
        `  › *Tanggal Lahir:* ${formattedDate}\n` +
        `  › *Nomor:* +${rawNumber}\n` +
        `  › *Serial Number (SN):* \`${sn}\`\n\n` +
        `• *Bonus Petualang Baru:*\n` +
        `  › *Limit:* 50 Limit\n` +
        `  › *EXP:* 2.500 EXP (Level 1)\n` +
        `  › *Koin Awal:* 50 Perunggu\n` +
        `  › *Lencana Awal:* 🌱 Early Adventurer (Permanen)\n\n` +
        `• Ketik \`${usedPrefix}menu\` untuk mulai menggunakan bot.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`

    const buttons = [
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: 'Salin Serial Number (SN)',
                copy_code: sn
            })
        }
    ]

    try {
        await sendButtons(conn, m.chat, {
            text: successMessage,
            footer: 'Joy WhatsApp Bot',
            buttons
        }, { quoted: m })
    } catch (e) {
        await conn.sendMessage(m.chat, {
            text: successMessage,
            contextInfo: { mentionedJid: [sender, m.sender, pnJid, `${rawNumber}@s.whatsapp.net`].filter(Boolean) }
        }, { quoted: m })
    }
}

handler.before = async (m, { conn }) => {
    if (!conn.unregConfirm?.has(m.sender)) return false

    const rawText = m.text?.trim()
    if (!rawText) return false

    const jawaban = rawText.toLowerCase()
    const isYa    = ['y', 'ya', 'iya', 'yes', 'ok', 'setuju', 'lanjut'].includes(jawaban)
    const isTidak = ['n', 'no', 'tidak', 'gak', 'batal', 'cancel', 'ga'].includes(jawaban)

    if (!isYa && !isTidak) return false

    const session = conn.unregConfirm.get(m.sender)
    clearTimeout(session.timeout)
    conn.unregConfirm.delete(m.sender)

    if (isTidak) {
        await m.reply('Penghapusan akun dibatalkan. Data akunmu tetap aman.')
        return true
    }

    const { user, targetKey, sender } = resolveUserAndKey(m, conn)
    if (!user) return true

    const oldName = user.name || 'Pengguna'
    const wasPrem = user.premium === true

    Object.assign(user, {
        name: '', birthdate: '', age: -1,
        register: false, regTime: -1, sn: '',
        premium: false, premiumDate: -1,
        exp: 0, level: 0,
        limit: 25
    })

    global.saveData('users', targetKey)
    if (targetKey !== sender) global.saveData('users', sender)

    await m.reply(
        `╭── ✦ *AKUN BERHASIL DIHAPUS* ✦\n` +
        `• Sampai jumpa, *${oldName}*.\n` +
        (wasPrem ? `• Akses premium telah dinonaktifkan.\n` : '') +
        `• Kamu dapat mendaftar kembali kapan saja dengan \`.daftar\`.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    )

    return true
}

handler.help = ['daftar *nama | umur/tgl lahir*']
handler.tags    = ['info']
handler.command = /^(daftar|reg|register|unreg|unregister|ceksn|sn)$/i

export default handler