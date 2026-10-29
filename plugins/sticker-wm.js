/*
- @Author: Rafli
- @Feature: Sticker Watermark
- @Description: Ubah watermark (packname & author) pada stiker yang sudah ada.
*/

import { writeExif } from '../function/media/exif.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!m.quoted) {
        return m.reply(
            `*GANTI WATERMARK STIKER*\n\n` +
            `Ganti nama pack dan author pada stiker yang sudah ada.\n\n` +
            `*Cara Pakai:*\n` +
            `Reply stiker lalu ketik \`${usedPrefix + command} packname | author\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} Stiker Keren | Rafli\`\n\n` +
            `_Jika tidak diisi, akan pakai nama bot dan owner secara otomatis._`
        )
    }

    let q    = m.quoted
    let mime = q.mimetype || ''

    if (!/webp/.test(mime)) {
        return m.reply('Pesan yang di-reply bukan stiker. Pastikan reply stiker lalu coba lagi.')
    }

    let media
    try {
        media = await q.download()
    } catch (e) {
        console.warn('Gagal download stiker:', e?.message || e)
        return m.reply(
            `*Gagal Mengunduh Stiker*\n\n` +
            `Tidak dapat mengambil file stiker dari server WhatsApp.\n\n` +
            `*Penyebab:*\n` +
            `• File media di server WhatsApp sudah kedaluwarsa atau terhapus\n` +
            `• Gangguan koneksi sementara ke CDN WhatsApp\n\n` +
            `*Solusi:*\n` +
            `› Kirim ulang stiker lalu coba lagi.`
        )
    }

    if (!media) return m.reply('Gagal mengunduh stiker. Coba lagi.')

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    let [packname, author] = (text || '').split('|')
    packname = packname?.trim() || global.info.namabot  || 'Joy Bot'
    author   = author?.trim()   || global.info.namaowner || 'Rafli'

    try {
        const stickerWithExif = await writeExif(media, { packname, author })
        await conn.sendMessage(m.chat, { sticker: stickerWithExif }, { quoted: m })
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (error) {
        console.warn('Gagal write EXIF:', error?.message || error)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal mengganti watermark.*\n\n${error.message}`)
    }
}

handler.help    = ['wm *pack|author*']
handler.tags    = ['sticker']
handler.command = /^(wm|watermark|take)$/i

export default handler