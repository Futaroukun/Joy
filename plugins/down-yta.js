import fetch from 'node-fetch'

// Helper Format Durasi dari detik
const formatDuration = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
};

// --- SCRAPER 1: THESOCIALCAT (PRIMARY) ---
class Youtube {
    constructor() {
        this.API_URL = "https://thesocialcat.com/api/youtube-download";
        this.HEADERS = {
            "accept": "*/*",
            "accept-language": "id-ID",
            "content-type": "application/json",
            "Referer": "https://thesocialcat.com/tools/youtube-video-downloader",
            "Referrer-Policy": "strict-origin-when-cross-origin"
        };
        this.CREATED_BY = "Ditzzy";
        this.NOTE = "Thank you for using this scrape, I hope you appreciate me for making this scrape by not deleting wm";
    }

    wrapResponse(data) {
        return {
            created_by: this.CREATED_BY,
            note: this.NOTE,
            results: data
        };
    }

    async download(url, format) {
        try {
            const response = await fetch(this.API_URL, {
                method: "POST",
                headers: this.HEADERS,
                body: JSON.stringify({
                    format,
                    url
                }),
                timeout: 30000
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            return this.wrapResponse(data);
        } catch (e) {
            throw new Error(`Error downloading: ${e.message}`);
        }
    }
}

// --- SCRAPER 2: OOTAIZUMI (BACKUP) ---
const ootaizumi = async (url) => {
    try {
        const apiUrl = `https://api.ootaizumi.web.id/downloader/youtube?url=${encodeURIComponent(url)}&format=mp3`;
        const response = await fetch(apiUrl, { timeout: 30000 });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }
        
        const json = await response.json();

        if (!json.status || !json.result || !json.result.download) {
            throw new Error('Format response API tidak valid');
        }
        
        return {
            title: json.result.title || 'YouTube Audio',
            download: json.result.download,
            thumbnail: json.result.thumbnail || json.result.image || 'https://telegra.ph/file/5a5a67f0822606822c60c.jpg',
            channel: json.result.author?.name || json.result.channel || '-',
            duration: json.result.timestamp || json.result.duration || '00:00',
            server: "Ootaizumi"
        };
    } catch (e) {
        throw new Error(`Ootaizumi Error: ${e.message}`);
    }
};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*MASUKKAN LINK YOUTUBE*\n\n` +
            `Download lagu MP3 dari YouTube.\n\n` +
            `*Cara Pakai:*\n` +
            `\`${usedPrefix + command}\` \`url\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command}\` \`https://youtu.be/GEsaP891k90\``
        )
    }

    const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)[\w-]{11}.*$/
    if (!ytRegex.test(text)) {
        return m.reply('*Link gak valid!* Pastikan link YouTube kamu benar.')
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Sabar, lagi download audio...*')

        let data = null;
        let buffer = null;

        // --- COBA SERVER UTAMA (TheSocialCat) ---
        try {
            const yt = new Youtube();
            const response = await yt.download(text, 'audio');
            
            // Response structure: { created_by, note, results: {...} }
            const result = response.results;
            
            if (!result || !result.mediaUrl) {
                throw new Error('mediaUrl tidak ditemukan dalam response');
            }

            console.log('TheSocialCat Response:', JSON.stringify(result, null, 2));

            // Download Audio dari mediaUrl
            const buffResp = await fetch(result.mediaUrl, { timeout: 60000 });
            if (!buffResp.ok) throw new Error(`Gagal download: ${buffResp.status}`);
            buffer = await buffResp.buffer();

            data = {
                title: result.caption || result.id || "YouTube Audio",
                channel: result.username || '-',
                thumbnail: result.thumbnail || 'https://telegra.ph/file/5a5a67f0822606822c60c.jpg',
                durationStr: formatDuration(result.videoMeta?.duration || 0),
                quality: `128kbps`,
                server: "TheSocialCat"
            };

        } catch (e) {
            // --- JIKA GAGAL, PINDAH KE SERVER BACKUP (Ootaizumi) ---
            console.log("Primary Scraper Error:", e.message);
            console.log("Switching to backup server...");

            const result = await ootaizumi(text);

            // Download Audio Backup
            const buffResp = await fetch(result.download, { timeout: 60000 });
            if (!buffResp.ok) throw new Error(`Gagal download backup: ${buffResp.status}`);
            buffer = await buffResp.buffer();

            data = {
                title: result.title,
                channel: result.channel,
                thumbnail: result.thumbnail,
                durationStr: result.duration,
                quality: `128kbps`,
                server: result.server
            };
        }

        // Validasi buffer
        if (!buffer || buffer.length === 0) {
            throw new Error('File audio kosong atau tidak valid');
        }

        console.log('Final Data:', data);
        console.log('Buffer Size:', buffer.length, 'bytes');

        // Update status loading
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: `*Berhasil diunduh!*\n\nLagi ngirim audio:\n*${data.title}*\n\nTunggu sebentar ya...`,
                    edit: loadingMsg.key
                })
            } catch (e) {
                console.log('Edit message error:', e.message);
            }
        }

        const caption = `*YOUTUBE MP3 DOWNLOADER*\n\n` +
                       `*Judul:* ${data.title}\n` +
                       `*Channel:* ${data.channel}\n` +
                       `*Durasi:* ${data.durationStr}\n` +
                       `*Kualitas:* ${data.quality}\n` +
                       `*Server:* ${data.server}`

        // Kirim Pesan Info (AdReply)
        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: data.title,
                    body: `${data.channel} • ${data.durationStr}`,
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
            fileName: `${data.title.replace(/[^\w\s]/gi, '')}.mp3`
        }, { quoted: m })

        // Hapus loading message setelah sukses
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch (e) {}
        }

    } catch (error) {
        console.error('YTMP3 Error:', error)
        const errMsg = `*PENGUNDUHAN GAGAL*\n\nSemua server sibuk atau link error.\n\n*Error:* ${error.message}\n\nCoba lagi dalam beberapa saat.`;
        
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, {
                    text: errMsg,
                    edit: loadingMsg.key
                })
            } catch {
                m.reply(errMsg)
            }
        } else {
            m.reply(errMsg)
        }
    }
}

handler.help = ['ytmp3 *url*']
handler.tags = ['downloader']
handler.command = /^(ytmp3|youtubemp3|yta)$/i
handler.limit = false

export default handler