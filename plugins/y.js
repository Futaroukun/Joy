let handler = async (m, { conn, usedPrefix }) => {
    if (!m.isGroup) {
        return m.reply('*COMMAND KHUSUS GRUP*\n\nCommand ini hanya untuk testing di grup.')
    }
    
    const chat = global.db.data.chats[m.chat]
    
    if (!chat || !chat.antidelete) {
        return m.reply(
            `*⚠️ ANTI-DELETE BELUM AKTIF*\n\n` +
            `Fitur anti-delete belum diaktifkan di grup ini.\n\n` +
            `*Cara Aktivasi:*\n` +
            `1. Ketik: *${usedPrefix}enable antidelete*\n` +
            `2. Atau: *${usedPrefix}settings* lalu pilih antidelete\n\n` +
            `*Akses:* Admin grup atau Owner bot`
        )
    }
    
    // Kirim pesan instruksi
    await m.reply(
        `*🧪 TEST ANTI-DELETE DIMULAI*\n\n` +
        `Saya akan mengirim pesan test dan menghapusnya dalam 5 detik.\n\n` +
        `*Yang Akan Terjadi:*\n` +
        `1️⃣ Bot kirim pesan test\n` +
        `2️⃣ Tunggu 5 detik\n` +
        `3️⃣ Bot hapus pesan\n` +
        `4️⃣ Anti-delete mendeteksi\n` +
        `5️⃣ Bot kirim ulang pesan\n\n` +
        `Tunggu sebentar...`
    )
    
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Kirim pesan test
    const testMsg = await conn.sendMessage(m.chat, {
        text: `*✨ PESAN TEST ANTI-DELETE ✨*\n\n` +
              `Ini adalah pesan test untuk menguji fitur anti-delete.\n\n` +
              `Pesan ini akan dihapus dalam 3 detik.\n\n` +
              `Jika anti-delete bekerja dengan baik, bot akan:\n` +
              `• Mendeteksi penghapusan\n` +
              `• Mengirim header info\n` +
              `• Mengirim ulang pesan ini\n\n` +
              `━━━━━━━━━━━━━━━━━━━━\n` +
              `_Test dilakukan oleh: @${m.sender.split('@')[0]}_`,
        mentions: [m.sender]
    })
    
    // Tunggu 3 detik
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Hapus pesan
    try {
        await conn.sendMessage(m.chat, {
            delete: testMsg.key
        })
        
        // Anti-delete akan otomatis mendeteksi dan mengirim ulang
        // Kirim konfirmasi ke pengirim
        setTimeout(async () => {
            await m.reply(
                `*✅ TEST SELESAI*\n\n` +
                `Jika Anda melihat:\n` +
                `1. Header "ANTI-DELETE DETECTED"\n` +
                `2. Pesan test yang dikirim ulang\n\n` +
                `Maka fitur anti-delete bekerja dengan sempurna! 🎉\n\n` +
                `Jika tidak muncul, coba:\n` +
                `• Restart bot\n` +
                `• Cek console untuk error\n` +
                `• Pastikan event listener terpasang`
            )
        }, 2000)
        
    } catch (error) {
        console.error('Error deleting test message:', error)
        await m.reply(
            `*❌ TEST GAGAL*\n\n` +
            `Gagal menghapus pesan test.\n\n` +
            `*Error:* ${error.message}\n\n` +
            `Kemungkinan penyebab:\n` +
            `• Bot tidak memiliki izin hapus pesan\n` +
            `• Koneksi bermasalah\n` +
            `• Error internal WhatsApp`
        )
    }
}

handler.help = ['testantidelete']
handler.tags = ['group']
handler.command = /^(testantidelete|testantidel|testad)$/i
handler.group = true
handler.admin = true

export default handler