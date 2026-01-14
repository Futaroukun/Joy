import fetch from 'node-fetch'
import crypto from 'crypto'

const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// Savetube Scraper
const savetube = {
    api: {
        base: "https://media.savetube.me/api",
        cdn: "/random-cdn",
        info: "/v2/info",
        download: "/download"
    },
    headers: {
        'accept': '*/*',
        'content-type': 'application/json',
        'origin': 'https://yt.savetube.me',
        'referer': 'https://yt.savetube.me/',
        'user-agent': 'Postify/1.0.0'
    },

    hexToBuffer: (hexString) => {
        const matches = hexString.match(/.{1,2}/g);
        return Buffer.from(matches.join(''), 'hex');
    },

    decrypt: async (enc) => {
        try {
            const secretKey = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
            const data = Buffer.from(enc, 'base64');
            const iv = data.slice(0, 16);
            const content = data.slice(16);
            const key = savetube.hexToBuffer(secretKey);

            const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
            let decrypted = decipher.update(content);
            decrypted = Buffer.concat([decrypted, decipher.final()]);

            return JSON.parse(decrypted.toString());
        } catch (error) {
            throw new Error(error.message);
        }
    },

    youtube: (url) => {
        if (!url) return null;
        const patterns = [
            /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
            /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
            /youtu\.be\/([a-zA-Z0-9_-]{11})/
        ];
        for (let pattern of patterns) {
            if (pattern.test(url)) return url.match(pattern)[1];
        }
        return null;
    },

    request: async (endpoint, data = {}, method = 'post') => {
        try {
            const url = endpoint.startsWith('http') ? endpoint : `${savetube.api.base}${endpoint}`;
            const options = {
                method,
                headers: savetube.headers
            };

            if (method === 'post') {
                options.body = JSON.stringify(data);
            } else {
                const params = new URLSearchParams(data);
                options.url = `${url}?${params}`;
            }

            const response = await fetch(method === 'get' ? options.url : url, options);
            const result = await response.json();

            return {
                status: true,
                code: 200,
                data: result
            };
        } catch (error) {
            return {
                status: false,
                code: 500,
                error: error.message
            };
        }
    },

    getCDN: async () => {
        const response = await savetube.request(savetube.api.cdn, {}, 'get');
        if (!response.status) return response;
        return {
            status: true,
            code: 200,
            data: response.data.cdn
        };
    },

    download: async (link, format = 'mp3') => {
        const id = savetube.youtube(link);
        if (!id) throw new Error('Link YouTube tidak valid');

        const cdnx = await savetube.getCDN();
        if (!cdnx.status) throw new Error('Gagal mendapatkan CDN');
        const cdn = cdnx.data;

        const result = await savetube.request(`https://${cdn}${savetube.api.info}`, {
            url: `https://www.youtube.com/watch?v=${id}`
        });
        if (!result.status) throw new Error('Gagal mendapatkan info video');

        const decrypted = await savetube.decrypt(result.data.data);

        const dl = await savetube.request(`https://${cdn}${savetube.api.download}`, {
            id: id,
            downloadType: 'audio',
            quality: '128',
            key: decrypted.key
        });

        return {
            title: decrypted.title || "Unknown",
            thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
            download: dl.data.data.downloadUrl,
            duration: decrypted.duration,
            quality: '128kbps'
        };
    }
};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*MASUKKAN LINK YOUTUBE*\n\n` +
            `Gunakan fitur ini buat download audio kualitas paling bagus.\n\n` +
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
        loadingMsg = await m.reply('*Sabar, lagi nyari kualitas audio paling bagus...*')

        let data = null;
        let buffer = null;

        // --- SERVER UTAMA: SAVETUBE ---
        try {
            const result = await savetube.download(text, 'mp3');

            // Download audio
            const buffResp = await fetch(result.download);
            if (!buffResp.ok) throw new Error('Gagal download file audio');
            buffer = await buffResp.buffer();

            data = {
                title: result.title,
                channel: '-',
                thumbnail: result.thumbnail,
                durationStr: formatDuration(result.duration || 0),
                views: '-',
                quality: `\`${result.quality} MP3\``,
                server: 'Savetube'
            };

        } catch (e) {
            // --- SERVER BACKUP: NEKOLABS V2 ---
            console.log("Savetube error, switch to backup:", e.message);

            const apiUrl = `https://api.nekolabs.web.id/downloader/youtube/v2?url=${encodeURIComponent(text)}`;
            const response = await fetch(apiUrl);
            const json = await response.json();

            if (!json.success || !json.result) throw new Error('Nekolabs API Failed');

            const result = json.result;

            // Cari audio dengan kualitas terbaik
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

            if (!bestAudio) throw new Error('Audio tidak ditemukan');

            // Download audio
            const buffResp = await fetch(bestAudio.url);
            if (!buffResp.ok) throw new Error('Gagal download file audio');
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

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: `*Berhasil diunduh!*\n\nLagi ngirim audio:\n*${data.title}* (${data.quality})\n\nTunggu sebentar ya...`,
                    edit: loadingMsg.key
                })
            } catch (e) {}
        }

        let caption = `*YOUTUBE AUDIO DOWNLOADER*\n\n` +
                      `*Judul:* ${data.title}\n` +
                      `*Channel:* ${data.channel}\n` +
                      `*Durasi:* ${data.durationStr}\n` +
                      `*Kualitas:* ${data.quality}\n` +
                      `*Server:* ${data.server}`

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
                    text: `*PENGUNDUHAN GAGAL*\n\nAda masalah pas proses permintaan kamu.\n*Error:* ${error.message}`,
                    edit: loadingMsg.key
                })
            } catch {}
        } else {
            m.reply(`*PENGUNDUHAN GAGAL*\n\nAda masalah pas proses permintaan kamu.\n*Error:* ${error.message}`)
        }
    }
}

handler.help = ['ytmp3 *url*']
handler.tags = ['downloader']
handler.command = /^(ytmp3|youtubemp3|yta)$/i
handler.limit = false

export default handler