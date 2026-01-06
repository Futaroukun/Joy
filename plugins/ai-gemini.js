import axios from 'axios'
import fetch from 'node-fetch'
import { sendButtons } from '../function/button.js'

let sessions = {};

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    if (!hasInput) return m.reply(`*JOY AI ASSISTANT*\n\nKirim pertanyaan atau perintah.\n\n*Contoh:*\n\`${usedPrefix + command}\` *Buatkan kode html login*\n\`${usedPrefix + command}\` *Putar lagu APT Rose*`);

    if (text?.toLowerCase() === 'reset') {
        delete sessions[m.chat];
        return m.reply('♻️ *Ingatan Joy telah direset.* Kita mulai dari nol ya!');
    }

    try {
        // --- PROMPT (DARI KODE KEDUA) ---
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
1. NO BASA-BASI: DILARANG pakai pengantar "Oke", "Bentar", "Sedang diproses".
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

        let currentSession = sessions[m.chat] || null;

        const response = await gemini({
            message: text,
            instruction: systemInstruction,
            sessionId: currentSession
        });

        sessions[m.chat] = response.sessionId;
        const textResponse = response.text;

        // --- IMPLEMENTASI SEARCH & DOWNLOAD ---
        if (textResponse.includes("CMD: play")) {
            const rawQuery = textResponse.replace("CMD: play", "").trim();
            let musicMsg = await conn.reply(m.chat, `_Oke, Joy cariin "${rawQuery}"..._ 🎧`, m);
            
            try {
                // 1. SEARCH DULU (API GIMITA)
                // Kita cari URL spesifiknya dulu biar akurat
                let videoUrl = rawQuery; // Fallback ke query kalau search error
                
                try {
                    const searchApiUrl = `https://api.gimita.id/api/search/youtube?query=${encodeURIComponent(rawQuery)}`;
                    const searchRes = await fetch(searchApiUrl);
                    const searchJson = await searchRes.json();
                    
                    if (searchJson.data && searchJson.data.length > 0) {
                        // Ambil URL dari hasil pertama
                        videoUrl = searchJson.data[0].url;
                    }
                } catch (searchErr) {
                    console.error("Gimita Search Error:", searchErr.message);
                    // Kalau search error, lanjut aja pake rawQuery ke downloader
                }

                // 2. DOWNLOAD (API NEKOLABS - KODE YANG UDAH ADA)
                // Kita oper videoUrl (Link hasil search) ke sini
                const downloadApiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(videoUrl)}`;
                const apiRes = await fetch(downloadApiUrl);
                
                if (!apiRes.ok) throw new Error("API Downloader Down");
                
                const json = await apiRes.json();
                if (!json.success || !json.result) throw new Error("Lagu tidak ditemukan.");
                
                const { metadata, downloadUrl } = json.result;

                // Hapus pesan waiting
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
        m.reply(`*Joy Error:* ${e.message}\n_Coba ketik .joy reset jika error berlanjut._`);
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

handler.help = ['ai *teks*'];
handler.tags = ['ai'];
handler.command = /^(joy|ai|gemini)$/i;

export default handler;

// --- FUNGSI GEMINI BAWAAN ---
async function gemini({ message, instruction = '', sessionId = null }) {
    try {
        if (!message) throw new Error('Message is required.');
        
        let resumeArray = null;
        let cookie = null;
        let savedInstruction = instruction;
        
        if (sessionId) {
            try {
                const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString());
                resumeArray = sessionData.resumeArray;
                cookie = sessionData.cookie;
                savedInstruction = instruction || sessionData.instruction || '';
            } catch (e) {
                console.error('Error parsing session:', e.message);
            }
        }
        
        if (!cookie) {
            const { headers } = await axios.post('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c', 
                'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&', 
                { headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
            );
            cookie = headers['set-cookie']?.[0]?.split('; ')[0] || '';
        }
        
        const requestBody = [
            [message, 0, null, null, null, null, 0], ["en-US"], resumeArray || ["", "", "", null, null, null, null, null, null, ""],
            null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null,
            ["", "", savedInstruction, null, null, null, null, null, 0, null, 1, null, null, null, []],
            null, null, 1, null, null, null, null, null, null, null, 
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1]
        ];
        
        const payload = [null, JSON.stringify(requestBody)];
        
        const { data } = await axios.post('https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c', 
            new URLSearchParams({ 'f.req': JSON.stringify(payload) }).toString(), 
            {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                    'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
                    'cookie': cookie
                }
            }
        );
        
        const match = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm));
        if (!match || match.length < 4) throw new Error("Gagal parsing respon (Format berubah/IP Block).");

        const array = match.reverse();
        const selectedArray = array[3][1];
        const realArray = JSON.parse(selectedArray);
        const parse1 = JSON.parse(realArray[0][2]);
        
        const newResumeArray = [...parse1[1], parse1[4][0][0]];
        const text = parse1[4][0][1][0].replace(/\*\*(.+?)\*\*/g, '*$1*');
        
        const newSessionId = Buffer.from(JSON.stringify({
            resumeArray: newResumeArray,
            cookie: cookie,
            instruction: savedInstruction
        })).toString('base64');
        
        return { text: text, sessionId: newSessionId };

    } catch (error) {
        throw new Error(error.message);
    }
}