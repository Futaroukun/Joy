import { writeExifImg } from '../function/media/exif.js'
import path from 'path'
import fs from 'fs'

let canvasPkg = null
try {
    const pkg = await import('canvas')
    canvasPkg = pkg
    const fontPath = path.join(process.cwd(), 'src/impact.ttf')
    if (fs.existsSync(fontPath)) {
        pkg.registerFont(fontPath, { family: 'MemeFont' })
    }
} catch (_) {}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q    = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!mime || !/image/.test(mime)) {
        return m.reply(
            `*STICKER MEME (SMEME)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Buat meme dari gambar dengan teks atas dan bawah.\n\n` +
            `*Cara Pakai:*\n` +
            `› Reply gambar: \`${usedPrefix + command} <teks atas> | <teks bawah>\`\n\n` +
            `*Contoh:*\n` +
            `› \`${usedPrefix + command} Senin Pagi | Masih Ngantuk\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (!text) {
        return m.reply(
            `*TEKS MEME BELUM DIISI*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Format: \`${usedPrefix + command} <teks atas> | <teks bawah>\`\n\n` +
            `*Contoh:*\n` +
            `› \`${usedPrefix + command} Info Ngopi | Dimana Nih\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    let [atas, bawah, customSize] = text.split('|').map(v => v?.trim() || '')

    if (!canvasPkg) {
        return m.reply('Fitur smeme memerlukan modul canvas yang tidak didukung pada environment ini.')
    }

    const { createCanvas, loadImage } = canvasPkg

    try {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

        let imgBuffer
        try {
            imgBuffer = await q.download()
        } catch (err) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return m.reply(
                `*Gagal Mengunduh Gambar*\n\n` +
                `Tidak dapat mengambil file gambar dari server WhatsApp.\n\n` +
                `*Penyebab:*\n` +
                `• File media di server WhatsApp sudah kedaluwarsa atau terhapus\n` +
                `• Gangguan koneksi sementara ke CDN WhatsApp\n\n` +
                `*Solusi:*\n` +
                `› Kirim atau teruskan (forward) kembali gambarnya, lalu coba lagi.`
            )
        }
        if (!imgBuffer) throw new Error('Gagal mengunduh gambar.')

        let img       = await loadImage(imgBuffer)

        let width  = img.width
        let height = img.height
        const minSize = 512

        if (width < minSize || height < minSize) {
            let scale = minSize / Math.min(width, height)
            width  = Math.floor(width * scale)
            height = Math.floor(height * scale)
        }

        const canvas = createCanvas(width, height)
        const ctx    = canvas.getContext('2d')

        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 0, 0, width, height)

        let fontSize = (customSize && !isNaN(customSize))
            ? parseInt(customSize)
            : Math.floor(width / 7)

        ctx.font        = `${fontSize}px MemeFont, Impact, sans-serif`
        ctx.textAlign   = 'center'
        ctx.fillStyle   = 'white'
        ctx.strokeStyle = 'black'
        ctx.lineWidth   = fontSize / 17

        if (atas && atas !== '_') {
            ctx.textBaseline = 'top'
            ctx.strokeText(atas.toUpperCase(), width / 2, 20, width - 20)
            ctx.fillText(atas.toUpperCase(), width / 2, 20, width - 20)
        }

        if (bawah && bawah !== '_') {
            ctx.textBaseline = 'bottom'
            ctx.strokeText(bawah.toUpperCase(), width / 2, height - 20, width - 20)
            ctx.fillText(bawah.toUpperCase(), width / 2, height - 20, width - 20)
        }

        let resultBuffer = canvas.toBuffer('image/png')

        let sticker = await writeExifImg(resultBuffer, {
            packname: global.info.namabot,
            author  : global.info.namaowner
        })

        await conn.sendMessage(m.chat, { sticker }, { quoted: m })
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (e) {
        console.warn('[SMEME ERROR]:', e?.message || e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        m.reply('Gagal membuat meme. Pastikan file yang di-reply adalah gambar yang valid.')
    }
}

handler.help    = ['smeme *atas | bawah*']
handler.tags    = ['sticker']
handler.command = /^(smeme|stickermeme)$/i

export default handler