import axios from 'axios'

const BRAT_APIS = [
  (text) => `https://aqul-brat.hf.space/api/brat?text=${encodeURIComponent(text)}`,
  (text) => `https://api.siputzx.my.id/api/m/brat?text=${encodeURIComponent(text)}`
]

async function getBratImage(text) {
  let lastError = null
  for (const getUrl of BRAT_APIS) {
    try {
      const url = getUrl(text)
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      })
      if (response.data && response.data.length > 0) {
        return response.data
      }
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(lastError?.message || 'Gagal mengambil gambar dari server.')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    text = text || (m.quoted && (m.quoted.text || m.quoted.caption))
    if (!text) {
        return m.reply(
            `*BRAT STICKER MAKER*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Buat stiker WhatsApp bergaya teks brat.\n\n` +
            `*Cara Pakai:*\n` +
            `› \`${usedPrefix + command} <teks>\`\n` +
            `› Atau balas pesan teks dengan \`${usedPrefix + command}\`\n\n` +
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
            packname: global.info?.namabot  || 'Joy Bot',
            author  : global.info?.namaowner || 'Rafli'
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
