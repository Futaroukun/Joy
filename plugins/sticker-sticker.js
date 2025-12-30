let handler = async (m, { conn, command, usedPrefix }) => {
    if (m.quoted?.viewOnce) return;
    
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || "";
    
    // VALIDASI WEBP
    if (/webp/.test(mime)) {
        return m.reply(
            '*GAGAL MEMPROSES*\n\n' +
            'File yang Anda kirim adalah sticker dalam format WebP.\n' +
            'Silakan kirim gambar JPEG/PNG atau video MP4.\n\n' +
            '*Cara Penggunaan:*\n' +
            '1. Kirim/Reply gambar atau video\n' +
            '2. Ketik ' + usedPrefix + command + '\n\n' +
            '*Format:*\n' +
            '- Gambar: JPEG, PNG\n' +
            '- Video: MP4 (max 15 detik)'
        );
    }
    
    // VALIDASI MEDIA
    if (!mime || !/image|video/.test(mime)) {
        return m.reply(
            '*FORMAT TIDAK DIDUKUNG*\n\n' +
            '*Cara Penggunaan:*\n' +
            '1. Kirim/Reply gambar (JPEG/PNG) atau video (MP4)\n' +
            '2. Ketik ' + usedPrefix + command + '\n\n' +
            '*Contoh:*\n' +
            '- Kirim gambar lalu ketik ' + usedPrefix + command + '\n' +
            '- Reply gambar dengan caption ' + usedPrefix + command
        );
    }
    
    let loadingMsg = null;
    
    try {
        // PROSES GAMBAR
        if (/image\/(jpeg|png)/.test(mime)) {
            loadingMsg = await m.reply('*Memproses gambar...*');
            
            // DOWNLOAD DENGAN FIX
            console.log('[STICKER] Downloading image...');
            let media;
            
            try {
                // Method 1: Download biasa
                media = await q.download();
            } catch (e1) {
                console.log('[STICKER] Download method 1 failed, trying alternative...');
                try {
                    // Method 2: Download dengan options
                    media = await q.download({ asBuffer: true });
                } catch (e2) {
                    console.log('[STICKER] Download method 2 failed');
                    throw new Error('Gagal download media dari WhatsApp');
                }
            }
            
            // VALIDASI HASIL DOWNLOAD
            if (!media) {
                throw new Error('Download gagal: hasil null');
            }
            
            // Convert ke Buffer jika bukan Buffer
            if (!Buffer.isBuffer(media)) {
                if (media instanceof Uint8Array) {
                    media = Buffer.from(media);
                } else if (typeof media === 'object' && media.data) {
                    media = Buffer.from(media.data);
                } else {
                    throw new Error('Download gagal: format tidak dikenali');
                }
            }
            
            // Validasi ukuran
            if (media.length === 0) {
                throw new Error('Download gagal: file kosong (0 byte)');
            }
            
            if (media.length < 1000) {
                throw new Error('Download gagal: file terlalu kecil, kemungkinan corrupt');
            }
            
            console.log(`[STICKER] Downloaded: ${media.length} bytes`);
            
            // KIRIM STICKER
            const options = {
                packname: global.info?.namabot || 'Sticker',
                author: global.info?.namaowner || 'Bot'
            };
            
            await conn.sendStickerImage(m.chat, media, m, options);
            
            // Hapus loading
            if (loadingMsg?.key) {
                try {
                    await conn.sendMessage(m.chat, { delete: loadingMsg.key });
                } catch {}
            }
            
        } 
        // PROSES VIDEO
        else if (/video|mp4/.test(mime)) {
            let duration = (q.msg || q).seconds || 0;
            
            // VALIDASI DURASI
            if (duration > 15) {
                return m.reply(
                    '*DURASI TERLALU PANJANG*\n\n' +
                    'Durasi video: ' + duration + ' detik\n' +
                    'Maksimal: 15 detik\n\n' +
                    'Silakan kirim video dengan durasi max 15 detik.'
                );
            }
            
            loadingMsg = await m.reply('*Memproses video...*');
            
            // DOWNLOAD DENGAN FIX
            console.log('[STICKER] Downloading video...');
            let media;
            
            try {
                media = await q.download();
            } catch (e1) {
                console.log('[STICKER] Download method 1 failed, trying alternative...');
                try {
                    media = await q.download({ asBuffer: true });
                } catch (e2) {
                    console.log('[STICKER] Download method 2 failed');
                    throw new Error('Gagal download media dari WhatsApp');
                }
            }
            
            // VALIDASI HASIL DOWNLOAD
            if (!media) {
                throw new Error('Download gagal: hasil null');
            }
            
            // Convert ke Buffer
            if (!Buffer.isBuffer(media)) {
                if (media instanceof Uint8Array) {
                    media = Buffer.from(media);
                } else if (typeof media === 'object' && media.data) {
                    media = Buffer.from(media.data);
                } else {
                    throw new Error('Download gagal: format tidak dikenali');
                }
            }
            
            // Validasi ukuran
            if (media.length === 0) {
                throw new Error('Download gagal: file kosong (0 byte)');
            }
            
            if (media.length < 10000) {
                throw new Error('Download gagal: file terlalu kecil');
            }
            
            console.log(`[STICKER] Downloaded: ${media.length} bytes`);
            
            // KIRIM STICKER
            const options = {
                packname: global.info?.namabot || 'Sticker',
                author: global.info?.namaowner || 'Bot'
            };
            
            await conn.sendStickerVideo(m.chat, media, m, options);
            
            // Hapus loading
            if (loadingMsg?.key) {
                try {
                    await conn.sendMessage(m.chat, { delete: loadingMsg.key });
                } catch {}
            }
        }
        
    } catch (error) {
        console.error('[STICKER ERROR]', error);
        
        // Hapus loading
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key });
            } catch {}
        }
        
        // ERROR MESSAGE
        let errorMsg = '*TERJADI KESALAHAN*\n\n';
        
        if (error.message.includes('Download gagal')) {
            errorMsg += '*Masalah Download*\n' + error.message + '\n\n';
            errorMsg += '*Solusi:*\n';
            errorMsg += '- Coba kirim ulang media\n';
            errorMsg += '- Pastikan file tidak rusak\n';
            errorMsg += '- Compress file terlebih dahulu';
        } else if (error.message.includes('conversion') || error.message.includes('WebP')) {
            errorMsg += '*Masalah Konversi*\n' + error.message + '\n\n';
            errorMsg += '*Solusi:*\n';
            errorMsg += '- Gunakan format JPG/PNG/MP4\n';
            errorMsg += '- Kurangi ukuran/durasi file\n';
            errorMsg += '- Pastikan file tidak corrupt';
        } else if (error.message.includes('0 byte') || error.message.includes('kosong')) {
            errorMsg += '*File Corrupt*\nFile ukurannya 0 byte.\n\n';
            errorMsg += '*Solusi:*\n';
            errorMsg += '- Kirim ulang file\n';
            errorMsg += '- Compress dulu\n';
            errorMsg += '- Gunakan file berbeda';
        } else {
            errorMsg += 'Error: ' + error.message + '\n\n';
            errorMsg += 'Coba kirim ulang atau gunakan file lain.';
        }
        
        return m.reply(errorMsg);
    }
};

handler.help = ["stiker"];
handler.command = /^(s|stiker|sticker)$/i;
handler.tags = ["sticker"];
handler.limit = false;

export default handler;