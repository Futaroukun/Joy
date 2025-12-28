import { scrapeHokCharacter } from '../function/hok-scraper.js'; // Panggil scraper yang baru dibuat

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
`*HONOR OF KINGS - INFO HERO*

Gua bisa cariin info detail hero dari Fandom Wiki.

*Cara Pakai:*
${usedPrefix + command} <nama hero>

*Contoh:*
${usedPrefix + command} Angela`
        );
    }

    let loadingMsg;
    try {
        loadingMsg = await m.reply('*Sabar, gua lagi nyari data hero...*');

        const data = await scrapeHokCharacter(text);

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key });
        }

        if (!data) {
            return m.reply(`*Hero "${text}" gak ketemu.*\n\nPastikan namanya bener, contoh: *Diaochan*, bukan *Diao chan*.`);
        }

        let caption = `*${data.title}*\n\n`;
        
        if (data.bio) {
            caption += `*Bio:* ${data.bio}\n\n`;
        }

        if (Object.keys(data.profile).length) {
            caption += `*PROFIL HERO*\n`;
            for (const [key, value] of Object.entries(data.profile)) {
                caption += `• *${key}:* ${value}\n`;
            }
            caption += `\n`;
        }

        if (data.lore) {
            caption += `*LORE SINGKAT*\n${data.lore}`;
        }

        await conn.sendMessage(m.chat, {
            image: { url: data.image },
            caption: caption.trim(),
            contextInfo: {
                externalAdReply: {
                    title: data.title,
                    body: `Class: ${data.profile['Class'] || 'Unknown'}`,
                    thumbnailUrl: data.image,
                    sourceUrl: data.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (e) {
        console.error('HOK Char handler error:', e);
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }
        m.reply(`*Waduh, ada error.*\nCoba lagi nanti atau laporin ke owner, ya.`);
    }
};

handler.help = ['hokchar <hero>'];
handler.tags = ['info']; // Atau 'internet'
handler.command = /^(hokchar|hokinfo|herohok)$/i;
handler.limit = true;

export default handler;