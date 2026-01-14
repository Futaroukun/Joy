import fetch from 'node-fetch'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*YOUTUBE PLAY*\n\n` +
            `Gua puterin lagu dari YouTube buat lu.\n\n` +
            `*Cara Pakai:*\n` +
            `*${usedPrefix + command} <judul lagu>*\n\n` +
            `*Contoh:*\n` +
            `*${usedPrefix + command} dj pet polipet*`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Sabar, gua lagi nyari lagunya...*')

        // URL API Baru
        const apiUrl = `https://api.ootaizumi.web.id/downloader/youtube/play?query=${encodeURIComponent(text)}`
        const response = await fetch(apiUrl)

        if (!response.ok) {
            throw new Error(`API server lagi error, status: ${response.status}`)
        }

        const json = await response.json()

        // Validasi response berdasarkan struktur JSON baru
        if (!json.status || !json.result || !json.result.download) {
            throw new Error('Lagu gak ketemu atau link download kosong.')
        }

        const data = json.result

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let caption = `*YOUTUBE PLAY*\n\n` +
                      `*Judul:* ${data.title}\n` +
                      `*Channel:* ${data.author.name}\n` +
                      `*Durasi:* ${data.timestamp}\n` +
                      `*Views:* ${data.views}\n` +
                      `*Upload:* ${data.ago}`

        // Kirim Info Lagu dengan Thumbnail
        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: data.title,
                    body: `Channel: ${data.author.name}`,
                    thumbnailUrl: data.thumbnail || data.image,
                    sourceUrl: data.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

        // Kirim Audio
        await conn.sendMessage(m.chat, {
            audio: { url: data.download }, // Mengambil link dari json.result.download
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`
        }, { quoted: m })

    } catch (error) {
        console.error('Play Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*GAGAL MEMUTAR LAGU*\n\n*Error:* ${error.message}\n\nCoba lagi nanti.`)
    }
}

handler.help = ['play *judul*']
handler.tags = ['downloader']
handler.command = /^(play)$/i
handler.limit = false

export default handler