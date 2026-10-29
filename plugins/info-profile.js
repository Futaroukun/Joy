/*
 * @Author      : Rafli
 * @Feature     : User Profile Inspector
 * @Description : Menampilkan informasi profil pengguna yang menggabungkan data WhatsApp (Baileys) dan database bot secara realtime, akurat, dan elegan.
 */

import moment from 'moment-timezone'
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'
import { getLevelProgress } from '../function/core/levelling.js'
import { formatCoins } from '../function/scrapers/currency.js'

const LOCAL_THUMBNAIL = path.join(process.cwd(), 'src', 'thumbnail.jpg')

/**
 * Timeout helper agar request Baileys/eksternal tidak pernah hanging
 */
function withTimeout(promise, ms = 2000, fallback = null) {
    if (!promise || typeof promise.then !== 'function') return Promise.resolve(fallback)
    let timer
    const timeoutPromise = new Promise(resolve => {
        timer = setTimeout(() => resolve(fallback), ms)
    })
    return Promise.race([
        promise.then(
            res => { clearTimeout(timer); return res },
            () => { clearTimeout(timer); return fallback }
        ),
        timeoutPromise
    ])
}

/**
 * Normalisasi JID WhatsApp (hapus device suffix :1, :2 dll)
 */
function normalizeJid(jid) {
    if (!jid) return ''
    const decoded = jid.split('@')[0].split(':')[0]
    return jid.endsWith('@lid') ? `${decoded}@lid` : `${decoded}@s.whatsapp.net`
}

/**
 * Download buffer gambar profil dengan timeout ketat dan fallback instan
 */
async function fetchImageBuffer(url) {
    if (url) {
        try {
            const controller = new AbortController()
            const timer = setTimeout(() => controller.abort(), 2500)
            const res = await fetch(url, {
                signal: controller.signal,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            clearTimeout(timer)
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer())
                if (buf && buf.length > 100) return buf
            }
        } catch {}
    }

    // Fallback instan: memory global.thum atau thumbnail lokal (tanpa request eksternal)
    if (Buffer.isBuffer(global.thum)) return global.thum
    if (fs.existsSync(LOCAL_THUMBNAIL)) return fs.readFileSync(LOCAL_THUMBNAIL)

    return null
}

/**
 * Parser respon Bio / Status WhatsApp dari berbagai format Baileys (USync / IQ)
 */
function parseBioResult(waBioRaw) {
    if (!waBioRaw) return { text: 'Tidak ada bio / Privasi disembunyikan', date: '-' }

    const item = Array.isArray(waBioRaw) ? waBioRaw[0] : waBioRaw
    if (!item) return { text: 'Tidak ada bio / Privasi disembunyikan', date: '-' }

    let bioText = null
    let setAtDate = null

    if (typeof item === 'string') {
        bioText = item
    } else if (typeof item === 'object') {
        if (item.status && typeof item.status === 'object') {
            bioText = item.status.status
            setAtDate = item.status.setAt || item.setAt
        } else if (typeof item.status === 'string') {
            bioText = item.status
            setAtDate = item.setAt
        } else if (item.content) {
            bioText = typeof item.content === 'string' ? item.content : item.content.toString('utf-8')
            setAtDate = item.attrs?.t ? new Date(+item.attrs.t * 1000) : null
        }
    }

    const hasText = bioText && typeof bioText === 'string' && bioText.trim().length > 0

    let formattedDate = '-'
    if (setAtDate) {
        const m = moment(setAtDate).tz('Asia/Jakarta')
        if (m.isValid()) formattedDate = m.format('DD/MM/YYYY HH:mm [WIB]')
    }

    return {
        text: hasText ? bioText.trim() : 'Tidak ada bio / Privasi disembunyikan',
        date: formattedDate
    }
}

/**
 * Mengambil Status / Bio WhatsApp secara cepat dengan timeout ketat (Phone Number only)
 */
async function fetchWhatsAppBio(conn, pnJid, cleanJid) {
    const rawTarget = (pnJid && pnJid.endsWith('@s.whatsapp.net'))
        ? pnJid
        : (cleanJid && cleanJid.endsWith('@s.whatsapp.net') ? cleanJid : null)

    const targetJid = rawTarget ? normalizeJid(rawTarget) : null
    if (!targetJid) {
        return { text: 'Tidak ada bio / Privasi disembunyikan', date: '-' }
    }

    // 1. Coba via Baileys fetchStatus (timeout 2000ms)
    try {
        if (typeof conn.fetchStatus === 'function') {
            const res = await withTimeout(conn.fetchStatus(targetJid), 2000, null)
            if (res && (Array.isArray(res) ? res.length > 0 : Object.keys(res).length > 0)) {
                const parsed = parseBioResult(res)
                if (parsed.text !== 'Tidak ada bio / Privasi disembunyikan') return parsed
            }
        }
    } catch {}

    // 2. Coba via Direct IQ Query (timeout 1500ms)
    try {
        if (typeof conn.query === 'function') {
            const iqPromise = conn.query({
                tag: 'iq',
                attrs: {
                    to: targetJid,
                    type: 'get',
                    xmlns: 'status'
                },
                content: [{ tag: 'status', attrs: {} }]
            })
            const iqRes = await withTimeout(iqPromise, 1500, null)
            if (iqRes) {
                const statusChild = iqRes.content?.find?.(c => c.tag === 'status')
                if (statusChild) {
                    const parsed = parseBioResult(statusChild)
                    if (parsed.text !== 'Tidak ada bio / Privasi disembunyikan') return parsed
                }
            }
        }
    } catch {}

    return { text: 'Tidak ada bio / Privasi disembunyikan', date: '-' }
}

/**
 * Mengambil URL Foto Profil Baileys secara cepat dengan deduplikasi & timeout
 */
async function fetchProfilePictureUrl(conn, pnJid, cleanJid, lidJid) {
    const candidates = [...new Set([
        pnJid ? normalizeJid(pnJid) : null,
        cleanJid ? normalizeJid(cleanJid) : null,
        lidJid ? normalizeJid(lidJid) : null
    ].filter(Boolean))]

    for (const jid of candidates) {
        try {
            const url = await withTimeout(conn.profilePictureUrl(jid, 'image'), 1800, null)
            if (url) return url
        } catch {}
    }
    return null
}

function resolveUserData(conn, lidJid, pnJid, rawNumber) {
    // 1. Coba dari cache memory global.db.data.users
    const memoryKeys = [lidJid, pnJid, rawNumber ? `${rawNumber}@s.whatsapp.net` : null].filter(Boolean)
    for (const key of memoryKeys) {
        const u = global.db?.data?.users?.[key]
        if (u && typeof u === 'object' && Object.keys(u).length > 0) {
            return { user: u, lid: lidJid, pn: pnJid }
        }
    }

    // 2. Fallback query SQLite database jika memory belum tersinkronisasi
    try {
        if (global.sqlite && global.sqlite.open) {
            if (!lidJid || !pnJid) {
                const storeRow = global.sqlite.prepare(
                    'SELECT pn, lid FROM storeLid WHERE pn = ? OR lid = ? LIMIT 1'
                ).get(pnJid || '', lidJid || '')

                if (storeRow) {
                    if (!lidJid && storeRow.lid) lidJid = storeRow.lid.endsWith('@lid') ? storeRow.lid : `${storeRow.lid}@lid`
                    if (!pnJid && storeRow.pn) pnJid = storeRow.pn.endsWith('@s.whatsapp.net') ? storeRow.pn : `${storeRow.pn}@s.whatsapp.net`
                }
            }

            if (lidJid) {
                const row = global.sqlite.prepare('SELECT data FROM users WHERE jid = ? LIMIT 1').get(lidJid)
                if (row?.data) return { user: JSON.parse(row.data), lid: lidJid, pn: pnJid }
            }

            if (pnJid) {
                const row = global.sqlite.prepare('SELECT data FROM users WHERE jid = ? LIMIT 1').get(pnJid)
                if (row?.data) return { user: JSON.parse(row.data), lid: lidJid, pn: pnJid }
            }

            if (rawNumber) {
                const row = global.sqlite.prepare('SELECT data FROM users WHERE jid LIKE ? LIMIT 1').get(`%${rawNumber}%`)
                if (row?.data) {
                    return { user: JSON.parse(row.data), lid: lidJid, pn: pnJid }
                }
            }
        }
    } catch (e) {
        console.error('[PROFILE DB FALLBACK ERROR]:', e.message)
    }

    return { user: {}, lid: lidJid, pn: pnJid }
}

function checkIsOwner(rawNumber, pnJid, lidJid, isROwner, isSenderOwner) {
    if (isROwner) return true

    const cleanStaticOwners = (global.owner || [])
        .map(o => (Array.isArray(o) ? o[0] : o).toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, ''))
    if (rawNumber && cleanStaticOwners.includes(rawNumber)) return true

    const ownersDb = global.db?.data?.owners || {}
    if (
        (pnJid && ownersDb[pnJid]) ||
        (lidJid && ownersDb[lidJid]) ||
        (rawNumber && ownersDb[rawNumber]) ||
        (rawNumber && ownersDb[`${rawNumber}@s.whatsapp.net`])
    ) return true

    try {
        if (global.sqlite && global.sqlite.open) {
            const row = global.sqlite.prepare(
                'SELECT jid FROM owners WHERE jid = ? OR jid = ? OR jid LIKE ? LIMIT 1'
            ).get(pnJid || '', lidJid || '', `%${rawNumber}%`)
            if (row) return true
        }
    } catch {}

    return isSenderOwner || false
}

let handler = async (m, { conn, text, usedPrefix, isOwner, isROwner }) => {
    try {
        await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } }).catch(() => {})

        // 1. Tentukan target JID
        let who = m.sender
        if (m.quoted && m.quoted.sender) {
            who = m.quoted.sender
        } else if (m.mentionedJid && m.mentionedJid.length > 0) {
            who = m.mentionedJid[0]
        } else if (text && text.trim()) {
            const clean = text.trim().replace(/^@/, '')
            if (clean.endsWith('@lid') || clean.endsWith('@s.whatsapp.net')) {
                who = clean
            } else {
                let num = clean.replace(/[^0-9]/g, '')
                if (num.startsWith('0')) num = '62' + num.slice(1)
                if (num.length >= 7) {
                    who = num + '@s.whatsapp.net'
                }
            }
        }

        const cleanJid = conn.decodeJid ? conn.decodeJid(who) : who
        const isSelf = (cleanJid === m.sender || cleanJid === m.userJid)

        // 2. Resolve LID & Phone Number (PN)
        let pnJid = ''
        let lidJid = ''

        if (cleanJid.endsWith('@lid')) {
            lidJid = cleanJid
            if (conn.storeLid && conn.storeLid[cleanJid]) {
                pnJid = conn.storeLid[cleanJid]
            } else {
                try {
                    const resolvedPn = await withTimeout(conn.getLidPN?.(cleanJid), 1200, '')
                    if (resolvedPn && resolvedPn.endsWith('@s.whatsapp.net')) pnJid = resolvedPn
                } catch {}
            }
        } else {
            pnJid = cleanJid.endsWith('@s.whatsapp.net') ? cleanJid : `${cleanJid.split('@')[0]}@s.whatsapp.net`
            if (conn.storeLid && conn.storeLid[pnJid]) {
                lidJid = conn.storeLid[pnJid]
            } else if (conn.storeLid && conn.storeLid[cleanJid]) {
                lidJid = conn.storeLid[cleanJid]
            } else if (conn.getLid) {
                const l = conn.getLid(pnJid)
                if (l && l.endsWith('@lid')) lidJid = l
            }
            if (!lidJid || lidJid === pnJid) {
                try {
                    const resolvedLid = await withTimeout(conn.getLidPN?.(pnJid), 1200, '')
                    if (resolvedLid && resolvedLid.endsWith('@lid')) lidJid = resolvedLid
                } catch {}
            }
        }

        const rawNumber = (pnJid || cleanJid || '').split('@')[0].split(':')[0].replace(/[^0-9]/g, '')

        // 3. Ambil data User dari Database (Memory + SQLite Fallback)
        const { user } = resolveUserData(conn, lidJid, pnJid, rawNumber)

        // 4. Ambil data WhatsApp (Baileys) secara paralel (Foto Profil + Bio/Status) dengan timeout ketat
        const [ppResult, bioResult] = await Promise.all([
            fetchProfilePictureUrl(conn, pnJid, cleanJid, lidJid),
            fetchWhatsAppBio(conn, pnJid, cleanJid)
        ])

        // 5. Olah Informasi Profil
        let pushName = ''
        if (who === m.sender && m.pushName) {
            pushName = m.pushName
        } else {
            pushName = (pnJid && conn.getName(pnJid)) || (lidJid && conn.getName(lidJid)) || conn.getName(cleanJid)
        }
        if (!pushName || /(?:@s\.whatsapp\.net|@lid)$/.test(pushName)) {
            pushName = user.name || (rawNumber ? `+${rawNumber}` : 'User')
        }

        const dbName = user.name || pushName
        const isTargetOwner = checkIsOwner(rawNumber, pnJid, lidJid, isROwner, isSelf && isOwner)

        const regStatus = user.register ? 'Terdaftar' : 'Belum Terdaftar'
        const regDate = (user.register && user.regTime && user.regTime > 0)
            ? moment(user.regTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm [WIB]')
            : '-'

        let premStatus = 'Gratis (Free)'
        if (isTargetOwner) {
            premStatus = 'Owner Bot'
        } else if (user.premium) {
            if (user.premiumDate && user.premiumDate > Date.now()) {
                const sisaHari = Math.ceil((user.premiumDate - Date.now()) / (1000 * 60 * 60 * 24))
                premStatus = `⭐ Premium (${sisaHari} Hari Tersisa)`
            } else if (user.premiumDate === -1 || !user.premiumDate) {
                premStatus = '⭐ Premium (Permanen)'
            } else {
                premStatus = 'Gratis (Kadaluarsa)'
            }
        }

        const limitDisplay = (isTargetOwner || user.premium || user.limit === Infinity || user.limit === null)
            ? 'Unlimited'
            : (typeof user.limit === 'number' ? `${user.limit} Tiket` : '25 Tiket')

        const exp = typeof user.exp === 'number' ? user.exp : 0
        const progress = getLevelProgress(exp)
        const level = progress.level
        const role = progress.role

        // SN Masking (hanya pemilik akun atau owner yang melihat SN lengkap)
        let snDisplay = '-'
        if (user.register && user.sn) {
            if (isSelf || isOwner || isROwner) {
                snDisplay = `\`${user.sn}\``
            } else {
                snDisplay = `\`${user.sn.slice(0, 4)}••••${user.sn.slice(-4)}\``
            }
        }

        // 6. Susun Pesan
        let caption = `*USER PROFILE*\n`
        caption += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        caption += `╭── ✦ *INFO WHATSAPP* ✦\n`
        caption += `│ • Nama Kontak: ${pushName}\n`
        caption += `│ • Nomor: ${rawNumber ? `+${rawNumber}` : '-'}\n`
        caption += `│ • Tag: @${rawNumber}\n`
        caption += `│ • Bio: ${bioResult.text}\n`
        caption += `│ • Update Bio: ${bioResult.date}\n`
        caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        caption += `╭── ✦ *INFO DATABASE & AKUN* ✦\n`
        caption += `│ • Nama Terdaftar: ${user.register ? (user.name || dbName) : '-'}\n`
        caption += `│ • Status: ${regStatus}\n`
        caption += `│ • Tipe Akun: ${premStatus}\n`
        caption += `│ • Serial Number: ${snDisplay}\n`
        caption += `│ • Tanggal Lahir: ${user.register && user.birthdate ? user.birthdate : '-'}\n`
        caption += `│ • Umur: ${user.register && user.age && user.age > 0 ? `${user.age} Tahun` : '-'}\n`
        caption += `│ • Limit: ${limitDisplay}\n`
        caption += `│ • Banned: ${user.banned ? 'Ya (Diblokir)' : 'Tidak'}\n`
        caption += `│ • Terdaftar Pada: ${regDate}\n`
        caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        caption += `╭── ✦ *STATISTIK RPG & LEVEL* ✦\n`
        caption += `│ • Level: ${level}\n`
        caption += `│ • Role: ${role}\n`
        if (user.badge) {
            if (user.badgeExpire && user.badgeExpire > 0 && Date.now() > user.badgeExpire) {
                user.badge = ''
                user.badgeExpire = -1
            } else if (user.badgeExpire && user.badgeExpire > 0) {
                const sisaMs = user.badgeExpire - Date.now()
                const sisaJam = Math.ceil(sisaMs / (1000 * 60 * 60))
                const sisaLabel = sisaJam <= 24 ? `${sisaJam} Jam` : `${Math.ceil(sisaJam / 24)} Hari`
                caption += `│ • Lencana: ${user.badge} (Trial: ${sisaLabel})\n`
            } else {
                caption += `│ • Lencana: ${user.badge} (Permanen)\n`
            }
        }
        caption += `│ • Total EXP: ${exp.toLocaleString('id-ID')} EXP\n`
        caption += `│ • Dompet: ${formatCoins(user.money || 0)}\n`
        caption += `│ • Progres Level: [${progress.bar}] ${progress.percent}%\n`
        caption += `│ • Target Level ${level + 1}: ${progress.remainingExp.toLocaleString('id-ID')} EXP lagi\n`
        caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (user.afk) {
            const afkDuration = user.afkTime > 0
                ? moment.duration(Date.now() - user.afkTime).humanize()
                : '-'
            caption += `╭── ✦ *STATUS AFK* ✦\n`
            caption += `│ • Alasan: ${user.afkReason || 'Tanpa alasan'}\n`
            caption += `│ • Sejak: ${moment(user.afkTime).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm')} WIB (${afkDuration} lalu)\n`
            caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        caption += `> _© 2026 Joy Multi-Device Assistant_`

        const mentions = [pnJid, lidJid, who, cleanJid, `${rawNumber}@s.whatsapp.net`].filter(Boolean)

        // 7. Ambil buffer gambar profil dengan fallback otomatis
        const imageBuffer = await fetchImageBuffer(ppResult, pushName)

        if (imageBuffer) {
            try {
                await conn.sendMessage(m.chat, {
                    image: imageBuffer,
                    caption: caption.trim(),
                    mentions
                }, { quoted: m })
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                return
            } catch (err) {
                console.warn('[PROFILE] Gagal kirim gambar profil:', err.message)
            }
        }

        await conn.sendMessage(m.chat, {
            text: caption.trim(),
            mentions
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (err) {
        console.error('[PROFILE ERROR]:', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        m.reply(`Terjadi kesalahan saat memuat profil:\n${err.message}`)
    }
}

handler.help = ['profile *@user/reply*']
handler.tags = ['info']
handler.command = /^(profile|profil|me|myprofile)$/i

export default handler
