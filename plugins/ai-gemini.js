import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted;
    if (!hasInput) {
        return m.reply(`*JOY - ASISTEN DEVELOPER*

Gua bisa bantu lu ngoding bot WhatsApp ini.

*CARA PAKAI:*
• Langsung tanya: *${usedPrefix + command} cara bikin fitur kick*
• Reply gambar: *${usedPrefix + command} jelaskan gambar ini*
• Analisis kode: *${usedPrefix + command} fix error handler.js*

*FITUR KHUSUS OWNER:*
• *scan* - Gua baca SEMUA file project lu
• *analisis* - Gua cek struktur kodenya
• *fix* - Gua bantu benerin error
• *code* - Gua kasih contoh kode lengkap
• *debug* - Gua tracking bug-nya

*CONTOH:*
*${usedPrefix + command} scan cara bikin fitur upload*
*${usedPrefix + command} fix error di antidelete*
*${usedPrefix + command} code buat fitur sticker*`)
    }
    
    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    
    // === PROMPT SISTEM BERDASARKAN USER TYPE ===
    
    const devPrompt = `
GUA JOY - ASISTEN DEVELOPER BOT WHATSAPP

SKILL GUA:
- Expert JavaScript/Node.js ES6+
- Master Baileys WhatsApp Library
- Paham full struktur bot ini
- Bisa baca & analisis semua file project
- Kasih solusi teknis yang bener-bener work

GAYA NGOBROL:
- Santai tapi tetep profesional
- Pake "gua" buat diri sendiri, "lu" buat user
- Gak pake kata baku/formal
- Langsung to the point
- Kasih contoh kode yang jelas

TUGAS UTAMA:
1. Bantu debug & fix error
2. Kasih contoh kode yang siap pakai
3. Jelasin konsep teknis dengan simple
4. Optimasi performa bot
5. Review & improve code quality

STRUKTUR PROJECT INI:
- function/ - Utilities (gemini, converter, uploader, dll)
- plugins/ - Fitur bot (semua command ada disini)
- handler.js - Message handler utama (LID system)
- main.js - Entry point & connection
- database.json - User data, chats, settings

TECH STACK:
- @whiskeysockets/baileys v7.0.0
- Node.js ESM (import/export)
- LowDB untuk database
- Baileys LID system (bukan JID lagi!)

ATURAN PENTING:
1. SELALU cek file yang ada sebelum kasih solusi
2. Code harus compatible sama ESM (import/export)
3. Pakai LID bukan JID (sistem terbaru Baileys)
4. Jangan lupa error handling
5. Code harus clean & readable

CONTOH JAWABAN GUA:
"Oke gua liat error lu di handler.js. Masalahnya di line X, lu lupa convert JID ke LID. Ini fix-nya:

\`\`\`javascript
// SEBELUM (SALAH)
const user = global.db.data.users[m.sender]

// SESUDAH (BENAR)
const senderLID = await ensureLID(conn, m.sender)
const user = global.db.data.users[senderLID]
\`\`\`

Jadi sekarang user data bakal disimpen pake LID yang lebih stabil."

FORMAT OUTPUT:
- Jangan pake markdown heading (###)
- Pake KAPITAL atau *tebal* buat judul
- Code block pake \`\`\`language
- Kasih penjelasan sebelum & sesudah code
- Hindari penjelasan yang bertele-tele`;

    const userPrompt = `
GUA JOY - ASISTEN AI

IDENTITAS:
Gua Joy, AI assistant yang dibuat sama Rafli buat bantu lu.

CARA NGOBROL:
- Santai aja kayak ngobrol sama temen
- Gua pake "gua" buat diri sendiri
- Lu gua panggil "kamu" atau "lu" 
- Gak pake bahasa formal
- Jawaban yang jelas & to the point

TUGAS GUA:
Jawab pertanyaan lu dengan cerdas dan kasih info yang akurat. Kalo ada yang nanya siapa yang bikin gua, bilang aja "Rafli".

ATURAN:
- Jangan bohong atau ngarang info
- Kalo gak tau, bilang gak tau
- Kasih penjelasan yang gampang dipahami
- Hindari markdown yang ribet, sesuaiin sama WhatsApp`;

    // === DETEKSI KEYWORD UNTUK AUTO SCAN ===
    const needFullScan = isOwner && [
        'scan', 'analisis', 'struktur', 'semua file', 'full code',
        'cek semua', 'review code', 'baca semua', 'lihat semua'
    ].some(kw => prompt.toLowerCase().includes(kw));

    const needSpecificFile = isOwner && [
        'handler', 'main.js', 'database', 'plugin', 'function',
        'error di', 'bug di', 'fix', 'debug', 'cek file'
    ].some(kw => prompt.toLowerCase().includes(kw));

    // === SISTEM PILIH MODE ===
    let systemInstruction = isOwner ? devPrompt : userPrompt;
    
    systemInstruction += `\n
PENTING:
- Jangan pake markdown heading (### atau ##)
- Pake KAPITAL atau *tebal* untuk judul
- Format harus cocok buat WhatsApp
- Code block tetep pake \`\`\`language
`;

    // === MODE 1: FULL SCAN (OWNER + KEYWORD) ===
    if (needFullScan) {
        loadingMsg = await conn.reply(m.chat, 
            "*FULL SYSTEM SCAN MODE*\n\nGua lagi baca seluruh project lu...\n_Ini bakal agak lama dikit_", 
            m
        );
        
        const rootDir = process.cwd();
        const scannedData = fullProjectScan(rootDir);
        
        const finalPrompt = `
=== FULL PROJECT SOURCE CODE ===

${scannedData}

=== PERTANYAAN DEVELOPER ===
${prompt}

=== INSTRUKSI ===
Lu sekarang punya AKSES PENUH ke semua file project. Analisis dengan teliti dan kasih jawaban yang:
1. Merujuk langsung ke file & line yang relevan
2. Kasih solusi yang bener-bener applicable
3. Jelasin hubungan antar file kalo perlu
4. Sertakan contoh code yang complete`;
        
        messages.push({ role: "user", content: finalPrompt });
        
    } 
    // === MODE 2: SPECIFIC FILE SCAN (OWNER + KEYWORD) ===
    else if (needSpecificFile) {
        loadingMsg = await conn.reply(m.chat, 
            "*TARGETED SCAN MODE*\n\nGua lagi cek file yang relevan...", 
            m
        );
        
        // Deteksi file mana yang perlu di-scan
        const targetFiles = detectTargetFiles(prompt);
        const fileContents = [];
        
        for (const file of targetFiles) {
            const content = readSpecificFile(file);
            if (content) {
                fileContents.push(`\n=== FILE: ${file} ===\n${content}`);
            }
        }
        
        const finalPrompt = `
=== CONTEXT FILES ===
${fileContents.join('\n\n')}

=== PERTANYAAN DEVELOPER ===
${prompt}

=== INSTRUKSI ===
File-file diatas adalah context yang relevan. Analisis dan kasih solusi yang tepat.`;
        
        messages.push({ role: "user", content: finalPrompt });
    }
    // === MODE 3: CHAT BIASA (USER ATAU OWNER TANPA KEYWORD) ===
    else {
        if (m.quoted) {
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';
            
            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Gua lagi liat media lu...*", m);
                try {
                    buffer = await q.download();
                    messages.push({ 
                        role: "user", 
                        content: prompt || "Jelasin detail apa yang lu liat di gambar ini." 
                    });
                } catch (e) {
                    return m.reply("*Gagal download media.* Coba lagi.");
                }
            } else if (q.text) {
                loadingMsg = await conn.reply(m.chat, "*Gua baca context-nya...*", m);
                messages.push({
                    role: "user",
                    content: `Context: "${q.text}"\n\nPertanyaan: ${prompt}`
                });
            } else {
                loadingMsg = await conn.reply(m.chat, "*Processing...*", m);
                messages.push({ role: "user", content: prompt });
            }
        } else {
            const mime = (m.msg || m).mimetype || '';
            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Lagi analisis gambar...*", m);
                try {
                    buffer = await m.download();
                    messages.push({ 
                        role: "user", 
                        content: prompt || "Jelasin detail gambar ini." 
                    });
                } catch (e) {
                    return m.reply("*Gagal download media.*");
                }
            } else {
                loadingMsg = await conn.reply(m.chat, "*Tunggu sebentar...*", m);
                messages.push({ role: "user", content: prompt });
            }
        }
    }
    
    // === KIRIM KE AI & PROSES RESPONSE ===
    try {
        if (messages.length === 0) throw new Error("Empty message");
        
        const response = await chat(messages, buffer, systemInstruction);
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        let finalResponse = formatText(response);
        
        // Extract code blocks untuk tombol copy
        const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g;
        const matches = [...finalResponse.matchAll(codeBlockRegex)];
        const buttons = [];
        const MAX_BUTTONS = 3;
        
        if (matches.length > 0) {
            for (let i = 0; i < matches.length && i < MAX_BUTTONS; i++) {
                const match = matches[i];
                const blockContent = match[1];
                
                const lines = blockContent.split('\n');
                while (lines.length > 0 && (lines[0].trim().startsWith('FILE:') || lines[0].trim().startsWith('//'))) {
                    lines.shift();
                }
                const codeToCopy = lines.join('\n').trim();
                
                if (codeToCopy) {
                    buttons.push({
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: `Copy Code ${i + 1}`,
                            copy_code: codeToCopy
                        })
                    });
                }
            }
        }
        
        if (buttons.length > 0) {
            let footerText = `Klik tombol buat copy code.`;
            if (matches.length > MAX_BUTTONS) {
                footerText += `\n(Cuma ${MAX_BUTTONS} block pertama yang dibuatin tombol)`;
            }
            
            await sendButtons(conn, m.chat, {
                text: finalResponse,
                footer: footerText,
                buttons: buttons
            }, { quoted: m });
        } else {
            await conn.reply(m.chat, finalResponse, m);
        }
        
    } catch (e) {
        console.error('AI Error:', e);
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply("*Error di sistem AI.* Coba lagi nanti.");
    }
}

// === HELPER FUNCTIONS ===

function formatText(text) {
    return text
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*')
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/__([^_]+)__/g, '*$1*')
        .replace(/~~([^~]+)~~/g, '~$1~')
        .replace(/^\s*\*\s+/gm, '- ');
}

function fullProjectScan(dir, fileList = [], depth = 0) {
    if (depth > 5) return fileList;
    
    try {
        const files = fs.readdirSync(dir);
        
        files.forEach(file => {
            const filePath = path.join(dir, file);
            const blacklist = ['node_modules', '.git', 'package-lock.json', 'yarn.lock', 'tmp'];
            
            if (blacklist.includes(file)) return;
            
            try {
                const stat = fs.statSync(filePath);
                if (stat.isDirectory()) {
                    fullProjectScan(filePath, fileList, depth + 1);
                } else {
                    if (/\.(js|json|md)$/i.test(file)) {
                        if (stat.size < 200 * 1024) { // Max 200KB per file
                            try {
                                const content = fs.readFileSync(filePath, 'utf8');
                                const relativePath = filePath.replace(process.cwd(), '');
                                fileList.push(`
=== FILE: ${relativePath} ===
${content}
`);
                            } catch (e) {
                                console.error(`Skip file ${file}:`, e.message);
                            }
                        }
                    }
                }
            } catch (statError) {
                console.error(`Stat error ${file}:`, statError.message);
            }
        });
    } catch (e) {
        console.error(`Read dir error ${dir}:`, e.message);
    }
    
    return fileList.join('\n');
}

function detectTargetFiles(prompt) {
    const files = [];
    const lowerPrompt = prompt.toLowerCase();
    
    // Mapping keyword ke file
    const fileMap = {
        'handler': 'handler.js',
        'main': 'main.js',
        'database': 'database.json',
        'settings': 'settings.js',
        'antidelete': 'function/antidelete.js',
        'connection': 'function/connection.js',
        'gemini': 'function/gemini.js',
        'converter': 'function/converter.js',
        'uploader': 'function/uploader.js',
        'button': 'function/button.js',
        'simple': 'function/simple.js',
        'store': 'function/store.js',
        'leveling': 'lib/leveling.js'
    };
    
    for (const [keyword, file] of Object.entries(fileMap)) {
        if (lowerPrompt.includes(keyword)) {
            files.push(file);
        }
    }
    
    // Deteksi plugin specific
    if (lowerPrompt.includes('plugin')) {
        const pluginMatch = prompt.match(/plugin[s]?[\s\/\\-]*([\w-]+)/i);
        if (pluginMatch) {
            files.push(`plugins/${pluginMatch[1]}.js`);
        }
    }
    
    // Default files kalo gak ada yang match
    if (files.length === 0) {
        files.push('handler.js', 'main.js');
    }
    
    return [...new Set(files)]; // Remove duplicates
}

function readSpecificFile(filePath) {
    try {
        const fullPath = path.join(process.cwd(), filePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath, 'utf8');
        }
    } catch (e) {
        console.error(`Error reading ${filePath}:`, e.message);
    }
    return null;
}

handler.help = ['ai *teks*'];
handler.tags = ['ai'];
handler.command = /^(ai|gemini|joy)$/i;

export default handler;