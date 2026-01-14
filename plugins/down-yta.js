import fetch from 'node-fetch'

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*MASUKKAN LINK YOUTUBE*\n\n` +
            `Gunakan fitur ini buat download audio MP3.\n\n` +
            `*Cara Pakai:*\n` +
            `\`${usedPrefix + command}\` \`url\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command}\` \`https://youtu.be/GEsaP891k90\``
        )
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}.*$/
    if (!ytRegex.test(text)) {
        return m.reply('*Link gak valid!* Pastiin link YouTube kamu bener.')
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Sabar, lagi download audio...*')

        let data = null;
        let buffer = null;

        // --- SERVER UTAMA: OOTAIZUMI API ---
        try {
            // Request ke API Baru
            const apiUrl = `https://api.ootaizumi.web.id/downloader/youtube?url=${encodeURIComponent(text)}&format=mp3`
            const response = await fetch(apiUrl)
            const json = await response.json()

            if (!json.status || !json.result || !json.result.download) {
                throw new Error('Link download tidak ditemukan di API utama.')
            }

            const result = json.result

            // Download Audio dari URL result
            const buffResp = await fetch(result.download)
            if (!buffResp.ok) throw new Error(`Gagal mendownload file (Status: ${buffResp.status})`)
            buffer = await buffResp.buffer()

            data = {
                title: result.title,
                channel: result.author?.name || '-',
                thumbnail: result.thumbnail || result.image,
                durationStr: result.timestamp || formatDuration(result.seconds),
                views: result.views || '-',
                quality: '`128kbps`', // Default standar MP3
                server: 'Ootaizumi'
            };

        } catch (e) {
            // --- SERVER BACKUP: NEKOLABS V2 ---
            console.log("Primary API error, switching to backup:", e.message);

            const apiUrl = `https://api.nekolabs.web.id/downloader/youtube/v2?url=${encodeURIComponent(text)}`;
            const response = await fetch(apiUrl);
            const json = await response.json();

            if (!json.success || !json.result) throw new Error('Semua server sibuk/error.');

            const result = json.result;

            // Cari audio dengan bitrate tertinggi
            let bestAudio = null;
            let maxBitrate = 0;

            for (const media of result.medias) {
                if (media.type === 'audio') {
                    const bitrate = parseInt(media.label.match(/\d+/)?.[0] || '0');
                    if (bitrate > maxBitrate) {
                        maxBitrate = bitrate;
                        bestAudio = media;
                    }
                }
            }

            if (!bestAudio) throw new Error('Audio tidak ditemukan di server backup.');

            // Download audio
            const buffResp = await fetch(bestAudio.url);
            if (!buffResp.ok) throw new Error('Gagal download file audio backup');
            buffer = await buffResp.buffer();

            data = {
                title: result.title,
                channel: result.author || '-',
                thumbnail: result.thumbnail,
                durationStr: formatDuration(result.duration),
                views: '-',
                quality: `\`${bestAudio.label}\``,
                server: 'Nekolabs (Backup)'
            };
        }

        // Update status loading
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: `*Berhasil diunduh!*\n\nLagi ngirim audio:\n*${data.title}*\n\nTunggu sebentar ya...`,
                    edit: loadingMsg.key
                })
            } catch (e) {}
        }

        let caption = `*YOUTUBE MP3 DOWNLOADER*\n\n` +
                      `*Judul:* ${data.title}\n` +
                      `*Channel:* ${data.channel}\n` +
                      `*Durasi:* ${data.durationStr}\n` +
                      `*Views:* ${data.views}\n` +
                      `*Server:* ${data.server}`

        // Kirim Pesan Info (AdReply)
        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: data.title,
                    body: `Channel: ${data.channel}`,
                    thumbnailUrl: data.thumbnail,
                    sourceUrl: text,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

        // Kirim File Audio
        await conn.sendMessage(m.chat, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            fileName: `${data.title}.mp3`
        }, { quoted: m })

    } catch (error) {
        console.error('YTMP3 Error:', error)
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: `*PENGUNDUHAN GAGAL*\n\nMaaf, server lagi sibuk atau link error.\n*Log:* ${error.message}`,
                    edit: loadingMsg.key
                })
            } catch {}
        } else {
            m.reply(`*PENGUNDUHAN GAGAL*\n\nMaaf, server lagi sibuk atau link error.\n*Log:* ${error.message}`)
        }
    }
}

handler.help = ['ytmp3 *url*']
handler.tags = ['downloader']
handler.command = /^(ytmp3|youtubemp3|yta)$/i
handler.limit = false

export default handler