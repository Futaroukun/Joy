import chat from '../function/gemini.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // 1. Validasi Input
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || q.mediaType || ''
    
    if (!/image/g.test(mime)) {
        return m.reply(`REPLY ke sebuah gambar lalu berikan perintah.\n\nContoh:\n${usedPrefix + command} ubah jadi anime style`)
    }
    if (!text) {
        return m.reply(`Harap berikan instruksi editan.\n\nContoh:\n${usedPrefix + command} ganti background jadi pemandangan pantai`)
    }
    
    let loadingMsg = null
    try {
        loadingMsg = await conn.reply(m.chat, "Sedang memproses editan gambar dengan AI... Mohon tunggu sebentar.", m)
        
        // 2. Persiapan data untuk AI
        const buffer = await q.download()
        const messages = [{ role: "user", content: text }]
        
        // 3. System Instruction Khusus untuk Edit Gambar
        const systemInstruction = `
ANDA ADALAH EDITOR GAMBAR BERBASIS AI.
TUGAS UTAMA:
1. Anda akan menerima sebuah gambar dan sebuah instruksi teks.
2. MODIFIKASI gambar tersebut sesuai instruksi yang diberikan.
3. OUTPUT ANDA HARUS HANYA GAMBAR HASIL EDITAN. JANGAN TAMBAHKAN TEKS, komentar, atau penjelasan apapun. Hanya kembalikan data gambar yang sudah dimodifikasi.
4. Jika instruksi tidak jelas atau tidak bisa dilakukan, kembalikan gambar aslinya tanpa perubahan.
`
        // 4. Eksekusi ke Gemini AI
        const result = await chat(messages, buffer, systemInstruction)
        
        // Hapus pesan loading
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key })
        }
        
        // 5. Proses Hasil dari AI
        if (result && result.image) {
            let caption = `✨ Hasil editan AI:\n\n"${text}"`
            await conn.sendMessage(m.chat, {
                image: result.image,
                caption: caption
            }, { quoted: m })
        } else {
            await m.reply(`Maaf, AI gagal mengedit gambar. Coba dengan instruksi yang lebih jelas.\n\nRespon Teks AI: ${result.text}`)
        }
        
    } catch (e) {
        console.error('Error in ai-editimage:', e)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply("Terjadi kesalahan saat memproses gambar dengan AI. Silakan coba lagi nanti.")
    }
}

handler.help = ['editimg <prompt>']
handler.tags = ['ai']
handler.command = /^(editimg|aiedit|editgambar)$/i
handler.limit = false

export default handler