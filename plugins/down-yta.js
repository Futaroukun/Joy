import fetch from 'node-fetch'
import axios from 'axios'
import { delay } from '@whiskeysockets/baileys'

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

async function ytdown(url, type = 'video') {
    const { data } = await axios.post('https://ytdown.to/proxy.php', new URLSearchParams({ url }), { 
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' } 
    });

    const api = data.api;
    if (api.status == 'ERROR') throw new Error(api.message);

    const media = api.mediaItems.find((m) => m.type.toLowerCase() === type.toLowerCase());
    if (!media) throw new Error('Media type gak ketemu');

    while (true) {
        const { data: res } = await axios.get(media.mediaUrl);
        if (res.error === 'METADATA_NOT_FOUND') throw new Error('Metadata gak ketemu');
        if (res.percent === 'Completed' && res.fileUrl !== 'In Processing...') {
            return {
                info: {
                    title: api.title,
                    desc: api.description,
                    thumbnail: api.imagePreviewUrl,
                    views: api.mediaStats?.viewsCount,
                    uploader: api.userInfo?.name,
                    quality: media.mediaQuality,
                    duration: media.mediaDuration,
                    extension: media.mediaExtension,
                    size: media.mediaFileSize,
                },
                download: res.fileUrl,
            };
        }
        await delay(5000);
    }
}

async function getMetadata(url) {
    const match = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:.*?[?&]v=|embed\/|v\/|shorts\/|live\/|music\/watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (!match) throw new Error('Link Youtube gak valid');
    const res = await axios.post(
        'https://www.terrific.tools/api/youtube/get-video-metadata',
        { videoId: match[1] },
        { headers: { 'Content-Type': 'application/json' } }
    );
    return res.data;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*MASUKKIN LINK YOUTUBE*\n\n` +
            `Pake fitur ini buat download audio MP3.\n\n` +
            `*Cara Pakai:* \`${usedPrefix + command}\` *url*\n\n` +
            `*Contoh:* \`${usedPrefix + command}\` *https://youtu.be/GEsaP891k90*`
        )
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)[\w-]{11}.*$/
    if (!ytRegex.test(text)) {
        return m.reply('*Link gak valid!* Pastiin link YouTube kamu bener.')
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Bentar ya, lagi proses download audionya...*')

        let data = null;
        let buffer = null;

        try {
            const dl = await ytdown(text, 'video');
            const info = await getMetadata(text);

            const buffResp = await fetch(dl.download, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            
            if (!buffResp.ok) throw new Error(`Gagal download file (${buffResp.status})`)
            buffer = await buffResp.buffer()

            data = {
                title: dl.info.title || info.title,
                channel: dl.info.uploader || info.channelTitle || '-',
                thumbnail: dl.info.thumbnail || info.thumbnails?.maxres,
                durationStr: dl.info.duration || formatDuration(info.duration),
                views: dl.info.views || info.viewCount || '-',
                quality: `\`${dl.info.quality || '128kbps'}\``,
                server: 'YTDown.to'
            };

        } catch (e) {
            console.log("Server utama error, pindah ke backup:", e.message);

            const apiUrl = `https://api.ootaizumi.web.id/downloader/youtube?url=${encodeURIComponent(text)}&format=mp3`
            const response = await fetch(apiUrl)
            const json = await response.json()

            if (!json.status || !json.result || !json.result.download) {
                throw new Error('Semua server lagi sibuk.')
            }

            const result = json.result
            const buffResp = await fetch(result.download, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            })
            
            if (!buffResp.ok) throw new Error(`Gagal download file (${buffResp.status})`)
            buffer = await buffResp.buffer()

            data = {
                title: result.title,
                channel: result.author?.name || '-',
                thumbnail: result.thumbnail || result.image,
                durationStr: result.timestamp || formatDuration(result.seconds),
                views: result.views || '-',
                quality: '`128kbps`',
                server: 'Ootaizumi (Backup)'
            };
        }

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: `*Berhasil diunduh!*\n\nLagi ngirim audionya ya:\n*${data.title}*`,
                    edit: loadingMsg.key
                })
            } catch (e) {}
        }

        let caption = `*YOUTUBE MP3 DOWNLOADER*\n\n` +
                      `• Judul: *${data.title}*\n` +
                      `• Channel: *${data.channel}*\n` +
                      `• Durasi: *${data.durationStr}*\n` +
                      `• Views: *${data.views}*\n` +
                      `• Server: *${data.server}*`

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
                    text: `*PENGUNDUHAN GAGAL*\n\nMaaf, semua server lagi sibuk atau down.\n*Log:* ${error.message}`,
                    edit: loadingMsg.key
                })
            } catch {}
        } else {
            m.reply(`*PENGUNDUHAN GAGAL*\n\nMaaf, semua server lagi sibuk atau down.\n*Log:* ${error.message}`)
        }
    }
}

handler.help = ['ytmp3 *url*']
handler.tags = ['downloader']
handler.command = /^(ytmp3|youtubemp3|yta)$/i

export default handler