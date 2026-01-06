/**
  *» Nama :* — [ NANOBANANA PRO - AI ] —
  *» Type :* Plugin - ESM
  *» Base Url :* https://www.artany.ai
  *» Saluran :* https://whatsapp.com/channel/0029Vb7XfVV2v1IzPVqjgq37
  *» Creator :* -Ɗαnčoᴡ々 (Modified for 9:16 AR)
**/

import axios from 'axios'
import crypto from 'crypto'
import { URL } from 'url'
import FormData from 'form-data'

const TEMPMAIL_API = Buffer.from(
  'aHR0cHM6Ly9hcGkubmVrb2xhYnMud2ViLmlkL3Rvb2xzL3RlbXBtYWlsL3Yx',
  'base64'
).toString()

const SUPABASE_URL = 'https://urrxpnraqkaiickvdtfl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycnhwbnJhcWthaWlja3ZkdGZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkwNDMzNjMsImV4cCI6MjA3NDYxOTM2M30.JFp8mnLQRuHAh7oYTGXFGP9K9hShl_MxMFZAesNjtcE'

async function uploadImage(buffer) {
  const form = new FormData()
  form.append('file', buffer, 'image.jpg')

  const res = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
    headers: form.getHeaders(),
    timeout: 30000
  })

  if (!res.data || !res.data.data || !res.data.data.url) {
    throw 'Gagal upload gambar ke server tmpfiles.'
  }

  const originalUrl = res.data.data.url
  const fileUrl = originalUrl.replace('tmpfiles.org/', 'tmpfiles.org/dl/')
  
  return fileUrl
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  let q = m.quoted ? m.quoted : m
  let mime = (q.msg || q).mimetype || ''

  if (!mime) return m.reply(`Kirim atau reply gambar terus kasih caption \`${usedPrefix + command}\` *prompt*`)
  if (!text) return m.reply(`Masukin prompt mau diubah gaya kayak gimana.\n\nContoh: \`${usedPrefix + command}\` *ubah jadi anime*`)

  m.reply('*Bentar ya, lagi diproses...* (Output: 9:16 Portrait)')

  try {
    let media = await q.download()
    let imageUrl = await uploadImage(media)

    const { code_verifier, code_challenge } = generatePKCE()

    const mailData = await axios.get(`${TEMPMAIL_API}/create`).then(r => r.data)
    
    if (!mailData.success) return m.reply('*Gagal bikin email sementara.*')

    const { email, sessionId } = mailData.result
    const redirectUrl = 'http://localhost:3000/callback'

    const headers = {
      'content-type': 'application/json',
      'apikey': SUPABASE_KEY,
      'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'
    }

    await axios.post(
      `${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectUrl)}`,
      {
        email,
        create_user: true,
        gotrue_meta_security: {},
        code_challenge,
        code_challenge_method: 's256'
      },
      { headers }
    )

    let authCode = null
    let attempts = 0

    while (attempts < 20 && !authCode) {
      await new Promise(r => setTimeout(r, 2000))

      const inbox = await axios.get(`${TEMPMAIL_API}/inbox`, {
        params: { id: sessionId }
      }).then(r => r.data)

      if (inbox.success && inbox.result.emails?.length) {
        const mail = inbox.result.emails[0]
        const content = mail.text || mail.html || ''
        const match = content.match(/https:\/\/urrxpnraqkaiickvdtfl\.supabase\.co\/auth\/v1\/verify\?token=[^\s"&]+&type=signup&redirect_to=[^\s"&]+/)

        if (match) {
          const verifyUrl = match[0].replace(/&amp;/g, '&')

          const verifyRes = await axios.get(verifyUrl, {
            maxRedirects: 0,
            validateStatus: s => s >= 200 && s < 400
          })

          const location = verifyRes.headers.location
          if (location) {
            const u = new URL(location)
            authCode = u.searchParams.get('code')
          }
        }
      }
      attempts++
    }

    if (!authCode) return m.reply('*Gagal dapetin kode verifikasi, coba lagi aja.*')

    const exchangeRes = await axios.post(
      `${SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
      {
        auth_code: authCode,
        code_verifier
      },
      { headers }
    )

    const { access_token, refresh_token } = exchangeRes.data
    if (!access_token) return m.reply('*Gagal tuker kode jadi token.*')

    const authCookie = `sb-urrxpnraqkaiickvdtfl-auth-token=${encodeURIComponent(JSON.stringify([access_token, refresh_token, null, null, null]))}`

    const creditHeaders = {
      'user-agent': headers['user-agent'],
      'content-type': 'application/json',
      'cookie': authCookie,
      'authority': 'www.artany.ai',
      'origin': 'https://www.artany.ai',
      'referer': 'https://www.artany.ai/'
    }

    const creditRes = await axios.post('https://www.artany.ai/api/credits', {}, { headers: creditHeaders })
    if (creditRes.data?.credits < 1) return m.reply('*Akun berhasil dibuat tapi saldo kreditnya kosong. Coba lagi nanti ya.*')

    // --- BAGIAN YANG DIUBAH ---
    const genPayload = {
      prompt: text,
      model: 'nano-banana-pro-image-editor',
      enable_safety_checker: false,
      num_images: 1,
      // Mengubah aspect ratio dari '1:1' menjadi '9:16'
      aspect_ratio: '9:16',
      quality: '1k',
      image_urls: [imageUrl]
    }
    // -------------------------

    const genHeaders = {
      ...creditHeaders,
      referer: 'https://www.artany.ai/ai-image-editor'
    }

    const genRes = await axios.post(
      'https://www.artany.ai/api/image-generator/nano-banana-pro',
      genPayload,
      { headers: genHeaders }
    )

    const taskId = genRes.data?.data?.task_id
    if (!taskId) return m.reply('*Gagal mulai proses edit gambar.*')

    let finalImageUrl = null
    let status = 'PENDING'
    let checks = 0

    while (!['SUCCEEDED', 'FAILED'].includes(status) && checks < 30) {
      await new Promise(r => setTimeout(r, 2000))

      const s = await axios.get(
        `https://www.artany.ai/api/image-task-status?task_id=${taskId}`,
        { headers: genHeaders }
      )

      status = s.data?.data?.status
      if (status === 'SUCCEEDED') {
        finalImageUrl = s.data?.data?.result_images?.[0]?.url
      }
      checks++
    }

    if (!finalImageUrl) return m.reply('*Gagal ganti gaya gambar atau waktu tunggu abis.*')

    await conn.sendMessage(
      m.chat,
      {
        image: { url: finalImageUrl },
        caption: `*BERHASIL DIUBAH (9:16)*\n\nPrompt: *${text}*`
      },
      { quoted: m }
    )

  } catch (e) {
    if (e.response) {
      m.reply(`*Error API:* ${e.response.status}`)
    } else {
      m.reply(`*Ada masalah:* ${e}`)
    }
  }
}

handler.help = ['aiimage *prompt*']
handler.tags = ['ai']
handler.command = /^(aiimage|image)$/i

export default handler

function generatePKCE() {
  const verifier = base64URLEncode(crypto.randomBytes(32))
  const challenge = base64URLEncode(
    crypto.createHash('sha256').update(verifier).digest()
  )
  return { code_verifier: verifier, code_challenge: challenge }
}

function base64URLEncode(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}