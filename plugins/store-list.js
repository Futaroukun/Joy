import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'store.json')

function loadStore() {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, '{}')
        return {}
    }
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'))
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const store = loadStore()
    const keys = Object.keys(store)

    if (keys.length === 0) {
        return m.reply(`*STORE KOSONG*\n\nBelum ada item. Gunakan \`${usedPrefix}addlist\` untuk menambah.`)
    }

    try {
        let header = `*STORE LIST RESULT*\n`
        header += `Total Item: ${keys.length}\n\n`
        header += `Balas pesan ini dengan angka (1-${keys.length}) untuk mengambil item.\n\n`

        let listText = '';
        keys.forEach((key, i) => {
            listText += `*${i + 1}.* ${key}\n`
        });

        conn.storeList = conn.storeList || {};
        conn.storeList[m.chat] = keys;

        // Tampilan MENU LIST tetap pakai thumbnail biar keren (opsional)
        await conn.sendMessage(m.chat, {
            text: header + listText,
            contextInfo: {
                externalAdReply: {
                    title: `DAFTAR MENU STORE`,
                    body: "Klik angka untuk mengambil item",
                    thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (error) {
        console.error('Store List Error:', error)
        m.reply(`*ERROR*\n${error.message}`)
    }
}

handler.before = async (m, { conn }) => {
    conn.storeList = conn.storeList || {};
    const keys = conn.storeList[m.chat];

    if (m.text && keys && !isNaN(m.text)) {
        let index = parseInt(m.text) - 1;
        
        if (index >= 0 && index < keys.length) {
            let keyName = keys[index];
            delete conn.storeList[m.chat]; 

            try {
                const store = loadStore()
                const item = store[keyName]

                if (!item) throw new Error(`Item hilang dari database.`)

                // --- 1. HANDLING TEXT ---
                if (typeof item === 'string') {
                    await conn.sendMessage(m.chat, { text: item }, { quoted: m });
                    return true;
                }

                if (item.mtype === 'conversation' || item.mtype === 'extendedTextMessage') {
                    const textContent = item.text || item.mediaMessage?.extendedTextMessage?.text || item.mediaMessage?.conversation || item.message?.conversation;
                    if (textContent) {
                        await conn.sendMessage(m.chat, { text: textContent }, { quoted: m });
                        return true;
                    }
                }

                // --- 2. HANDLING MEDIA ---
                let msgContent = item.mediaMessage || item.message;
                if (!msgContent) throw new Error('Konten media rusak.');

                // Clone object
                msgContent = JSON.parse(JSON.stringify(msgContent));
                let type = Object.keys(msgContent)[0];

                // ============================================
                //        MODIFIKASI TAMPILAN (CLEAN MODE)
                // ============================================

                // A. Caption Otomatis
                if (type === 'imageMessage' || type === 'videoMessage' || type === 'documentMessage') {
                    let newCaption = `📦 *STORE ITEM*\n`
                    newCaption += `🏷️ Nama: *${keyName}*\n`
                    newCaption += `📅 Date: ${new Date().toLocaleDateString('id-ID')}`
                    
                    msgContent[type].caption = newCaption;
                }

                // B. SETTING CUSTOM QUOTE (Tanpa Thumbnail Link)
                let customQuote = {
                    key: {
                        fromMe: false,
                        participant: '0@s.whatsapp.net', 
                        remoteJid: 'status@broadcast' 
                    },
                    message: {
                        conversation: `Bot Verified Store | ${keyName}` // <-- Teks di bubble reply
                    }
                }

                // Inject ContextInfo (Tanpa externalAdReply)
                msgContent[type].contextInfo = {
                    ...(msgContent[type].contextInfo || {}),
                    quotedMessage: customQuote.message,
                    participant: customQuote.key.participant,
                    stanzaId: "FAKE_" + Date.now(),
                    remoteJid: customQuote.key.remoteJid
                    // externalAdReply SAYA HAPUS DISINI BIAR BERSIH
                };

                let generateId = (Math.random() + 1).toString(36).substring(7);

                await conn.relayMessage(m.chat, msgContent, { 
                    messageId: generateId
                });

            } catch (e) {
                console.error('Handler Store Error:', e)
                m.reply(`*Gagal:* ${e.message}`)
            }
            return true;
        }
    }
    return false; 
}

handler.help = ['list']
handler.tags = ['store']
handler.command = /^list(store)?$/i

export default handler