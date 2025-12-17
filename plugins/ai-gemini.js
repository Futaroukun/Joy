import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // 1. Cek Input (Harus ada teks atau reply media)
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    
    if (!text && !mime) return m.reply(`🤖 *Joy AI Assistant*\n\nKirim pertanyaan atau foto.\nContoh:\n${usedPrefix + command} Apa resep nasi goreng?\n${usedPrefix + command} (reply gambar) Gambar apa ini?`)

    let buffer = null
    let prompt = text || "Jelaskan gambar ini"
    
    // --- KONFIGURASI PROMPT UNTUK USER BIASA ---
    let systemInstruction = `
    IDENTITAS:
    Nama kamu adalah Joy. Kamu adalah asisten virtual WhatsApp yang cerdas, sopan, dan sedikit jenaka.
    
    PANDUAN INTERAKSI:
    1. Jawablah dengan bahasa Indonesia yang santai namun tetap sopan.
    2. Jika user mengirim gambar, jelaskan dengan detail apa yang kamu lihat.
    3. Kamu BUKAN programmer user tersebut. Jika user bertanya soal teknis coding/bot, jawablah secara umum saja atau arahkan mereka menghubungi Owner.
    4. Gunakan emoji sesekali agar tidak kaku. 😊
    `

    // --- LOGIKA FITUR --SCAN (KHUSUS OWNER) ---
    if (text && text.includes('--scan')) {
        // A. Security Check: Tolak User Biasa
        if (!isOwner) {
            return m.reply("⛔ *AKSES DITOLAK*\n\nMaaf, fitur debugging system (--scan) hanya bisa diakses oleh Owner Bot.")
        }

        m.reply("🔍 *System Scanning in Progress...*")

        // B. Bersihkan flag --scan dari prompt
        prompt = prompt.replace('--scan', '').trim()
        if (!prompt) prompt = "Analisa struktur kode bot ini secara garis besar."

        // C. Baca File System (Scan Folder Bot)
        const rootDir = process.cwd()
        const scannedData = scanDirectory(rootDir)

        // D. Inject Context Kode ke Prompt
        prompt = `SYSTEM SOURCE CODE CONTEXT:\n\n${scannedData}\n\nOWNER QUESTION:\n${prompt}`

        // E. Override Persona Menjadi "Expert Developer"
        systemInstruction = `
        MODE: SENIOR BACKEND DEVELOPER (Node.js/Baileys/ESM).
        
        TUGAS:
        Anda sedang berbicara langsung dengan OWNER (Pemilik Bot).
        Anda diberikan akses penuh membaca struktur file bot di atas ('SYSTEM SOURCE CODE CONTEXT').
        1. Analisa kode tersebut untuk menjawab pertanyaan Owner.
        2. Berikan solusi teknis, perbaikan bug, atau saran optimasi yang spesifik.
        3. Gaya bicara: Profesional, teknis, dan to-the-point.
        `
    }

    // 2. Download Media (Jika ada gambar/dokumen)
    if (/image|video|pdf/g.test(mime)) {
        try {
            buffer = await q.download()
            if (!text) prompt = "Deskripsikan secara detail apa yang ada di gambar/media ini."
        } catch (e) {
            return m.reply("Gagal mengunduh media.")
        }
    }

    // 3. Eksekusi Request ke AI
    try {
        let messages = [{ role: "user", content: prompt }]
        
        // Handle reply chat text (agar AI tahu konteks obrolan sebelumnya)
        if (m.quoted && m.quoted.text) {
             messages = [{ role: "user", content: `Konteks Pesan Sebelumnya:\n"${m.quoted.text}"\n\nPertanyaan Baru User:\n${prompt}` }]
        }

        const response = await chat(messages, buffer, systemInstruction)
        m.reply(response)

    } catch (e) {
        console.error(e)
        m.reply("Maaf, Joy sedang mengalami gangguan sistem. 😵")
    }
}

// --- Helper: Fungsi Scan Folder ---
function scanDirectory(dir, fileList = []) {
    try {
        const files = fs.readdirSync(dir)
        
        files.forEach(file => {
            const filePath = path.join(dir, file)
            const stat = fs.statSync(filePath)
            
            // --- FILTER FOLDER & FILE RAHASIA/SAMPAH ---
            // Folder yang DILARANG discan:
            const blacklist = [
                'node_modules', 
                'session', 
                'database', 
                '.git', 
                'tmp',
                'package-lock.json',
                'yarn.lock'
            ]
            
            if (blacklist.includes(file)) return
            
            if (stat.isDirectory()) {
                scanDirectory(filePath, fileList)
            } else {
                // Hanya ambil file JS dan JSON (Source Code Utama)
                if (file.endsWith('.js') || file.endsWith('.json')) {
                    // Skip file database.json jika ada di root agar data user aman
                    if (file === 'database.json') return

                    // Batasi ukuran file max 100KB agar prompt tidak kepenuhan
                    if (stat.size < 100 * 1024) { 
                        try {
                            const content = fs.readFileSync(filePath, 'utf8')
                            fileList.push(`\n// --- FILE PATH: ${filePath.replace(process.cwd(), '')} ---\n${content}`)
                        } catch (e) {}
                    }
                }
            }
        })
    } catch (e) { console.error("Scan Error:", e) }
    return fileList.join('\n')
}

handler.help = ['ai', 'gemini']
handler.tags = ['ai']
handler.command = /^(ai|gemini)$/i

export default handler