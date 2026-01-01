import fetch from 'node-fetch'
import { uploadFile } from '../function/uploader.js'

let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!m.quoted && !/image/.test(mime)) {
        return m.reply(
            `*UPSCALE / HD*\n\n` +
            `Fitur buat naikin resolusi gambar kamu biar lebih jernih.\n\n` +
            `*Cara Pakai:*\n` +
            `Kirim atau reply gambar dengan caption *${usedPrefix + command}*`
        )
    }

    if (!/image\/(jpe?g|png)/.test(mime)) {
        return m.reply(`*FORMAT SALAH*\n\nCuma bisa pake format gambar jpeg atau png aja ya.`)
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Sabar ya, lagi upload sama jernihin fotonya...*')

        let media = await q.download()
        if (!media) throw new Error('Gagal download medianya.')

        let fileUrl = await uploadFile(media, mime)
        
        if (!fileUrl) throw new Error('Gagal upload file ke server sementara.')

        const apiUrl = `https://api.gimita.id/api/tools/upscale?url=${encodeURIComponent(fileUrl)}`
        const res = await fetch(apiUrl)
        const json = await res.json()

        if (!json.success || !json.data || !json.data.url) {
            throw new Error('Gagal proses upscale gambar dari API.')
        }

        const resultUrl = json.data.url

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        await conn.sendMessage(m.chat, {
            image: { url: resultUrl },
            caption: '*Fotonya udah berhasil dijernihin*',
            contextInfo: {
                externalAdReply: {
                    title: 'UPSCALE / HD',
                    body: 'Powered by Gimita API',
                    thumbnailUrl: resultUrl,
                    sourceUrl: resultUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (error) {
        console.error('Upscale Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*PROSES GAGAL*\n\n*Error:* ${error.message}`)
    }
}

handler.help = ['hd']
handler.tags = ['tools']
handler.command = /^(upscale|hd|enhance)$/i
handler.limit = true

export default handler