/*
- @Author: Rafli
- @Feature: Brat Sticker Maker
- @Description: Buat stiker bergaya brat dari teks.
*/

import axios from 'axios'

async function getBratImage(text) {
  try {
    const url = `https://api.nexray.web.id/maker/brat?text=${encodeURIComponent(text)}`
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: { 'user-agent': 'Mozilla/5.0' }
    })
    return response.data
  } catch (error) {
    throw new Error('Gagal mengambil gambar dari server.')
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*BRAT STICKER MAKER*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Buat stiker WhatsApp bergaya teks brat.\n\n` +
            `*Cara Pakai:*\n` +
            `› \`${usedPrefix + command} <teks>\`\n\n` +
            `*Contoh:*\n` +
            `› \`${usedPrefix + command} capek banget\`\n` +
            `› \`${usedPrefix + command} overthinking lagi\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const imageBuffer = await getBratImage(text)

        await conn.sendStickerImage(m.chat, imageBuffer, m, {
            packname: global.info.namabot  || 'Joy Bot',
            author  : global.info.namaowner || 'Rafli'
        })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (error) {
        console.error(error)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal membuat stiker.*\n\n${error.message}`)
    }
}

handler.help    = ['brat *teks*']
handler.tags    = ['sticker']
handler.command = /^brat$/i

export default handler