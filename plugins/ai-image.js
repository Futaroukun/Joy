import { editImage } from '../function/gemini-image.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Validasi input
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!/image/g.test(mime)) {
        return m.reply(`*IMAGE TO IMAGE AI*

Modifikasi gambar menggunakan teknologi Gemini AI.

*Cara Penggunaan:*
*Reply* gambar lalu ketik *${usedPrefix + command} <instruksi>*

*Contoh Instruksi:*
- *${usedPrefix + command}* ubah background jadi pantai
- *${usedPrefix + command}* ganti warna mobil jadi merah
- *${usedPrefix + command}* ubah menjadi gaya anime
- *${usedPrefix + command}* hapus background
- *${usedPrefix + command}* konversi ke hitam putih

*Tips:*
- Gunakan instruksi yang *spesifik* untuk hasil maksimal.
- Anda bisa melakukan *multi-edit* secara bertahap pada hasil sebelumnya.

*Pengaturan Aspect Ratio:*
Tambahkan kode berikut di akhir instruksi:
*--1:1, --16:9, --9:16, --4:3*

Contoh: *${usedPrefix + command}* jadi anime *--16:9*`)
    }

    if (!text) {
        return m.reply(`*INSTRUKSI DIPERLUKAN*

Silakan masukkan instruksi perubahan yang diinginkan.
Contoh: *${usedPrefix + command}* ganti background jadi gunung`)
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
            return m.reply(`*ASPECT RATIO TIDAK VALID*

Pilihan yang tersedia: *${validRatios.join(', ')}*`)
        }

        loadingMsg = await conn.reply(m.chat,
            `*PROSES EDIT SEDANG BERJALAN*

*Instruksi:* ${editPrompt}
*Rasio:* ${aspectRatio}

Mohon tunggu sekitar *10-30 detik*...`,
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
            caption: `*PROSES SELESAI*

*Instruksi:* ${editPrompt}
*Rasio:* ${aspectRatio}
*Engine:* Gemini AI

*Catatan:* Balas gambar ini untuk melakukan edit lebih lanjut.`,
            mimetype: 'image/jpeg'
        }, { quoted: m })

    } catch (error) {
        console.error('Image2Image Error:', error)

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch {}
        }

        let errorMsg = "*GAGAL MEMPROSES GAMBAR*\n\n"

        if (error.message.includes('API')) {
            errorMsg += "*Masalah API:* Key tidak valid, kuota habis, atau server sibuk."
        } else if (error.message.includes('Invalid image')) {
            errorMsg += "*File Rusak:* Pastikan file yang dikirim adalah gambar JPG atau PNG."
        } else if (error.message.includes('safety')) {
            errorMsg += "*Pelanggaran Konten:* Instruksi ditolak karena melanggar aturan keamanan (NSFW/Kekerasan)."
        } else {
            errorMsg += `*Error:* ${error.message}`
        }

        m.reply(errorMsg)
    }
}

handler.help = ['editimg *prompt*']
handler.tags = ['ai']
handler.command = /^(img2img|editimg|ubahgambar)$/i
handler.limit = false

export default handler