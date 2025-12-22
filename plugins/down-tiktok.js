import axios from 'axios'
import * as cheerio from 'cheerio'

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

async function tikwm(url) {
    try {
        const response = await axios.get(`https://tikwm.com/api/?hd=1&url=${url}`);
        return response.data;
    } catch (e) {
        return { code: -1 };
    }
}

async function savetik(url) {
    try {
        const r = await axios.post(
            'https://savetik.co/api/ajaxSearch',
            new URLSearchParams({ q: url, lang: 'id' }).toString(),
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 10)',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                    origin: 'https://savetik.co',
                    referer: 'https://savetik.co/id1'
                }
            }
        )
        const $ = cheerio.load(r.data.data)
        return {
            title: $('h3').first().text().trim() || 'Video TikTok',
            mp4: $('.dl-action a:contains("MP4")').not(':contains("HD")').attr('href') || null,
            mp4_hd: $('.dl-action a:contains("HD")').attr('href') || null,
            mp3: $('.dl-action a:contains("MP3")').attr('href') || null,
            foto: $('.photo-list a[href*="snapcdn"]').map((_, e) => $(e).attr('href')).get()
        }
    } catch (e) {
        return null;
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            '*LINK TIKTOK DIPERLUKAN*\n\n' +
            '*Format penggunaan:*\n' +
            '*' + usedPrefix + command + ' <url_tiktok>*\n' +
            '*Contoh:*\n' + usedPrefix + command + ' https://vt.tiktok.com/ZSPXAahx2/'
        );
    }
    
    try {
        await m.reply('*Sedang memproses media, mohon tunggu...*');
        
        let result = await tikwm(text);
        
        if (result.code === 0) {
            const data = result.data;
            
            if (data.images && data.images.length > 0) {
                await m.reply('*TIKTOK FOTO DETECTED*\n\n*Jumlah:* ' + data.images.length + ' foto\n*Status:* Mengirim file...');
                for (let img of data.images) {
                    await conn.sendMessage(m.chat, { image: { url: img } }, { quoted: m });
                    await sleep(2000);
                }
            } else {
                const videoUrl = data.hdplay || data.play;
                let caption = `*TIKTOK DOWNLOADER*\n\n` +
                    `*Judul:* ${data.title}\n` +
                    `*Region:* ${data.region}\n` +
                    `*Ukuran:* ${formatSize(data.hd_size || data.size)}\n\n` +
                    `*Statistik:* \n` +
                    `- View: ${data.play_count}\n` +
                    `- Like: ${data.digg_count}\n\n` +
                    `*Status: Berhasil diunduh melalui TikWM*\n`;
                
                await conn.sendMessage(m.chat, { video: { url: videoUrl }, caption }, { quoted: m });
            }
            
            if (data.music) {
                await conn.sendMessage(m.chat, { audio: { url: data.music }, mimetype: 'audio/mpeg' }, { quoted: m });
            }
            
        } else {
            let dataBackup = await savetik(text);
            
            if (!dataBackup || (!dataBackup.mp4 && !dataBackup.foto.length)) {
                return m.reply('*GAGAL MEMPROSES LINK*\n\nSemua server sibuk atau link tidak valid.');
            }
            
            if (dataBackup.foto.length > 0) {
                await m.reply('*TIKTOK FOTO DETECTED (Backup Server)*\n\n*Jumlah:* ' + dataBackup.foto.length + ' foto');
                for (let pic of dataBackup.foto) {
                    await conn.sendMessage(m.chat, { image: { url: pic } }, { quoted: m });
                    await sleep(3000);
                }
            } else {
                const videoUrl = dataBackup.mp4_hd || dataBackup.mp4;
                let caption = `*TIKTOK DOWNLOADER (BACKUP)*\n\n` +
                    `*Judul:* ${dataBackup.title}\n\n` +
                    `*Status: Berhasil diunduh melalui Savetik*\n`;
                
                await conn.sendMessage(m.chat, { video: { url: videoUrl }, caption }, { quoted: m });
            }
            
            if (dataBackup.mp3) {
                await conn.sendMessage(m.chat, { audio: { url: dataBackup.mp3 }, mimetype: 'audio/mpeg' }, { quoted: m });
            }
        }
        
    } catch (error) {
        console.error(error);
        return m.reply('*TERJADI KESALAHAN SISTEM*\n\n*Kesalahan:* ' + error.message);
    }
}

handler.help = ['tiktok *url*'];
handler.tags = ['downloader'];
handler.command = /^(tt|tiktok|ttdl)$/i;
handler.limit = false;

export default handler;