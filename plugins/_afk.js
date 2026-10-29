/*
- @Author     : Rafli
- @Feature    : AFK Handler (Auto Return & Mention Detector)
- @Description: Mendeteksi saat user AFK kembali online (dengan proteksi grace period 5 detik) dan memberitahu ketika user AFK di-mention di grup.
*/

function msToTime(duration) {
    let seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours   = Math.floor((duration / (1000 * 60 * 60)) % 24),
        days    = Math.floor(duration / (1000 * 60 * 60 * 24))

    let timeString = []
    if (days > 0) timeString.push(`${days} hari`)
    if (hours > 0) timeString.push(`${hours} jam`)
    if (minutes > 0) timeString.push(`${minutes} menit`)
    if (seconds > 0) timeString.push(`${seconds} detik`)

    return timeString.length > 0 ? timeString.join(' ') : 'beberapa detik'
}

const cooldowns = new Map()

export async function before(m, { conn }) {
    if (!m.sender || m.isBaileys) return true

    const getLid = (jid) => {
        if (!jid) return ''
        try {
            return conn.getLid ? (conn.getLid(jid) || jid) : jid
        } catch {
            return jid
        }
    }

    const senderLid = getLid(m.sender)
    const user = global.db.data.users[senderLid] || global.db.data.users[m.sender]

    // ── 1. USER AFK KEMBALI ONLINE ───────────────────────────────────────────
    if (user && user.afk) {
        // Grace period: Abaikan pesan dalam 5 detik pertama setelah set AFK
        if (Date.now() - (user.afkTime || 0) > 5000) {
            const afkDuration = Date.now() - (user.afkTime || Date.now())
            let phone = conn.storeNumber?.[m.sender] || (conn.getNumber ? conn.getNumber(m.sender) : '')
            if (!phone && conn.storeLid?.[m.sender]) {
                const mapped = conn.storeLid[m.sender]
                if (typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
                    phone = mapped.split('@')[0].split(':')[0]
                }
            }
            if (!phone && m.sender.endsWith('@s.whatsapp.net')) {
                phone = m.sender.split('@')[0].split(':')[0]
            }
            const displayTag = phone ? `@${phone}` : (user.name || m.name || 'Pengguna')

            user.afk = false
            user.afkTime = -1
            user.afkReason = ''

            const welcomeMsg =
                `👋 *STATUS AFK DINONAKTIFKAN*\n\n` +
                `Selamat datang kembali, ${displayTag}!\n` +
                `Kamu sebelumnya AFK selama: *${msToTime(afkDuration)}*.`

            await conn.sendMessage(m.chat, {
                text: welcomeMsg,
                mentions: [m.sender, conn.storeLid?.[m.sender]].filter(Boolean)
            }, { quoted: m })
        }
    }

    // ── 2. DETEKSI MENTION USER YANG SEDANG AFK DI GRUP ─────────────────────
    if (m.isGroup) {
        let mentionedJids = m.mentionedJid?.length ? m.mentionedJid : []
        if (m.quoted?.sender && !mentionedJids.includes(m.quoted.sender)) {
            mentionedJids.push(m.quoted.sender)
        }

        if (mentionedJids.length > 0) {
            for (let jid of mentionedJids) {
                if (!jid) continue

                const lid = getLid(jid)
                if (lid === senderLid || jid === m.sender) continue

                const mentionedUser = global.db.data.users[lid] || global.db.data.users[jid]

                if (mentionedUser && mentionedUser.afk) {
                    const cooldownKey = `${m.chat}-${lid}`
                    const lastNotified = cooldowns.get(cooldownKey) || 0

                    // Cooldown 30 detik per user per chat agar tidak spam
                    if (Date.now() - lastNotified < 30000) continue
                    cooldowns.set(cooldownKey, Date.now())

                    let phone = conn.storeNumber?.[jid] || (conn.getNumber ? conn.getNumber(jid) : '')
                    if (!phone && conn.storeLid?.[jid]) {
                        const mapped = conn.storeLid[jid]
                        if (typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
                            phone = mapped.split('@')[0].split(':')[0]
                        }
                    }
                    if (!phone && jid.endsWith('@s.whatsapp.net')) {
                        phone = jid.split('@')[0].split(':')[0]
                    }
                    const displayTag = phone ? `@${phone}` : (mentionedUser.name || 'Pengguna')
                    const durationStr = msToTime(Date.now() - (mentionedUser.afkTime || Date.now()))

                    const afkNotifyMsg =
                        `*PENGGUNA SEDANG AFK*\n\n` +
                        `Jangan tag ${displayTag} terlebih dahulu, saat ini dia sedang tidak aktif.\n\n` +
                        `• *Alasan:* ${mentionedUser.afkReason || 'Tanpa alasan'}\n` +
                        `• *Durasi:* Sudah AFK selama ${durationStr}`

                    await conn.sendMessage(m.chat, {
                        text: afkNotifyMsg,
                        mentions: [jid, conn.storeLid?.[jid]].filter(Boolean)
                    }, { quoted: m })
                }
            }
        }
    }

    return true
}