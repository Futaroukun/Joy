import axios from 'axios';
import { URLSearchParams } from 'url'; // Perlu diimport secara eksplisit di ESM

/**
- Fungsi untuk berinteraksi dengan Google Bard/Gemini melalui API internal yang TIDAK STABIL.
- Gunakan dengan risiko Anda sendiri, karena Google dapat mengubah endpoint ini kapan saja.
- * @param {object} options
- @param {string} options.message - Pesan yang akan dikirim ke AI.
- @param {string} [options.instruction=''] - Instruksi sistem/persona.
- @param {string} [options.sessionId=null] - Session ID dari respons sebelumnya untuk melanjutkan percakapan.
- @returns {Promise<{text: string, sessionId: string}>} - Objek berisi teks respons dan session ID baru.
 */
async function geminiBardUnstable({ message, instruction = '', sessionId = null }) {
    try {
        if (!message) throw new Error('Message is required.');

        let resumeArray = null;
        let cookie = null;
        let savedInstruction = instruction; // Gunakan instruction yang diberikan, atau dari session jika ada

        if (sessionId) {
            try {
                const sessionData = JSON.parse(Buffer.from(sessionId, 'base64').toString());
                resumeArray = sessionData.resumeArray;
                cookie = sessionData.cookie;
                // Jika ada instruction baru, override yang dari session, jika tidak, pakai yang dari session
                savedInstruction = instruction || sessionData.instruction || ''; 
            } catch (e) {
                console.error('Error parsing session data from sessionId:', e.message);
                // Jika parsing gagal, anggap ini session baru
                sessionId = null; 
            }
        }

        // Jika tidak ada cookie, atau session baru, coba dapatkan cookie baru
        if (!cookie) {
            console.log('[GEMINI_BARD_UNSTABLE] Mengambil cookie baru...');
            const firstRequestHeaders = {
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            };

            const firstResponseBody = 'f.req=%5B%5B%5B%22maGuAc%22%2C%22%5B0%5D%22%2Cnull%2C%22generic%22%5D%5D%5D&';
            const firstRequestUrl = 'https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&bl=boq_assistant-bard-web-server_20250814.06_p1&f.sid=-7816331052118000090&hl=en-US&_reqid=173780&rt=c'; // HARDCODED values

            const { headers } = await axios.post(firstRequestUrl, firstResponseBody, {
                headers: firstRequestHeaders
            });

            cookie = headers['set-cookie']?.[0]?.split('; ')[0] || '';
            if (!cookie) {
                throw new Error('Failed to get session cookie from Bard.');
            }
            console.log('[GEMINI_BARD_UNSTABLE] Cookie didapat.');
        }

        // Payload untuk StreamGenerate
        // HARDCODED VALUES: bl, f.sid, _reqid, x-goog-ext-525001261-jspb
        // HATI-HATI: Array ini sangat rentan berubah
        const requestBody = [
            [message, 0, null, null, null, null, 0], ["en-US"], resumeArray || ["", "", "", null, null, null, null, null, null, ""],
            null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1, null, null, null, null, null,
            ["", "", savedInstruction, null, null, null, null, null, 0, null, 1, null, null, null, []],
            null, null, 1, null, null, null, null, null, null, null,
            [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], 1, null, null, null, null, [1]
        ];

        const payload = [null, JSON.stringify(requestBody)];

        const streamGenerateUrl = 'https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?bl=boq_assistant-bard-web-server_20250729.06_p0&f.sid=4206607810970164620&hl=en-US&_reqid=2813378&rt=c'; // HARDCODED values
        const streamGenerateHeaders = {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'x-goog-ext-525001261-jspb': '[1,null,null,null,"9ec249fc9ad08861",null,null,null,[4]]', // HARDCODED values
            'cookie': cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };

        const { data } = await axios.post(streamGenerateUrl, new URLSearchParams({ 'f.req': JSON.stringify(payload) }).toString(), {
            headers: streamGenerateHeaders,
            timeout: 30000 // Tambahkan timeout
        });
        
        // Parsing respons
        const match = Array.from(data.matchAll(/^\d+\n(.+?)\n/gm));
        if (match.length < 4) { // Cek minimal ada match yang cukup
            console.error('Raw Bard Response:', data);
            throw new Error('Failed to parse Bard response: not enough matches.');
        }

        const array = match.reverse();
        const selectedArray = array[3][1];
        const realArray = JSON.parse(selectedArray);
        const parse1 = JSON.parse(realArray[0][2]);

        const newResumeArray = [...parse1[1], parse1[4][0][0]];
        const text = parse1[4][0][1][0].replace(/\*\*(.+?)\*\*/g, '*$1*').trim(); // Trim hasil akhir

        const newSessionId = Buffer.from(JSON.stringify({
            resumeArray: newResumeArray,
            cookie: cookie,
            instruction: savedInstruction // Simpan instruction yang aktif
        })).toString('base64');

        return {
            text: text,
            sessionId: newSessionId
        };
    } catch (error) {
        console.error('[GEMINI_BARD_UNSTABLE] Error:', error.message);
        throw new Error(`Bard (Unstable) API Error: ${error.message}`);
    }
}

export default geminiBardUnstable;