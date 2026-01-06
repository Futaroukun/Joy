import axios from 'axios';

// Penyimpanan sesi sementara (Memory) agar bot ingat konteks obrolan
// Format: { [chatId]: 'sessionId_string' }
let sessions = {};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // 1. Cek input teks
    if (!text) throw `*Contoh penggunaan:*\n${usedPrefix + command} Halo, siapa namamu?\n\n*Fitur lain:*\n${usedPrefix + command} reset (untuk menghapus ingatan bot)`;

    try {
        // 2. Fitur Reset Sesi
        if (text.toLowerCase() === 'reset') {
            delete sessions[m.chat];
            return m.reply('♻️ Sesi obrolan berhasil direset. Bot telah melupakan konteks sebelumnya.');
        }

        // 3. Kirim status mengetik/loading
        m.reply(global.wait || '_Sedang memproses..._');

        // 4. Ambil session ID jika ada (agar nyambung)
        let currentSession = sessions[m.chat] || null;
        
        // 5. System Instruction (Identitas Bot)
        // Kamu bisa ubah instruksi di bawah ini sesuai keinginan
        const systemInstruction = 'Kamu adalah Asisten AI WhatsApp yang cerdas, ramah, dan membantu. Jawablah pertanyaan dengan ringkas dan jelas. Gunakan format Markdown WhatsApp (Bold, Italic, Code) untuk mempercantik jawaban.';

        // 6. Panggil fungsi Gemini
        let response = await gemini({
            message: text,
            instruction: systemInstruction,
            sessionId: currentSession
        });

        // 7. Simpan session ID baru untuk obrolan selanjutnya
        sessions[m.chat] = response.sessionId;

        // 8. Kirim balasan
        await conn.sendMessage(m.chat, { text: response.text }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply('❌ Terjadi kesalahan saat menghubungi server Gemini. Coba lagi nanti.');
    }
}

handler.help = ['ai <teks>', 'gemini <teks>'];
handler.tags = ['ai'];
handler.command = /^(ai|gemini|bard)$/i;

export default handler;


// --- FUNGSI GEMINI (BAWAAN DARI KODE KAMU) ---

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
            const { headers } = await axios.post('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c', 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&', {
                headers: {
                    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
                }
            });
            
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
        
        const { data } = await axios.post('https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c', new URLSearchParams({ 'f.req': JSON.stringify(payload) }).toString(), {
            headers: {
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]',
                'cookie': cookie
            }
        });
        
        const match = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm));
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
        
        return {
            text: text,
            sessionId: newSessionId
        };
    } catch (error) {
        throw new Error(error.message);
    }
}