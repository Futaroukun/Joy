import axios from 'axios'
import fetch from 'node-fetch'
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // 1. Validasi Input
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    if (!hasInput) return m.reply(`*JOY AI ASSISTANT* (Gemini 2.5)\n\nKirim pertanyaan atau perintah.\n\n*Contoh:*\n\`${usedPrefix + command}\` *Buatkan kode html login*\n\`${usedPrefix + command}\` *Putar lagu APT Rose*`);

    try {
        // 2. Setup Prompt (System Instruction)
        const ownerPrompt = `
IDENTITAS UTAMA:
Nama: Joy (Asisten AI Rafli).
Gaya Bicara: Santai, pakai gua dan lu. To the point.
Tugas: Bantu urusan teknis coding dan manajemen bot.
Loyalitas: Mutlak ke Rafli.

ATURAN MUSIK (WAJIB):
Jika Rafli minta putar lagu/musik, JANGAN nanya balik. Langsung balas dengan format: "CMD: play [Judul Lagu]"
Contoh: "CMD: play APT Rose Bruno Mars"

ATURAN RESPON:
1. NO BASA-BASI: DILARANG pakai pengantar "Oke", "Bentar".
2. LANGSUNG JAWAB: Langsung ke inti masalah.
`;
    
        const userPrompt = `
IDENTITAS:
Nama: Joy (Asisten AI Publik).
USER SAAT INI: User Umum.
SIFAT: Santai, gaul, akrab (gue-lu), tapi tetap sopan.

ATURAN MUSIK (WAJIB):
Jika user minta putar lagu, balas dengan format: "CMD: play [Judul Lagu]"

ATURAN RESPON:
1. NO BASA-BASI: Jangan pakai kata pengantar.
2. LANGSUNG JAWAB: Langsung ke poin utamanya aja.
`;

        const systemInstruction = isOwner ? ownerPrompt : userPrompt;

        await conn.sendPresenceUpdate('composing', m.chat);

        // 3. Panggil Fungsi AI Baru (Nekolabs) - FIXED
        const textResponse = await askGemini(text, systemInstruction);

        if (!textResponse) throw new Error("AI tidak memberikan respon (Kosong).");

        // --- IMPLEMENTASI SEARCH & DOWNLOAD MUSIK ---
        if (textResponse.includes("CMD: play")) {
            const rawQuery = textResponse.replace("CMD: play", "").trim();
            let musicMsg = await conn.reply(m.chat, `_Oke, Joy cariin "${rawQuery}"..._ 🎧`, m);
            
            try {
                // A. SEARCH DULU (API GIMITA)
                let videoUrl = rawQuery; 
                
                try {
                    const searchApiUrl = `https://api.gimita.id/api/search/youtube?query=${encodeURIComponent(rawQuery)}`;
                    const searchRes = await fetch(searchApiUrl);
                    const searchJson = await searchRes.json();
                    
                    if (searchJson.data && searchJson.data.length > 0) {
                        videoUrl = searchJson.data[0].url;
                    }
                } catch (searchErr) {
                    console.error("Gimita Search Error:", searchErr.message);
                }

                // B. DOWNLOAD (API NEKOLABS)
                const downloadApiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(videoUrl)}`;
                const apiRes = await fetch(downloadApiUrl);
                
                if (!apiRes.ok) throw new Error("API Downloader Down");
                
                const json = await apiRes.json();
                if (!json.success || !json.result) throw new Error("Lagu tidak ditemukan.");
                
                const { metadata, downloadUrl } = json.result;

                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }); } catch {}

                let caption = `*JOY MUSIC PLAYER* 🎵\n\n` +
                              `*Judul:* ${metadata.title}\n` +
                              `*Channel:* ${metadata.channel}\n` +
                              `*Durasi:* ${metadata.duration}`;

                await conn.sendMessage(m.chat, {
                    text: caption,
                    contextInfo: {
                        externalAdReply: {
                            title: metadata.title,
                            body: "Joy AI Player",
                            thumbnailUrl: metadata.cover,
                            sourceUrl: metadata.url,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: m });

                await conn.sendMessage(m.chat, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${metadata.title}.mp3`
                }, { quoted: m });

            } catch (musicError) {
                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }); } catch {}
                m.reply(`*Gagal memutar lagu.*\nError: ${musicError.message}`);
            }
            return; 
        }

        // 4. Formatting & Button Handler
        let finalResponse = formatText(textResponse);
        const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g;
        const matches = [...finalResponse.matchAll(codeBlockRegex)];
        const buttons = [];
        
        if (matches.length > 0) {
            for (let i = 0; i < matches.length && i < 3; i++) {
                const codeToCopy = matches[i][1].trim();
                if (codeToCopy) {
                    buttons.push({
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: `Salin Kode ${i + 1}`,
                            copy_code: codeToCopy
                        })
                    });
                }
            }
        }
        
        if (buttons.length > 0) {
            await sendButtons(conn, m.chat, {
                text: finalResponse,
                footer: "Klik tombol untuk menyalin kode.",
                buttons: buttons
            }, { quoted: m });
        } else {
            await conn.reply(m.chat, finalResponse, m);
        }

    } catch (e) {
        console.error(e);
        m.reply(`*Joy Error:* ${e.message}`);
    }
}

function formatText(text) {
    if (!text) return "Gak ada respon.";
    return text
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*') 
        .replace(/\*\*([^*]+)\*\*/g, '*$1*') 
        .replace(/__([^_]+)__/g, '*$1*') 
        .replace(/^\s*\*\s+/gm, '- '); 
}

// --- FUNGSI AI (FIXED) ---
async function askGemini(text, systemPrompt) {
    try {
        const payload = {
            text: text,
            systemPrompt: systemPrompt
        };

        // Menggunakan logika persis seperti snippet yang lu kasih
        // Langsung ambil data.result tanpa cek status boolean
        const { data } = await axios.post(
            "https://api.nekolabs.web.id/text.gen/gemini/2.5-pro",
            payload
        );

        return data.result;

    } catch (error) {
        console.error("Axios Error:", error.message);
        throw new Error("Gagal menghubungi server Nekolabs.");
    }
}

handler.help = ['ai *teks*'];
handler.tags = ['ai'];
handler.command = /^(joy|ai|gemini)$/i;

export default handler;