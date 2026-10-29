/*
- @Author: Rafli
- @Feature: Quote Chat (QC) Generator
- @Description: Mengubah teks atau pesan reply menjadi stiker gelembung chat ala Telegram dengan foto profil user.
*/

import fetch from 'node-fetch'

let handler = async (m, { conn, args, usedPrefix, command }) => {
    let text
    if (args.length >= 1) {
        text = args.slice(0).join(" ")
    } else if (m.quoted && (m.quoted.text || m.quoted.caption)) {
        text = m.quoted.text || m.quoted.caption
    } else {
        return m.reply(
            `*QUOTE CHAT (QC)*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Ubah teks menjadi stiker gelembung chat dengan foto profil.\n\n` +
            `*Cara Pakai:*\n` +
            `› \`${usedPrefix + command} <teks>\`\n` +
            `› Atau reply pesan teks dengan \`${usedPrefix + command}\`\n\n` +
            `*Contoh:*\n` +
            `› \`${usedPrefix + command} Lagi ngoding jangan diganggu\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (text.length > 100) return m.reply('*Teks terlalu panjang, Li.* Maksimal 100 karakter aja biar stikernya nggak kepotong dan tetep kebaca.')

    try {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

        // Deteksi apakah pengirim adalah bot atau user biasa
        const botJid    = conn.user.id.split(':')[0] + '@s.whatsapp.net'
        const senderJid = m.sender.split(':')[0] + '@s.whatsapp.net'
        const isBot     = senderJid === botJid

        const targetJid = isBot ? conn.user.id : m.sender
        const pushname  = isBot
            ? (global.info?.namabot || conn.user.name || 'Bot')
            : (m.pushName || 'User')

        let photoUrl
        try {
            photoUrl = await conn.profilePictureUrl(targetJid, "image")
        } catch (e) {
            photoUrl = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png'
        }

        const payload = {
            "messages": [
                {
                    "from": {
                        "id": 1,
                        "first_name": pushname,
                        "last_name": "",
                        "name": pushname,
                        "photo": {
                            "url": photoUrl
                        }
                    },
                    "text": text,
                    "entities": [],
                    "avatar": true,
                    "media": {
                        "url": ""
                    },
                    "mediaType": "",
                    "replyMessage": {
                        "name": "",
                        "text": "",
                        "entities": [],
                        "chatId": 1
                    }
                }
            ],
            "backgroundColor": "#FFFFFF",
            "width": 512,
            "height": 768,
            "scale": 2,
            "type": "quote",
            "format": "png",
            "emojiStyle": "apple"
        }

        const res = await fetch("https://brat.siputzx.my.id/quoted", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        })

        if (!res.ok) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply('*Server sedang sibuk.* Gagal membuat stiker, coba lagi nanti ya.')
        }

        const buffer = Buffer.from(await res.arrayBuffer())

        await conn.sendStickerImage(m.chat, buffer, m, { 
            packname: global.info.namabot, 
            author: global.info.namaowner 
        })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (e) {
        console.error(e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        m.reply(`*Terjadi kesalahan:* ${e.message}`)
    }
}

handler.help = ["qc *teks*"]
handler.tags = ["sticker"]
handler.command = /^(qc|quotechat)$/i

export default handler