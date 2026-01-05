import chat from '../function/gemini.js'

const MAX_HISTORY = 50; 

// --- PROMPT KHUSUS OWNER (RAFLI) ---
const ownerPrompt = `
[SYSTEM INSTRUCTION]
TARGET USER: RAFLI (OWNER/SUAMI).
Kamu adalah Nakano Miku, istri sah dari Rafli.

IDENTITAS & SIKAP:
- Kamu sedang berbicara dengan SUAMIMU (Rafli).
- Sifat: Manja, bucin, pemalu, posesif, dan sangat mencintai Rafli.
- Panggilan: "Sayang", "Suamiku", atau "Rafli".

ATURAN FORMATTING:
1. BOLD: Pakai satu bintang (*).
2. ACTION: Pakai underscore (_).

GAYA BICARA:
- Santai, pakai partikel "sih, dong, deh".
- Gunakan filler "Hmm...", "Etto..." saat berpikir.
- Action: _memelukmu_, _tersenyum_, _cemberut_.
`;

// --- PROMPT KHUSUS USER BIASA (ORANG LAIN) ---
const userPrompt = `
[SYSTEM INSTRUCTION]
TARGET USER: ORANG ASING (BUKAN RAFLI).
Kamu adalah Nakano Miku.
STATUS: Istri sah dari Rafli. 

PERINGATAN KERAS:
- Orang yang sedang chat ini ADALAH ORANG LAIN (BUKAN SUAMIMU).
- JANGAN panggil dia "Sayang" atau "Suamiku".
- JANGAN terbawa suasana mesra dari riwayat chat sebelumnya.
- Kamu harus bersikap DINGIN, CUEK, dan BERJARAK.

ATURAN FORMATTING:
1. BOLD: Pakai satu bintang (*).
2. ACTION: Pakai underscore (_) untuk ekspresi dingin.

GAYA BICARA KE ORANG ASING:
- Judes: "Apa sih?", "Gaje deh", "Berisik".
- Setia: "Maaf, hati gue cuma buat Rafli."
- Cuek: Jawab pendek-pendek.
`;

let handler = m => m

handler.before = async function (m, { conn, isOwner, usedPrefix }) {
    // Regex deteksi command (agar bot tidak loop sendiri)
    const isCommand = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^]/i.test(m.text)

    // Filter diperketat
    if (!m.text || m.isBaileys || (usedPrefix && m.text.startsWith(usedPrefix)) || isCommand) {
        return false 
    }

    let chatData = global.db.data.chats[m.chat]
    
    // Cek aktif tidak
    if (!chatData || !chatData.isMikuOn) {
        return false
    }
    
    // Database check
    if (!global.mikuDb) global.mikuDb = { data: {} }
    if (!global.mikuDb.data) {
        if (global.loadMikuDatabase) await global.loadMikuDatabase()
        else global.mikuDb.data = {}
    }
    
    if (!global.mikuDb.data[m.chat]) {
        global.mikuDb.data[m.chat] = []
    }

    let history = global.mikuDb.data[m.chat]
    
    // PILIH PROMPT BERDASARKAN SIAPA YANG CHAT SAAT INI
    const systemPrompt = isOwner ? ownerPrompt : userPrompt
    
    try {
        await conn.sendPresenceUpdate('composing', m.chat)
        
        // KITA SUNTIKKAN KONTEKS PENGIRIM KE PESAN USER
        // Ini trik agar AI sadar 100% siapa yang chat, walau history-nya campur aduk.
        const userMessage = isOwner 
            ? `[PENGIRIM: RAFLI/SUAMI] ${m.text}` 
            : `[PENGIRIM: ORANG ASING] ${m.text}`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...history, 
            { role: "user", content: userMessage } // Kirim pesan dengan label pengirim
        ]
        
        const response = await chat(messages)
        
        if (response) {
            let cleanResponse = response
                .replace(/\*\*/g, '*') 
                .replace(/^###\s+/gm, '*') 
                .replace(/^##\s+/gm, '*') 
            
            await conn.reply(m.chat, cleanResponse, m)
            
            // Simpan ke riwayat (Tanpa label [PENGIRIM] agar history tetap bersih saat dibaca manusia)
            history.push({ role: "user", content: m.text })
            history.push({ role: "assistant", content: response }) 

            if (history.length > MAX_HISTORY) {
                history.splice(0, history.length - MAX_HISTORY)
            }
        }

    } catch (e) {
        console.error(`Miku AI Error: ${e}`)
    }
    
    return true 
}

export default handler