/*
- @Author     : Rafli
- @Feature    : Group AFK (Away From Keyboard)
- @Description: Fitur mengaktifkan status AFK dan melihat daftar member yang sedang AFK (.afk <alasan> / .afk list / .afk).
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

let handler = async (m, { conn, text, usedPrefix, command, participants }) => {
    const rawText = (text || '').trim()

    // ── SUBCOMMAND: LIST AFK ─────────────────────────────────────────────────
    if (rawText.toLowerCase() === 'list' || command.toLowerCase() === 'listafk') {
        const usersDb = global.db.data.users || {}
        let afkList = []

        if (m.isGroup && participants && participants.length > 0) {
            for (const p of participants) {
                const jid = p.id || p.jid
                if (!jid) continue
                const lid = conn.getLid ? (conn.getLid(jid) || jid) : jid
                const user = usersDb[lid] || usersDb[jid]
                if (user && user.afk) {
                    afkList.push({
                        jid,
                        name: user.name || jid.split('@')[0],
                        reason: user.afkReason || 'Tanpa alasan',
                        duration: Date.now() - (user.afkTime || Date.now())
                    })
                }
            }
        } else {
            for (const [key, user] of Object.entries(usersDb)) {
                if (user && user.afk) {
                    afkList.push({
                        jid: key,
                        name: user.name || key.split('@')[0],
                        reason: user.afkReason || 'Tanpa alasan',
                        duration: Date.now() - (user.afkTime || Date.now())
                    })
                }
            }
        }

        if (afkList.length === 0) {
            return m.reply('💤 *Tidak ada member yang sedang AFK saat ini.*')
        }

        let listText = `*DAFTAR MEMBER AFK (${afkList.length})*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`
        const mentions = []

        afkList.forEach((item, index) => {
            const phone = item.jid.split('@')[0].split(':')[0]
            mentions.push(item.jid)
            listText += `*${index + 1}.* @${phone}\n`
            listText += `   • *Alasan:* ${item.reason}\n`
            listText += `   • *Durasi:* ${msToTime(item.duration)}\n\n`
        })

        listText += `━━━━━━━━━━━━━━━━━━━━━━`
        return conn.sendMessage(m.chat, {
            text: listText.trim(),
            mentions: mentions
        }, { quoted: m })
    }

    // ── TANPA ARGUMEN / HELP ────────────────────────────────────────────────
    if (!rawText || rawText.toLowerCase() === 'help') {
        return m.reply(
            `*PANDUAN FITUR AFK 💤*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `• *Aktifkan AFK:*\n` +
            `  \`${usedPrefix}afk <alasan>\`\n` +
            `  _Contoh: \`${usedPrefix}afk tidur\` atau \`${usedPrefix}afk kuliah\`_\n\n` +
            `• *Cek Member yang Sedang AFK:*\n` +
            `  \`${usedPrefix}afk list\` atau \`${usedPrefix}listafk\`\n\n` +
            `• *Menonaktifkan AFK:*\n` +
            `  Kirim pesan apa saja ke chat setelah 5 detik.\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── SET AFK ──────────────────────────────────────────────────────────────
    const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
    let user = global.db.data.users[senderLID] || global.db.data.users[m.sender]
    if (!user) {
        global.db.data.users[senderLID] = {
            name: m.name || m.pushName || 'Pengguna',
            afk: false,
            afkTime: -1,
            afkReason: ''
        }
        user = global.db.data.users[senderLID]
    }

    user.afk = true
    user.afkTime = Date.now()
    user.afkReason = rawText

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
    const timeStr = new Date().toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta' })

    const afkMsg =
        `💤 *STATUS AFK DIAKTIFKAN*\n\n` +
        `• *Nama:* ${displayTag}\n` +
        `• *Waktu:* ${timeStr} WIB\n` +
        `• *Alasan:* ${rawText}\n\n` +
        `_Ketik pesan apa saja untuk menonaktifkan status AFK secara otomatis._`

    return conn.sendMessage(m.chat, {
        text: afkMsg,
        mentions: [m.sender, conn.storeLid?.[m.sender]].filter(Boolean)
    }, { quoted: m })
}

handler.help = ['afk *alasan*']
handler.tags    = ['group']
handler.command = /^(afk|listafk)$/i

export default handler