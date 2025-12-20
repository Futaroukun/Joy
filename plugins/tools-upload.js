import { uploadFile, getFileInfo } from '../function/uploader.js'

let handler = async (m, { conn, usedPrefix, command }) => {
    // 1. Cek apakah ada media di pesan utama (caption) atau di pesan yang di-reply
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''

    // 2. Validasi: Jika tidak ada media atau hanya berupa teks biasa
    if (!/image|video|audio|sticker|document/.test(mime)) {
        return m.reply(
            '*MEDIA TIDAK DITEMUKAN*\n\n' +
            'Untuk menggunakan fitur ini, silakan:\n' +
            '1. *Kirim* gambar/video dengan caption *' + usedPrefix + command + '*\n' +
            '2. Atau *reply* media yang sudah ada dengan ketik *' + usedPrefix + command + '*\n\n' +
            '*Format yang didukung:*\n' +
            '- Gambar, Video, Audio, Stiker, dan Dokumen\n\n' +
            '*Ketentuan:*\n' +
            '- Maksimal ukuran: *50MB*'
        )
    }

    let loadingMsg = null
    try {
        // 3. Jika validasi lolos, tampilkan loading
        loadingMsg = await m.reply('*Sedang memproses upload, mohon tunggu sebentar...*')

        // Download media
        let media = await q.download?.()
        if (!media) {
            throw new Error('Gagal mengunduh media dari server WhatsApp')
        }

        // Get file info
        const fileInfo = await getFileInfo(media)

        // Upload file
        const url = await uploadFile(media, mime)

        // Hapus loading message setelah selesai
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key })
        }

        // Kirim hasil akhir
        const caption = `*UPLOAD BERHASIL*\n\n` +
            `*Detail File:*\n` +
            `• Format: *${fileInfo.ext.toUpperCase()}*\n` +
            `• Ukuran: *${fileInfo.sizeFormatted}*\n` +
            `• Tipe: ${fileInfo.mime}\n\n` +
            `*URL Hasil:* \n${url}\n\n` +
            `*Catatan:* URL ini bersifat permanen.`

        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: 'UPLOAD SUCCESS',
                    body: `File: ${fileInfo.ext.toUpperCase()} | Size: ${fileInfo.sizeFormatted}`,
                    thumbnailUrl: /image/.test(mime) ? url : 'https://qu.ax/NvoLP.jpg',
                    sourceUrl: url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                },
                mentionedJid: [m.sender]
            }
        }, { quoted: m })

    } catch (error) {
        console.error('ToURL Error:', error)

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch {}
        }

        let errorMsg = '*GAGAL MENGUPLOAD FILE*\n\n'
        errorMsg += '*Kesalahan:* ' + error.message
        
        m.reply(errorMsg)
    }
}

handler.help = ['tourl']
handler.tags = ['tools']
handler.command = /^(tourl|upload)$/i
handler.limit = false

export default handler