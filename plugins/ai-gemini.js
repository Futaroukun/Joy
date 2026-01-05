import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    
    const isMedia = /image|video|sticker|webp/i.test((m.msg || m).mimetype || '');

    if (!hasInput && !isMedia) {
        return m.reply(`*JOY AI ASSISTANT*

Kirim pertanyaan, foto, atau stiker.
Contoh:
*${usedPrefix + command} Apa resep nasi goreng?*
*${usedPrefix + command} (reply gambar/stiker) Gambar apa ini?*`)
    }
    
    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    
    const ownerPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS UTAMA:
Nama: Joy (Asisten AI Rafli).
Gaya Bicara: Santai, pakai "gua" (lu) dan "lu" (user/Rafli). To the point.
Tugas: Bantu urusan teknis coding dan manajemen bot.
Loyalitas: Mutlak ke Rafli.
`;
    
    const userPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS:
Nama: Joy (Asisten AI buatan Rafli).
Gaya Bicara: Santai, gaul, akrab. Pakai "gua" dan "kamu".
Tugas: Jawab pertanyaan dengan cerdas tapi asik.
`;
    
    const scanKeywords = [
        'scan', 'kode', 'code', 'file', 'fix', 'debug', 'analisis',
        'struktur', 'error', 'perbaiki', 'analisa', 'source code'
    ];
    
    const isScanMode = isOwner && scanKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
    
    let systemInstruction = isOwner ? ownerPrompt : userPrompt;
    
    if (isScanMode) {
        loadingMsg = await conn.reply(m.chat, "*SYSTEM ACCESS GRANTED (OWNER)*\n\nMembaca struktur direktori (mengabaikan src, tmp, sessions)...", m)
        
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)
        
        systemInstruction = `
[SYSTEM INSTRUCTION]
MODE: SENIOR BACKEND ARCHITECT.
Fokus: Analisis Kode, Debugging.
Gaya: Teknis, santai (gua-lu).
Konteks Proyek:
${scannedData}
`;
        messages.push({ role: "user", content: `Analisis permintaan ini: ${prompt}` });
        
    } else {
        if (m.quoted) {
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';
            
            if (/image|video|sticker|webp/i.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang melihat media (gambar/stiker)...*", m);
                try {
                    buffer = await q.download();
                    messages.push({ role: "user", content: prompt || "Jelaskan media ini secara detail." });
                } catch (e) {
                    return m.reply("*Gagal mengunduh media.*");
                }
            } else if (q.text) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang membaca konteks...*", m);
                messages.push({
                    role: "user",
                    content: `Konteks Pesan yang direply: "${q.text}"\n\nPerintah: ${prompt}`
                });
            } else {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses...*", m);
                messages.push({ role: "user", content: prompt });
            }
        } else {
            const mime = (m.msg || m).mimetype || '';
            
            if (/image|video|sticker|webp/i.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang melihat media (gambar/stiker)...*", m);
                try {
                    buffer = await m.download();
                    messages.push({ role: "user", content: prompt || "Deskripsikan detail media ini." });
                } catch (e) {
                    return m.reply("*Gagal mengunduh media.*");
                }
            } else {
                const thinkingMessages = ["*Joy sedang berpikir...*", "*Sedang mencari informasi...*"];
                loadingMsg = await conn.reply(m.chat, thinkingMessages[0], m);
                messages.push({ role: "user", content: prompt });
            }
        }
    }
    
    if (messages.length > 0) {
        messages[0].content = systemInstruction + "\n\n" + messages[0].content;
    }

    try {
        if (messages.length === 0) throw new Error("Empty message");
        
        const response = await chat(messages, buffer)
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        let finalResponse = formatText(response);
        
        const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g;
        const matches = [...finalResponse.matchAll(codeBlockRegex)];
        const buttons = [];
        const MAX_BUTTONS = 3;
        
        if (matches.length > 0) {
            for (let i = 0; i < matches.length && i < MAX_BUTTONS; i++) {
                const match = matches[i];
                const codeToCopy = match[1].trim();
                
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
            let footerText = `Klik tombol untuk menyalin kode.`;
            const buttonMessageData = {
                text: finalResponse,
                footer: footerText,
                buttons: buttons
            };
            await sendButtons(conn, m.chat, buttonMessageData, { quoted: m });
        } else {
            await conn.reply(m.chat, finalResponse, m);
        }
        
    } catch (e) {
        console.error('Error AI:', e)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Joy Error:* ${e.message}\n\n(Cek console log untuk detail)`)
    }
}

function formatText(text) {
    if (!text) return "Maaf, tidak ada respon dari AI.";
    return text
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*')
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/__([^_]+)__/g, '*$1*')
        .replace(/~~([^~]+)~~/g, '~$1~')
        .replace(/^\s*\*\s+/gm, '- ');
}

function scanDirectory(dir, fileList = [], depth = 0) {
    if (depth > 5) return fileList
    
    try {
        const files = fs.readdirSync(dir)
        
        files.forEach(file => {
            const filePath = path.join(dir, file)
            
            const blacklist = [
                'node_modules', 
                '.git', 
                'package-lock.json', 
                'yarn.lock',
                'session', 
                'sessions',
                'creds.json', 
                '.env',
                'src',
                'tmp'
            ]
            
            if (blacklist.some(b => file.includes(b))) return
            
            try {
                const stat = fs.statSync(filePath)
                if (stat.isDirectory()) {
                    scanDirectory(filePath, fileList, depth + 1)
                } else {
                    if (/\.(js|json|html|txt|md)$/i.test(file)) {
                        if (stat.size < 50 * 1024) { 
                            try {
                                const content = fs.readFileSync(filePath, 'utf8')
                                const relativePath = filePath.replace(process.cwd(), '')
                                fileList.push(`\nFILE: ${relativePath}\n${content}`)
                            } catch (e) {}
                        }
                    }
                }
            } catch (statError) {}
        })
    } catch (e) {}
    
    return fileList.join('\n')
}

handler.help = ['ai *teks*', 'ai *reply stiker*']
handler.tags = ['ai']
handler.command = /^(ai|joy|gemini)$/i

export default handler;