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

        // --- SERVER UTAMA: NEKOLABS ---
        try {
            const apiUrl = `https://api.nekolabs.web.id/downloader/youtube/v1?url=${encodeURIComponent(text)}&format=mp3`;
            const response = await fetch(apiUrl);
            const json = await response.json();

            if (!json.success || !json.result) throw new Error('Nekolabs API Failed');

            const result = json.result;

            // Download file dari URL yang didapat
            const buffResp = await fetch(result.downloadUrl);
            if (!buffResp.ok) throw new Error('Gagal download file audio');
            buffer = await buffResp.buffer();

            data = {
                title: result.title,
                channel: '-', // API Nekolabs tidak menyertakan nama channel di result
                thumbnail: result.cover,
                durationStr: result.duration, // Format dari API sudah "03:46"
                views: '-',
                quality: `\`${result.quality}kbps (${result.format})\``,
                server: 'Nekolabs'
            };

        } catch (e) {
            // --- SERVER BACKUP: VREDEN ---
            console.log("Nekolabs error, switch to backup:", e.message);
            
            const vredenUrl = `https://api.vreden.my.id/api/v1/download/youtube/audio?url=${encodeURIComponent(text)}&quality=320`;
            const vredenResp = await fetch(vredenUrl);
            const vredenJson = await vredenResp.json();

            if (vredenJson.status && vredenJson.result) {
                const meta = vredenJson.result.metadata;
                const dl = vredenJson.result.download;

                const buffResp = await fetch(dl.url);
                if (!buffResp.ok) throw new Error('Vreden download gagal');
                buffer = await buffResp.buffer();

                data = {
                    title: meta.title,
                    channel: meta.author.name,
                    thumbnail: meta.thumbnail,
                    durationStr: formatDuration(meta.seconds),
                    views: meta.views.toString(),
                    quality: `\`${dl.quality}\``,
                    server: 'Vreden (Backup)'
                };
            } else {
                throw new Error('Semua server lagi gangguan.');
            }
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