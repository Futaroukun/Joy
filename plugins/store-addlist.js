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

function saveStore(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!m.quoted) {
        return m.reply(`*REPLY PESANNYA*\n\nReply pesan entah itu teks, gambar, stiker, atau video yang mau kamu simpen, terus ketik:\n\`${usedPrefix + command}\` *nama*`)
    }
    
    if (!text) {
        return m.reply(`*KASIH NAMA ITEMNYA*\n\nJangan lupa kasih nama buat item yang mau kamu simpen:\n\`${usedPrefix + command}\` *nama*`)
    }

    const key = text.trim()
    const store = loadStore()

    if (store[key]) {
        return m.reply(`*NAMA UDAH DIPAKE*\n\nNama *${key}* udah ada di list. Pake nama lain aja atau hapus dulu yang lama pake dellist.`)
    }
    
    let dataToSave = {}

    try {
        let q = m.quoted

        if (q.mediaMessage || q.isMedia) {
            dataToSave = {
                mtype: q.mtype,
                mediaMessage: q.mediaMessage || q.msg, 
                text: q.text || q.caption || '',
                key: {
                    remoteJid: m.chat,
                    fromMe: false,
                    id: q.id || q.key?.id,
                    participant: q.sender
                }
            }
        } 
        else {
            dataToSave = {
                mtype: q.mtype || 'conversation',
                text: q.text || q.body || '',
                mediaMessage: {
                    conversation: q.text || q.body || ''
                }
            }
        }

        store[key] = dataToSave
        saveStore(store)

        await conn.sendMessage(m.chat, {
            text: `*BERHASIL DISIMPEN*\n\nItem dengan nama *${key}* udah masuk ke database.\n\nCek itemnya pake perintah \`.list\` ya.`,
            contextInfo: {
                externalAdReply: {
                    title: `ITEM BERHASIL DISIMPAN`,
                    body: `Nama Item: ${key}`,
                    thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (e) {
        console.error(e)
        m.reply(`*Gagal nyimpen:* ${e.message}`)
    }
}

handler.help = ['addlist *nama*']
handler.tags = ['store']
handler.command = /^addlist$/i

export default handler