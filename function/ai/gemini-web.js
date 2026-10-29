/*
- @Feature: Gemini AI Web Client (Chat, Web Search, Text-to-Image & Image-to-Image)
- @Base: https://gemini.google.com
- @Developer: ZennzXD (Adapted for Joy Bot ESM with Auto-Recovery & Session Fallback)
*/

import https from 'https'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const agent = new https.Agent({ keepAlive: true })

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const COOKIES_PATH = path.join(process.cwd(), 'data', 'gemini-cookies.json')
const FALLBACK_COOKIES_PATH = path.join(__dirname, '../../data/gemini-cookies.json')

const randomUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
  const r = Math.random() * 16 | 0
  return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
})

function persistCookiesToDisk(cookies) {
  try {
    if (cookies && Object.keys(cookies).length > 0) {
      const paths = [COOKIES_PATH, FALLBACK_COOKIES_PATH]
      for (const p of paths) {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, JSON.stringify(cookies, null, 2))
      }
    }
  } catch {}
}

function syncCookies(jar, setCookies = []) {
  const list = Array.isArray(setCookies) ? setCookies : [setCookies]
  let hasUpdate = false
  for (const item of list) {
    if (!item) continue
    const pair = item.split(';')[0].split('=')
    if (pair.length >= 2) {
      const k = pair[0].trim()
      const v = pair.slice(1).join('=').trim()
      if (jar[k] !== v) {
        jar[k] = v
        hasUpdate = true
      }
    }
  }
  if (hasUpdate) {
    persistCookiesToDisk(jar)
  }
}

const buildCookieString = (jar) => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ')

function cleanText(text) {
  if (!text) return ''
  text = text.replace(/https?:\/\/[a-z0-9.-]*googleusercontent\.com\/[^\s\n"<>]+/gi, '')
  text = text.replace(/\[cite:\s*[\d,\s-]+\]/gi, '')
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

function request(url, { method = 'GET', headers = {}, body = null, stream = false, timeout = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method,
      headers: body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers,
      agent,
      maxHeaderSize: 1048576,
      timeout
    }

    const req = https.request(opts, res => {
      if (stream) {
        res.setTimeout(timeout, () => {
          res.destroy(new Error(`Stream request timeout (${timeout / 1000}s)`))
        })
        return resolve({ res, headers: res.headers, statusCode: res.statusCode })
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve({ text: Buffer.concat(chunks).toString(), headers: res.headers, statusCode: res.statusCode }))
    })

    req.on('timeout', () => {
      req.destroy(new Error(`Request timeout (${timeout / 1000}s)`))
    })

    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function download(url, cookieStr = null, hops = 0, timeout = 30000) {
  return new Promise((resolve, reject) => {
    if (hops > 5) return reject(new Error('Too many redirects'))
    const safeUrl = url.startsWith('http:') ? url.replace('http:', 'https:') : url
    const u = new URL(safeUrl)
    const headers = { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
    if (cookieStr) headers['cookie'] = cookieStr
    const req = https.get({ hostname: u.hostname, path: u.pathname + u.search, headers, maxHeaderSize: 1048576, agent, timeout }, res => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        return download(res.headers.location, cookieStr, hops + 1, timeout).then(resolve).catch(reject)
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    })
    req.on('timeout', () => {
      req.destroy(new Error(`Download timeout (${timeout / 1000}s)`))
    })
    req.on('error', reject)
  })
}

function parseFrames(buffer) {
  const frames = []
  let remaining = buffer

  if (remaining.startsWith(")]}'")) remaining = remaining.substring(4).trimStart()

  while (true) {
    const nl = remaining.indexOf('\n')
    if (nl === -1) break

    const sizeStr = remaining.substring(0, nl).trim()
    const size = parseInt(sizeStr, 10)

    if (isNaN(size)) {
      remaining = remaining.substring(nl + 1)
      continue
    }

    if (remaining.length < nl + size) break

    const framePayload = remaining.substring(nl, nl + size)
    remaining = remaining.substring(nl + size)

    try {
      const frameData = JSON.parse(framePayload)
      for (const item of (Array.isArray(frameData) ? frameData : [frameData])) {
        const innerStr = item?.[2]
        if (!innerStr) continue
        try { frames.push(JSON.parse(innerStr)) } catch (_) {}
      }
    } catch (_) {}
  }

  return { frames, remaining }
}

export function loadStoredCookies() {
  const possiblePaths = [
    COOKIES_PATH,
    FALLBACK_COOKIES_PATH,
    path.join(process.cwd(), 'data', 'cookies.json'),
    path.join(process.cwd(), 'cookies.json'),
    path.join(__dirname, '../../data/cookies.json')
  ]

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8')
        const content = JSON.parse(raw)
        const cookies = {}
        if (Array.isArray(content)) {
          content.forEach(c => { if (c.name && c.value) cookies[c.name] = c.value })
        } else if (content.cookies && Array.isArray(content.cookies)) {
          content.cookies.forEach(c => { if (c.name && c.value) cookies[c.name] = c.value })
        } else if (typeof content === 'object') {
          Object.assign(cookies, content)
        }
        if (Object.keys(cookies).length > 0) return cookies
      }
    } catch (err) {
      console.error('[GEMINI-WEB] Error reading cookie file:', err.message)
    }
  }
  return {}
}

export async function startSession(cookieInput = null, forceGuest = false) {
  let cookies = {}

  if (!forceGuest) {
    if (typeof cookieInput === 'string' && cookieInput.trim()) {
      for (const pair of cookieInput.split(';')) {
        const idx = pair.indexOf('=')
        if (idx > 0) cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
      }
    } else if (typeof cookieInput === 'object' && cookieInput !== null) {
      cookies = { ...cookieInput }
    } else {
      cookies = loadStoredCookies()
    }
  }

  const pageRes = await request('https://gemini.google.com/app', {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      ...(Object.keys(cookies).length > 0 ? { 'cookie': buildCookieString(cookies) } : {})
    }
  })
  syncCookies(cookies, pageRes.headers['set-cookie'])

  const cfb2hMatch = pageRes.text?.match(/"cfb2h":\s*"(.*?)"/)
  const buildLabel = cfb2hMatch ? cfb2hMatch[1] : 'boq_assistant-bard-web-server_20260709.09_p0'

  const atMatch = pageRes.text?.match(/"SNlM0e":"([^"]+)"/)
  const sidMatch = pageRes.text?.match(/"FdrFJe":"(-?\d+)"/)
  const atToken = atMatch ? atMatch[1] : null
  const fSid = sidMatch ? sidMatch[1] : null

  // Jika cookie kedaluwarsa (atToken hilang tapi ada cookie), otomatis fallback ke guest session
  if (!atToken && Object.keys(cookies).length > 0 && !forceGuest) {
    console.warn('[GEMINI-WEB] Cookie expired / session revoked, switching to guest session')
  }

  const batchRes = await request('https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=maGuAc&source-path=%2F&hl=en-US&_reqid=1&rt=c', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'cookie': buildCookieString(cookies)
    },
    body: 'f.req=[[["maGuAc","[0]",null,"generic"]]]&'
  })
  syncCookies(cookies, batchRes.headers['set-cookie'])

  const sessionId = Array.from({ length: 19 }, () => Math.floor(Math.random() * 10)).join('')

  return {
    cookies,
    buildLabel,
    sessionId,
    atToken,
    fSid,
    reqId: Math.floor(Math.random() * 90000) + 10000
  }
}

function buildStreamRequest(prompt, tokens, metadata, auth, imageParam = null) {
  const traceId = randomUUID().toUpperCase()
  const queryParams = new URLSearchParams({ hl: 'en-US', _reqid: String(auth.reqId), rt: 'c' })
  if (auth.buildLabel) queryParams.set('bl', auth.buildLabel)
  if (auth.fSid) queryParams.set('f.sid', auth.fSid)
  else if (auth.sessionId) queryParams.set('f.sid', auth.sessionId)

  const payload = [
    [prompt, 0, null, imageParam, null, null, 0], ['en-US'],
    metadata, null, null, null, [1], 1, null, null, 1, 0, null, null, null, null, null, [[0]], 1,
    null, null, null, null, null,
    ['', '', '', null, null, null, null, null, 0, null, 1, null, null, null, []],
    null, null, 1, null, null, null, null, null, null, null,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
    1, null, null, null, null, [1]
  ]

  const bodyParams = new URLSearchParams({ 'f.req': JSON.stringify([null, JSON.stringify(payload)]) })
  if (auth.atToken) bodyParams.set('at', auth.atToken)
  const body = bodyParams.toString()

  return {
    url: `https://gemini.google.com/_/BardChatUi/data/assistant.lamda.BardFrontendService/StreamGenerate?${queryParams}`,
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'x-goog-ext-525001261-jspb': '[1,null,null,null,"fbb127bbb056c959",null,null,0,[4,6],null,null,1,null,null,1]',
      'x-goog-ext-525005358-jspb': `["${traceId}",1]`,
      'x-goog-ext-73010989-jspb': '[0]',
      'x-goog-ext-73010990-jspb': '[0,0,0]',
      'x-same-domain': '1',
      'origin': 'https://gemini.google.com',
      'referer': 'https://gemini.google.com/',
      'cookie': buildCookieString(auth.cookies)
    },
    body
  }
}

export async function chat(prompt, auth = null, chatId = null, onChunk = null, fileInput = null, fileName = null) {
  auth = auth || await startSession()
  auth.reqId = (auth.reqId || 10000) + 100000

  let metadata = ['', '', '', null, null, null, null, null, null, '']
  if (chatId) {
    try {
      metadata = typeof chatId === 'string' ? JSON.parse(chatId) : chatId
    } catch (_) {}
  }

  let imageParam = null
  if (fileInput) {
    try {
      const name = fileName || 'file.bin'
      const fileUrl = await uploadFile(fileInput, name)
      imageParam = [
        [[fileUrl, 1], name]
      ]
    } catch (e) {
      console.error('[GEMINI-WEB] File upload error in chat:', e.message)
    }
  }

  const req = buildStreamRequest(prompt, null, metadata, auth, imageParam)
  const { res, headers: resHeaders } = await request(req.url, { method: 'POST', headers: req.headers, body: req.body, stream: true })

  syncCookies(auth.cookies, resHeaders['set-cookie'])

  return new Promise((resolve, reject) => {
    let accumulatedText = ''
    let lastSentText = ''
    let buf = ''
    let updatedMetadata = metadata

    res.on('data', chunk => {
      try {
        buf += chunk.toString('utf8')
        const { frames, remaining } = parseFrames(buf)
        buf = remaining

        for (const pj of frames) {
          if (pj?.[1]) updatedMetadata = pj[1]
          if (typeof pj?.[25] === 'string') updatedMetadata[9] = pj[25]
          for (const cand of (pj?.[4] || [])) {
            const cleaned = cleanText(cand?.[1]?.[0] || '')
            if (cleaned) {
              accumulatedText = cleaned
              const delta = cleaned.substring(lastSentText.length)
              if (delta && onChunk) {
                onChunk(delta)
                lastSentText = cleaned
              }
            }
          }
        }
      } catch (err) { reject(err) }
    })

    res.on('end', () => {
      const finalDelta = accumulatedText.substring(lastSentText.length)
      if (finalDelta && onChunk) onChunk(finalDelta)
      resolve({ reply: accumulatedText, chatId: updatedMetadata, auth })
    })

    res.on('error', reject)
  })
}

export async function uploadFile(input, customName = 'file.bin') {
  let fileData
  let fileName = customName

  if (Buffer.isBuffer(input)) {
    fileData = input
  } else if (typeof input === 'string') {
    fileData = fs.readFileSync(input)
    fileName = path.basename(input)
  } else {
    throw new Error('Invalid file input: expected Buffer or file path')
  }
  
  const startHeaders = {
    'host': 'push.clients6.google.com',
    'x-goog-upload-protocol': 'resumable',
    'x-goog-upload-command': 'start',
    'x-goog-upload-header-content-length': String(fileData.length),
    'push-id': 'feeds/mcudyrk2a4khkz',
    'x-client-pctx': 'CgcSBWjK7pYx',
    'x-tenant-id': 'bard-storage',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'origin': 'https://gemini.google.com',
    'referer': 'https://gemini.google.com/',
    'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
  }
  const startRes = await request('https://push.clients6.google.com/upload/', { method: 'POST', headers: startHeaders, body: `File name: ${fileName}` })
  const uploadUrl = startRes.headers['x-goog-upload-url']
  if (!uploadUrl) throw new Error('Gagal mendapatkan upload URL dari Google.')
  
  const uploadHeaders = {
    'host': 'push.clients6.google.com',
    'x-goog-upload-command': 'upload, finalize',
    'x-goog-upload-offset': '0',
    'x-tenant-id': 'bard-storage',
    'push-id': 'feeds/mcudyrk2a4khkz',
    'x-client-pctx': 'CgcSBWjK7pYx',
    'user-agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    'origin': 'https://gemini.google.com',
    'referer': 'https://gemini.google.com/',
    'content-length': String(fileData.length)
  }
  const uploadRes = await request(uploadUrl, { method: 'POST', headers: uploadHeaders, body: fileData })
  return uploadRes.text.trim()
}

export async function uploadImage(input) {
  return uploadFile(input, 'image.jpg')
}

export async function vision(input, prompt = 'Describe this file', auth = null, chatId = null, fileName = 'image.jpg') {
  auth = auth || await startSession()
  auth.reqId = (auth.reqId || 10000) + 100000

  const fileUrl = await uploadFile(input, fileName)
  const imageParam = [
    [[fileUrl, 1], fileName]
  ]

  let metadata = ['', '', '', null, null, null, null, null, null, '']
  if (chatId) {
    try {
      metadata = typeof chatId === 'string' ? JSON.parse(chatId) : chatId
    } catch (_) {}
  }

  const req = buildStreamRequest(prompt, null, metadata, auth, imageParam)
  const { res, headers: resHeaders } = await request(req.url, { method: 'POST', headers: req.headers, body: req.body, stream: true })

  syncCookies(auth.cookies, resHeaders['set-cookie'])

  return new Promise((resolve, reject) => {
    let rawText = ''
    let fullRawText = ''
    let buf = ''
    let updatedMetadata = metadata

    res.on('data', chunk => {
      try {
        const chunkStr = chunk.toString('utf8')
        fullRawText += chunkStr
        buf += chunkStr
        const { frames, remaining } = parseFrames(buf)
        buf = remaining

        for (const pj of frames) {
          if (pj?.[1]) updatedMetadata = pj[1]
          if (typeof pj?.[25] === 'string') updatedMetadata[9] = pj[25]
          for (const cand of (pj?.[4] || [])) {
            const raw = cand?.[1]?.[0] || ''
            if (raw) rawText = raw
          }
        }
      } catch (err) { reject(err) }
    })

    res.on('end', () => {
      resolve({ reply: cleanText(rawText), chatId: updatedMetadata, auth })
    })

    res.on('error', reject)
  })
}

export async function visionFile(fileInput, prompt = 'Jelaskan isi file ini', auth = null, chatId = null, fileName = 'document.txt') {
  return vision(fileInput, prompt, auth, chatId, fileName)
}

export async function generateImageToImage(prompt, imageInput, auth = null, chatId = null, outputPath = null) {
  auth = auth || await startSession()
  auth.reqId = (auth.reqId || 10000) + 100000

  const imgUrl = await uploadImage(imageInput)
  const imageParam = [
    [[imgUrl, 1], 'input.jpg']
  ]

  let metadata = ['', '', '', null, null, null, null, null, null, '']
  if (chatId) {
    try {
      metadata = typeof chatId === 'string' ? JSON.parse(chatId) : chatId
    } catch (_) {}
  }

  const req = buildStreamRequest(prompt, null, metadata, auth, imageParam)
  const { res, headers: resHeaders } = await request(req.url, { method: 'POST', headers: req.headers, body: req.body, stream: true })

  syncCookies(auth.cookies, resHeaders['set-cookie'])

  return new Promise((resolve, reject) => {
    let rawText = ''
    let fullRawText = ''
    let buf = ''
    let updatedMetadata = metadata

    res.on('data', chunk => {
      try {
        const chunkStr = chunk.toString('utf8')
        fullRawText += chunkStr
        buf += chunkStr
        const { frames, remaining } = parseFrames(buf)
        buf = remaining

        for (const pj of frames) {
          if (pj?.[1]) updatedMetadata = pj[1]
          if (typeof pj?.[25] === 'string') updatedMetadata[9] = pj[25]
          for (const cand of (pj?.[4] || [])) {
            const raw = cand?.[1]?.[0] || ''
            if (raw) rawText = raw
          }
        }
      } catch (err) { reject(err) }
    })

    res.on('end', async () => {
      try {
        const urlMatch = fullRawText.match(/https?:\/\/[a-z0-9.-]*googleusercontent\.com\/(?:rd-)?gg-dl\/[^\s\n"<>'\\]+/i)
        if (!urlMatch) {
          return resolve({ imageUrl: null, imageBuffer: null, reply: cleanText(rawText), chatId: updatedMetadata, auth })
        }

        const imageUrl = urlMatch[0]
        const imgBuf = await download(imageUrl, buildCookieString(auth.cookies))
        if (outputPath) fs.writeFileSync(outputPath, imgBuf)
        resolve({ imageUrl, imageBuffer: imgBuf, savedTo: outputPath, chatId: updatedMetadata, auth })
      } catch (err) { reject(err) }
    })

    res.on('error', reject)
  })
}

export async function generateImage(prompt, auth = null, chatId = null, outputPath = null) {
  auth = auth || await startSession()
  auth.reqId = (auth.reqId || 10000) + 100000

  let metadata = ['', '', '', null, null, null, null, null, null, '']
  if (chatId) {
    try {
      metadata = typeof chatId === 'string' ? JSON.parse(chatId) : chatId
    } catch (_) {}
  }

  const req = buildStreamRequest(prompt, null, metadata, auth)
  const { res, headers: resHeaders } = await request(req.url, { method: 'POST', headers: req.headers, body: req.body, stream: true })

  syncCookies(auth.cookies, resHeaders['set-cookie'])

  return new Promise((resolve, reject) => {
    let rawText = ''
    let fullRawText = ''
    let buf = ''
    let updatedMetadata = metadata

    res.on('data', chunk => {
      try {
        const chunkStr = chunk.toString('utf8')
        fullRawText += chunkStr
        buf += chunkStr
        const { frames, remaining } = parseFrames(buf)
        buf = remaining

        for (const pj of frames) {
          if (pj?.[1]) updatedMetadata = pj[1]
          if (typeof pj?.[25] === 'string') updatedMetadata[9] = pj[25]
          for (const cand of (pj?.[4] || [])) {
            const raw = cand?.[1]?.[0] || ''
            if (raw) rawText = raw
          }
        }
      } catch (err) { reject(err) }
    })

    res.on('end', async () => {
      try {
        const urlMatch = fullRawText.match(/https?:\/\/[a-z0-9.-]*googleusercontent\.com\/(?:rd-)?gg-dl\/[^\s\n"<>'\\]+/i)
        if (!urlMatch) {
          return resolve({ imageUrl: null, imageBuffer: null, reply: cleanText(rawText), chatId: updatedMetadata, auth })
        }

        const imageUrl = urlMatch[0]
        const imgBuf = await download(imageUrl, buildCookieString(auth.cookies))
        if (outputPath) fs.writeFileSync(outputPath, imgBuf)
        resolve({ imageUrl, imageBuffer: imgBuf, savedTo: outputPath, chatId: updatedMetadata, auth })
      } catch (err) { reject(err) }
    })

    res.on('error', reject)
  })
}

export default {
  startSession,
  chat,
  generateImage,
  generateImageToImage,
  vision,
  visionFile,
  uploadImage,
  uploadFile,
  loadStoredCookies
}