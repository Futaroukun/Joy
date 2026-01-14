let handler = async (m, { conn, text, usedPrefix, command }) => {
    let who
    
    // 1. Cek Target (Reply atau Tag)
    if (m.quoted) {
        // Jika user me-reply pesan
        who = m.quoted.sender
    } else if (m.mentionedJid && m.mentionedJid.length > 0) {
        // Jika user men-tag member
        who = m.mentionedJid[0]
    } else {
        // Jika tidak ada target
        return m.reply(`❌ *Gagal:* Harap reply pesan atau tag member yang ingin disimpan.\n\n*Contoh:*\n${usedPrefix + command} Jamal`)
    }

    // 2. Cek Nama (Text)
    if (!text) {
        return m.reply(`❌ *Gagal:* Kamu belum memasukkan nama untuk kontak ini.\n\n*Contoh:*\n${usedPrefix + command} Jamal`)
    }

    // 3. Kirim Kontak
    try {
        // Penjelasan Format Data:
        // conn.sendContact menerima data berupa array: [[nomor, nama]]
        // 'who' berisi JID (misal: 628xxx@s.whatsapp.net), fungsi sendContact kamu sudah punya regex penghapus huruf, jadi aman.
        
        await conn.sendContact(m.chat, [[who, text]], m)
        
    } catch (e) {
        console.error(e)
        m.reply(`❌ Terjadi kesalahan saat mengirim kontak.`)
    }
}

handler.help = ['save <nama>', 'sv <nama>']
handler.tags = ['group', 'tools']
handler.command = /^(save|sv|simpan|savecontact)$/i
handler.group = true // Khusus grup

export default handler