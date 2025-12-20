import { ffmpeg } from '../function/converter.js';

let handler = async (m, { conn, usedPrefix, command }) => {
    // Definisi q sebagai pesan yang direply atau pesan itu sendiri
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';

    // Validasi: Harus berupa sticker (WebP)
    if (!/webp/.test(mime)) {
        return m.reply(`*Format salah!*\nSilakan reply/balas sticker dengan caption *${usedPrefix + command}*`);
    }

    m.reply('*Sedang memproses...*');

    try {
        // 1. Download media sticker
        let media = await q.download();

        // 2. Konversi menggunakan fungsi ffmpeg yang ada di function/converter.js
        // Argumen: (buffer, args_ffmpeg, input_ext, output_ext)
        // Kita ubah dari 'webp' ke 'png' agar transparansi terjaga
        let out = await ffmpeg(media, [], 'webp', 'png');

        // 3. Kirim hasil gambar kembali ke chat
        await conn.sendFile(m.chat, out.data, 'image.png', '✅ *Berhasil diubah ke Gambar*', m);

        // 4. Hapus file temp jika ada (converter.js menyediakan fungsi delete)
        if (out.delete) await out.delete();

    } catch (error) {
        console.error('Error converting sticker to image:', error);
        m.reply(
            '*Gagal mengubah sticker ke gambar.*\n\n' +
            'Kemungkinan penyebab:\n' +
            '- Sticker adalah animasi (bergerak)\n' +
            '- Terjadi kesalahan pada server konversi'
        );
    }
};

handler.help = ['toimg'];
handler.tags = ['sticker'];
handler.command = /^(toimg|toimage)$/i;

export default handler;