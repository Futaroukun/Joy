let handler = async (m, { conn, text, usedPrefix, command, participants }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    
    // Ambil teks dari input atau reply
    text = text ? text : (m.quoted && (m.quoted.text || m.quoted.caption || m.quoted.description)) ? (m.quoted.text || m.quoted.caption || m.quoted.description) : ''
    
    // Daftar semua peserta grup untuk tag
    const users = participants.map(u => u.id)

    // Logika Khusus Stiker: Download dan kirim ulang dengan mentions
    if (/sticker/g.test(mime)) {
        let media = await q.download?.()
        if (!media) return m.reply('*GAGAL MENGUNDUH STIKER*')
        
        await conn.sendMessage(m.chat, { 
            sticker: media, 
            mentions: users 
        }, { quoted: m })
        return
    } 

    // Logika untuk Media Lainnya
    if (/video/g.test(mime)) {
        if (!text) return m.reply('*TEKS DIPERLUKAN*\n\nContoh: *' + usedPrefix + command + ' pengumuman*');
        let media = await q.download?.()
        await conn.sendMessage(m.chat, { video: media, caption: text, mentions: users }, { quoted: m })
        
    } else if (/image/g.test(mime)) {
        if (!text) return m.reply('*TEKS DIPERLUKAN*\n\nContoh: *' + usedPrefix + command + ' pengumuman*');
        let media = await q.download?.()
        await conn.sendMessage(m.chat, { image: media, caption: text, mentions: users }, { quoted: m })
        
    } else if (/audio/g.test(mime)) {
        let media = await q.download?.()
        await conn.sendMessage(m.chat, { audio: media, mimetype: 'audio/mpeg', mentions: users }, { quoted: m })
        
    } else {
        // Jika hanya teks biasa
        if (!text) return m.reply('*TEKS PENGUMUMAN DIPERLUKAN*\n\nSilakan masukkan teks atau reply media sebagai pemanis.');
        await conn.sendMessage(m.chat, { text: text, mentions: users }, { quoted: m })
    }
}

handler.help = ['hidetag <teks>']
handler.tags = ['admin']
handler.command = /^(hidetag|ht)$/i

handler.admin = true
handler.botAdmin = true
handler.group = true

export default handler