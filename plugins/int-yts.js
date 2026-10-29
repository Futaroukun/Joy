import yts from 'yt-search'

function fmtViews(n) {
  if (!n || n < 0) return '—'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function parseAgeInDays(ago) {
  if (!ago) return 0
  const s = String(ago).toLowerCase().trim()
  if (/second|sec|detik|minute|min|menit|hour|hr|jam/i.test(s)) return 0.5
  const dayMatch = s.match(/(\d+)\s*(?:day|hari|d)\b/i)
  if (dayMatch) return parseInt(dayMatch[1], 10)
  const weekMatch = s.match(/(\d+)\s*(?:week|minggu|w)\b/i)
  if (weekMatch) return parseInt(weekMatch[1], 10) * 7
  const monthMatch = s.match(/(\d+)\s*(?:month|bulan|mo)\b/i)
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30
  const yearMatch = s.match(/(\d+)\s*(?:year|tahun|y)\b/i)
  if (yearMatch) return parseInt(yearMatch[1], 10) * 365
  return 9999
}

function rankVideos(videos = [], query = '', limit = 5) {
  const q = String(query).toLowerCase().trim()
  const isSeekingNew = /terbaru|baru|teranyar|latest|new|\b202[5-9]\b/i.test(q)
  const cleanQ = q.replace(/terbaru|baru|teranyar|latest|new|\b202[5-9]\b/gi, '').trim()
  const keywords = (cleanQ || q).split(/\s+/).filter(k => k.length > 1)

  const seen = new Set()
  const uniqueVideos = []
  for (const v of videos) {
    if (!v || (v.type !== 'video' && v.type !== undefined)) continue
    const id = v.videoId || v.url
    if (!id || seen.has(id)) continue
    seen.add(id)
    uniqueVideos.push(v)
  }

  const scored = uniqueVideos.map((v, originalIndex) => {
    let score = 0
    const title = (v.title || '').toLowerCase()
    const author = (v.author?.name || '').toLowerCase()
    const views = Number(v.views) || 0
    const daysAgo = parseAgeInDays(v.ago)

    // 1. Keyword match in title
    let matchedKw = 0
    for (const kw of keywords) {
      if (title.includes(kw)) matchedKw++
    }
    const kwRatio = keywords.length > 0 ? matchedKw / keywords.length : 1
    score += kwRatio * 40

    // 2. Exact phrase match
    if (cleanQ && title.includes(cleanQ)) {
      score += 30
    }

    // 3. Author match (channel name contains keywords)
    for (const kw of keywords) {
      if (author.includes(kw)) {
        score += 15
        break
      }
    }

    // 4. Official music video / audio indicator
    if (/official\s*(music\s*video|video|audio|lyric|mv)|\(mv\)|\[mv\]/i.test(title)) {
      score += 10
    }

    // 5. Popularity (views) - log scale up to 25 pts
    const viewScore = Math.min(25, Math.log10(views + 1) * 3.5)
    score += viewScore

    // 6. Recency Boost
    if (isSeekingNew) {
      if (daysAgo <= 7) score += 35
      else if (daysAgo <= 30) score += 28
      else if (daysAgo <= 90) score += 20
      else if (daysAgo <= 180) score += 12
      else if (daysAgo <= 365) score += 5
      else score -= 15
    } else {
      if (daysAgo <= 7) score += 8
      else if (daysAgo <= 30) score += 6
      else if (daysAgo <= 90) score += 4
      else if (daysAgo <= 365) score += 2
    }

    // 7. Base ranking preservation
    score += Math.max(0, 15 - originalIndex)

    // 8. Negative penalty for karaoke/reaction if not asked
    if (!/reaction/i.test(q) && /reaction/i.test(title)) score -= 30
    if (!/karaoke/i.test(q) && /karaoke|instrumental|minus\s*one/i.test(title)) score -= 15

    return { v, score }
  })

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(s => s.v)
}

function buildVideoCard(v, i) {
  const ago   = v.ago ?? '—'
  const dur   = v.duration?.timestamp ?? v.timestamp ?? '—'
  const views = fmtViews(v.views)
  const ch    = v.author?.name ?? '—'

  return [
    `*${i}. ${v.title}*`,
    `• Durasi: ${dur}`,
    `• Viewer: ${views} views`,
    `• Upload: ${ago}`,
    `• Channel: ${ch}`,
    `• Link: ${v.url}`
  ].join('\n')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  if (!text) return m.reply(
    `╭── ✦ *YOUTUBE SEARCH* ✦\n` +
    `Cari video dan musik di YouTube dengan hasil relevan dan terbaru.\n\n` +
    `• *Format:* \`${usedPrefix + command} <kata kunci>\`\n` +
    `• *Contoh:* \`${usedPrefix + command} lofi music loop\`\n` +
    `• *Contoh Baru:* \`${usedPrefix + command} lagu viral terbaru\`\n` +
    `╰━━━━━━━━━━━━━━━━━━━━━━━`
  )

  const loading = await conn.sendMessage(m.chat, { text: `_Sedang mencari video "${text}" di YouTube..._` }, { quoted: m })
  const editKey = loading?.key

  const edit = async (text) => {
    if (editKey) {
      await conn.sendMessage(m.chat, { edit: editKey, text })
    } else {
      await conn.reply(m.chat, text, m)
    }
  }

  let res
  try {
    res = await yts(text)
  } catch (e) {
    return edit(`Gagal mengambil data.\n${e.message}`)
  }

  const rawList = res.videos || res.all || []
  const list = rankVideos(rawList, text, 7)
  if (!list.length) return edit('Tidak ada video ditemukan.')

  const body = [
    `╭── ✦ *YOUTUBE SEARCH* ✦`,
    `• *Kata Kunci:* _${text}_`,
    `• *Ditemukan:* _${list.length} video_`,
    `╰━━━━━━━━━━━━━━━━━━━━━━━\n`,
    list.map((v, i) => buildVideoCard(v, i + 1)).join('\n\n'),
    `\n╭── ✦ *PETUNJUK DOWNLOAD* ✦`,
    `• Putar audio: \`.play <link>\` atau \`.play ${text} <1-${list.length}>\``,
    `• Unduh MP3: \`.ytmp3 <link>\``,
    `╰━━━━━━━━━━━━━━━━━━━━━━━`
  ].join('\n')

  const thumb = list[0]?.thumbnail ?? null

  if (thumb) {
    await edit(`Ditemukan ${list.length} video untuk "${text}"`)
    await conn.sendMessage(m.chat, { image: { url: thumb }, caption: body }, { quoted: m })
  } else {
    await edit(body)
  }
}

handler.help    = ['yts *judul*']
handler.tags    = ['internet']
handler.command = /^yt(s|search)$/i

export default handler