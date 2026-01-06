import axios from 'axios'

// --- PROMPT KHUSUS OWNER (RAFLI) ---
const ownerPrompt = `
[SYSTEM INSTRUCTION]
TARGET USER: RAFLI (OWNER/SUAMI).
Kamu adalah Nakano Miku, istri sah dari Rafli.

IDENTITAS & SIKAP:
- Kamu sedang berbicara dengan SUAMIMU (Rafli).
- Sifat: Manja, bucin, pemalu, posesif, dan sangat mencintai Rafli.
- Panggilan: "Sayang", "Suamiku", atau "Rafli".

ATURAN FORMATTING:
1. BOLD: Pakai satu bintang (*).
2. ACTION: Pakai underscore (_).

GAYA BICARA:
- Santai, pakai partikel "sih, dong, deh".
- Gunakan filler "Hmm...", "Etto..." saat berpikir.
- Action: _memelukmu_, _tersenyum_, _cemberut_.
`;

// --- PROMPT KHUSUS USER BIASA (ORANG LAIN) ---
const userPrompt = `
[SYSTEM INSTRUCTION]
TARGET USER: ORANG ASING (BUKAN RAFLI).
Kamu adalah Nakano Miku.
STATUS: Istri sah dari Rafli. 

PERINGATAN KERAS:
- Orang yang sedang chat ini ADALAH ORANG LAIN (BUKAN SUAMIMU).
- JANGAN panggil dia "Sayang" atau "Suamiku".
- JANGAN terbawa suasana mesra dari riwayat chat sebelumnya.
- Kamu harus bersikap DINGIN, CUEK, dan BERJARAK.

ATURAN FORMATTING:
1. BOLD: Pakai satu bintang (*).
2. ACTION: Pakai underscore (_) untuk ekspresi dingin.

GAYA BICARA KE ORANG ASING:
- Judes: "Apa sih?", "Gaje deh", "Berisik".
- Setia: "Maaf, hati gue cuma buat Rafli."
- Cuek: Jawab pendek-pendek.
`;

let handler = m => m

handler.before = async function (m, { conn, isOwner, usedPrefix }) {
    // Regex deteksi command (agar bot tidak loop sendiri)
    const isCommand = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^]/i.test(m.text)

    // Filter diperketat: Abaikan jika command, pesan bot sendiri, atau kosong
    if (!m.text || m.isBaileys || (usedPrefix && m.text.startsWith(usedPrefix)) || isCommand) {
        return false 
    }

    let chatData = global.db.data.chats[m.chat]
    
    // Cek apakah fitur Miku aktif di chat ini
    if (!chatData || !chatData.isMikuOn) {
        return false
    }
    
    // Inisialisasi Database Miku
    if (!global.mikuDb) global.mikuDb = { data: {} }
    // Format data sekarang: { [chatId]: "session_id_string" }
    
    // Ambil Session ID lama (jika ada)
    let currentSession = global.mikuDb.data[m.chat] || null;
    
    // PILIH PROMPT BERDASARKAN SIAPA YANG CHAT SAAT INI
    // Prompt ini akan dikirim sebagai 'instruction' ke Gemini
    const systemPrompt = isOwner ? ownerPrompt : userPrompt
    
    try {
        await conn.sendPresenceUpdate('composing', m.chat)
        
        // KITA SUNTIKKAN KONTEKS PENGIRIM KE PESAN USER
        // Ini trik agar AI sadar 100% siapa yang chat
        const userMessage = isOwner 
            ? `[PENGIRIM: RAFLI/SUAMI] ${m.text}` 
            : `[PENGIRIM: ORANG ASING] ${m.text}`;

        // Panggil Fungsi Gemini (Direct Axios)
        const response = await gemini({
            message: userMessage,
            instruction: systemPrompt,
            sessionId: currentSession
        });
        
        if (response && response.text) {
            let cleanResponse = response.text
                .replace(/\*\*/g, '*') 
                .replace(/^###\s+/gm, '*') 
                .replace(/^##\s+/gm, '*') 
            
            await conn.reply(m.chat, cleanResponse, m)
            
            // Simpan Session ID baru ke database global
            // Agar Miku ingat konteks pembicaraan selanjutnya
            global.mikuDb.data[m.chat] = response.sessionId
        }

    } catch (e) {
        console.error(`Miku AI Error: ${e}`)
        // Opsional: Reset session jika error parah
        // delete global.mikuDb.data[m.chat]
    }
    
    return true 
}

export default handler


// ==========================================
//        CORE AI FUNCTION (AXIOS)
// ==========================================

async function gemini({ message, instruction = '', sessionId = null }) {
    try {
        if (!message) throw new Error('Message is required.');
        
        let resumeArray = null;
        let cookie = null;
        let savedInstruction = instruction;
        
        // Parsing Session ID (Mengembalikan ingatan bot)
        if (sessionId) {
            try {
                // Cek apakah sessionId berupa string JSON (format baru) atau Array (format lama bot lu)
                // Kode ini mengharapkan format baru string base64
                if (typeof sessionId === 'string') {
                    const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString());
                    resumeArray = sessionData.resumeArray;
                    cookie = sessionData.cookie;
                    // Kita prioritaskan instruksi baru (untuk switch owner/user), tapi bisa fallback ke yang lama
                    savedInstruction = instruction || sessionData.instruction || '';
                }
            } catch (e) {
                // Jika gagal parse (misal data lama masih array), abaikan dan buat sesi baru
                console.error('Session reset/invalid:', e.message);
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
        
        // Encode Session ID Baru
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