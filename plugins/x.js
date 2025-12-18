import { editImage } from '../function/gemini-image.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Validasi input
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!/image/g.test(mime)) {
        return m.reply(`🖼️ *IMAGE TO IMAGE AI*

Edit atau modifikasi gambar menggunakan Gemini AI!

📝 *Cara Pakai:*
REPLY ke gambar + ${usedPrefix + command} <instruksi edit>

💡 *Contoh Edit:*
${usedPrefix + command} ubah background jadi pantai
${usedPrefix + command} ganti warna mobil jadi merah
${usedPrefix + command} tambahkan kacamata hitam
${usedPrefix + command} ubah jadi style anime
${usedPrefix + command} hapus background, jadikan transparan
${usedPrefix + command} ubah suasana jadi malam hari
${usedPrefix + command} convert to black and white

✨ *Tips:*
• Jelaskan perubahan yang spesifik
• Sebutkan style yang diinginkan
• Bisa multi-edit secara bertahap
• Gunakan bahasa yang jelas

⚙️ *Aspect Ratio:*
Tambahkan di akhir prompt:
• --1:1, --16:9, --9:16, --4:3, dll

Contoh: ${usedPrefix + command} ubah jadi anime --16:9`)
    }

    if (!text) {
        return m.reply(`❌ *Instruksi edit diperlukan!*

*Contoh:*
Reply gambar + ${usedPrefix + command} ubah background jadi gunung
Reply gambar + ${usedPrefix + command} jadikan style kartun`)
    }

    let loadingMsg = null
    try {
        // Parse aspect ratio
        let aspectRatio = "1:1"
        let editPrompt = text

        const ratioMatch = text.match(/--(\d+:\d+)$/i)
        if (ratioMatch) {
            aspectRatio = ratioMatch[1]
            editPrompt = text.replace(/--\d+:\d+$/i, '').trim()
        }

        // Validasi aspect ratio
        const validRatios = ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "21:9"]
        if (!validRatios.includes(aspectRatio)) {
            return m.reply(`❌ *Aspect ratio tidak valid!*\n\nGunakan: ${validRatios.join(', ')}`)
        }

        loadingMsg = await conn.reply(m.chat,
            `🎨 *Editing Image...*\n\n` +
            `📝 Edit: ${editPrompt}\n` +
            `📐 Aspect Ratio: ${aspectRatio}\n\n` +
            `⏳ Mohon tunggu 10-30 detik...`,
            m
        )

        // Download gambar
        const imageBuffer = await q.download()

        // Edit image dengan Gemini AI
        const editedImageBuffer = await editImage(imageBuffer, editPrompt, aspectRatio)

        // Hapus loading
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch (e) {
                console.error('Error deleting loading msg:', e)
            }
        }

        // Kirim hasil
        await conn.sendMessage(m.chat, {
            image: editedImageBuffer,
            caption: `✨ *Image Edited!*\n\n` +
                     `📝 Edit: ${editPrompt}\n` +
                     `📐 Aspect Ratio: ${aspectRatio}\n` +
                     `🤖 Powered by Gemini AI\n\n` +
                     `💡 Reply gambar hasil untuk edit lebih lanjut!`,
            mimetype: 'image/jpeg'
        }, { quoted: m })

    } catch (error) {
        console.error('Image2Image Error:', error)

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch {}
        }

        let errorMsg = "❌ *Gagal edit gambar*\n\n"

        if (error.message.includes('API')) {
            errorMsg += "⚠️ Masalah dengan Gemini API.\n"
            errorMsg += "Kemungkinan:\n"
            errorMsg += "• API Key tidak valid\n"
            errorMsg += "• Kuota API habis\n"
            errorMsg += "• Server sedang sibuk\n\n"
            errorMsg += "💡 Coba lagi dalam beberapa menit."
        } else if (error.message.includes('Invalid image')) {
            errorMsg += "⚠️ Gambar tidak valid atau rusak.\n"
            errorMsg += "💡 Pastikan file adalah gambar yang valid (JPG/PNG)."
        } else if (error.message.includes('safety')) {
            errorMsg += "⚠️ Instruksi edit ditolak karena melanggar safety guidelines.\n"
            errorMsg += "💡 Hindari konten: NSFW, kekerasan, hate speech, dll."
        } else {
            errorMsg += `⚠️ Error: ${error.message}\n\n`
            errorMsg += "💡 Coba lagi atau hubungi owner jika masalah berlanjut."
        }

        m.reply(errorMsg)
    }
}

handler.help = ['img2img <edit prompt>', 'editimg <edit prompt>']
handler.tags = ['ai']
handler.command = /^(img2img|image2image|editimg|editimage|ubahgambar)$/i
handler.limit = true

export default handler