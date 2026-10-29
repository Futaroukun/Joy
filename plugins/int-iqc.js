/*
- @Author: Rafli
- @Feature: iPhone Chat Generator
- @Description: Buat gambar chat gaya iPhone.
*/

import moment from 'moment-timezone'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*IPHONE CHAT*\n\n` +
        `Buat gambar chat bergaya iPhone.\n\n` +
        `*Cara Pakai:* \`${usedPrefix + command} <teks>\`\n\n` +
        `*Contoh:*\n` +
        `\`${usedPrefix + command} Hai cantik\``
    )

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    try {
        const time = moment.tz('Asia/Jakarta').format('HH:mm')
        const url  = `https://brat.siputzx.my.id/iphone-quoted?time=${encodeURIComponent(time)}&messageText=${encodeURIComponent(text)}`

        await conn.sendMessage(m.chat, {
            image  : { url },
            caption: `_${text}_`
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (err) {
        console.error('[IQC]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal membuat gambar.*\n\n*Error:* ${err.message}`)
    }
}

handler.help    = ['iqc *teks*']
handler.tags    = ['internet']
handler.command = /^(iqc|iqchat|iphonechat)$/i

export default handler