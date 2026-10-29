let handler = async (m, { conn, usedPrefix, command, text, participants }) => {
    if (!m.isGroup) return m.reply('*Maaf ya, perintah ini cuma bisa dipakai di dalam grup.*')

    const users = participants.map(u => conn.getLid(u.id))
    
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    let isMedia = /image|video|sticker|audio|document/.test(mime)
    
    let msgText = text || (m.quoted ? (q.text || q.caption || '') : '')

    try {
        if (isMedia) {
            let media = await q.download().catch(() => null)

            if (!media) {
                return m.reply('*Gagal download medianya.* Coba lu kirim ulang pesannya baru tag lagi ya.')
            }

            let type = mime.split('/')[0]
            if (type === 'application') type = 'document'
            if (mime.includes('webp')) type = 'sticker'
            if (mime.includes('audio')) type = 'audio'

            await conn.sendMessage(m.chat, {
                [type]: media,
                caption: msgText,
                mimetype: mime,
                ptt: mime.includes('audio') && (q.msg?.ptt || false),
                fileName: q.msg?.fileName || `hidetag-${Date.now()}`,
                mentions: users
            }, { quoted: m })

        } else {
            if (!msgText) {
                return m.reply(
                    `*TEKS TIDAK DITEMUKAN*\n\n` +
                    `Halo! Masukin teks yang mau lu tag ke semua orang ya.\n\n` +
                    `*Caranya:* \`${usedPrefix + command}\` *teks*\n` +
                    `*Contoh:* \`${usedPrefix + command}\` *Pagi semua!*`
                )
            }
            
            await conn.sendMessage(m.chat, {
                text: msgText,
                mentions: users
            }, { quoted: m })
        }

    } catch (e) {
        console.error(e)
        m.reply(`*Terjadi kesalahan:* ${e.message}`)
    }
}

handler.help = ['hidetag *teks*']
handler.tags = ['group']
handler.command = /^(hidetag|ht|totag)$/i

handler.admin = true
handler.botAdmin = true
handler.group = true

export default handler