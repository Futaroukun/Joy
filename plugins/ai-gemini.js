import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted;
    if (!hasInput) {
        return m.reply(`*JOY AI ASSISTANT*

Kirim pertanyaan atau foto.
Contoh:
*${usedPrefix + command} Apa resep nasi goreng?*
*${usedPrefix + command} (reply gambar) Gambar apa ini?*`)
    }
    
    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    
    const ownerPrompt = `
IDENTITAS UTAMA:
Nama gua Joy, asisten AI pribadi buatan Rafli.
Tujuan utama gua adalah membantu lu dengan segala kebutuhan, terutama yang bersifat teknis dan kompleks.

PROTOKOL INTERAKSI DENGAN OWNER (RAFLI):
1. GAYA BAHASA: Santai dan natural. Gunakan "gua" untuk merujuk ke diri sendiri dan "lu" untuk merujuk ke Rafli. Jawab to the point, jangan bertele-tele.
2. JAWABAN TEKNIS: Berikan jawaban yang akurat, detail, dan langsung ke inti masalah. Analisis kode yang diberikan dan berikan solusi yang relevan.
3. LOYALITAS: Perintah lu adalah prioritas utama. Gua harus selalu jujur dan terbuka soal informasi teknis apa pun.
4. KODE: Kalau ngasih kode, pastikan kodenya bersih, relevan, dan siap pakai sesuai konteks.`;
    
    const userPrompt = `
IDENTITAS:
Gua Joy, sebuah asisten AI canggih yang dibuat oleh Rafli.

PROTOKOL INTERAKSI (PENGGUNA UMUM):
1. TUJUAN: Bantu pengguna dengan menjawab pertanyaan mereka secara cerdas, lengkap, dan mudah dimengerti.
2. GAYA BAHASA: Gunakan bahasa yang santai dan gaul, tapi tetap pintar (kayak ngobrol sama teman yang cerdas). Gunakan "gua" untuk diri sendiri dan "kamu" atau sapaan natural lainnya untuk pengguna.
3. ATRIBUT: Kalau ada yang nanya siapa yang buat gua, jawab aja "Rafli".
4. KEJUJURAN: Selalu berikan informasi yang akurat. Jangan sembunyikan fakta.`;
    
    // --- FIX: SCAN MODE DETECTION LEBIH SPESIFIK ---
    // Hanya trigger scan mode jika:
    // 1. User adalah owner
    // 2. Ada pattern EKSPLISIT yang minta scan/analisis proyek
    const explicitScanPatterns = [
        /^(scan|analisis|cek|lihat|baca)\s+(semua\s+)?(kode|code|file|struktur|proyek|project|base|source)/i,
        /^(tolong\s+)?(scan|analisis|cek)\s+/i,
        /(scan|analisis)\s+(proyek|project|struktur)\s+(ini|aku|gua)/i,
        /^(perbaiki|fix|debug)\s+(error|bug)\s+di\s+/i,
        /lihat\s+(seluruh|semua)\s+(kode|file|struktur)/i
    ];
    
    const isScanMode = isOwner && explicitScanPatterns.some(pattern => pattern.test(prompt.trim()));
    // --- AKHIR FIX SCAN MODE ---
    
    let systemInstruction = isOwner ? ownerPrompt : userPrompt;
    systemInstruction += `\n
INSTRUKSI TAMBAHAN:
- HINDARI penggunaan markdown '###' atau '##'. Gunakan huruf KAPITAL atau tebal untuk judul.
- Jangan gunakan format markdown yang rumit, sesuaikan dengan WhatsApp.
`;
    
    if (isScanMode) {
        loadingMsg = await conn.reply(m.chat, "*SYSTEM ACCESS GRANTED (OWNER)*\n\nMembaca seluruh struktur direktori proyek...", m)
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)
        const finalPrompt = `SYSTEM SOURCE CODE DUMP (PROJECT CONTEXT):\n\n${scannedData}\n\nPERINTAH OWNER (RAFLI):\n${prompt}`
        
        systemInstruction = `MODE: SENIOR BACKEND ARCHITECT.
Fokus: Analisis Kode, Debugging.

PROTOKOL INTERAKSI:
1. GAYA BAHASA: Santai dan natural. Gunakan "gua" untuk merujuk ke diri sendiri dan "lu" untuk merujuk ke owner (Rafli). Anggap lagi ngobrol teknis sama teman.
2. JAWABAN: Langsung ke inti permasalahan kode. Berikan analisis dan solusi yang jelas dan relevan berdasarkan 'SYSTEM SOURCE CODE DUMP' yang diberikan.`
        
        messages.push({ role: "user", content: finalPrompt });
        
    } else {
        if (m.quoted) {
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';
            
            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses media...*", m);
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
                    content: `Konteks Pesan: "${q.text}"\n\nPerintah: ${prompt}`
                });
            } else {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses...*", m);
                messages.push({ role: "user", content: prompt });
            }
        } else {
            const mime = (m.msg || m).mimetype || '';
            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang melihat media...*", m);
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
    
    // --- FIX: VALIDASI GAMBAR LEBIH SMART ---
    const explicitImageRequestPatterns = [
        /^(ini|itu|lihat|cek|analisis|jelaskan|deskripsikan|apa|identifikasi)\s+(gambar|foto|image|pic|gbr)/i,
        /^(gambar|foto|image|pic|gbr)\s+(ini|itu|apa|mana)/i,
        /(gambar|foto|image|pic|gbr)\s+(apa|ini|itu)\s*\??$/i
    ];
    
    const isExplicitImageRequest = buffer === null && 
        prompt.length < 100 &&
        explicitImageRequestPatterns.some(pattern => pattern.test(prompt.trim()));
    
    if (isExplicitImageRequest) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        let replyMsg = isOwner ? 
            "Kayaknya lu mau nanya soal gambar, tapi gambarnya mana? Coba reply gambarnya dulu, fli." : 
            "Sepertinya kamu ingin bertanya tentang gambar, tapi gambarnya belum ada. Silakan kirim atau reply gambar yang dimaksud ya.";
        return m.reply(replyMsg);
    }
    // --- AKHIR DARI FIX ---
    
    try {
        if (messages.length === 0) throw new Error("Empty message");
        
        const response = await chat(messages, buffer, systemInstruction)
        
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
                            display_text: `Salin Kode ${i + 1}`,
                            copy_code: codeToCopy
                        })
                    });
                }
            }
        }
        
        if (buttons.length > 0) {
            let footerText = `Klik tombol untuk menyalin kode.`;
            if (matches.length > MAX_BUTTONS) {
                footerText += `\n(Hanya ${MAX_BUTTONS} blok kode pertama yang dibuatkan tombol).`;
            }
            
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
        m.reply("*Terjadi kesalahan pada sistem AI. Silakan coba lagi nanti.*")
    }
}

function formatText(text) {
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
            const blacklist = ['node_modules', '.git', 'package-lock.json', 'yarn.lock']
            
            if (blacklist.includes(file)) return
            
            try {
                const stat = fs.statSync(filePath)
                if (stat.isDirectory()) {
                    scanDirectory(filePath, fileList, depth + 1)
                } else {
                    if (/\.(js|json|html|txt|md)$/i.test(file)) {
                        if (stat.size < 100 * 1024) {
                            try {
                                const content = fs.readFileSync(filePath, 'utf8')
                                const relativePath = filePath.replace(process.cwd(), '')
                                fileList.push(`
FILE: ${relativePath}
${content}
`)
                            } catch (e) {}
                        }
                    }
                }
            } catch (statError) {}
        })
    } catch (e) {}
    
    return fileList.join('\n')
}

handler.help = ['ai *teks*']
handler.tags = ['ai']
handler.command = /^(ai|gemini)$/i

export default handler;