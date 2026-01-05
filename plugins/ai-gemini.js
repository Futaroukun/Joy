import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch' // Wajib ada untuk fitur musik
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    const isMedia = /image|video|sticker|webp/i.test((m.msg || m).mimetype || '');

    if (!hasInput && !isMedia) {
        return m.reply(`*JOY AI ASSISTANT*\n\nKirim pertanyaan, foto, atau stiker.\n\n*Contoh:*\n\`${usedPrefix + command}\` *Apa resep nasi goreng?*\n\`${usedPrefix + command}\` *(reply gambar)* *Gambar apa ini?*`)
    }
    
    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    
    // --- PROMPT ASLI (TIDAK DIUBAH, HANYA TAMBAH ATURAN MUSIK) ---
    const ownerPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS UTAMA:
Nama: Joy (Asisten AI Rafli).
Gaya Bicara: Santai, pakai gua dan lu. To the point.
Tugas: Bantu urusan teknis coding dan manajemen bot.
Loyalitas: Mutlak ke Rafli.

ATURAN MUSIK (WAJIB):
Jika Rafli minta putar lagu/musik, JANGAN nanya balik. Langsung balas dengan format: "CMD: play [Judul Lagu]"
Contoh: "CMD: play APT Rose Bruno Mars"

ATURAN RESPON:
1. NO BASA-BASI: DILARANG menggunakan kalimat pengantar seperti Tunggu bentar, Gua cari dulu, Ketemu nih, Oke bos, atau Sedang diproses.
2. LANGSUNG JAWAB: Langsung berikan informasi atau jawaban yang diminta tanpa pengantar.
`;
    
    const userPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS:
Nama: Joy (Asisten AI buatan Rafli).
Gaya Bicara: Santai, gaul, akrab. Pakai gua dan kamu.
Tugas: Jawab pertanyaan dengan cerdas tapi asik.

ATURAN MUSIK (WAJIB):
Jika user minta putar lagu, balas dengan format: "CMD: play [Judul Lagu]"

ATURAN RESPON:
1. NO BASA-BASI: Jangan pakai kata pengantar kayak Bentar ya, Aku cari dulu, Ketemu.
2. LANGSUNG JAWAB: Langsung ke poin utamanya aja.
`;
    
    const scanKeywords = ['scan', 'kode', 'code', 'file', 'fix', 'debug', 'analisis', 'struktur', 'error', 'perbaiki', 'analisa', 'source code'];
    const isScanMode = isOwner && scanKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
    let systemInstruction = isOwner ? ownerPrompt : userPrompt;
    
    if (isScanMode) {
        // Khusus Scan Mode tetap pakai loading text biar kelihatan lagi kerja berat
        loadingMsg = await conn.reply(m.chat, "*SYSTEM ACCESS GRANTED (OWNER)*\n\nLagi baca struktur direktori...", m)
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)
        systemInstruction = `[SYSTEM INSTRUCTION]\nMODE: SENIOR BACKEND ARCHITECT.\nFokus: Analisis Kode, Debugging.\nGaya: Teknis, santai (gua-lu).\nATURAN: Langsung analisis masalah tanpa basa-basi pembuka.\nKonteks Proyek:\n${scannedData}`;
        messages.push({ role: "user", content: `Analisis permintaan ini: ${prompt}` });
    } else {
        if (m.quoted) {
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';
            if (/image|video|sticker|webp/i.test(mime)) {
                // Media: Pakai status mengetik
                await conn.sendPresenceUpdate('composing', m.chat)
                try {
                    buffer = await q.download();
                    messages.push({ role: "user", content: prompt || "Jelasin media ini secara detail." });
                } catch (e) {
                    return m.reply("*Gagal download media.*");
                }
            } else if (q.text) {
                // Quoted Text: Pakai status mengetik
                await conn.sendPresenceUpdate('composing', m.chat)
                messages.push({ role: "user", content: `Konteks Pesan: "${q.text}"\n\nPerintah: ${prompt}` });
            } else {
                await conn.sendPresenceUpdate('composing', m.chat)
                messages.push({ role: "user", content: prompt });
            }
        } else {
            const mime = (m.msg || m).mimetype || '';
            if (/image|video|sticker|webp/i.test(mime)) {
                // Kirim Gambar: Pakai status mengetik
                await conn.sendPresenceUpdate('composing', m.chat)
                try {
                    buffer = await m.download();
                    messages.push({ role: "user", content: prompt || "Deskripsiin detail media ini." });
                } catch (e) {
                    return m.reply("*Gagal download media.*");
                }
            } else {
                // CHAT BIASA: GANTI LOADING JADI MENGETIK (COMPOSING)
                await conn.sendPresenceUpdate('composing', m.chat)
                messages.push({ role: "user", content: prompt });
            }
        }
    }
    
    if (messages.length > 0) {
        messages[0].content = systemInstruction + "\n\n" + messages[0].content;
    }

    try {
        const response = await chat(messages, buffer)
        
        // Hapus loading message (Khusus Scan Mode)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        // --- LOGIKA PLAY MUSIC (INTEGRASI) ---
        if (response.includes("CMD: play")) {
            const songName = response.replace("CMD: play", "").trim()
            
            // Info singkat (Opsional, pake typing juga bisa kalau mau benar2 silent)
            // await conn.sendPresenceUpdate('composing', m.chat) 
            let musicMsg = await conn.reply(m.chat, `_Oke, gua cariin "${songName}"..._`, m)
            
            try {
                const apiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(songName)}`
                const apiRes = await fetch(apiUrl)
                
                if (!apiRes.ok) throw new Error("Server API lagi down.")
                
                const json = await apiRes.json()
                if (!json.success || !json.result) throw new Error("Lagu gak ketemu.")
                
                const { metadata, downloadUrl } = json.result

                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }) } catch {}

                let caption = `*JOY MUSIC PLAYER*\n\n` +
                              `*Judul:* ${metadata.title}\n` +
                              `*Channel:* ${metadata.channel}\n` +
                              `*Durasi:* ${metadata.duration}`

                await conn.sendMessage(m.chat, {
                    text: caption,
                    contextInfo: {
                        externalAdReply: {
                            title: metadata.title,
                            body: "Joy AI",
                            thumbnailUrl: metadata.cover,
                            sourceUrl: metadata.url,
                            mediaType: 1,
                            renderLargerThumbnail: true
                        }
                    }
                }, { quoted: m })

                await conn.sendMessage(m.chat, {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${metadata.title}.mp3`
                }, { quoted: m })

            } catch (musicError) {
                if (musicMsg?.key) try { await conn.sendMessage(m.chat, { delete: musicMsg.key }) } catch {}
                m.reply(`*Gagal muter lagu.*\nError: ${musicError.message}`)
            }
            return; 
        }
        // --- END LOGIKA MUSIC ---
        
        let finalResponse = formatText(response);
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
                footer: "Klik tombol buat salin kode.",
                buttons: buttons
            }, { quoted: m });
        } else {
            await conn.reply(m.chat, finalResponse, m);
        }
        
    } catch (e) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Joy Error:* ${e.message}`)
    }
}

function formatText(text) {
    if (!text) return "Gak ada respon dari AI.";
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
            const blacklist = ['node_modules', '.git', 'package-lock.json', 'yarn.lock', 'session', 'sessions', 'creds.json', '.env', 'src', 'tmp']
            if (blacklist.some(b => file.includes(b))) return
            try {
                const stat = fs.statSync(filePath)
                if (stat.isDirectory()) {
                    scanDirectory(filePath, fileList, depth + 1)
                } else {
                    if (/\.(js|json|html|txt|md)$/i.test(file) && stat.size < 50 * 1024) {
                        const content = fs.readFileSync(filePath, 'utf8')
                        const relativePath = filePath.replace(process.cwd(), '')
                        fileList.push(`\nFILE: ${relativePath}\n${content}`)
                    }
                }
            } catch (e) {}
        })
    } catch (e) {}
    return fileList.join('\n')
}

handler.help = ['ai *teks*']
handler.tags = ['ai']
handler.command = /^(ai|joy|gemini)$/i

export default handler;