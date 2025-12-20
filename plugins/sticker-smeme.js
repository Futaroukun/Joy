let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Validasi input teks
    if (!text) {
        return m.reply(
            '*STICKER MEME GENERATOR*\n\n' +
            '*Cara Penggunaan:*\n' +
            '*1. Satu Teks:*\n' +
            '   ' + usedPrefix + command + ' <teks>\n' +
            '*2. Dua Teks (Atas & Bawah):*\n' +
            '   ' + usedPrefix + command + ' <teks atas>|<teks bawah>\n\n' +
            '*Contoh:*\n' +
            '• ' + usedPrefix + command + ' apaa loo\n' +
            '• ' + usedPrefix + command + ' When you|Finally understand\n\n' +
            '*Catatan:*\n' +
            '- Mendukung penggunaan emoji\n' +
            '- *Reply* gambar lalu ketik command ini'
        )
    }

    // Cek apakah ada gambar yang di-reply
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''

    if (!mime) {
        return m.reply('*GAGAL MEMPROSES*\n\nSilakan *reply* gambar yang ingin dijadikan meme.')
    }

    // Validasi tipe gambar
    if (!/image\/(jpe?g|png)/.test(mime)) {
        return m.reply('*FORMAT TIDAK DIDUKUNG*\n\nFormat gambar tidak didukung. Gunakan *JPG atau PNG*.')
    }

    let loadingMsg = null

    try {
        // 1. Kirim pesan loading sederhana
        loadingMsg = await m.reply('*Sedang memproses konversi...*')

        // Parse teks
        let atas = ''
        let bawah = ''
        let isSingleText = !text.includes('|')

        if (isSingleText) {
            bawah = text.trim()
        } else {
            let parts = text.split('|')
            atas = parts[0]?.trim() || ''
            bawah = parts[1]?.trim() || ''
        }

        // Download gambar
        let img = await q.download()
        if (!img) throw new Error('Gagal mengunduh gambar')

        // Upload gambar ke TmpFiles
        let url = await uploadToTmpFiles(img, 'meme.png')
        if (!url) throw new Error('Gagal mengupload gambar')

        // Generate meme URL
        let memeUrl
        if (isSingleText) {
            memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(bawah)}.png?background=${url}`
        } else {
            let topText = atas || '_'
            let bottomText = bawah || '_'
            memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(topText)}/${encodeURIComponent(bottomText)}.png?background=${url}`
        }

        // Kirim stiker
        const options = {
            packname: global.info.namabot || 'Sticker',
            author: global.info.namaowner || 'Meme Maker'
        }

        await conn.sendStickerImage(m.chat, memeUrl, m, options)

        // Hapus pesan loading setelah stiker terkirim
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key })
        }

    } catch (error) {
        console.error('Sticker Meme Error:', error)

        // Hapus pesan loading jika terjadi error
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch {}
        }

        m.reply('*TERJADI KESALAHAN*\n\nGagal membuat meme. Pastikan ukuran gambar tidak terlalu besar dan coba kembali.')
    }
}

handler.help = ['smeme *teks*']
handler.tags = ['sticker']
handler.command = /^(smeme|stickermeme|memesticker)$/i
handler.limit = false

export default handler

// --- FUNGSI UPLOADER ---

async function uploadToTmpFiles(buffer, fileName) {
    const formData = new FormData();
    formData.append('file', new Blob([buffer]), fileName);

    try {
        const response = await fetch('https://tmpfiles.org/api/v1/upload', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.status === 'success' && data.data && data.data.url) {
            let originalUrl = data.data.url;
            let parts = originalUrl.split('/');
            let fileId = parts[parts.length - 2];
            let name = parts[parts.length - 1];
            return `https://tmpfiles.org/dl/${fileId}/${name}`;
        } else {
            throw new Error('Upload failed - no URL returned');
        }
    } catch (err) {
        throw new Error('Upload failed: ' + err.message);
    }
}