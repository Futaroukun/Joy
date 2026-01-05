import { writeExif } from '../function/exif.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!m.quoted) {
        return m.reply(`*REPLY STIKERNYA DULU*\n\nReply stiker yang mau dikasih watermark baru, terus ketik commandnya.\n\nContoh:\n\`${usedPrefix + command}\` *Pack Baru | Author Baru*`)
    }

    let q = m.quoted
    let mime = q.mimetype || ''

    if (!/webp/.test(mime)) {
        return m.reply(`*INI BUKAN STIKER*\n\nYang kamu reply itu bukan stiker. Coba lagi ya.`)
    }

    if (!text) {
        return m.reply(
            `*WATERMARK KOSONG*\n\nIsi dulu watermark-nya mau apa.\n\n` +
            `*Format:* \`${usedPrefix + command}\` *packname | author*\n\n` +
            `*Contoh:* \`${usedPrefix + command}\` *Stiker Keren | Rafli*`
        )
    }

    let media
    try {
        media = await q.download()
    } catch (e) {
        console.error('Gagal download stiker:', e)
        return m.reply('*Gagal download stiker yang direply.*')
    }

    if (!media) {
        return m.reply('*Download stiker gagal, coba lagi.*')
    }

    m.reply('*Bentar, lagi nempelin watermark baru...*')

    let [packname, author] = text.split('|')
    packname = packname ? packname.trim() : (global.info.namabot || 'Joy Bot')
    author = author ? author.trim() : (global.info.namaowner || 'Rafli')

    try {
        const stickerWithExif = await writeExif(media, { packname, author })

        await conn.sendMessage(m.chat, { sticker: stickerWithExif }, { quoted: m })

    } catch (error) {
        console.error('Gagal write EXIF:', error)
        m.reply(`*Gagal bikin watermark!*\n\n*Error:* ${error.message}`)
    }
}

handler.help = ['wm *pack|author*']
handler.tags = ['sticker']
handler.command = /^(wm|watermark|take)$/i

export default handler