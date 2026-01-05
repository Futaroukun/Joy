import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import fetch from 'node-fetch'
import { sendButtons } from '../function/button.js'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const hasInput = text || m.quoted || (m.msg && (m.msg.caption || m.msg.text));
    const isMedia = /image|video|sticker|webp/i.test((m.msg || m).mimetype || '');

    if (!hasInput && !isMedia) {
        return m.reply(`*JOY AI ASSISTANT*\n\nKirim pertanyaan, foto, atau stiker.\n\n*Contoh:*\n\`${usedPrefix + command}\` *Apa resep nasi goreng?*\n\`${usedPrefix + command}\` *(reply gambar)* *Gambar apa ini?*\n\`${usedPrefix + command}\` *Putarin lagu DJ Jedag Jedug*`)
    }
    
    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    
    // --- KONFIGURASI PROMPT ---
    const ownerPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS UTAMA:
Nama: Joy (Asisten AI Rafli).
Gaya Bicara: Santai, pakai "gua" dan "lu". To the point.
Tugas: Bantu urusan teknis coding, manajemen bot, dan hiburan.
Loyalitas: Mutlak ke Rafli.

ATURAN KHUSUS (MUSIK/LAGU):
Jika Rafli meminta memutar lagu, musik, atau nyanyi, JANGAN BANYAK BACOT.
Cukup balas dengan format: "CMD: play [Judul Lagu]"
Contoh:
- Rafli: "Joy putarin lagu apt dong" -> Jawab: "CMD: play APT Rose Bruno Mars"
- Rafli: "Gua mau denger lagu galau" -> Jawab: "CMD: play lagu galau indonesia populer"

ATURAN RESPON UMUM:
1. NO BASA-BASI: DILARANG pakai pengantar "Tunggu bentar", "Gua cari dulu", dll.
2. LANGSUNG JAWAB: Berikan info langsung.
`;
    
    const userPrompt = `
[SYSTEM INSTRUCTION]
IDENTITAS:
Nama: Joy (Asisten AI buatan Rafli).
Gaya Bicara: Santai, gaul, akrab. Pakai "gua" dan "kamu".
Tugas: Jawab pertanyaan dengan cerdas tapi asik.

ATURAN KHUSUS (MUSIK/LAGU):
Jika user meminta lagu, balas dengan format: "CMD: play [Judul Lagu]"

ATURAN RESPON UMUM:
1. NO BASA-BASI: Jangan pakai kata pengantar.
2. LANGSUNG JAWAB: Langsung ke poin utamanya.
`;
    
    const scanKeywords = ['scan', 'kode', 'code', 'file', 'fix', 'debug', 'analisis', 'struktur', 'error', 'perbaiki', 'analisa', 'source code'];
    const isScanMode = isOwner && scanKeywords.some(keyword => prompt.toLowerCase().includes(keyword));
    let systemInstruction = isOwner ? ownerPrompt : userPrompt;
    
    if (isScanMode) {
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
                // Kalau ada gambar, tetap pakai loading teks biar user tau lagi download
                loadingMsg = await conn.reply(m.chat, "*Bentar, Joy lagi liat medianya...*", m);
                try {
                    buffer = await q.download();
                    messages.push({ role: "user", content: prompt || "Jelasin media ini secara detail." });
                } catch (e) {
                    return m.reply("*Gagal download media.*");
                }
            } else if (q.text) {
                // Kalau teks doang, pakai status 'typing' (komposing)
                await conn.sendPresenceUpdate('composing', m.chat)
                messages.push({ role: "user", content: `Konteks Pesan: "${q.text}"\n\nPerintah: ${prompt}` });
            } else {
                await conn.sendPresenceUpdate('composing', m.chat)
                messages.push({ role: "user", content: prompt });
            }
        } else {
            const mime = (m.msg || m).mimetype || '';
            if (/image|video|sticker|webp/i.test(mime)) {
                // Kalau ada gambar, tetap pakai loading teks
                loadingMsg = await conn.reply(m.chat, "*Joy lagi liat gambarnya...*", m);
                try {
                    buffer = await m.download();
                    messages.push({ role: "user", content: prompt || "Deskripsiin detail media ini." });
                } catch (e) {
                    return m.reply("*Gagal download media.*");
                }
            } else {
                // --- BAGIAN YANG DIUBAH ---
                // Dulu: loadingMsg = await conn.reply(m.chat, "*Joy lagi mikir...*", m);
                // Sekarang: Pakai efek mengetik saja biar natural & gak nyampah
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
        
        // Hapus loading message (hanya jika ada, misal saat scan/kirim gambar)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        // --- LOGIKA MUSIK ---
        if (response.includes("CMD: play")) {
            const songName = response.replace("CMD: play", "").trim()
            
            // Info singkat bahwa lagu sedang diproses
            // Pesan ini opsional, bisa dihapus kalau mau benar-benar silent
            let musicMsg = await conn.reply(m.chat, `_Oke, Joy cariin "${songName}"..._ 🎧`, m)
            
            try {
                const apiUrl = `https://api.nekolabs.web.id/dwn/youtube/play/v1?q=${encodeURIComponent(songName)}`
                const apiRes = await fetch(apiUrl)
                
                if (!apiRes.ok) throw new Error("Server API lagi down.")
                
                const json = await apiRes.json()
                if (!json.success || !json.result) throw new Error("Lagu gak ketemu.")
                
                const { metadata, downloadUrl } = json.result

                // Hapus pesan "Joy cariin"
                if (musicMsg?.key) {
                    try { await conn.sendMessage(m.chat, { delete: musicMsg.key }) } catch {}
                }

                let caption = `*JOY MUSIC PLAYER* 🎵\n\n` +
                              `*Judul:* ${metadata.title}\n` +
                              `*Channel:* ${metadata.channel}\n` +
                              `*Durasi:* ${metadata.duration}\n\n` +
                              `_Nih lagunya..._`

                await conn.sendMessage(m.chat, {
                    text: caption,
                    contextInfo: {
                        externalAdReply: {
                            title: metadata.title,
                            body: "Now Playing via Joy AI",
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
        // --- END LOGIKA MUSIK ---

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

handler.help = ['ai *teks*', 'ai *putar lagu*']
handler.tags = ['ai']
handler.command = /^(ai|joy|gemini)$/i

export default handler;