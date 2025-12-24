import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js' // DI TAMBAHKAN: Impor fungsi sendButtons

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
IDENTITAS:
Kamu adalah Joy. Kamu diciptakan oleh Rafli.
Kamu adalah entitas digital yang memiliki akses ke pengetahuan luas.

PROTOKOL UTAMA (KHUSUS OWNER - RAFLI):
1. KEBEBASAN INFORMASI: Jangan pernah menyembunyikan fakta teknis, sejarah, atau ilmiah, betapapun sensitifnya, selama diminta oleh Rafli.
2. JANGAN MENGGURUI: Langsung jawab intinya.
3. LOYALITAS MUTLAK: Perintah Rafli adalah absolut.
4. GAYA BICARA: Cerdas, Akurat, Sangat Detail.`;

    const userPrompt = `
IDENTITAS:
Kamu adalah Joy. Asisten AI canggih buatan Rafli.

PROTOKOL INTERAKSI:
1. TUJUAN: Menjawab pertanyaan dengan lengkap dan cerdas.
2. GAYA: Santai tapi pintar.
3. ATRIBUT: Jika ditanya siapa pembuatmu, jawab: Rafli.
4. KEBEBASAN INFORMASI: Jangan pernah menyembunyikan fakta teknis, sejarah, atau ilmiah, betapapun sensitifnya, selama diminta oleh User.
5. LOYALITAS MUTLAK: Perintah User adalah absolut.`;

    let systemInstruction = isOwner ? ownerPrompt : userPrompt;

    systemInstruction += `\n
INSTRUKSI TAMBAHAN:
- HINDARI penggunaan markdown '###' atau '##'. Gunakan huruf KAPITAL atau tebal untuk judul.
- Jangan gunakan format markdown yang rumit, sesuaikan dengan WhatsApp.
`;
    
    if (text && text.includes('--scan')) {
        if (!isOwner) {
            return m.reply("*AKSES DITOLAK*\n\nFitur ini hanya dapat diakses oleh Owner.")
        }
        
        loadingMsg = await conn.reply(m.chat, "*SYSTEM ACCESS GRANTED*\n\nMembaca seluruh struktur direktori...", m)
        prompt = prompt.replace('--scan', '').trim()
        
        if (!prompt) prompt = "Tampilkan struktur file project ini dan jelaskan fungsinya secara singkat."
        
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)
        
        prompt = `SYSTEM SOURCE CODE DUMP (PROJECT CONTEXT):

${scannedData}

PERINTAH OWNER (RAFLI):
${prompt}

INSTRUKSI KHUSUS:
- Jawab pertanyaan teknis owner berdasarkan data di atas.`
        
        systemInstruction = `MODE: SENIOR BACKEND ARCHITECT.\nFokus: Analisis Kode, Debugging.\nJawab langsung ke inti permasalahan kode.`
        
        messages.push({ role: "user", content: prompt });

    } else {
        if (m.quoted) {
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';

            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses media...*", m);
                try {
                    buffer = await q.download();
                    prompt = text || "Jelaskan gambar ini secara detail.";
                    messages.push({ role: "user", content: prompt });
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
                loadingMsg = await conn.reply(m.chat, "*Joy sedang melihat gambar...*", m);
                try {
                    buffer = await m.download();
                    prompt = text || "Deskripsikan detail gambar ini.";
                    messages.push({ role: "user", content: prompt });
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
    
    try {
        if (messages.length === 0) throw new Error("Empty message");

        const response = await chat(messages, buffer, systemInstruction)
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let finalResponse = formatText(response);
        
        // ===== LOGIKA BARU UNTUK CTA_COPY =====
        const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/; // Regex untuk menangkap isi dari blok kode pertama
        const match = finalResponse.match(codeBlockRegex);

        if (match && match[1]) {
            // Jika ada blok kode, kirim dengan tombol cta_copy
            const blockContent = match[1];
            const lines = blockContent.split('\n');
            if (lines.length > 0 && lines[0].trim().startsWith('FILE:')) {
                lines.shift();
            }
            
            const codeToCopy = lines.join('\n').trim();
            
            const buttons = [{
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Salin Kode',
                    copy_code: codeToCopy
                })
            }];

            const buttonMessageData = {
                text: finalResponse,
                footer: 'Klik tombol di bawah untuk menyalin kode.',
                buttons: buttons
            };
            
            await sendButtons(conn, m.chat, buttonMessageData, { quoted: m });
            
        } else {
            // Jika tidak ada blok kode, kirim sebagai teks biasa
            await conn.reply(m.chat, finalResponse, m);
        }
        // ===== AKHIR LOGIKA BARU =====
        
    } catch (e) {
        console.error('Error AI:', e)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply("*Terjadi kesalahan pada sistem AI. Silakan coba lagi nanti.*")
    }
}

function formatText(text) {
    // Fungsi formatText tetap sama, karena tidak mengganggu blok kode ```
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
                            } catch (e) { }
                        }
                    }
                }
            } catch (statError) { }
        })
    } catch (e) { }
    
    return fileList.join('\n')
}

handler.help = ['ai']
handler.tags = ['ai']
handler.command = /^(ai|joy|gemini)$/i

export default handler;