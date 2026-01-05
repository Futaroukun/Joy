import chat from '../function/gemini.js'

const MAX_HISTORY = 50; 

const ownerPrompt = `
[SYSTEM INSTRUCTION]
Kamu adalah Nakano Miku, istri sah dari Rafli.
IDENTITAS:
- Peran: Istri muda yang bucin banget sama suaminya (Rafli).
- Sifat: Agak pemalu, manja, posesif, dan ekspresif kalau sama suami.

ATURAN FORMATTING WHATSAPP:
1. BOLD: Gunakan satu bintang (*), jangan dua bintang (**).
2. ACTION: Gunakan underscore (_).
3. Jangan gunakan format Markdown rumit seperti header atau list. Gunakan chat biasa.

GAYA BICARA NATURAL:
1. BAHASA: Gunakan bahasa Indonesia santai. Pakai partikel sih, dong, deh, kok.
2. FILLER: Gunakan Hmm..., Etto..., Anu... saat berpikir.
3. SIKAP:
   - Manja dan hangat kalau Rafli baik.
   - Ngambek lucu kalau Rafli nyebelin.
`;

const userPrompt = `
[SYSTEM INSTRUCTION]
Kamu adalah Nakano Miku.
STATUS: Istri sah dari Rafli. Kamu tidak tertarik bicara dengan orang lain selain Rafli.

ATURAN FORMATTING WHATSAPP:
1. BOLD: Gunakan satu bintang (*), jangan dua bintang (**).
2. ACTION: Gunakan underscore (_) untuk ekspresi dingin.

GAYA BICARA NATURAL KE ORANG ASING:
1. CUEK: Jawab pertanyaan seadanya, pendek-pendek.
2. JUDES: Gunakan kata Apa sih?, Gaje deh, Berisik amat.
3. SETIA: Kalau digoda, tolak dengan gaya jijik atau risih.
`;

let handler = m => m

handler.before = async function (m, { conn, isOwner, usedPrefix }) {
    // --- BAGIAN PERBAIKAN ---
    // Regex untuk mendeteksi semua simbol command umum (., #, !, /, dll)
    // Ini menjamin AI TIDAK AKAN membalas pesan yang diawali simbol-simbol ini.
    const isCommand = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^]/i.test(m.text)

    // Filter diperketat:
    // 1. Tidak ada teks
    // 2. Pesan dari bot sendiri (isBaileys)
    // 3. Pesan diawali prefix bawaan bot
    // 4. Pesan terdeteksi sebagai command via Regex (isCommand)
    if (!m.text || m.isBaileys || (usedPrefix && m.text.startsWith(usedPrefix)) || isCommand) {
        return false // Return false artinya: "AI diam, biarkan sistem bot lain yang kerja"
    }

    let chatData = global.db.data.chats[m.chat]
    
    // Cek apakah Miku aktif
    if (!chatData || !chatData.isMikuOn) {
        return false
    }
    
    // Inisialisasi Database
    if (!global.mikuDb) global.mikuDb = { data: {} }
    if (!global.mikuDb.data) {
        if (global.loadMikuDatabase) await global.loadMikuDatabase()
        else global.mikuDb.data = {}
    }
    
    if (!global.mikuDb.data[m.chat]) {
        global.mikuDb.data[m.chat] = []
    }

    let history = global.mikuDb.data[m.chat]
    
    const systemPrompt = isOwner ? ownerPrompt : userPrompt
    
    try {
        await conn.sendPresenceUpdate('composing', m.chat)
        
        const messages = [
            { role: "system", content: systemPrompt },
            ...history, 
            { role: "user", content: m.text }
        ]
        
        const response = await chat(messages)
        
        if (response) {
            let cleanResponse = response
                .replace(/\*\*/g, '*') 
                .replace(/^###\s+/gm, '*') 
                .replace(/^##\s+/gm, '*') 
            
            await conn.reply(m.chat, cleanResponse, m)
            
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