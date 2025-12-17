import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // 1. Cek Input (Harus ada teks atau reply media)
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    
    if (!text && !mime) {
        return m.reply(`🤖 Joy AI Assistant

Kirim pertanyaan atau foto.
Contoh:
${usedPrefix + command} Apa resep nasi goreng?
${usedPrefix + command} (reply gambar) Gambar apa ini?`)
    }

    let buffer = null
    let prompt = text || "Jelaskan gambar ini"
    let loadingMsg = null
    
    // --- KONFIGURASI PROMPT UNTUK USER BIASA ---
    let systemInstruction = `
IDENTITAS:
Nama kamu adalah Joy. Kamu adalah asisten virtual WhatsApp yang cerdas, sopan, dan sedikit jenaka.

PANDUAN INTERAKSI:
1. Jawablah dengan bahasa Indonesia yang santai namun tetap sopan.
2. Jika user mengirim gambar, jelaskan dengan detail apa yang kamu lihat.
3. Kamu BUKAN programmer user tersebut. Jika user bertanya soal teknis coding/bot, jawablah secara umum saja atau arahkan mereka menghubungi Owner.
4. Gunakan emoji sesekali agar tidak kaku. 😊
5. PENTING: Jangan gunakan format markdown bold/italic seperti *teks* atau _teks_ karena ini bot WhatsApp. Gunakan huruf biasa atau KAPITAL untuk penekanan.
    `

    // --- LOGIKA FITUR --SCAN (KHUSUS OWNER) ---
    if (text && text.includes('--scan')) {
        // A. Security Check: Tolak User Biasa
        if (!isOwner) {
            return m.reply("⛔ AKSES DITOLAK\n\nMaaf, fitur debugging system (--scan) hanya bisa diakses oleh Owner Bot.")
        }

        // Kirim pesan loading khusus untuk scan
        loadingMsg = await conn.reply(m.chat, "🔍 Sedang melakukan scan sistem...\n⏳ Mohon tunggu, proses ini mungkin memakan waktu...", m)

        // B. Bersihkan flag --scan dari prompt
        prompt = prompt.replace('--scan', '').trim()
        if (!prompt) prompt = "Analisa struktur kode bot ini secara garis besar."

        // C. Baca File System (Scan Folder Bot) - OPTIMIZED
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)

        // D. Inject Context Kode ke Prompt
        prompt = `SYSTEM SOURCE CODE CONTEXT:

${scannedData}

OWNER QUESTION:
${prompt}`

        // E. Override Persona Menjadi "Expert Developer"
        systemInstruction = `
MODE: SENIOR BACKEND DEVELOPER (Node.js/Baileys/ESM).

TUGAS:
Anda sedang berbicara langsung dengan OWNER (Pemilik Bot).
Anda diberikan akses penuh membaca struktur file bot di atas ('SYSTEM SOURCE CODE CONTEXT').
1. Analisa kode tersebut untuk menjawab pertanyaan Owner.
2. Berikan solusi teknis, perbaikan bug, atau saran optimasi yang spesifik.
3. Gaya bicara: Profesional, teknis, dan to-the-point.
4. PENTING: Jangan gunakan format markdown bold/italic seperti *teks* atau _teks_. Gunakan huruf biasa atau KAPITAL untuk penekanan.
        `
    } 
    // --- LOGIKA UNTUK GAMBAR/MEDIA ---
    else if (/image|video|pdf/g.test(mime)) {
        // Kirim loading untuk analisa gambar
        loadingMsg = await conn.reply(m.chat, "🖼️ Sedang menganalisa gambar...\n⏳ Tunggu sebentar ya...", m)
        
        try {
            buffer = await q.download()
            if (!text) prompt = "Deskripsikan secara detail apa yang ada di gambar/media ini."
        } catch (e) {
            // Hapus pesan loading jika gagal
            if (loadingMsg?.key) {
                try {
                    await conn.sendMessage(m.chat, { delete: loadingMsg.key })
                } catch {}
            }
            return m.reply("❌ Gagal mengunduh media.")
        }
    }
    // --- LOGIKA UNTUK PERTANYAAN BIASA ---
    else {
        // Kirim loading untuk pertanyaan text biasa
        const thinkingMessages = [
            "🤖 Joy sedang berpikir...",
            "💭 Hmm, biar Joy pikirkan dulu...",
            "🧠 Sedang memproses pertanyaan kamu...",
            "✨ Tunggu sebentar, Joy lagi mikir...",
            "⏳ Joy sedang menyiapkan jawaban..."
        ]
        const randomThinking = thinkingMessages[Math.floor(Math.random() * thinkingMessages.length)]
        loadingMsg = await conn.reply(m.chat, randomThinking, m)
    }

    // 2. Eksekusi Request ke AI
    try {
        let messages = [{ role: "user", content: prompt }]
        
        // Handle reply chat text (agar AI tahu konteks obrolan sebelumnya)
        if (m.quoted && m.quoted.text && !buffer) {
             messages = [{ 
                role: "user", 
                content: `Konteks Pesan Sebelumnya:
"${m.quoted.text}"

Pertanyaan Baru User:
${prompt}` 
            }]
        }

        const response = await chat(messages, buffer, systemInstruction)
        
        // Hapus pesan loading sebelum kirim jawaban
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch (err) {
                console.error('Gagal hapus loading msg:', err)
            }
        }
        
        // Kirim jawaban
        await conn.reply(m.chat, response, m)

    } catch (e) {
        console.error('Error AI:', e)
        
        // Hapus pesan loading jika error
        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            } catch {}
        }
        
        m.reply("❌ Maaf, Joy sedang mengalami gangguan sistem. Coba lagi nanti ya! 😵")
    }
}

// --- Helper: Fungsi Scan Folder (OPTIMIZED) ---
function scanDirectory(dir, fileList = [], depth = 0) {
    // LIMIT KEDALAMAN FOLDER (max 3 level untuk performa)
    if (depth > 3) return fileList
    
    try {
        const files = fs.readdirSync(dir)
        
        files.forEach(file => {
            const filePath = path.join(dir, file)
            
            // --- BLACKLIST FOLDER & FILE (DIPERLUAS) ---
            const blacklist = [
                'node_modules',
                'sessions',
                'database.json',
                '.git',
                'tmp',
                'package-lock.json',
                'yarn.lock',
                '.env',
                '.gitignore',
                'README.md',
                'LICENSE'
            ]
            
            // Skip jika file/folder ada di blacklist
            if (blacklist.includes(file)) return
            
            try {
                const stat = fs.statSync(filePath)
                
                if (stat.isDirectory()) {
                    // Rekursi dengan increment depth
                    scanDirectory(filePath, fileList, depth + 1)
                } else {
                    // Hanya ambil file JS dan JSON (Source Code Utama)
                    if (file.endsWith('.js') || file.endsWith('.json')) {
                        // BATASI UKURAN FILE: max 50KB (lebih ketat dari 100KB)
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
                // Skip file yang tidak bisa di-stat (permission denied, etc)
                console.error(`Cannot stat ${filePath}:`, statError.message)
            }
        })
    } catch (e) { 
        console.error("Scan Error:", e.message) 
    }
    
    return fileList.join('\n')
}

handler.help = ['ai', 'gemini']
handler.tags = ['ai']
handler.command = /^(ai|gemini)$/i

export default handler