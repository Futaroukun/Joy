const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const extractInstagramUrl = (text = '') => {
  const regex = /(https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv|stories)\/[a-zA-Z0-9_\-]+\/?)/i
  return text.match(regex)?.[0] || null
}

const guessMediaType = (url = '') => {
  if (/\.mp4|video/i.test(url)) return 'video'
  return 'image'
}

const downloadViaNexray = async (url) => {
  const target = url.trim()
  const apiUrl = `https://api.nexray.web.id/api/downloader/instagram?url=${encodeURIComponent(target)}`
  
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(25000)
  })

  if (!res.ok) {
    throw new Error(`Nexray HTTP ${res.status}`)
  }

  const json = await res.json()
  if (!json.status || !json.result) {
    throw new Error(json.error || 'Gagal memproses link Instagram.')
  }

  const rawList = Array.isArray(json.result) ? json.result : [json.result]
  const list = []

  for (const item of rawList) {
    const mediaUrl = item?.url || item?.video || item?.image
    if (mediaUrl) {
      const type = item?.type === 'video' || guessMediaType(mediaUrl) === 'video' ? 'video' : 'image'
      list.push({ url: mediaUrl, type, thumbnail: item?.thumbnail || null })
    }
  }

  if (list.length === 0) {
    throw new Error('Tidak ada media yang ditemukan dalam postingan.')
  }

  return {
    media: list,
    caption: json.result?.caption || null
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const input = m.quoted?.text || text || ''

  if (!input.trim()) {
    return m.reply(
      `╭── ✦ *IG DOWNLOADER* ✦\n` +
      `• Unduh Reels, Posts, dan Carousel Instagram.\n\n` +
      `• *Cara pakai:*\n` +
      `  › \`${usedPrefix + command} <link instagram>\`\n\n` +
      `• *Contoh:*\n` +
      `  › \`${usedPrefix + command} https://www.instagram.com/reel/xxx\`\n` +
      `  › \`${usedPrefix + command} https://www.instagram.com/p/xxx\`\n\n` +
      `• _Catatan: Stories & konten privat tidak didukung._\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    )
  }

  const parseUrl = extractInstagramUrl(input)
  if (!parseUrl) {
    return m.reply('Link tidak valid. Pastikan tautan berasal dari Instagram (reel/p/tv).')
  }

  if (parseUrl.includes('/stories/')) {
    return m.reply(
      `╭── ✦ *STORIES TIDAK DIDUKUNG* ✦\n` +
      `• Server tidak mendukung pengunduhan Instagram Stories.\n` +
      `• Silakan kirim tautan *Reels* atau *Postingan*.\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    )
  }

  const loadingMsg = await m.reply('_Memproses unduhan Instagram, tunggu sebentar..._')

  const deleteLoading = async () => {
    if (loadingMsg?.key) {
      await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
    }
  }

  try {
    const result = await downloadViaNexray(parseUrl)
    const { media: mediaList, caption } = result
    await deleteLoading()

    const mainCaption =
      `╭── ✦ *INSTAGRAM DOWNLOADER* ✦\n` +
      (caption ? `• *Caption:* _${caption.slice(0, 150)}${caption.length > 150 ? '...' : ''}_\n` : '') +
      `• *Total Media:* ${mediaList.length}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`

    if (mediaList.length === 1) {
      const item = mediaList[0]
      const msgType = item.type === 'video' ? 'video' : 'image'
      await conn.sendMessage(m.chat, {
        [msgType]: { url: item.url },
        caption: mainCaption,
        mimetype: item.type === 'video' ? 'video/mp4' : 'image/jpeg'
      }, { quoted: m })

    } else {
      let albumSent = false

      if (typeof conn.sendAlbum === 'function') {
        try {
          const albumPayload = mediaList.map((item, i) => ({
            [item.type === 'video' ? 'video' : 'image']: { url: item.url },
            caption: i === 0 ? mainCaption : ''
          }))
          await conn.sendAlbum(m.chat, albumPayload, { quoted: m, delay: 800 })
          albumSent = true
        } catch (e) {
          console.error('[IG] sendAlbum gagal, fallback 1-by-1:', e.message)
        }
      }

      if (!albumSent) {
        for (let i = 0; i < mediaList.length; i++) {
          const item = mediaList[i]
          const msgType = item.type === 'video' ? 'video' : 'image'
          await conn.sendMessage(m.chat, {
            [msgType]: { url: item.url },
            caption: i === 0 ? mainCaption : `*Slide ${i + 1}/${mediaList.length}*`,
            mimetype: item.type === 'video' ? 'video/mp4' : 'image/jpeg'
          }, { quoted: m })
          if (i < mediaList.length - 1) await new Promise(r => setTimeout(r, 700))
        }
      }
    }

  } catch (error) {
    console.error('[IG Error]', error.message)
    await deleteLoading()
    return m.reply(
      `╭── ✦ *GAGAL MENGUNDUH* ✦\n` +
      `• *Alasan:* ${error.message}\n\n` +
      `• _Pastikan link valid, bukan konten privat, dan coba lagi nanti._\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    )
  }
}

handler.help = ['instagram *url*']
handler.tags = ['downloader']
handler.command = /^(instagram|ig|igdl)$/i
handler.limit = false

export default handler
