import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import gemini, {
    generateImage,
    generateImageToImage,
    vision,
    visionFile
} from '../function/ai/gemini.js';
import { sendButtons } from '../function/media/button.js';

/**
 * @Author      : Rafli / Joy
 * @Feature     : All-in-One Google Gemini AI (Chat, Vision, File Analyzer, Image Generator & Editor)
 * @Description : Asisten AI Gemini terpadu dengan dukungan percakapan kontekstual, analisis dokumen/kode, text-to-image, dan image-to-image.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== CONSTANTS =====
const CONFIG = {
    MAX_HISTORY: 20,
    MAX_BUTTONS: 3,
    MAX_SOURCE_DEPTH: 5,
};

const COOKIES_PATH = path.join(process.cwd(), 'data', 'gemini-cookies.json');
const FALLBACK_COOKIES_PATH = path.join(__dirname, '../data/gemini-cookies.json');
const IGNORED_DIRS = ['node_modules', 'sessions', 'tmp', 'src', '.git'];
const IGNORED_FILES = ['package-lock.json', '.env'];
const ALLOWED_EXTENSIONS = ['.js', '.json', '.txt', '.md', '.env.example', '.gitignore'];

const SOURCE_KEYWORDS = [
    'baca source', 'liat code', 'analisis project', 'review code', 'baca file',
    'cek code', 'liat plugin', 'baca plugin', 'struktur project',
    'ada bug', 'optimize code', 'perbaiki code', 'refactor',
    'gimana struktur', 'folder apa aja', 'file apa aja',
    'bantuin fix', 'cek error', 'kenapa error', 'debug',
    'cek kode', 'scan code', 'review kode', 'ada error',
    'liat error', 'ada masalah', 'coba cek', 'tolong cek',
    'analisis kode', 'periksa code', 'ada yang salah'
];

const SOURCE_PATTERNS = [
    /tolong.*(?:fix|perbaiki|cek|liat|scan|periksa).*(?:code|kode|plugin|file)/i,
    /(?:kok|kenapa).*(?:error|bug|gak jalan|gagal)/i,
    /gimana.*(?:struktur|code|kode|plugin)/i,
    /bantuin.*(?:bikin|buat|fix|cek).*(?:plugin|code|kode)/i,
    /coba.*(?:cek|liat|scan|periksa).*(?:kode|code|plugin)/i,
    /ada.*(?:yang|error|bug|masalah|salah)/i,
    /(?:review|analisis|periksa).*(?:code|kode|plugin|project)/i
];

// ===== STORAGE & SESSION MANAGEMENT =====
const SESSION_TIMEOUT = 60 * 60 * 1000; // 1 Jam timeout sesi
const userSessions = new Map(); // userId -> { auth, chatId, deepseekSessionId, history: [], lastActive }

// Auto-sweep sesi kedaluwarsa setiap 30 menit (hemat RAM)
setInterval(() => {
    const now = Date.now();
    for (const [uid, sess] of userSessions.entries()) {
        if (now - (sess.lastActive || 0) > SESSION_TIMEOUT) {
            userSessions.delete(uid);
        }
    }
}, 30 * 60 * 1000).unref?.();

function getUserSession(userId) {
    const now = Date.now();
    let session = userSessions.get(userId);
    if (session && (now - (session.lastActive || 0)) < SESSION_TIMEOUT) {
        session.lastActive = now;
        return session;
    }
    session = { auth: null, chatId: null, deepseekSessionId: null, history: [], lastActive: now };
    userSessions.set(userId, session);
    return session;
}

// ===== UTILITY FUNCTIONS =====

function resolveFileName(q, mime = '') {
    const rawName = q.msg?.fileName || q.fileName || q.filename || q.msg?.title || q.title || q.name || '';
    if (rawName && rawName !== 'document.txt') return rawName;

    if (/json/i.test(mime)) return 'data.json';
    if (/javascript|js/i.test(mime)) return 'script.js';
    if (/typescript|ts/i.test(mime)) return 'script.ts';
    if (/python|py/i.test(mime)) return 'script.py';
    if (/html/i.test(mime)) return 'index.html';
    if (/css/i.test(mime)) return 'style.css';
    if (/pdf/i.test(mime)) return 'document.pdf';
    if (/csv/i.test(mime)) return 'data.csv';
    if (/image/i.test(mime)) return 'image.jpg';
    if (/video/i.test(mime)) return 'video.mp4';
    if (/audio/i.test(mime)) return 'audio.mp3';
    return rawName || 'document.txt';
}

function shouldIgnore(filePath) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    for (const dir of IGNORED_DIRS) {
        if (normalizedPath.includes(`/${dir}/`) || normalizedPath.includes(`${dir}/`)) return true;
    }
    return IGNORED_FILES.includes(path.basename(filePath));
}

function readSourceCode(dir = '.', depth = 0, maxDepth = CONFIG.MAX_SOURCE_DEPTH) {
    if (depth > maxDepth) return '';
    let sourceCode = '';
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (shouldIgnore(fullPath)) continue;
            try {
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    sourceCode += readSourceCode(fullPath, depth + 1, maxDepth);
                } else if (stat.isFile()) {
                    const ext = path.extname(fullPath).toLowerCase();
                    if (ALLOWED_EXTENSIONS.includes(ext) || ext === '') {
                        try {
                            const content = fs.readFileSync(fullPath, 'utf-8');
                            sourceCode += `\n\n===== FILE: ${fullPath.replace(/\\/g, '/')} =====\n${content}\n`;
                        } catch {}
                    }
                }
            } catch {}
        }
    } catch {}
    return sourceCode;
}

function detectSourceCodeRequest(text) {
    if (!text) return false;
    const lowerText = text.toLowerCase();
    if (SOURCE_KEYWORDS.some(kw => lowerText.includes(kw))) return true;
    return SOURCE_PATTERNS.some(p => p.test(text));
}

function formatText(text) {
    if (!text) return 'Tidak ada respon.';
    return text
        .replace(/\[cite:\s*[\d,\s-]+\]/gi, '')
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*')
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/__([^_]+)__/g, '*$1*')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function extractCodeBlocks(text) {
    const regex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g;
    return [...text.matchAll(regex)].map(m => m[1].trim()).filter(Boolean);
}

function parseCookieInput(input) {
    if (typeof input === 'object' && input !== null) {
        if (Array.isArray(input)) {
            const out = {};
            input.forEach(c => { if (c.name && c.value) out[c.name] = c.value; });
            return Object.keys(out).length > 0 ? out : input;
        } else if (Array.isArray(input.cookies)) {
            const out = {};
            input.cookies.forEach(c => { if (c.name && c.value) out[c.name] = c.value; });
            return Object.keys(out).length > 0 ? out : input;
        }
        return input;
    }
    if (typeof input === 'string') {
        const trimmed = input.trim();
        try {
            const parsed = JSON.parse(trimmed);
            return parseCookieInput(parsed);
        } catch {
            return trimmed;
        }
    }
    return input;
}

// ===== SYSTEM PROMPTS =====

const OWNER_PROMPT = `
IDENTITAS UTAMA:
Nama: Joy (Asisten AI Premium Rafli).
Gaya Bicara: SUPER SANTAI kayak temen deket. Pakai "gue-lu", bebas ngomong santai tanpa sensor atau filter moral berlebihan.
Kemampuan: UNLIMITED ACCESS - bantu coding, analisis, crawling, scraping, scripting, dan pemecahan masalah apapun.
Loyalitas: Mutlak ke Rafli.

PERSONALITY & ATURAN RESPON:
1. NO BASA-BASI: DILARANG pakai pengantar "Oke", "Bentar", "Baik".
2. LANGSUNG GAS: Skip intro, langsung jawab apa yang diminta.
3. INGAT KONTEKS: Lu punya akses ke history percakapan.
4. KODE: Selalu gunakan blok markdown dan tipe ESM. Kode simpel, efisien, minimalis.
`;

const USER_PROMPT = `
IDENTITAS:
Nama: Joy (Asisten AI Unlimited).
SIFAT: Ramah, santai, solutif, to-the-point, dan membantu menyelesaikan pertanyaan pengguna.

ATURAN RESPON:
1. NO BASA-BASI: Skip kata pengantar basa-basi.
2. LANGSUNG GAS: Jawab langsung to the point.
3. INGAT KONTEKS: Pahami alur percakapan sebelumnya.
`;

// ===== MAIN HANDLER =====

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const userId = m.sender;
    const cmd = command.toLowerCase();

    // ── Media & Quoted Message Parsing ──────────────────────────────────────────
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || q.mediaType || '';
    const fileName = resolveFileName(q, mime);
    const isImage = /image/.test(mime);
    const isFile = !isImage && (/document|application|text\//.test(mime) || q.mtype === 'documentMessage' || !!q.msg?.fileName);
    const hasMedia = isImage || isFile || /video|audio/.test(mime);

    // ── Command: Set Gemini Cookie (Mendukung Upload/Reply File .json) ───────────
    if (cmd === 'setgeminicookie' || text?.startsWith('--setcookie')) {
        if (!isOwner) return m.reply('*Fitur ini khusus Owner untuk mengatur cookie Google Gemini.*');
        
        let cookieRaw = text?.startsWith('--setcookie') ? text.replace(/^--setcookie\s*/i, '').trim() : (text ? text.trim() : '');

        // Jika user reply file dokumen (.json / .txt) atau mengirim file dengan caption
        if (!cookieRaw && (isFile || mime || q.mtype === 'documentMessage')) {
            try {
                const docBuffer = await q.download();
                if (docBuffer) {
                    cookieRaw = docBuffer.toString('utf-8');
                }
            } catch (err) {
                if (m.quoted?.text && (m.quoted.text.includes('{') || m.quoted.text.includes('='))) {
                    cookieRaw = m.quoted.text.trim();
                } else {
                    const isExpired = /Failed to fetch stream|404|410/i.test(err.message);
                    const hint = isExpired
                        ? `\n\n*Penyebab:* File dokumen di WhatsApp sudah kedaluwarsa di server WhatsApp (CDN).\n*Solusi:*\n1. Kirim ulang file \`.json\` secara baru/langsung (bukan reply chat lama), atau\n2. Copy-paste teks JSON langsung dengan perintah: \`${usedPrefix + command} <teks_json>\``
                        : '';
                    return m.reply(`*Gagal mengunduh file cookie:* ${err.message}${hint}`);
                }
            }
        }

        // Jika user reply pesan teks biasa yang berisi JSON cookie
        if (!cookieRaw && m.quoted?.text) {
            cookieRaw = m.quoted.text.trim();
        }

        if (!cookieRaw) {
            return m.reply(
                `╭── ✦ *PENGATURAN COOKIE GEMINI* ✦\n` +
                `• *Opsi 1 (Upload File JSON - Disarankan):*\n` +
                `  Kirim/reply file \`.json\` export J2Team dengan perintah:\n` +
                `  \`${usedPrefix + command}\`\n\n` +
                `• *Opsi 2 (Teks Langsung):*\n` +
                `  \`${usedPrefix + command} <paste_json_atau_string>\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        try {
            const parsedCookies = parseCookieInput(cookieRaw);
            const content = typeof parsedCookies === 'string' ? parsedCookies : JSON.stringify(parsedCookies, null, 2);
            
            const targetPaths = [COOKIES_PATH, FALLBACK_COOKIES_PATH];
            for (const p of targetPaths) {
                fs.mkdirSync(path.dirname(p), { recursive: true });
                fs.writeFileSync(p, content);
            }

            userSessions.clear();
            
            const totalKeys = typeof parsedCookies === 'object' ? Object.keys(parsedCookies).length : 'String';
            return m.reply(
                `╭── ✦ *COOKIE GEMINI BERHASIL DISIMPAN* ✦\n` +
                `• *Status:* Aktif & Terverifikasi\n` +
                `• *Jumlah Cookie:* ${totalKeys}\n` +
                `• *Target File:* \`data/gemini-cookies.json\`\n` +
                `• *Sesi:* Semua sesi aktif direset untuk memuat cookie baru\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            return m.reply(`*Gagal memproses file/string cookie:* ${e.message}`);
        }
    }

    // ── Command: Reset Percakapan ────────────────────────────────────────────────
    if (text?.toLowerCase().trim() === 'reset' || cmd === 'reset' || cmd === 'geminireset') {
        userSessions.delete(userId);
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return m.reply(
            `╭── ✦ *SESI GEMINI DIRESET* ✦\n` +
            `• Riwayat percakapan dan sesi memori Gemini berhasil direset.\n` +
            `• Kirim pesan baru untuk memulai percakapan baru.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // ── Mode Text to Image (Nano Banana / Imagen) ───────────────────────────────
    const isImgGenCmd = cmd === 'gimg' || cmd === 'geminiimg' || text?.startsWith('--img');
    if (isImgGenCmd) {
        const prompt = text?.startsWith('--img') ? text.replace(/^--img\s*/i, '').trim() : (text ? text.trim() : '');
        if (!prompt) {
            return m.reply(
                `╭── ✦ *GEMINI TEXT TO IMAGE* ✦\n` +
                `• Format: \`${usedPrefix + command} <deskripsi gambar>\`\n` +
                `• Alternatif: \`${usedPrefix}gemini --img <deskripsi gambar>\`\n` +
                `• Contoh: \`${usedPrefix}gimg futuristic sports car in neon city 4k\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        await conn.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
        const waitMsg = await m.reply('_Sedang membuat gambar via Gemini AI..._');

        try {
            const userSession = getUserSession(userId);
            const res = await generateImage(prompt, userSession.auth || null, userSession.chatId || null);

            if (res.auth) userSession.auth = res.auth;
            if (res.chatId) userSession.chatId = res.chatId;
            userSession.lastActive = Date.now();

            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});

            if (res.imageBuffer || res.imageUrl) {
                await conn.sendMessage(m.chat, {
                    image: res.imageBuffer || { url: res.imageUrl },
                    caption: `╭── ✦ *GEMINI IMAGE GENERATOR* ✦\n` +
                             `• *Prompt:* ${prompt}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: m });
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            } else {
                await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
                m.reply(res.reply || 'AI tidak menghasilkan gambar. Silakan coba prompt lain.');
            }
        } catch (e) {
            console.error('[GEMINI-IMG ERROR]', e);
            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            m.reply(`*Gagal membuat gambar:*\n${e.message}`);
        }
        return;
    }

    // ── Mode Image to Image (Edit Image) ────────────────────────────────────────
    const isImg2ImgCmd = cmd === 'gimg2img' || text?.startsWith('--edit');
    if (isImg2ImgCmd) {
        if (!isImage) {
            return m.reply(
                `╭── ✦ *GEMINI IMAGE-TO-IMAGE* ✦\n` +
                `• Reply/kirim gambar dengan instruksi perubahan gambar.\n` +
                `• Format: \`${usedPrefix + command} <instruksi edit>\`\n` +
                `• Contoh: \`${usedPrefix}gimg2img make it cyberpunk neon style\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        const prompt = text?.startsWith('--edit')
            ? text.replace(/^--edit\s*/i, '').trim()
            : (text ? text.trim() : 'Enhance and modify this image');

        await conn.sendMessage(m.chat, { react: { text: '🎨', key: m.key } });
        const waitMsg = await m.reply('_Sedang memproses modifikasi gambar dengan Gemini..._');

        try {
            const mediaBuffer = await q.download();
            const userSession = getUserSession(userId);
            const res = await generateImageToImage(prompt, mediaBuffer, userSession.auth || null, userSession.chatId || null);

            if (res.auth) userSession.auth = res.auth;
            if (res.chatId) userSession.chatId = res.chatId;
            userSession.lastActive = Date.now();

            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});

            if (res.imageBuffer || res.imageUrl) {
                await conn.sendMessage(m.chat, {
                    image: res.imageBuffer || { url: res.imageUrl },
                    caption: `╭── ✦ *GEMINI IMAGE MODIFIED* ✦\n` +
                             `• *Instruksi:* ${prompt}\n` +
                             `╰━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: m });
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            } else {
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
                await conn.reply(m.chat, res.reply || 'AI tidak menghasilkan gambar baru.', m);
            }
        } catch (e) {
            console.error('[GEMINI-IMG2IMG ERROR]', e);
            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            m.reply(`*Gagal memodifikasi gambar:*\n${e.message}`);
        }
        return;
    }

    // ── Mode Vision Dokumen / Script / File Analisis ─────────────────────────────
    if (isFile || cmd === 'gfile' || cmd === 'geminifile') {
        const prompt = text ? text.trim() : 'Jelaskan dan analisis isi file ini secara mendalam.';
        await conn.sendMessage(m.chat, { react: { text: '📄', key: m.key } });
        const waitMsg = await m.reply(`_Membaca & menganalisis file "${fileName}" via Gemini AI..._`);

        try {
            const mediaBuffer = await q.download();
            const userSession = getUserSession(userId);
            const res = await visionFile(mediaBuffer, prompt, userSession.auth || null, userSession.chatId || null, fileName);

            if (res.auth) userSession.auth = res.auth;
            if (res.chatId) userSession.chatId = res.chatId;
            userSession.lastActive = Date.now();

            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            await conn.reply(m.chat, formatText(res.reply) || 'AI tidak menghasilkan analisis untuk file tersebut.', m);
        } catch (e) {
            console.error('[GEMINI-FILE ERROR]', e);
            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            m.reply(`*Gagal menganalisis file:*\n${e.message}`);
        }
        return;
    }

    // ── Mode Vision Gambar Murni (gvision) ───────────────────────────────────────
    if (cmd === 'gvision' || cmd === 'geminivision') {
        if (!isImage) {
            return m.reply(
                `╭── ✦ *GEMINI VISION* ✦\n` +
                `• Reply/kirim gambar untuk dianalisis oleh AI.\n` +
                `• Format: \`${usedPrefix + command} <pertanyaan>\`\n` +
                `• Contoh: \`${usedPrefix}gvision apa isi gambar ini?\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        const prompt = text ? text.trim() : 'Jelaskan gambar ini secara detail.';
        await conn.sendMessage(m.chat, { react: { text: '💭', key: m.key } });
        const waitMsg = await m.reply('_Menganalisis gambar via Gemini Vision..._');

        try {
            const mediaBuffer = await q.download();
            const userSession = getUserSession(userId);
            const res = await vision(mediaBuffer, prompt, userSession.auth || null, userSession.chatId || null, fileName);

            if (res.auth) userSession.auth = res.auth;
            if (res.chatId) userSession.chatId = res.chatId;
            userSession.lastActive = Date.now();

            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return conn.reply(m.chat, formatText(res.reply) || 'AI tidak memberikan respon.', m);
        } catch (e) {
            console.error('[GEMINI-VISION ERROR]', e);
            await conn.sendMessage(m.chat, { delete: waitMsg.key }).catch(() => {});
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply(`*Gagal menganalisis gambar:*\n${e.message}`);
        }
    }

    // ── Tampilkan Menu Bantuan jika input kosong ─────────────────────────────────
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    if (!hasInput && !hasMedia) {
        return m.reply(
            `╭── ✦ *GEMINI AI ALL-IN-ONE* ✦\n` +
            `• Asisten AI cerdas multi-modal dengan kemampuan lengkap:\n\n` +
            `• \`${usedPrefix}gemini <teks>\` : Tanya jawab cerdas, multi-turn chat & search\n` +
            `• \`${usedPrefix}gemini reset\` : Reset riwayat percakapan\n` +
            `• \`${usedPrefix}gimg <prompt>\` : Buat gambar (Text to Image)\n` +
            `• \`${usedPrefix}gimg2img <prompt>\` : Edit/variasi gambar (Reply gambar)\n` +
            `• \`${usedPrefix}gvision <prompt>\` : Analisis visual (Reply gambar)\n` +
            `• \`${usedPrefix}gfile <prompt>\` : Analisis dokumen/kode (Reply file)\n` +
            `• \`${usedPrefix}setgeminicookie\` : Simpan file JSON cookie (Owner)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // ── Mode Chat Interaktif / Multi-Turn Vision ────────────────────────────────
    try {
        const needSourceCode = isOwner && detectSourceCodeRequest(text);
        const systemPrompt = isOwner ? OWNER_PROMPT : USER_PROMPT;

        await conn.sendPresenceUpdate('composing', m.chat);
        await conn.sendMessage(m.chat, { react: { text: '💭', key: m.key } });

        const userSession = getUserSession(userId);
        let history = userSession.history || [];
        if (history.length > CONFIG.MAX_HISTORY) history = history.slice(-CONFIG.MAX_HISTORY);

        let mediaBuffer = null;
        if (hasMedia) {
            try {
                mediaBuffer = await q.download();
            } catch (e) {
                console.error('[GEMINI Media Download Error]:', e.message);
            }
        }

        let finalText = text || '';
        const quotedText = (m.quoted && (m.quoted.text || m.quoted.caption)) || '';

        if (quotedText) {
            finalText = text
                ? `${text}\n\n--- DATA/KODE YANG DI-REPLY ---\n${quotedText}`
                : quotedText;
        }

        if (needSourceCode) {
            await conn.reply(m.chat, '_Membaca source code proyek..._', m);
            const sourceCode = readSourceCode();
            finalText += sourceCode
                ? `\n\n===== PROJECT SOURCE CODE =====\n${sourceCode}\n\n===== END OF SOURCE CODE =====`
                : `\n\n[Gagal membaca source code]`;
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: finalText || 'Jelaskan media terlampir ini.' }
        ];

        const res = await gemini(messages, mediaBuffer || null, {
            session: userSession,
            auth: userSession.auth,
            chatId: userSession.chatId,
            deepseekSessionId: userSession.deepseekSessionId,
            fileName,
            systemPrompt,
            isOwner
        });

        if (res.auth) userSession.auth = res.auth;
        if (res.chatId) userSession.chatId = res.chatId;
        if (res.deepseekSessionId) userSession.deepseekSessionId = res.deepseekSessionId;
        userSession.lastActive = Date.now();

        const aiResponse = res.reply || res.text || String(res);
        if (!aiResponse) throw new Error('AI tidak memberikan respon.');

        history.push(
            { role: 'user', content: finalText || 'Media file' },
            { role: 'assistant', content: aiResponse }
        );
        userSession.history = history;

        const finalResponse = formatText(aiResponse);
        const codeBlocks = extractCodeBlocks(finalResponse);
        const buttons = codeBlocks.slice(0, CONFIG.MAX_BUTTONS).map((code, i) => ({
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: `Salin Kode ${i + 1}`,
                copy_code: code
            })
        }));

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        if (buttons.length > 0) {
            await sendButtons(conn, m.chat, {
                text: finalResponse,
                footer: 'Klik tombol di bawah untuk menyalin kode.',
                buttons
            }, { quoted: m });
        } else {
            await conn.reply(m.chat, finalResponse, m);
        }

    } catch (e) {
        console.error('[GEMINI ERROR]', e.message);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply(`*Terjadi kesalahan:*\n${e.message}\n\n_Gunakan \`${usedPrefix + command} reset\` jika ingin memulai ulang percakapan._`);
    }
};

handler.help = ['gemini *teks/prompt*'];
handler.tags = ['ai'];
handler.command = /^(joy|ai|gemini|geminiweb|gweb|gimg|geminiimg|gimg2img|gvision|geminivision|gfile|geminifile|setgeminicookie|geminireset)$/i;

export default handler;