let handler = async (m, { conn, text, usedPrefix, command, participants }) => {
    // Validasi: Hanya bisa digunakan di grup
    if (!m.isGroup) {
        return m.reply('*PERINTAH KHUSUS GRUP*\n\nFitur hidetag hanya dapat digunakan di dalam grup.');
    }

    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    
    // Ambil teks dari input atau reply
    text = text ? text : (m.quoted && (m.quoted.text || m.quoted.caption || m.quoted.description)) ? (m.quoted.text || m.quoted.caption || m.quoted.description) : ''
    
    // Daftar semua peserta grup untuk tag
    const users = participants.map(u => conn.getLid(u.id))

    // === LOGIKA KHUSUS STICKER ===
    if (/sticker/g.test(mime)) {
        let media = await q.download?.()
        if (!media) {
            return m.reply('*GAGAL MENGUNDUH STIKER*\n\nTidak dapat mengunduh stiker yang di-reply. Coba lagi.')
        }
        
        await conn.sendMessage(m.chat, { 
            sticker: media, 
            mentions: users 
        }, { quoted: m })
        return
    } 

    // === LOGIKA UNTUK VIDEO ===
    if (/video/g.test(mime)) {
        if (!text) {
            return m.reply(
                '*TEKS CAPTION DIPERLUKAN*\n\n' +
                '*Cara Penggunaan:*\n' +
                '1. Reply video\n' +
                '2. Ketik *' + usedPrefix + command + ' <teks caption>*\n\n' +
                '*Contoh:*\n' +
                usedPrefix + command + ' Pengumuman penting untuk semua member!'
            );
        }
        
        let media = await q.download?.()
        if (!media) {
            return m.reply('*GAGAL MENGUNDUH VIDEO*\n\nTidak dapat mengunduh video yang di-reply. Coba lagi.')
        }
        
        await conn.sendMessage(m.chat, { 
            video: media, 
            caption: text, 
            mentions: users 
        }, { quoted: m })
        return
    } 
    
    // === LOGIKA UNTUK GAMBAR ===
    if (/image/g.test(mime)) {
        if (!text) {
            return m.reply(
                '*TEKS CAPTION DIPERLUKAN*\n\n' +
                '*Cara Penggunaan:*\n' +
                '1. Reply gambar\n' +
                '2. Ketik *' + usedPrefix + command + ' <teks caption>*\n\n' +
                '*Contoh:*\n' +
                usedPrefix + command + ' Selamat pagi semua!'
            );
        }
        
        let media = await q.download?.()
        if (!media) {
            return m.reply('*GAGAL MENGUNDUH GAMBAR*\n\nTidak dapat mengunduh gambar yang di-reply. Coba lagi.')
        }
        
        await conn.sendMessage(m.chat, { 
            image: media, 
            caption: text, 
            mentions: users 
        }, { quoted: m })
        return
    } 
    
    // === LOGIKA UNTUK AUDIO ===
    if (/audio/g.test(mime)) {
        let media = await q.download?.()
        if (!media) {
            return m.reply('*GAGAL MENGUNDUH AUDIO*\n\nTidak dapat mengunduh audio yang di-reply. Coba lagi.')
        }
        
        await conn.sendMessage(m.chat, { 
            audio: media, 
            mimetype: 'audio/mpeg', 
            mentions: users 
        }, { quoted: m })
        return
    }
    
    // === LOGIKA UNTUK DOCUMENT ===
    if (/document|pdf|zip|rar/g.test(mime)) {
        if (!text) {
            return m.reply(
                '*TEKS CAPTION DIPERLUKAN*\n\n' +
                '*Cara Penggunaan:*\n' +
                '1. Reply dokumen/file\n' +
                '2. Ketik *' + usedPrefix + command + ' <teks caption>*\n\n' +
                '*Contoh:*\n' +
                usedPrefix + command + ' File penting untuk semua!'
            );
        }
        
        let media = await q.download?.()
        if (!media) {
            return m.reply('*GAGAL MENGUNDUH DOKUMEN*\n\nTidak dapat mengunduh dokumen yang di-reply. Coba lagi.')
        }
        
        await conn.sendMessage(m.chat, { 
            document: media,
            mimetype: mime,
            fileName: q.fileName || 'document',
            caption: text, 
            mentions: users 
        }, { quoted: m })
        return
    }
    
    // === LOGIKA TEKS BIASA ===
    if (!text) {
        return m.reply(
            '*HIDETAG - PENGUMUMAN GRUP*\n\n' +
            '*Cara Penggunaan:*\n\n' +
            '*1. Teks Biasa:*\n' +
            usedPrefix + command + ' <teks pengumuman>\n\n' +
            '*2. Dengan Media:*\n' +
            '• Reply *gambar/video* lalu ketik:\n' +
            '  ' + usedPrefix + command + ' <caption>\n' +
            '• Reply *sticker* lalu ketik:\n' +
            '  ' + usedPrefix + command + '\n' +
            '• Reply *audio* lalu ketik:\n' +
            '  ' + usedPrefix + command + '\n\n' +
            '*Contoh:*\n' +
            '• ' + usedPrefix + command + ' Rapat jam 7 malam!\n' +
            '• Reply gambar: ' + usedPrefix + command + ' Info penting\n' +
            '• Reply sticker: ' + usedPrefix + command + '\n\n' +
            '*Fitur:*\n' +
            '✅ Mention semua member\n' +
            '✅ Support semua jenis media\n' +
            '✅ Notifikasi langsung ke semua'
        );
    }
    
    // Kirim teks dengan mention semua member
    await conn.sendMessage(m.chat, { 
        text: text, 
        mentions: users 
    }, { quoted: m })
}

handler.help = ['hidetag <teks>']
handler.tags = ['group']
handler.command = /^(hidetag|ht|totag)$/i

handler.admin = true
handler.botAdmin = true
handler.group = true

export default handler