/*
 * @Author      : Rafli
 * @Feature     : Add, Remove & List Premium
 * @Description : Manajemen status premium user bot dan daftar user premium dengan sensor privasi untuk non-owner.
 */

import moment from 'moment-timezone'

const DURATIONS = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
}

function parseDuration(text) {
    const match = text.match(/^(\d+)(m|h|d|w|M)$/i)
    if (!match) return null
    const amount = parseInt(match[1])
    const unit   = match[2]
    if (!DURATIONS[unit] || amount <= 0) return null
    return { ms: amount * DURATIONS[unit], amount, unit }
}

function labelDuration(amount, unit) {
    const map = { m: 'Menit', h: 'Jam', d: 'Hari', w: 'Minggu', M: 'Bulan' }
    return `${amount} ${map[unit] || unit}`
}

function remainingLabel(ms) {
    if (ms <= 0) return 'Habis'
    const d = Math.floor(ms / (24 * 60 * 60 * 1000))
    const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000))
    const m = Math.floor((ms % (60 * 60 * 1000)) / 60000)
    const parts = []
    if (d > 0) parts.push(`${d} Hari`)
    if (h > 0) parts.push(`${h} Jam`)
    if (m > 0) parts.push(`${m} Menit`)
    return parts.join(' ') || 'Kurang dari semenit'
}

/**
 * Dapatkan nomor WA dari LID atau JID
 */
function getPhoneNumber(conn, jid) {
    if (!jid) return 'unknown'
    if (jid.endsWith('@s.whatsapp.net')) return jid.split('@')[0].split(':')[0]
    if (conn.storeNumber?.[jid]) return conn.storeNumber[jid].replace(/[^0-9]/g, '')
    if (conn.storeLid?.[jid]) return conn.storeLid[jid].replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')

    try {
        if (global.sqlite && global.sqlite.open) {
            const row = global.sqlite.prepare('SELECT pn FROM storeLid WHERE lid = ? LIMIT 1').get(jid)
            if (row?.pn) return row.pn.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
        }
    } catch {}

    const num = conn.getNumber?.(jid)
    if (num && !num.endsWith('@lid') && /^\d{5,}$/.test(num)) return num
    return jid.split('@')[0].split(':')[0]
}

/**
 * Format nomor telepon: Full number untuk Owner, Sensor akhir 'xxx' untuk user lain
 */
function formatDisplayPhone(conn, lid, isViewerOwner) {
    const raw = getPhoneNumber(conn, lid)
    const clean = raw.replace(/[^0-9]/g, '')

    if (isViewerOwner) {
        return clean ? `+${clean}` : raw
    }

    if (clean.length <= 4) {
        return clean ? `+${clean}xxx` : 'xxxxxx'
    }

    return `+${clean.slice(0, -3)}xxx`
}

let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    let cmd = command.toLowerCase()
    let targetText = text
    const isCallerOwner = isOwner || isROwner

    if (cmd === 'prem' || cmd === 'premium') {
        const parts = (text || '').trim().split(/\s+/)
        const sub = parts[0]?.toLowerCase()
        if (sub === 'list') {
            cmd = 'listprem'
            targetText = parts.slice(1).join(' ')
        } else if (sub === 'del' || sub === 'rem' || sub === 'remove') {
            cmd = 'remprem'
            targetText = parts.slice(1).join(' ')
        } else if (sub === 'add') {
            cmd = 'addprem'
            targetText = parts.slice(1).join(' ')
        } else {
            return m.reply(
                `*PENGATURAN PREMIUM*\n\n` +
                `• \`${usedPrefix}prem add @user <durasi>\` : Tambah premium (contoh: 30d, 1M, 1y)\n` +
                `• \`${usedPrefix}prem rem @user\` : Cabut status premium\n` +
                `• \`${usedPrefix}listprem\` : Lihat daftar user premium`
            )
        }
    }

    // ── LIST PREMIUM (Bisa diakses Owner & Semua User) ───────────────────────
    if (cmd === 'listprem') {
        const users = global.db.data.users || {}
        const premList = Object.entries(users)
            .filter(([_, u]) => u && u.premium)
            .map(([lid, u], i) => {
                const phoneDisplay = formatDisplayPhone(conn, lid, isCallerOwner)
                const expired = u.premiumDate > 0
                    ? moment(u.premiumDate).tz('Asia/Jakarta').format('DD MMM YYYY HH:mm')
                    : 'Permanen'
                const sisa = u.premiumDate > 0 ? remainingLabel(u.premiumDate - Date.now()) : 'Permanen (∞)'
                return `${i + 1}. *${phoneDisplay}*\n   Nama: ${u.name || '-'}\n   Sisa: ${sisa}\n   Berakhir: ${expired}`
            })

        if (!premList.length) return m.reply('ℹ️ Belum ada user premium yang terdaftar saat ini.')

        let headerNote = isCallerOwner ? '_(Mode Owner: Nomor lengkap ditampilkan)_' : '_(Mode Publik: 3 digit nomor terakhir disensor)_'

        return m.reply(
            `*DAFTAR USER PREMIUM*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Total: *${premList.length}* user premium\n` +
            `${headerNote}\n\n` +
            premList.join('\n\n') +
            `\n\n━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> Hubungi owner untuk upgrade premium.`
        )
    }

    // ── HANYA OWNER YANG BISA MENAMBAH / MENCABUT PREMIUM ────────────────────
    if (!isCallerOwner) {
        return global.dFail ? global.dFail('owner', m, conn) : m.reply('*AKSES DITOLAK*\nPerintah ini hanya dapat diakses oleh Owner bot.')
    }

    const isRemove = /^(remprem|removepremium)$/i.test(cmd)

    // ── REMOVE PREMIUM ────────────────────────────────────────────────────────
    if (isRemove) {
        const targets = m.mentionedJid?.length ? m.mentionedJid
            : m.quoted ? [m.quoted.sender]
            : targetText ? [`${targetText.replace(/\D/g, '')}@s.whatsapp.net`]
            : []

        if (!targets.length) return m.reply(
            `*CABUT PREMIUM*\n\n` +
            `Format: \`${usedPrefix}prem rem @user\`\n` +
            `Atau reply pesan target.`
        )

        const results = []
        for (const jid of targets) {
            const lid = conn.getLid ? (conn.getLid(jid) || jid) : jid
            const user = global.db.data.users[lid] || global.db.data.users[jid]
            const phone = getPhoneNumber(conn, lid)
            if (!user) { results.push(`• +${phone}: tidak ditemukan`); continue }
            if (!user.premium) { results.push(`• +${phone}: bukan premium`); continue }
            user.premium = false
            user.premiumDate = -1
            global.saveData('users', lid)
            if (lid !== jid) global.saveData('users', jid)
            results.push(`• +${phone} (${user.name || '-'}): dicabut`)
        }

        return m.reply(`*PREMIUM DICABUT*\n\n${results.join('\n')}`)
    }

    // ── ADD / EXTEND PREMIUM ──────────────────────────────────────────────────
    const targets = m.mentionedJid?.length ? m.mentionedJid
        : m.quoted ? [m.quoted.sender]
        : []

    if (!targets.length || !text) {
        return m.reply(
            `*${command.toUpperCase()} PREMIUM*\n\n` +
            `*Format:* \`${usedPrefix + command} @user <durasi>\`\n\n` +
            `*Satuan durasi:*\n` +
            `• \`m\` — menit\n` +
            `• \`h\` — jam\n` +
            `• \`d\` — hari\n` +
            `• \`w\` — minggu\n` +
            `• \`M\` — bulan\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} @user 30d\` — 30 hari\n` +
            `\`${usedPrefix + command} @user 1M\` — 1 bulan\n\n` +
            `*Perintah lain:*\n` +
            `\`${usedPrefix}listprem\` — lihat daftar premium\n` +
            `\`${usedPrefix}remprem @user\` — cabut premium`
        )
    }

    // Cari argumen durasi (non-mention)
    const durationArg = text.trim().split(/\s+/).find(a => parseDuration(a))
    const duration = durationArg ? parseDuration(durationArg) : null

    if (!duration) return m.reply(
        `Format durasi tidak valid.\n\n` +
        `Contoh: \`30d\` (30 hari), \`1M\` (1 bulan), \`12h\` (12 jam)`
    )

    const now = Date.now()
    const results = []

    for (const jid of targets) {
        const lid = conn.getLid ? (conn.getLid(jid) || jid) : jid
        const user = global.db.data.users[lid] || global.db.data.users[jid]

        if (!user) {
            results.push({ lid, status: 'not_found' })
            continue
        }

        const isExtend  = user.premium && user.premiumDate > now
        const baseTime  = isExtend ? user.premiumDate : now
        const newExpiry = baseTime + duration.ms
        const remaining = newExpiry - now

        user.premium     = true
        user.premiumDate = newExpiry
        user.limit       = Infinity
        global.saveData('users', lid)
        if (lid !== jid) global.saveData('users', jid)

        const phone      = getPhoneNumber(conn, lid)
        const expiredStr = moment(newExpiry).tz('Asia/Jakarta').format('DD MMMM YYYY [pukul] HH.mm')
        const addedLabel = labelDuration(duration.amount, duration.unit)
        const sisaLabel  = remainingLabel(remaining)

        results.push({ lid, phone, name: user.name, isExtend, expiredStr, addedLabel, sisaLabel })
    }

    for (const r of results) {
        if (r.status === 'not_found') {
            await m.reply(`User @${getPhoneNumber(conn, r.lid)} tidak ditemukan di database.`)
            continue
        }

        const header = r.isExtend ? '*PREMIUM DIPERPANJANG*' : '*PREMIUM DITAMBAHKAN*'
        const msg =
            `${header}\n\n` +
            `*User:* +${r.phone}\n` +
            `*Nama:* ${r.name || '-'}\n` +
            `*Ditambahkan:* ${r.addedLabel}\n` +
            `*Sisa:* ${r.sisaLabel}\n` +
            `*Berakhir:* ${r.expiredStr}`

        await conn.sendMessage(m.chat, {
            text    : msg,
            mentions: [r.lid]
        }, { quoted: m })
    }
}

handler.help = ['prem *add/del/list*']
handler.tags    = ['owner']
handler.command = /^(prem|addprem|delprem|remprem|listprem)$/i
handler.owner   = true

export default handler