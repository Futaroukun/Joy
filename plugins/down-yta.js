import fetch from 'node-fetch'

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const formatViews = (views) => {
    if (isNaN(views)) return 'N/A';
    if (views >= 1000000) return (views / 1000000).toFixed(1) + 'M';
    if (views >= 1000) return (views / 1000).toFixed(1) + 'K';
    return views.toString();
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*MASUKKAN LINK YOUTUBE*\n\n` +
            `Yuk, masukin link video YouTube yang mau kamu ambil audionya.\n\n` +
            `*Cara Pakai:*\n` +
            `\`${usedPrefix + command}\` \`url\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command}\` *https://www.youtube.com/watch?v=g2xhes9AF2w*`
        )
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}.*$/
    if (!ytRegex.test(text)) {
        return m.reply(
            `*LINK TIDAK VALID*\n\n` +
            `Kayaknya link yang kamu kasih salah deh. Pastikan itu link YouTube yang benar ya.\n\n` +
            `*Contoh:* \`${usedPrefix + command}\` *https://www.youtube.com/watch?v=dQw4w9WgXcQ*`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Sabar ya, lagi diproses dulu audionya...*')

        const apiUrl = `https://api.vreden.my.id/api/v1/download/youtube/audio?url=${encodeURIComponent(text)}&quality=320`
        const response = await fetch(apiUrl)

        if (!response.ok) {
            throw new Error(`Server sedang gangguan, status: ${response.status}`)
        }

        const json = await response.json()

        if (!json.status || !json.result?.status) {
            throw new Error(json.message || 'Gagal mengambil data dari server.')
        }
        
        const { metadata, download } = json.result;
        const { title, author, seconds, thumbnail, url: videoUrl, views, ago } = metadata;
        const { url: downloadUrl, quality: audioQuality } = download;

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let caption = `*YOUTUBE AUDIO BERHASIL*\n\n` +
                      `*Judul:* ${title}\n` +
                      `*Channel:* ${author.name}\n` +
                      `*Durasi:* ${formatDuration(seconds)}\n` +
                      `*Views:* ${formatViews(views)}\n` +
                      `*Upload:* ${ago}\n` +
                      `*Kualitas:* \`${audioQuality}\``

        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: title,
                    body: `Channel: ${author.name}`,
                    thumbnailUrl: thumbnail,
                    sourceUrl: videoUrl,
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
        console.error('Ytmp3 Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*PENGUNDUHAN GAGAL*\n\n*Pesan:* ${error.message}\n\nCoba lagi beberapa saat lagi atau pakai link lain ya.`)
    }
}

handler.help = ['ytmp3 *url*']
handler.tags = ['downloader']
handler.command = /^(ytmp3|youtubemp3|yta)$/i
handler.limit = false

export default handler