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

        try {
            const infoUrl = `https://api.gimita.id/api/downloader/ytinfo?url=${encodeURIComponent(text)}`;
            const infoResp = await fetch(infoUrl);
            const infoJson = await infoResp.json();

            if (!infoJson.success || !infoJson.audio_formats) throw new Error('Gimita Info Failed');

            const formats = infoJson.audio_formats.sort((a, b) => b.abr - a.abr);
            const bestFormat = formats[0]; 
            const formatId = bestFormat.format_id;

            const downUrl = `https://api.gimita.id/api/downloader/ytdown?format_id=${formatId}&type=audio&url=${encodeURIComponent(text)}`;
            const downResp = await fetch(downUrl);
            const downJson = await downResp.json();

            if (!downJson.success || !downJson.download_url) throw new Error('Gimita Download Failed');

            let fileUrl = downJson.download_url;
            if (!fileUrl.startsWith('http')) {
                fileUrl = 'https://api.gimita.id' + fileUrl;
            }

            const buffResp = await fetch(fileUrl);
            if (!buffResp.ok) throw new Error('Gagal download audio Gimita');
            buffer = await buffResp.buffer();

            data = {
                title: downJson.title || infoJson.title,
                channel: infoJson.uploader,
                thumbnail: infoJson.thumbnail,
                durationStr: formatDuration(infoJson.duration),
                views: '-',
                quality: `\`${Math.round(bestFormat.abr)}kbps (${bestFormat.ext})\``,
                server: 'Gimita'
            };

        } catch (e) {
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