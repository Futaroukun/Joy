/*
 * @Author      : Rafli
 * @Feature     : Instagram Downloader
 * @Description : Download Reels, Posts, Carousel via VideoDropper API (Primary) & Ryzumi (Fallback)
 * @Version     : 5.0 (Dual Engine)
 */

import crypto from 'node:crypto'

const AES_KEY = Buffer.from('qwertyuioplkjhgf', 'utf-8')
const BASE_ORIGIN = 'https://fastvideosave.net'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const RYZUMI_BASE = 'https://api.ryzumi.net/api/downloader/instagram'

function encryptUrl(url) {
  const cipher = crypto.createCipheriv('aes-128-ecb', AES_KEY, null)
  cipher.setAutoPadding(true)
  let hex = cipher.update(url.trim(), 'utf-8', 'hex')
  hex += cipher.final('hex')
  return hex
}

// ── URL Extractor ─────────────────────────────────────────────────────────────
const extractInstagramUrl = (text = '') => {
  const regex = /(https?:\/\/(?:www\.)?instagram\.com\/(p|reel|tv|stories)\/[a-zA-Z0-9_\-]+\/?)/i
  return text.match(regex)?.[0] || null
}

const guessMediaType = (url = '') => {
  if (/\.mp4|video/i.test(url)) return 'video'
  return 'image'
}

// ── 1. VideoDropper API (Primary Engine) ──────────────────────────────────────
const downloadViaVideoDropper = async (url) => {
  const target = url.trim()
  const res = await fetch('https://api.videodropper.app/allinone', {
    headers: {
      'accept': '*/*',
      'origin': BASE_ORIGIN,
      'referer': BASE_ORIGIN + '/',
      'url': encryptUrl(target),
      'user-agent': USER_AGENT
    }
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  const data = await res.json()
  const list = []

  if (Array.isArray(data.video)) {
    data.video.forEach(v => {
      const u = v?.video || (typeof v === 'string' ? v : null)
      if (u) list.push({ url: u, type: 'video' })
    })
  }

  if (Array.isArray(data.image)) {
    data.image.forEach(img => {
      const u = typeof img === 'string' ? img : (img?.url || img?.image)
      if (u) list.push({ url: u, type: 'image' })
    })
  }

  if (list.length === 0) {
    throw new Error('Tidak ada media ditemukan dalam respon VideoDropper.')
  }

  return {
    media: list,
    caption: null
  }
}

// ── 2. Ryzumi API (Fallback Engine) ───────────────────────────────────────────
const extractRyzumiMedia = (result) => {
  const list = []
  const push = (item) => {
    const url = item?.url || item?.media_url || item?.video_url || (typeof item === 'string' ? item : null)
    if (url && typeof url === 'string' && url.startsWith('http')) {
      list.push({ url, type: item?.type || guessMediaType(url) })
    }
  }

  if (Array.isArray(result?.media?.all))     result.media.all.forEach(push)
  else if (Array.isArray(result?.media?.videos) || Array.isArray(result?.media?.images)) {
    ;(result.media.videos || []).forEach(push)
    ;(result.media.images || []).forEach(push)
  }
  else if (Array.isArray(result?.medias))    result.medias.forEach(push)
  else if (Array.isArray(result?.media))     result.media.forEach(push)
  else if (Array.isArray(result))            result.forEach(push)
  else if (result?.video)  push({ url: result.video, type: 'video' })
  else if (result?.image)  push({ url: result.image, type: 'image' })
  else if (result?.url)    push(result)

  return list
}

const downloadViaRyzumi = async (url) => {
  const apiUrl = `${RYZUMI_BASE}?url=${encodeURIComponent(url)}`
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json',
      'Referer': 'https://ryzumi.net/'
    }
  })

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const errJson = await res.json()
      if (errJson?.message) detail += ` (${errJson.message})`
    } catch (_) {}
    throw new Error(detail)
  }

  const json = await res.json()
  if (!json.success) throw new Error(json.errors || json.error || json.message || 'API mengembalikan gagal')

  const result = json.result || json.data
  if (!result) throw new Error('Response kosong dari API')

  const mediaList = extractRyzumiMedia(result)
  if (mediaList.length === 0) throw new Error('Tidak ada media ditemukan dalam response API')

  return {
    media: mediaList,
    caption: result?.title || result?.caption || null
  }
}

// ── Handler Utama ──────────────────────────────────────────────────────────────
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
    let result = null
    let primaryErr = null

    // 1. Coba VideoDropper terlebih dahulu
    try {
      result = await downloadViaVideoDropper(parseUrl)
    } catch (e1) {
      primaryErr = e1
      console.warn('[IG] VideoDropper gagal, mencoba fallback Ryzumi:', e1.message)
    }

    // 2. Fallback ke Ryzumi jika VideoDropper gagal
    if (!result) {
      try {
        result = await downloadViaRyzumi(parseUrl)
      } catch (e2) {
        throw new Error(primaryErr?.message || e2.message)
      }
    }

    const { media: mediaList, caption } = result
    await deleteLoading()

    const mainCaption =
      `╭── ✦ *INSTAGRAM DOWNLOADER* ✦\n` +
      (caption ? `• *Caption:* _${caption.slice(0, 150)}${caption.length > 150 ? '...' : ''}_\n` : '') +
      `• *Total Media:* ${mediaList.length}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`

    // ── SINGLE MEDIA ──────────────────────────────────────────────────────────
    if (mediaList.length === 1) {
      const item = mediaList[0]
      const msgType = item.type === 'video' ? 'video' : 'image'
      await conn.sendMessage(m.chat, {
        [msgType]: { url: item.url },
        caption: mainCaption,
        mimetype: item.type === 'video' ? 'video/mp4' : 'image/jpeg'
      }, { quoted: m })

    // ── CAROUSEL / MULTIPLE MEDIA ──────────────────────────────────────────────
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

      // Fallback: kirim satu per satu
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