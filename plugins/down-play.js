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

        const apiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(text)}`
        const response = await fetch(apiUrl)

        if (!response.ok) {
            throw new Error(`API server lagi error, status: ${response.status}`)
        }

        const json = await response.json()

        if (!json.success || !json.result) {
            throw new Error('Lagu gak ketemu atau API lagi bermasalah.')
        }

        const { metadata, downloadUrl } = json.result

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let caption = `*YOUTUBE PLAY*\n\n` +
                      `*Judul:* ${metadata.title}\n` +
                      `*Channel:* ${metadata.channel}\n` +
                      `*Durasi:* ${metadata.duration}`

        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: metadata.title,
                    body: `Channel: ${metadata.channel}`,
                    thumbnailUrl: metadata.cover,
                    sourceUrl: metadata.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

        await conn.sendMessage(m.chat, {
            audio: { url: downloadUrl },
            mimetype: 'audio/mpeg'
        }, { quoted: m })

    } catch (error) {
        console.error('Play Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*GAGAL MEMUTAR LAGU*\n\n*Error:* ${error.message}\n\nCoba lagi dengan judul lain.`)
    }
}

handler.help = ['play *judul*']
handler.tags = ['downloader']
handler.command = /^(play)$/i
handler.limit = false

export default handler