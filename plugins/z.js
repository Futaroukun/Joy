/**
  *» Nama :* — [ DGAF AI ] —
  *» Type :* Plugin - ESM
  *» Base Url :* https://dgaf.ai
  *» Saluran :* https://whatsapp.com/channel/0029Vb7XfVV2v1IzPVqjgq37
  *» Creator :* -Ɗαnčoᴡ々
**/

import fetch from 'node-fetch'

const API_URL = 'https://dgaf.ai/api/chat/'

const ALTCHA_PAYLOAD =
  'eyJhbGdvcml0aG0iOiJTSEEtMjU2IiwiY2hhbGxlbmdlIjoiOWU5MjlkMDQ2MzJiODk1NWFjZGE2NzA3NTJlOWI3ZTE4OWFiZDk0YjAwY2U4M2U4NTU4MjQxNWYyOWU0MWZjNSIsIm51bWJlciI6MTU5NTUsInNhbHQiOiIzZmQ3MjgzMTFjNTQxNzU4M2Y3YzNlMWIiLCJzaWduYXR1cmUiOiJmMjJmNDU4NmYxNmJlZWJkZGYyYjQzYmIwYzgxZWQ4YzZiN2NlNzJjZjQ5MmVkNWFmYzFlYmVmZmQyZTkwMmUyIiwidG9vayI6ODA4fQ=='

const UAS = [
  'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 Chrome/121 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
]

const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const sleep = ms => new Promise(r => setTimeout(r, ms))
const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2)

const cooldown = new Map()
const COOLDOWN_MS = 2500

const parseStream = async body => {
  let buf = ''
  let out = ''
  for await (const c of body) {
    buf += c.toString()
    let i
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (line.startsWith('0:'))
        out += line.slice(2).replace(/^"|"$/g, '')
    }
  }
  return out.trim()
}

const send = async payload => {
  await sleep(rand(1500, 3500))

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': '*/*',
      'origin': 'https://dgaf.ai',
      'referer': 'https://dgaf.ai/',
      'user-agent': UAS[rand(0, UAS.length - 1)]
    },
    body: JSON.stringify(payload),
    timeout: 30000
  })

  if (!res.ok) throw new Error('bad_status')
  return parseStream(res.body)
}

let handler = async (m, { text }) => {
  if (!text && !m.quoted?.image)
    return m.reply('Masukkan pertanyaan atau reply gambar')

  const now = Date.now()
  const last = cooldown.get(m.sender) || 0
  if (now - last < COOLDOWN_MS)
    return m.reply('Tunggu sebentar...')

  cooldown.set(m.sender, now)

  let imageUrl = null
  if (m.quoted?.image) imageUrl = await m.quoted.upload()

  const parts = []
  if (text) parts.push({ type: 'text', text })
  if (imageUrl) parts.push({ type: 'image', image: imageUrl })

  const payload = {
    id: rid(),
    messages: [
      {
        role: 'user',
        content: JSON.stringify(parts),
        parts: [{ type: 'text', text: JSON.stringify(parts) }]
      }
    ],
    altchaPayload: ALTCHA_PAYLOAD
  }

  try {
    let out
    try {
      out = await send(payload)
    } catch {
      await sleep(rand(2000, 4000))
      out = await send(payload)
    }

    if (!out) return m.reply('Tidak ada jawaban')
    m.reply(out)
  } catch {
    m.reply('Gagal menghubungi server')
  }
}

handler.help = ['dgaf']
handler.tags = ['ai']
handler.command = ['dgaf']

export default handler