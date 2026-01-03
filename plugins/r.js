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

    // --- [BARU] VALIDASI ANTI DOUBLE SESI ---
    // Jika sesi edit di chat ini sudah ada, tolak perintah baru
    if (conn.editListSession[m.chat]) {
        return m.reply(
            `⚠️ *SESI SEDANG AKTIF*\n\n` +
            `Kamu masih dalam mode edit list.\n` +
            `Silakan selesaikan prosesnya atau ketik *batal* (sambil reply pesan bot) untuk membatalkan sesi sebelumnya.`
        )
    }
    // ----------------------------------------

    const store = loadStore()
    const keys = Object.keys(store)

    if (keys.length === 0) {
        return m.reply(`*STORE KOSONG*\n\nBelum ada item yang bisa diedit.`)
    }

    let listText = `*EDIT LIST MODE*\n\n`
    listText += `Silakan *Reply pesan ini* dengan angka dari item yang ingin diedit:\n\n`
    keys.forEach((key, i) => {
        listText += `*${i + 1}.* ${key}\n`
    })
    listText += `\n_Ketik 'batal' (sambil reply pesan ini) untuk membatalkan._`

    // Kirim pesan instruksi
    let msg = await m.reply(listText)

    // Mulai Sesi
    conn.editListSession[m.chat] = {
        stage: 'select_item',
        keys: keys,
        currentMsgId: msg.key.id, 
        timeout: setTimeout(() => {
            if (conn.editListSession[m.chat]) {
                delete conn.editListSession[m.chat]
                conn.sendMessage(m.chat, { text: '⏳ Waktu edit habis. Sesi dibatalkan.' })
            }
        }, 120000)
    }
}

handler.before = async (m, { conn }) => {
    conn.editListSession = conn.editListSession || {}
    const session = conn.editListSession[m.chat]

    if (!session || m.isBaileys) return false

    // WAJIB REPLY PESAN BOT YANG SESUAI
    if (!m.quoted || m.quoted.id !== session.currentMsgId) {
        return false 
    }

    // Fitur Batal
    if (m.text.toLowerCase() === 'batal') {
        clearTimeout(session.timeout)
        delete conn.editListSession[m.chat]
        await m.reply('✅ Sesi edit dibatalkan.')
        return true
    }

    const store = loadStore()

    // --- TAHAP 1: PILIH NOMOR ---
    if (session.stage === 'select_item') {
        if (isNaN(m.text)) {
            let errMsg = await m.reply('❌ Harap balas dengan *ANGKA* saja.')
            session.currentMsgId = errMsg.key.id 
            return true
        }
        
        let index = parseInt(m.text) - 1
        if (index < 0 || index >= session.keys.length) {
            let errMsg = await m.reply('❌ Nomor tidak valid. Reply pesan ini dengan angka yang benar.')
            session.currentMsgId = errMsg.key.id
            return true
        }

        let oldKey = session.keys[index]
        session.oldKey = oldKey
        session.stage = 'edit_title'
        
        let msg = await m.reply(
            `*EDIT JUDUL*\n\n` +
            `Judul saat ini: *${oldKey}*\n\n` +
            `• Silakan Reply pesan ini dengan *Judul Baru*.\n` +
            `• Atau Reply *skip* untuk membiarkan judul tetap sama.`
        )
        session.currentMsgId = msg.key.id 
        return true
    }

    // --- TAHAP 2: EDIT JUDUL ---
    if (session.stage === 'edit_title') {
        let newTitle = m.text.trim()

        if (newTitle.toLowerCase() === 'skip') {
            session.newKey = session.oldKey
        } else {
            if (store[newTitle] && newTitle !== session.oldKey) {
                let errMsg = await m.reply(`❌ Nama *${newTitle}* sudah ada. Reply pesan ini dengan nama lain atau ketik 'skip'.`)
                session.currentMsgId = errMsg.key.id
                return true
            }
            session.newKey = newTitle
        }

        session.stage = 'edit_content'
        
        let infoTitle = session.newKey === session.oldKey ? 'Judul tidak diubah.' : `Judul diubah jadi: *${session.newKey}*`
        
        let msg = await m.reply(
            `✅ ${infoTitle}\n\n` +
            `*EDIT ISI PESAN*\n\n` +
            `• Silakan Reply pesan ini dengan konten baru (Teks/Gambar/Stiker/Video).\n` +
            `• Atau Reply *skip* untuk membiarkan isi pesan tetap sama.`
        )
        session.currentMsgId = msg.key.id 
        return true
    }

    // --- TAHAP 3: EDIT ISI PESAN ---
    if (session.stage === 'edit_content') {
        try {
            let finalData = null

            if (m.text.toLowerCase() === 'skip') {
                finalData = store[session.oldKey] 
            } else {
                let q = m 
                let msgContent = q.message 
                
                let type = q.mtype
                // Normalisasi ephemeral/viewonce
                if (type === 'ephemeralMessage') {
                     type = Object.keys(q.message)[0]
                     msgContent = q.message[type]
                }
                if (type === 'viewOnceMessage') {
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

            // Simpan Perubahan
            if (session.newKey !== session.oldKey) {
                delete store[session.oldKey]
            }
            store[session.newKey] = finalData
            saveStore(store)

            // Bersihkan sesi
            clearTimeout(session.timeout)
            delete conn.editListSession[m.chat]

            await conn.sendMessage(m.chat, {
                text: `*EDIT SUKSES!* ✅\n\n` +
                      `Nama: *${session.newKey}*\n` +
                      `Status: Berhasil diperbarui.\n\n` +
                      `Gunakan *.list* untuk melihat hasilnya.`,
                contextInfo: {
                    externalAdReply: {
                        title: `DATABASE UPDATED`,
                        body: `Item ${session.oldKey} telah diedit.`,
                        thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                        sourceUrl: '',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m })

        } catch (e) {
            console.error(e)
            let errMsg = await m.reply(`❌ Error saat menyimpan: ${e.message}\nSilakan coba reply pesan ini lagi.`)
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