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
    if (text.toLowerCase() === 'all') {
        conn.dellistConfirmation = conn.dellistConfirmation || {}
        
        conn.dellistConfirmation[m.chat] = {
            sender: m.sender,
            timeout: setTimeout(() => {
                if (conn.dellistConfirmation && conn.dellistConfirmation[m.chat]) {
                    delete conn.dellistConfirmation[m.chat]
                    conn.sendMessage(m.chat, { text: '*Waktu konfirmasi abis. Penghapusan dibatalkan.*' })
                }
            }, 60000)
        }

        return m.reply(
            `*PERINGATAN*\n\n` +
            `Kamu mau hapus *SEMUA* item di store.\n` +
            `Kalo udah dihapus gak bakal bisa balik lagi.\n\n` +
            `Balas pesan ini pake:\n` +
            `*Y* - Buat lanjut hapus semua.\n` +
            `*N* - Buat batalin.`
        )
    }

    const store = loadStore()
    const keys = Object.keys(store)

    if (!text) {
        if (keys.length === 0) {
            return m.reply('*STORE KOSONG*\n\nGak ada item yang bisa dihapus di sini.')
        }
        
        let list = keys.map((k, i) => `*${i + 1}.* ${k}`).join('\n')
        
        return m.reply(
            `*PENGHAPUSAN STORE*\n\n` +
            `Pilihan hapus:\n` +
            `• \`${usedPrefix + command}\` *all*\n` +
            `• \`${usedPrefix + command}\` *angka*\n` +
            `• \`${usedPrefix + command}\` *nama*\n\n` +
            `*Daftar Item:*\n${list}`
        )
    }

    let keyToDelete = text.trim()
    
    if (!isNaN(text)) {
        let index = parseInt(text) - 1
        if (index >= 0 && index < keys.length) {
            keyToDelete = keys[index]
        } else {
            return m.reply(`*Nomor ${text} gak ada di list.*`)
        }
    }

    if (!store[keyToDelete]) {
        return m.reply(`*Item ${keyToDelete} gak ketemu di database.*`)
    }

    delete store[keyToDelete]
    saveStore(store)

    await conn.sendMessage(m.chat, {
        text: `*BERHASIL DIHAPUS*\n\nItem dengan nama *${keyToDelete}* udah berhasil dihapus.`,
        contextInfo: {
            externalAdReply: {
                title: `ITEM BERHASIL DIHAPUS`,
                body: `Nama Item: ${keyToDelete}`,
                thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                sourceUrl: '',
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: m })
}

handler.before = async (m, { conn }) => {
    conn.dellistConfirmation = conn.dellistConfirmation || {}
    if (!conn.dellistConfirmation[m.chat]) return false

    const session = conn.dellistConfirmation[m.chat]
    if (m.sender !== session.sender) return false

    if (m.text.toLowerCase() === 'y') {
        fs.writeFileSync(dbPath, '{}') 
        clearTimeout(session.timeout)
        delete conn.dellistConfirmation[m.chat]
        
        await m.reply('*SEMUA ITEM DIHAPUS*\n\nDatabase store udah bersih sekarang.')
        return true 
    } 
    else if (m.text.toLowerCase() === 'n') {
        clearTimeout(session.timeout)
        delete conn.dellistConfirmation[m.chat]
        
        await m.reply('*Penghapusan semua item dibatalin.*')
        return true
    }

    return false 
}

handler.help = ['dellist *angka/nama/all*']
handler.tags = ['store']
handler.command = /^(dellist|hapuslist)$/i
handler.owner = true

export default handler