import axios from 'axios'
import fetch from 'node-fetch'
import { sendButtons } from '../function/button.js'

// Penyimpanan sesi (Memory) agar bot ingat konteks
let sessions = {};

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // 1. Validasi Input
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    if (!hasInput) return m.reply(`*JOY AI ASSISTANT*\n\nKirim pertanyaan atau perintah.\n\n*Contoh:*\n\`${usedPrefix + command}\` *Buatkan kode html login*\n\`${usedPrefix + command}\` *Putar lagu APT Rose*`);

    // 2. Fitur Reset Ingatan
    if (text?.toLowerCase() === 'reset') {
        delete sessions[m.chat];
        return m.reply('♻️ *Ingatan Joy telah direset.* Kita mulai dari nol ya!');
    }

    try {
        // --- KONFIGURASI PROMPT (IDENTITAS JOY) ---
        const ownerPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS: Joy (Asisten Pribadi Rafli).
USER SAAT INI: Rafli (Owner/Pembuatmu).
SIFAT: Penurut, santai, setia, dan to the point (gue-lu).

ATURAN MUSIK (WAJIB):
Jika Rafli minta putar lagu/musik, JANGAN MENOLAK. Langsung balas dengan format: "CMD: play [Judul Lagu]"
Contoh: "CMD: play APT Rose Bruno Mars"

ATURAN KODING:
Jika diminta kodingan, berikan kode yang lengkap dan jelaskan singkat saja.
`;
    
        const userPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS: Joy (Asisten AI Publik).
USER SAAT INI: User Umum.
SIFAT: Santai, gaul, akrab (gue-lu), tapi tetap sopan.

ATURAN MUSIK (WAJIB):
Jika user minta putar lagu, balas dengan format: "CMD: play [Judul Lagu]"

ATURAN UMUM:
Jawab pertanyaan dengan cerdas tapi asik. Jangan terlalu kaku.
`;

        // Pilih Prompt
        const systemInstruction = isOwner ? ownerPrompt : userPrompt;

        // Kirim status mengetik
        await conn.sendPresenceUpdate('composing', m.chat);

        // Ambil sesi lama (jika ada)
        let currentSession = sessions[m.chat] || null;

        // --- PANGGIL FUNGSI GEMINI (AXIOS) ---
        const response = await gemini({
            message: text,
            instruction: systemInstruction,
            sessionId: currentSession
        });

        // Simpan sesi baru (Update Ingatan)
        sessions[m.chat] = response.sessionId;
        const textResponse = response.text;

        // --- 3. LOGIKA MUSIK (AUTO PLAY) ---
        if (textResponse.includes("CMD: play")) {
            const songName = textResponse.replace("CMD: play", "").trim();
            let musicMsg = await conn.reply(m.chat, `_Oke, Joy cariin "${songName}"..._ 🎧`, m);
            
            try {
                // API Nekolabs (Sesuai kodemu sebelumnya)
                const apiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(songName)}`;
                const apiRes = await fetch(apiUrl);
                if (!apiRes.ok) throw new Error("API Down");
                
                const json = await apiRes.json();
                if (!json.success || !json.result) throw new Error("Lagu tidak ditemukan.");
                
                const { metadata, downloadUrl } = json.result;

                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }); } catch {}

                let caption = `*JOY MUSIC PLAYER* 🎵\n\n` +
                              `*Judul:* ${metadata.title}\n` +
                              `*Channel:* ${metadata.channel}\n` +
                              `*Durasi:* ${metadata.duration}`;

                // Kirim Thumbnail & Info
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

                // Kirim Audio
                await conn.sendMessage(m.chat, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${metadata.title}.mp3`
                }, { quoted: m });

            } catch (musicError) {
                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }); } catch {}
                m.reply(`*Gagal memutar lagu.*\nError: ${musicError.message}`);
            }
            return; // Stop eksekusi agar tidak mengirim teks CMD
        }

        // --- 4. LOGIKA CTA COPY (TOMBOL SALIN KODE) ---
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
        
        // Kirim response (pake tombol jika ada kode, pake teks biasa jika tidak)
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

// Fungsi Formatting Markdown
function formatText(text) {
    if (!text) return "Gak ada respon.";
    return text
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*') // Heading jadi Bold
        .replace(/\*\*([^*]+)\*\*/g, '*$1*') // **Bold** jadi *Bold*
        .replace(/__([^_]+)__/g, '*$1*') // __Bold__ jadi *Bold*
        .replace(/^\s*\*\s+/gm, '- '); // List bullet
}

handler.help = ['joy <teks>', 'ai <teks>'];
handler.tags = ['ai'];
handler.command = /^(joy|ai|gemini)$/i;

export default handler;


// ==========================================
//        CORE AI FUNCTION (AXIOS)
// ==========================================

async function gemini({ message, instruction = '', sessionId = null }) {
    try {
        if (!message) throw new Error('Message is required.');
        
        let resumeArray = null;
        let cookie = null;
        let savedInstruction = instruction;
        
        // Parsing Session ID
        if (sessionId) {
            try {
                const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString());
                resumeArray = sessionData.resumeArray;
                cookie = sessionData.cookie;
                // Gunakan instruksi lama jika tidak ada instruksi baru yang spesifik
                savedInstruction = instruction || sessionData.instruction || '';
            } catch (e) {
                console.error('Error parsing session:', e.message);
            }
        }
        
        // Ambil Cookie Baru (Handshake) jika belum ada
        if (!cookie) {
            const { headers } = await axios.post('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c', 
                'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&', 
                { headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' } }
            );
            cookie = headers['set-cookie']?.[0]?.split('; ')[0] || '';
        }
        
        // Payload Request
        const requestBody = [
            [message, 0, null, null, null, null, 0], ["en-US"], resumeArray || ["", "", "", null, null, null, null, null, null, ""],
            null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null,
            ["", "", savedInstruction, null, null, null, null, null, 0, null, 1, null, null, null, []],
            null, null, 1, null, null, null, null, null, null, null, 
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1]
        ];
        
        const payload = [null, JSON.stringify(requestBody)];
        
        // Request Utama
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
        
        // Parsing Result
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