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
    conn.editListSession = conn.editListSession || {}

    if (conn.editListSession[m.chat]) {
        return m.reply(
            `*SESI MASIH AKTIF*\n\n` +
            `Kamu lagi dalam mode edit. Selesaikan dulu atau ketik *batal* sambil reply pesan bot buat nyudahin sesinya.`
        )
    }

    const store = loadStore()
    const keys = Object.keys(store)

    if (keys.length === 0) {
        return m.reply(`*STORE KOSONG*\n\nGak ada item yang bisa diedit di sini.`)
    }

    let listText = `*EDIT LIST MODE*\n\n`
    listText += `Silakan *Reply pesan ini* pake angka item yang mau kamu edit:\n\n`
    keys.forEach((key, i) => {
        listText += `*${i + 1}.* ${key}\n`
    })
    listText += `\nKetik *batal* sambil reply pesan ini kalau mau batal.`

    let msg = await m.reply(listText)

    conn.editListSession[m.chat] = {
        stage: 'select_item',
        keys: keys,
        currentMsgId: msg.key.id, 
        timeout: setTimeout(() => {
            if (conn.editListSession[m.chat]) {
                delete conn.editListSession[m.chat]
                conn.sendMessage(m.chat, { text: '*Waktu edit abis. Sesi otomatis batal.*' })
            }
        }, 120000)
    }
}

handler.before = async (m, { conn }) => {
    conn.editListSession = conn.editListSession || {}
    const session = conn.editListSession[m.chat]

    if (!session || m.isBaileys) return false

    if (!m.quoted || m.quoted.id !== session.currentMsgId) {
        return false 
    }

    if (m.text.toLowerCase() === 'batal') {
        clearTimeout(session.timeout)
        delete conn.editListSession[m.chat]
        await m.reply('*Sesi edit udah dibatalin.*')
        return true
    }

    const store = loadStore()

    if (session.stage === 'select_item') {
        if (isNaN(m.text)) {
            let errMsg = await m.reply('*Kirim angka aja bos, jangan yang lain.*')
            session.currentMsgId = errMsg.key.id 
            return true
        }
        
        let index = parseInt(m.text) - 1
        if (index < 0 || index >= session.keys.length) {
            let errMsg = await m.reply('*Nomornya salah. Reply lagi pake angka yang bener.*')
            session.currentMsgId = errMsg.key.id
            return true
        }

        let oldKey = session.keys[index]
        session.oldKey = oldKey
        session.stage = 'edit_title'
        
        let msg = await m.reply(
            `*EDIT JUDUL*\n\n` +
            `Judul sekarang: *${oldKey}*\n\n` +
            `• Balas pesan ini pake *Judul Baru*.\n` +
            `• Atau balas *skip* kalau gak mau ganti judul.`
        )
        session.currentMsgId = msg.key.id 
        return true
    }

    if (session.stage === 'edit_title') {
        let newTitle = m.text.trim()

        if (newTitle.toLowerCase() === 'skip') {
            session.newKey = session.oldKey
        } else {
            if (store[newTitle] && newTitle !== session.oldKey) {
                let errMsg = await m.reply(`*Nama ${newTitle} udah ada. Pake nama lain atau ketik skip.*`)
                session.currentMsgId = errMsg.key.id
                return true
            }
            session.newKey = newTitle
        }

        session.stage = 'edit_content'
        
        let infoTitle = session.newKey === session.oldKey ? 'Judul gak diganti.' : `Judul diganti jadi: *${session.newKey}*`
        
        let msg = await m.reply(
            `${infoTitle}\n\n` +
            `*EDIT ISI PESAN*\n\n` +
            `• Balas pesan ini pake konten baru (Teks/Gambar/Stiker/Video).\n` +
            `• Atau balas *skip* kalau isinya gak mau diganti.`
        )
        session.currentMsgId = msg.key.id 
        return true
    }

    if (session.stage === 'edit_content') {
        try {
            let finalData = null

            if (m.text.toLowerCase() === 'skip') {
                finalData = store[session.oldKey] 
            } else {
                let q = m 
                let msgContent = q.message 
                let type = q.mtype
                
                if (type === 'ephemeralMessage' || type === 'viewOnceMessage') {
                     type = Object.keys(q.message)[0]
                     msgContent = q.message[type]
                }

                if (type !== 'conversation' && type !== 'extendedTextMessage') {
                    finalData = {
                        mtype: type,
                        mediaMessage: msgContent,
                        text: q.text || q.caption || '',
                        key: {
                            remoteJid: m.chat,
                            fromMe: false,
                            id: m.key.id,
                            participant: m.sender
                        }
                    }
                } else {
                    let textBody = q.text || q.body
                    finalData = {
                        mtype: 'conversation',
                        text: textBody,
                        mediaMessage: { conversation: textBody }
                    }
                }
            }

            if (session.newKey !== session.oldKey) {
                delete store[session.oldKey]
            }
            store[session.newKey] = finalData
            saveStore(store)

            clearTimeout(session.timeout)
            delete conn.editListSession[m.chat]

            await conn.sendMessage(m.chat, {
                text: `*EDIT BERHASIL*\n\nNama: *${session.newKey}*\nStatus: Udah diperbarui.\n\nCek hasilnya pake perintah \`.list\` ya.`,
                contextInfo: {
                    externalAdReply: {
                        title: `DATABASE UPDATED`,
                        body: `Item ${session.oldKey} udah berhasil diedit.`,
                        thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                        sourceUrl: '',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m })

        } catch (e) {
            console.error(e)
            let errMsg = await m.reply(`*Gagal nyimpen:* ${e.message}\nCoba reply lagi pesannya.`)
            session.currentMsgId = errMsg.key.id
        }
        return true
    }

    return false
}

handler.help = ['editlist']
handler.tags = ['store']
handler.command = /^(editlist|ubahlist)$/i
handler.owner = true

export default handler