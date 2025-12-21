import { ffmpeg } from '../function/converter.js';

let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';

    if (!/webp/.test(mime)) {
        return m.reply(
            '*FORMAT TIDAK SESUAI*\n\n' +
            'Silakan *reply* sticker yang ingin diubah menjadi gambar dengan ketik *' + usedPrefix + command + '*'
        );
    }

    m.reply('*Sedang memproses konversi, mohon tunggu sebentar...*');

    try {
        let media = await q.download();
        let out = await ffmpeg(media, [], 'webp', 'png');

        await conn.sendFile(m.chat, out.data, 'image.png', '*PROSES SELESAI*\n\nSticker berhasil dikonversi menjadi gambar.', m);

        if (out.delete) await out.delete();

    } catch (error) {
        console.error('Error converting sticker to image:', error);
        m.reply(
            '*GAGAL MENGONVERSI STICKER*\n\n' +
            '*Kemungkinan penyebab:*\n' +
            '- Sticker merupakan jenis animasi (bergerak)\n' +
            '- Terjadi kendala pada library konversi\n\n' +
            'Silakan coba dengan sticker statis lainnya.'
        );
    }
};

handler.help = ['toimg'];
handler.tags = ['sticker'];
handler.command = /^(toimg|toimage)$/i;

export default handler;