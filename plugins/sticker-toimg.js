import fetch from 'node-fetch';
import FormData from 'form-data';
import { JSDOM } from 'jsdom';

let handler = async (m, { conn, usedPrefix, command }) => {
    if (!m.quoted) return m.reply(
        `*STIKER KE GAMBAR/VIDEO*\n\n` +
        `Ubah stiker menjadi gambar (PNG) atau video (MP4).\n\n` +
        `*Cara Pakai:*\n` +
        `Reply stiker dengan \`${usedPrefix + command}\``
    )

    let q    = m.quoted ? m.quoted : m
    let mime = q.mimetype || ''

    if (!/webp/.test(mime)) return m.reply(
        `Pesan yang di-reply bukan stiker.\n` +
        `Pastikan reply stiker lalu ketik \`${usedPrefix + command}\``
    )

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        let media
        try {
            media = await q.download()
        } catch (err) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
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
        if (!media) throw new Error('Gagal mengunduh stiker.')
        let out

        if (/video/i.test(mime) || q.isAnimated) {
            out = await webp2mp4(media)
            await conn.sendMessage(m.chat, {
                video   : { url: out },
                caption : `_Stiker animasi berhasil diubah ke video._`,
                mimetype: 'video/mp4'
            }, { quoted: m })
        } else {
            out = await webp2png(media)
            await conn.sendMessage(m.chat, {
                image  : { url: out },
                caption: `_Stiker berhasil diubah ke gambar._`
            }, { quoted: m })
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (e) {
        console.warn('[TOIMG ERROR]:', e?.message || e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply('Gagal mengonversi stiker. Server mungkin sedang sibuk, coba lagi nanti.')
    }
}

handler.help    = ['toimg *reply stiker*']
handler.tags    = ['sticker']
handler.command = /^(toimg|tovid|tovideo)$/i

export default handler

async function webp2mp4(source) {
    let form  = new FormData()
    let isUrl = typeof source === 'string' && /https?:\/\//.test(source)
    form.append('new-image-url', isUrl ? source : '')
    form.append('new-image', isUrl ? '' : source, 'image.webp')

    let res  = await fetch('https://ezgif.com/webp-to-mp4', { method: 'POST', body: form })
    let html = await res.text()
    let { document } = new JSDOM(html).window
    let form2 = new FormData()
    let obj   = {}

    for (let input of document.querySelectorAll('form input[name]')) {
        obj[input.name] = input.value
        form2.append(input.name, input.value)
    }

    let res2  = await fetch('https://ezgif.com/webp-to-mp4/' + obj.file, { method: 'POST', body: form2 })
    let html2 = await res2.text()
    let { document: document2 } = new JSDOM(html2).window
    return new URL(document2.querySelector('div#output > p.outfile > video > source').src, res2.url).toString()
}

async function webp2png(source) {
    let form  = new FormData()
    let isUrl = typeof source === 'string' && /https?:\/\//.test(source)
    form.append('new-image-url', isUrl ? source : '')
    form.append('new-image', isUrl ? '' : source, 'image.webp')

    let res  = await fetch('https://ezgif.com/webp-to-png', { method: 'POST', body: form })
    let html = await res.text()
    let { document } = new JSDOM(html).window
    let form2 = new FormData()
    let obj   = {}

    for (let input of document.querySelectorAll('form input[name]')) {
        obj[input.name] = input.value
        form2.append(input.name, input.value)
    }

    let res2  = await fetch('https://ezgif.com/webp-to-png/' + obj.file, { method: 'POST', body: form2 })
    let html2 = await res2.text()
    let { document: document2 } = new JSDOM(html2).window
    return new URL(document2.querySelector('div#output > p.outfile > img').src, res2.url).toString()
}