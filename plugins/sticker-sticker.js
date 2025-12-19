let handler = async (m, { conn, command, usedPrefix }) => {
    if (m.quoted?.viewOnce) return;
    
    let sendSticker = async (media, isImage = true) => {
        await m.reply('*Sedang memproses...*');
        
        const optionsimg = {
            packname: info.namabot,
            author: info.namaown,
            isAnimated: false
        };
        
        const optionsvid = {
            packname: info.namabot,
            author: info.namaown,
            isAnimated: true
        };
        
        try {
            if (isImage) {
                await conn.sendStickerImage(m.chat, media, m, optionsimg);
            } else {
                await conn.sendStickerVideo(m.chat, media, m, optionsvid);
            }
        } catch (error) {
            console.error('Error sending sticker:', error);
            throw error;
        }
    };
    
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || "";
    
    // Validasi: Jika file adalah WebP (sticker)
    if (/webp/.test(mime)) {
        return m.reply(
            '*GAGAL MEMPROSES*\n\n' +
            'File yang Anda kirim adalah *sticker* dalam format *WebP*.\n' +
            'Silakan kirim gambar format *JPEG atau PNG*, atau video format *MP4*.\n\n' +
            '*Cara Penggunaan:*\n' +
            '1. Kirim/Reply *gambar atau video*\n' +
            '2. Ketik *' + usedPrefix + command + '*\n' +
            '3. Tunggu proses konversi\n\n' +
            '*Format yang didukung:*\n' +
            '- Gambar: *JPEG, PNG*\n' +
            '- Video: *MP4 (maksimal 15 detik)*'
        );
    }
    
    // Proses Gambar (JPEG/PNG)
    if (/image\/(jpeg|png)/.test(mime)) {
        try {
            let media = await q.download();
            await sendSticker(media, true);
        } catch (error) {
            console.error('Error processing image:', error);
            return m.reply(
                '*GAGAL MEMPROSES GAMBAR*\n\n' +
                'Terjadi kesalahan saat mengkonversi gambar menjadi sticker.\n\n' +
                '*Kemungkinan penyebab:*\n' +
                '- File gambar *rusak* atau tidak valid\n' +
                '- Ukuran file *terlalu besar*\n' +
                '- Format gambar *tidak didukung*\n\n' +
                'Silakan coba lagi dengan gambar yang berbeda.'
            );
        }
    } 
    // Proses Video (MP4)
    else if (/video|mp4/.test(mime)) {
        let duration = (q.msg || q).seconds || 0;
        
        if (duration > 15) {
            return m.reply(
                '*DURASI VIDEO TERLALU PANJANG*\n\n' +
                '*Durasi video:* ' + duration + ' detik\n' +
                '*Durasi maksimal:* 15 detik\n\n' +
                'Silakan kirim video dengan durasi maksimal *15 detik*.'
            );
        }
        
        try {
            let media = await q.download();
            await sendSticker(media, false);
        } catch (error) {
            console.error('Error processing video:', error);
            return m.reply(
                '*GAGAL MEMPROSES VIDEO*\n\n' +
                'Terjadi kesalahan saat mengkonversi video menjadi sticker.\n\n' +
                '*Kemungkinan penyebab:*\n' +
                '- File video *rusak* atau tidak valid\n' +
                '- Ukuran file *terlalu besar*\n' +
                '- Format video *tidak didukung*\n' +
                '- Durasi video *melebihi batas*\n\n' +
                'Silakan coba lagi dengan video yang berbeda.'
            );
        }
    } 
    // Jika bukan gambar atau video
    else {
        return m.reply(
            '*FORMAT FILE TIDAK DIDUKUNG*\n\n' +
            '*Cara Penggunaan:*\n' +
            '1. Kirim/Reply *gambar (JPEG/PNG)* atau *video (MP4)*\n' +
            '2. Ketik *' + usedPrefix + command + '*\n' +
            '3. Bot akan mengkonversi menjadi sticker\n\n' +
            '*Ketentuan:*\n' +
            '- Gambar: Format *JPEG atau PNG*\n' +
            '- Video: Format *MP4, maksimal 15 detik*\n' +
            '- Tidak mendukung format *WebP (sticker)*\n\n' +
            '*Contoh:*\n' +
            '- Kirim gambar lalu ketik *' + usedPrefix + command + '*\n' +
            '- Reply gambar dengan caption *' + usedPrefix + command + '*'
        );
    }
};

handler.help = ["s", "stiker", "sticker"];
handler.command = /^(s|stiker|sticker)$/i;
handler.tags = ["sticker"];
handler.limit = false;

export default handler;