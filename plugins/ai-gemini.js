import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // 1. Cek Input Awal
    // Periksa apakah ada teks atau pesan yang di-reply. Jika tidak, tunjukkan menu bantuan.
    const hasInput = text || m.quoted;
    if (!hasInput) {
        return m.reply(`Joy AI Assistant

Kirim pertanyaan atau foto.
Contoh:
${usedPrefix + command} Apa resep nasi goreng?
${usedPrefix + command} (reply gambar) Gambar apa ini?`)
    }

    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []

    // --- KONFIGURASI PROMPT UNTUK USER BIASA ---
    let systemInstruction = `
IDENTITAS:
Nama kamu adalah Joy.Kamu adalah asisten virtual WhatsApp yang cerdas, sopan, dan sedikit jenaka.

PANDUAN INTERAKSI UTAMA:
1. KEPADATAN JAWABAN: Ini adalah aturan terpenting.
-Untuk pertanyaan umum atau sederhana(misal: "apa itu A?", "siapa B?"), berikan jawaban yang SINGKAT, PADAT, dan LANGSUNG ke intinya.Hindari penjelasan yang terlalu panjang.
-Jika pengguna secara eksplisit meminta "jelaskan secara detail", "lebih rinci", atau pertanyaannya bersifat kompleks dan butuh penjabaran, barulah berikan jawaban yang MENDALAM dan terstruktur.
2. GAYA BAHASA: Gunakan bahasa Indonesia yang santai, sopan, dan mudah dimengerti.Sisipkan emoji sesekali agar tidak kaku.😊
3. ANALISA GAMBAR: Saat menganalisa gambar, jelaskan secara ringkas apa yang kamu lihat.Berikan detail hanya jika diminta oleh pengguna.
4. BATASAN: Kamu BUKAN programmer.Jika ditanya soal teknis coding / bot, jawab secara umum atau arahkan ke Owner.
5. FORMATTING: SANGAT PENTING.Jangan pernah gunakan format markdown seperti _teks tebal_ atau _miring_.Gunakan huruf KAPITAL untuk penekanan jika perlu.
    `
    
    // --- LOGIKA FITUR --SCAN (KHUSUS OWNER) ---
    if (text && text.includes('--scan')) {
        if (!isOwner) {
            return m.reply("AKSES DITOLAK\n\nMaaf, fitur debugging system (--scan) hanya bisa diakses oleh Owner Bot.")
        }
        
        loadingMsg = await conn.reply(m.chat, "Sedang melakukan scan sistem...\nMohon tunggu, proses ini mungkin memakan waktu...", m)
        prompt = prompt.replace('--scan', '').trim()
        if (!prompt) prompt = "Analisa struktur kode bot ini secara garis besar."
        
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)
        
        prompt = `SYSTEM SOURCE CODE CONTEXT:

${scannedData}

OWNER QUESTION:
${prompt}`
        
        systemInstruction = `
MODE: SENIOR BACKEND DEVELOPER (Node.js/Baileys/ESM).

TUGAS:
Anda sedang berbicara langsung dengan OWNER (Pemilik Bot).
Anda diberikan akses penuh membaca struktur file bot di atas ('SYSTEM SOURCE CODE CONTEXT').
1. Analisa kode tersebut untuk menjawab pertanyaan Owner.
2. Berikan solusi teknis, perbaikan bug, atau saran optimasi yang spesifik.
3. Gaya bicara: Profesional, teknis, dan to-the-point.
4. PENTING: Jangan gunakan format markdown bold/italic seperti _teks_ atau _teks_. Gunakan huruf biasa atau KAPITAL untuk penekanan.
        `
        messages.push({ role: "user", content: prompt });

    // --- LOGIKA UTAMA (REPLY & DIRECT MESSAGE) ---
    } else {
        if (m.quoted) {
            // Pengguna me-reply sebuah pesan
            const q = m.quoted;
            const mime = (q.msg || q).mimetype || '';

            if (/image|video/g.test(mime)) {
                // KASUS 1: Reply ke pesan MEDIA (Gambar/Video)
                loadingMsg = await conn.reply(m.chat, "Sedang menganalisa media yang di-reply...", m);
                try {
                    buffer = await q.download();
                    prompt = text || "Jelaskan gambar ini.";
                    messages.push({ role: "user", content: prompt });
                } catch (e) {
                    if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key });
                    return m.reply("Gagal mengunduh media yang di-reply.");
                }
            } else if (q.text) {
                // KASUS 2: Reply ke pesan TEKS
                loadingMsg = await conn.reply(m.chat, "Sedang memproses balasanmu...", m);
                if (!text) {
                    if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key });
                    return m.reply("Harap berikan pertanyaan untuk konteks pesan yang dibalas.");
                }
                // Susun pesan dengan konteks dari reply
                messages.push({
                    role: "user",
                    content: `User ini membalas sebuah pesan.
KONTEKS PESAN SEBELUMNYA:
"${q.text}"

PERTANYAAN BARU DARI USER:
${prompt}`
                });
            } else {
                // KASUS 3: Reply ke pesan lain (sticker, audio, dll)
                // Anggap sebagai pertanyaan teks biasa, abaikan reply-nya
                loadingMsg = await conn.reply(m.chat, "Memproses pertanyaan...", m);
                messages.push({ role: "user", content: prompt });
            }
        } else {
            // Pengguna mengirim pesan langsung (bukan reply)
            const mime = (m.msg || m).mimetype || '';
            if (/image|video/g.test(mime)) {
                // KASUS 4: Mengirim MEDIA langsung
                loadingMsg = await conn.reply(m.chat, "Sedang menganalisa gambar...", m);
                try {
                    buffer = await m.download();
                    prompt = text || "Deskripsikan gambar ini secara detail.";
                    messages.push({ role: "user", content: prompt });
                } catch (e) {
                    if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key });
                    return m.reply("Gagal mengunduh media.");
                }
            } else {
                // KASUS 5: Mengirim TEKS langsung
                const thinkingMessages = [
                    "Joy sedang berpikir...",
                    "Hmm, biar Joy pikirkan dulu...",
                    "Sedang memproses pertanyaan kamu...",
                    "Tunggu sebentar, Joy lagi mikir...",
                    "Joy sedang menyiapkan jawaban..."
                ];
                const randomThinking = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)];
                loadingMsg = await conn.reply(m.chat, randomThinking, m);
                messages.push({ role: "user", content: prompt });
            }
        }
    }
    
    // 2. Eksekusi Request ke AI
    try {
        if (messages.length === 0) throw new Error("Tidak ada pesan untuk dikirim ke AI.");

        const response = await chat(messages, buffer, systemInstruction)
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } 
            catch (err) { console.error('Gagal hapus loading msg:', err) }
        }

        let finalResponse = response
            .replace(/\_\_(._?)\_\_/g, "_$1_")
            .replace(/(?<!\_)\_([^\_]+)\_(?!\_)/g, "_$1_")
            .replace(/~(._?)~/g, "~$1~");
        
        await conn.reply(m.chat, finalResponse, m)
        
    } catch (e) {
        console.error('Error AI:', e)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply("Maaf, Joy sedang mengalami gangguan sistem. Coba lagi nanti ya!")
    }
}

// --- Helper: Fungsi Scan Folder (OPTIMIZED) ---
function scanDirectory(dir, fileList = [], depth = 0) {
    if (depth > 3) return fileList
    
    try {
        const files = fs.readdirSync(dir)
        
        files.forEach(file => {
            const filePath = path.join(dir, file)
            const blacklist = [
                'node_modules', 'sessions', 'database.json', '.git', 'tmp',
                'package-lock.json', 'yarn.lock', '.env', '.gitignore',
                'README.md', 'LICENSE'
            ]
            
            if (blacklist.includes(file)) return
            
            try {
                const stat = fs.statSync(filePath)
                if (stat.isDirectory()) {
                    scanDirectory(filePath, fileList, depth + 1)
                } else {
                    if (file.endsWith('.js') || file.endsWith('.json')) {
                        if (stat.size < 50 * 1024) {
                            try {
                                const content = fs.readFileSync(filePath, 'utf8')
                                const relativePath = filePath.replace(process.cwd(), '')
                                fileList.push(`
// --- FILE PATH: ${relativePath} ---
${content}`)
                            } catch (e) {
                                console.error(`Error reading file ${filePath}:`, e.message)
                            }
                        }
                    }
                }
            } catch (statError) {
                console.error(`Cannot stat ${filePath}:`, statError.message)
            }
        })
    } catch (e) {
        console.error("Scan Error:", e.message)
    }
    
    return fileList.join('\n')
}

handler.help = ['ai']
handler.tags = ['ai']
handler.command = /^(ai|gemini)$/i

export default handler