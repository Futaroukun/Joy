import axios from 'axios';
import FormData from 'form-data';
import https from 'https'; // Penting: Import https buat bypass SSL

/**
 * Fungsi Remini dengan bypass SSL
 */
async function remini(imageBuffer, method = 'enhance') {
    return new Promise(async (resolve, reject) => {
        try {
            const methods = {
                enhance: 'enhance',
                recolor: 'recolor',
                dehaze: 'dehaze'
            };
            
            method = methods[method] || methods.enhance;

            const form = new FormData();
            form.append('model_version', 1, {
                'Content-Transfer-Encoding': 'binary',
                contentType: 'multipart/form-data; charset=utf-8',
            });
            form.append('image', imageBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg',
            });

            // BYPASS SSL AGAR TIDAK EPROTO ERROR
            const agent = new https.Agent({
                rejectUnauthorized: false
            });

            const { data } = await axios.post(`https://inferenceengine.vyro.ai/${method}`, form, {
                headers: {
                    ...form.getHeaders(),
                    'User-Agent': 'okhttp/4.9.3',
                    'Connection': 'Keep-Alive',
                    'Accept-Encoding': 'gzip',
                },
                responseType: 'arraybuffer',
                httpsAgent: agent // Pasang agent di sini
            });

            resolve(data);
        } catch (error) {
            console.error('Error Remini Internal:', error.message);
            reject(error);
        }
    });
}

/**
 * Handler Bot
 */
let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';

    if (!mime) return m.reply(`*HD / REMINI*\n\nKirim atau reply gambar dengan caption *${usedPrefix + command}*`);
    
    if (!/image\/(jpe?g|png)/.test(mime)) return m.reply(`*Format salah!*\nPastikan yang di-reply adalah gambar (jpg/png).`);

    let loadingMsg = null;

    try {
        loadingMsg = await m.reply(`*Sedang menjernihkan foto...*\n_Tunggu sebentar ya..._`);

        let img = await q.download();
        
        // Panggil fungsi remini yang sudah diperbaiki
        let result = await remini(img, 'enhance');

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }

        await conn.sendMessage(m.chat, { 
            image: result, 
            caption: '*Sukses HD-in gambar!* 😎',
            contextInfo: {
                externalAdReply: {
                    title: 'HD / REMINI',
                    body: 'Powered by Vyro AI',
                    thumbnailUrl: 'https://qu.ax/GyhG.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (error) {
        console.error('Handler Error:', error);
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }
        m.reply(`*GAGAL*\n\nServer sedang sibuk atau menolak koneksi. Coba lagi nanti.`);
    }
};

handler.help = ['hd', 'remini'];
handler.tags = ['tools', 'ai'];
handler.command = /^(hd|remini|upscale)$/i;
handler.limit = true;

export default handler;