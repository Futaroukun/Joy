import { scrapeHokCharacter } from '../function/hok-scraper.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
`*HONOR OF KINGS - INFO HERO*

Cari info detail hero dari HOK Fandom Wiki.

*Cara Pakai:*
${usedPrefix + command} <nama hero>

*Contoh:*
• ${usedPrefix + command} jing
• ${usedPrefix + command} angela
• ${usedPrefix + command} sun wukong

*Tips:*
- Bisa pakai huruf kecil semua
- Gak perlu kapital yang benar
- Bot otomatis cari yang paling cocok`
        );
    }

    let loadingMsg;
    try {
        loadingMsg = await m.reply(`*Nyari data hero "${text}"...*\n_Sabar ya, lagi ngescroll Fandom Wiki_`);

        const data = await scrapeHokCharacter(text);

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key });
        }

        if (!data) {
            return m.reply(
`*HERO GAK KETEMU*

Hero *"${text}"* gak ada di database.

*Tips:*
- Coba cek ejaan (contoh: *Diaochan* bukan *Diao chan*)
- Coba nama bahasa Inggris kalau ada
- Pastikan hero udah rilis di versi global

Ketik *${usedPrefix + command}* tanpa argumen buat liat cara pakai.`
            );
        }

        // === FORMAT CAPTION LENGKAP ===
        let caption = `*${data.title.toUpperCase()}*\n\n`;
        
        // Bio
        if (data.bio) {
            caption += `*BIO*\n${data.bio}\n\n`;
        }

        // Profile Info
        if (Object.keys(data.profile).length) {
            caption += `*PROFILE*\n`;
            for (const [key, value] of Object.entries(data.profile)) {
                caption += `• *${key}:* ${value}\n`;
            }
            caption += `\n`;
        }

        // Release Info (BARU)
        if (data.releaseInfo) {
            caption += `*RELEASE INFO*\n`;
            if (data.releaseInfo.releaseDate) {
                caption += `• *Release Date:* ${data.releaseInfo.releaseDate}\n`;
            }
            if (data.releaseInfo.price) {
                caption += `• *Price:* ${data.releaseInfo.price}\n`;
            }
            if (data.releaseInfo.rarity) {
                caption += `• *Rarity:* ${data.releaseInfo.rarity}\n`;
            }
            caption += `\n`;
        }

        // Voice Actors (BARU)
        if (data.voiceActor) {
            caption += `*VOICE ACTORS*\n`;
            if (data.voiceActor.english) {
                caption += `• *English:* ${data.voiceActor.english}\n`;
            }
            if (data.voiceActor.chinese) {
                caption += `• *Chinese:* ${data.voiceActor.chinese}\n`;
            }
            if (data.voiceActor.japanese) {
                caption += `• *Japanese:* ${data.voiceActor.japanese}\n`;
            }
            caption += `\n`;
        }

        // Abilities (BARU)
        if (data.abilities && data.abilities.length > 0) {
            caption += `*ABILITIES*\n`;
            data.abilities.forEach((ability, index) => {
                caption += `\n*${index + 1}. ${ability.name}*\n`;
                if (ability.description && ability.description.length < 200) {
                    caption += `${ability.description}\n`;
                }
            });
            caption += `\n`;
        }

        // Lore
        if (data.lore) {
            // Batasi panjang lore biar gak kepanjangan
            const maxLoreLength = 800;
            let loreText = data.lore;
            
            if (loreText.length > maxLoreLength) {
                loreText = loreText.substring(0, maxLoreLength) + '...';
            }
            
            caption += `*LORE*\n${loreText}\n\n`;
        }

        caption += `*Full Info:* ${data.url}`;

        // === KIRIM DENGAN GAMBAR ===
        if (data.image) {
            await conn.sendMessage(m.chat, {
                image: { url: data.image },
                caption: caption.trim(),
                contextInfo: {
                    externalAdReply: {
                        title: data.title,
                        body: `${data.profile['Class'] || 'Hero'} | ${data.profile['Role'] || 'HOK Character'}`,
                        thumbnailUrl: data.image,
                        sourceUrl: data.url,
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m });
        } else {
            // Fallback jika gambar gak ada
            await conn.sendMessage(m.chat, {
                text: caption.trim(),
                contextInfo: {
                    externalAdReply: {
                        title: data.title,
                        body: `${data.profile['Class'] || 'Hero'} | HOK Character`,
                        thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                        sourceUrl: data.url,
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: m });
        }

    } catch (e) {
        console.error('[HOK Char] Handler error:', e);
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }
        
        m.reply(
`*ERROR SISTEM*

Gagal memproses permintaan untuk hero *"${text}"*.

*Kemungkinan penyebab:*
- Server Fandom lagi sibuk
- Koneksi internet bermasalah
- Hero belum ada di wiki

Coba lagi nanti atau laporin ke owner kalo error terus.`
        );
    }
};

handler.help = ['hokchar <hero>'];
handler.tags = ['info'];
handler.command = /^(hokchar|hokinfo|herohok|hok)$/i;
handler.limit = true;

export default handler;