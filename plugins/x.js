import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*YOUTUBE SEARCH*\n\n` +
            `Cari video YouTube langsung dari WhatsApp.\n\n` +
            `*Cara Pakai:*\n` +
            `${usedPrefix + command} <judul video>\n\n` +
            `*Contoh:*\n` +
            `${usedPrefix + command} guyonwaton pelanggaran`
        );
    }

    let loadingMsg = null;
    try {
        loadingMsg = await m.reply('*Sabar, gua lagi nyari videonya...*');

        const apiUrl = `https://api.gimita.id/api/search/youtube?query=${encodeURIComponent(text)}`;
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
            throw new Error(`API Error: Status ${response.status}`);
        }

        const json = await response.json();

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }

        if (!json.data || json.data.length === 0) {
            return m.reply(`*VIDEO TIDAK DITEMUKAN*\n\nGua gak nemu video buat query: *"${text}"*`);
        }

        const results = json.data;

        // [DITAMBAHKAN] Acak hasil pencarian (Fisher-Yates shuffle)
        // Ini bakal ngacak urutan semua video yang didapet dari API
        for (let i = results.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [results[i], results[j]] = [results[j], results[i]];
        }
        
        // Setelah diacak, video pertama di array jadi random, bagus buat thumbnail
        const firstResult = results[0]; 

        let replyText = `*HASIL PENCARIAN YOUTUBE (RANDOM)*\n\n` +
                        `*Query:* ${text}\n` +
                        `*Total Ditemukan:* ${results.length} video\n\n` +
                        `==============================\n\n`;

        // [DIUBAH] Ambil 7 hasil acak, bukan 5 hasil pertama
        results.slice(0, 7).forEach((item, index) => {
            replyText += `*${index + 1}. ${item.title}*\n` +
                         `   - *Channel:* ${item.author.name}\n` +
                         `   - *Durasi:* ${item.duration}\n` +
                         `   - *Views:* ${item.views}\n` +
                         `   - *Link:* ${item.url}\n\n`;
        });

        await conn.sendMessage(m.chat, {
            text: replyText.trim(),
            contextInfo: {
                externalAdReply: {
                    title: firstResult.title,
                    body: `Channel: ${firstResult.author.name} | Duration: ${firstResult.duration}`,
                    thumbnailUrl: firstResult.thumbnail,
                    sourceUrl: firstResult.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (error) {
        console.error('YouTube Search Error:', error);
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }
        m.reply(`*TERJADI KESALAHAN*\n\nError pas nyari video. Coba lagi nanti atau cek log di konsol.`);
    }
};

handler.help = ['ytsearch <query>'];
handler.tags = ['internet'];
handler.command = /^(ytsearch|yts|youtubesearch)$/i;
handler.limit = true;

export default handler;