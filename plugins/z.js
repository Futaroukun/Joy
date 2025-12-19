import axios from 'axios'

/**
 * Fungsi untuk mengonversi ukuran byte menjadi satuan yang mudah dibaca
 */
const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            '*LINK TIKTOK DIPERLUKAN*\n\n' +
            '*Format penggunaan:*\n' +
            '*' + usedPrefix + command + ' <url_tiktok>*\n\n' +
            '*Contoh:*\n' +
            usedPrefix + command + ' https://vt.tiktok.com/ZSPXAahx2/'
        );
    }

    try {
        await m.reply('*Sedang memproses, mohon tunggu...*');

        const response = await axios.get(`https://tikwm.com/api/?hd=1&url=${text}`);
        const res = response.data;

        if (res.code !== 0) {
            return m.reply('*GAGAL MENGUNDUH VIDEO*\n\nPastikan link yang Anda masukkan valid dan video tidak diprivasi.');
        }

        const data = res.data;
        const videoUrl = data.hdplay || data.play;
        const size = data.hd_size || data.size;

        let caption = `*TIKTOK DOWNLOADER*\n\n` +
            `*Judul:* ${data.title}\n` +
            `*Region:* ${data.region}\n` +
            `*Durasi:* ${data.duration} detik\n` +
            `*Ukuran:* ${formatSize(size)}\n\n` +
            `*Statistik:* \n` +
            `- Ditonton: ${data.play_count}\n` +
            `- Disukai: ${data.digg_count}\n` +
            `- Komentar: ${data.comment_count}\n\n` +
            `*Status: Berhasil mendapatkan video*`;

        await conn.sendMessage(m.chat, { 
            video: { url: videoUrl }, 
            caption: caption 
        }, { quoted: m });

    } catch (error) {
        console.error(error);
        return m.reply(
            '*TERJADI KESALAHAN SISTEM*\n\n' +
            '*Kesalahan:* ' + error.message
        );
    }
}

handler.help = ['tiktok <url>'];
handler.tags = ['downloader'];
handler.command = /^(tt|tiktok|ttdl)$/i;
handler.limit = true;

export default handler;