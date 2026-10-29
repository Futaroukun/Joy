/*
 * @Author      : Rafli
 * @Feature     : Web Fetcher & HTTP Client
 * @Description : Mengambil konten URL (JSON, HTML, XML, Media, Dokumen) langsung ke WhatsApp dengan auto-document untuk output besar.
 * @Version     : 3.0 (Stream Optimization, Large Output Auto-Doc & Clean Format)
 */

import fetch from 'node-fetch'
import https from 'https'
import mime from 'mime-types'
import { createReadStream, createWriteStream, unlinkSync, existsSync, statSync } from 'fs'
import { join, basename } from 'path'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'

const CFG = {
    timeout: 30000,
    maxSize: 100 * 1024 * 1024, // 100 MB
    maxTextLen: 3500,
    retries: 2,
    ua: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
        'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
    ]
}

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true })

const rand = arr => arr[Math.floor(Math.random() * arr.length)]
const esc = s => s ? String(s).replace(/[*`~>]/g, '') : ''
const clip = (s, max = 250) => s?.length > max ? s.slice(0, max).trim() + '...' : (s || '')
const trunc = (s, n = CFG.maxTextLen) => s?.length > n ? s.slice(0, n).trim() + '\n\n_... (konten dipotong)_' : (s || '')

function decodeHtml(str) {
    if (!str) return ''
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;|&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec))
        .replace(/<!\[CDATA\[|\]\]>/g, '')
}

const fmtSize = b => {
    if (!b || isNaN(b)) return '0 B'
    if (b < 1024) return `${b} B`
    if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / 1048576).toFixed(1)} MB`
}
const cleanup = p => { try { existsSync(p) && unlinkSync(p) } catch {} }

function getFilename(res, url, defaultExt = 'bin') {
    const cd = res.headers.get('content-disposition')
    if (cd) {
        const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)["']?/i)
        if (match && match[1]) {
            try { return decodeURIComponent(match[1].trim()) } catch { return match[1].trim() }
        }
    }
    try {
        const pathname = new URL(url).pathname
        const base = basename(pathname)
        if (base && base.includes('.')) return decodeURIComponent(base)
    } catch {}
    return `file_${Date.now()}.${defaultExt}`
}

function parseHTML(html, url) {
    const get = (re, i = 1) => decodeHtml(html.match(re)?.[i] || '').replace(/\s+/g, ' ').trim()
    const title = get(/<title[^>]*>([\s\S]*?)<\/title>/i) || get(/og:title" content="([^"]*)"/i) || new URL(url).hostname
    const desc  = get(/og:description" content="([^"]*)"/i) || get(/name="description" content="([^"]*)"/i)
    const image = get(/og:image" content="([^"]*)"/i) || get(/twitter:image" content="([^"]*)"/i)
    const cleanText = decodeHtml(
        html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
            .replace(/<[^>]+>/g, ' ')
    )
        .replace(/\s+/g, ' ')
        .trim()
    return { title, desc, image, content: cleanText.slice(0, 1500) }
}

async function smartFetch(url, options = {}) {
    const { method = 'GET', ignoreSSL = true } = options
    for (let i = 0; i < CFG.retries; i++) {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), CFG.timeout)
        try {
            const res = await fetch(url, {
                method,
                signal: ctrl.signal,
                headers: {
                    'User-Agent': rand(CFG.ua),
                    'Accept': '*/*'
                },
                redirect: 'follow',
                agent: url.startsWith('https') ? (ignoreSSL ? httpsAgent : undefined) : undefined
            })
            clearTimeout(timer)
            const cl = +res.headers.get('content-length') || 0
            if (cl > CFG.maxSize) throw new Error(`Ukuran file melebihi batas maksimal (${fmtSize(cl)} > ${fmtSize(CFG.maxSize)})`)
            return res
        } catch (err) {
            clearTimeout(timer)
            if (err.name === 'AbortError') throw new Error('Waktu permintaan habis (Request Timeout).')
            if (i === CFG.retries - 1) throw err
            await new Promise(r => setTimeout(r, 600 * (i + 1)))
        }
    }
}

async function streamFileToChat(conn, chat, res, ct, url, quoted) {
    const ext = mime.extension(ct) || ct.split(';')[0].split('/').pop() || 'bin'
    const fileName = getFilename(res, url, ext)
    const tmp = join(tmpdir(), `get_${Date.now()}.${ext}`)
    
    try {
        await pipeline(res.body, createWriteStream(tmp))
        const fileSize = existsSync(tmp) ? statSync(tmp).size : 0
        const cap =
            `╭── ✦ *WEB FETCHER* ✦\n` +
            `• *Nama File:* ${esc(fileName)}\n` +
            `• *Ukuran:* ${fmtSize(fileSize)}\n` +
            `• *MIME:* ${esc(ct.split(';')[0])}\n` +
            `• *Sumber:* ${esc(url)}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`

        const mediaType = ct.split('/')[0]
        if (['image', 'video', 'audio'].includes(mediaType) && fileSize <= 45 * 1024 * 1024) {
            await conn.sendMessage(chat, {
                [mediaType]: createReadStream(tmp),
                mimetype: ct,
                caption: cap
            }, { quoted })
        } else {
            await conn.sendMessage(chat, {
                document: createReadStream(tmp),
                fileName,
                mimetype: ct,
                caption: cap
            }, { quoted })
        }
    } finally {
        cleanup(tmp)
    }
}

let handler = async (m, { conn, text, usedPrefix, command, args, isOwner }) => {
    if (!text) {
        return m.reply(
            `╭── ✦ *WEB FETCHER* ✦\n` +
            `Mengambil dan mengirim konten URL langsung ke WhatsApp.\n\n` +
            `• *Format:* \`${usedPrefix + command} <url> [opsi]\`\n` +
            `• *Pilihan Opsi:*\n` +
            `  › \`--head\` : Cek header HTTP tanpa download body\n` +
            `  › \`--raw\`  : Paksa kirim output sebagai dokumen mentah\n` +
            `  › \`--ssl\`  : Verifikasi ketat SSL sertifikat\n\n` +
            `• *Contoh:*\n` +
            `  › \`${usedPrefix + command} https://api.github.com/users/octocat\`\n` +
            `  › \`${usedPrefix + command} https://example.com --head\`\n` +
            `  › \`${usedPrefix + command} https://example.com/file.zip\`\n\n` +
            `_Mendukung JSON, HTML, XML/RSS, Gambar, Video, Audio, & Dokumen._\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const isHead = args.includes('--head')
    const isForceRaw = args.includes('--raw')
    const strictSSL = args.includes('--ssl')

    const cleanArgs = args.filter(a => !a.startsWith('--'))
    let targetUrl = cleanArgs[0] || text.trim().split(/\s+/)[0]

    if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = 'https://' + targetUrl
    }

    try {
        const parsedUrl = new URL(targetUrl)
        const isLocalHost = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|\[::1\])$/i.test(parsedUrl.hostname)
        if (isLocalHost && !isOwner) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply('*Akses Ditolak:* Alamat host lokal / private network hanya dapat diakses oleh Owner.')
        }
    } catch {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply('*Format URL Tidak Valid:* Pastikan menyertakan domain yang benar.')
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    let res
    try {
        res = await smartFetch(targetUrl, {
            method: isHead ? 'HEAD' : 'GET',
            ignoreSSL: !strictSSL
        })
    } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(`*Gagal Mengambil URL*\n• *Error:* ${esc(err.message)}\n• *Target:* ${esc(targetUrl)}`)
    }

    if (!res.ok) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(
            `╭── ✦ *HTTP ERROR* ✦\n` +
            `• *Status:* ${res.status} ${esc(res.statusText)}\n` +
            `• *URL:* ${esc(res.url)}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // Penanganan mode HEAD
    if (isHead) {
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        const headersList = []
        for (const [k, v] of res.headers.entries()) {
            headersList.push(`• *${esc(k)}:* ${esc(v)}`)
        }
        return m.reply(
            `╭── ✦ *HTTP HEADERS* ✦\n` +
            `• *Status:* ${res.status} ${esc(res.statusText)}\n` +
            `• *URL:* ${esc(res.url)}\n\n` +
            `*DAFTAR HEADER:*\n` +
            headersList.slice(0, 30).join('\n') + '\n' +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const finalUrl = res.url

    // Cek media biner atau unduhan berkas
    const isMedia = /^(image|video|audio)\//.test(ct)
    const isDoc = /^(application\/(pdf|zip|x-tar|x-rar|x-7z|octet-stream|gzip|vnd\.))/i.test(ct)

    if (isForceRaw || isMedia || isDoc) {
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return streamFileToChat(conn, m.chat, res, ct || 'application/octet-stream', finalUrl, m)
    }

    // Tangani teks / data terstruktur
    let rawText = ''
    try {
        rawText = await res.text()
    } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(`*Gagal Membaca Data:* ${esc(err.message)}`)
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    const trimmed = rawText.trim()
    const isJson = ct.includes('json') || (trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))
    const isXml = ct.includes('xml') || ct.includes('rss') || /^<\?xml/i.test(trimmed)
    const isHtml = ct.includes('html') || /<!doctype\s*html|<html/i.test(trimmed)

    // Format JSON
    if (isJson) {
        let formatted = rawText
        try {
            formatted = JSON.stringify(JSON.parse(rawText), null, 2)
        } catch {}

        const header =
            `╭── ✦ *WEB FETCHER: JSON* ✦\n` +
            `• *URL:* ${esc(finalUrl)}\n` +
            `• *Status:* ${res.status} ${esc(res.statusText)}\n` +
            `• *Ukuran:* ${fmtSize(Buffer.byteLength(rawText, 'utf-8'))}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (formatted.length > CFG.maxTextLen) {
            return conn.sendMessage(m.chat, {
                document: Buffer.from(formatted, 'utf-8'),
                fileName: `response_${Date.now()}.json`,
                mimetype: 'application/json',
                caption: header + `\`\`\`json\n${trunc(formatted, 1200)}\n\`\`\`\n\n_Data utuh dilampirkan dalam berkas dokumen._`
            }, { quoted: m })
        }

        return m.reply(header + `\`\`\`json\n${formatted}\n\`\`\``)
    }

    // Format XML / RSS
    if (isXml) {
        if (/<rss|<feed/i.test(rawText)) {
            const title = rawText.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
            const items = [...rawText.matchAll(/<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)]
                .slice(0, 5)
                .map(x => {
                    const t = x[1].match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim()
                    const l = x[1].match(/<link[^>]*>([\s\S]*?)<\/link>|<link[^>]*href="([^"]*)"/i)?.[1]?.trim()
                    return t ? `• *${esc(t)}*${l ? `\n  › ${esc(l)}` : ''}` : ''
                })
                .filter(Boolean)
                .join('\n')

            return m.reply(
                `╭── ✦ *WEB FETCHER: RSS FEED* ✦\n` +
                (title ? `• *Saluran:* ${esc(title)}\n` : '') +
                `• *URL:* ${esc(finalUrl)}\n\n` +
                `*DAFTAR KONTEN:*\n` +
                (items || '_Tidak ada item ditemukan_') + '\n' +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const header =
            `╭── ✦ *WEB FETCHER: XML* ✦\n` +
            `• *URL:* ${esc(finalUrl)}\n` +
            `• *Ukuran:* ${fmtSize(Buffer.byteLength(rawText, 'utf-8'))}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (rawText.length > CFG.maxTextLen) {
            return conn.sendMessage(m.chat, {
                document: Buffer.from(rawText, 'utf-8'),
                fileName: `response_${Date.now()}.xml`,
                mimetype: 'application/xml',
                caption: header + `\`\`\`xml\n${trunc(rawText.replace(/>\s+</g, '>\n<'), 1200)}\n\`\`\`\n\n_Data XML utuh dilampirkan._`
            }, { quoted: m })
        }

        return m.reply(header + `\`\`\`xml\n${trunc(rawText.replace(/>\s+</g, '>\n<'), 2500)}\n\`\`\``)
    }

    // Format HTML
    if (isHtml) {
        const { title, desc } = parseHTML(rawText, finalUrl)
        const isRedirected = targetUrl.replace(/\/$/, '') !== finalUrl.replace(/\/$/, '')
        const cleanSize = fmtSize(Buffer.byteLength(rawText, 'utf-8'))

        let header =
            `╭── ✦ *WEB FETCHER: HTML* ✦\n` +
            `• *Judul:* ${esc(title || 'Tanpa Judul')}\n` +
            `• *Status:* ${res.status} ${esc(res.statusText)}\n` +
            `• *Ukuran:* ${cleanSize}\n` +
            `• *URL:* ${finalUrl}\n`

        if (isRedirected) header += `• *Pengalihan:* ${esc(targetUrl)} › ${finalUrl}\n`
        if (desc) header += `• *Deskripsi:* ${clip(desc, 250)}\n`
        header += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (rawText.length > CFG.maxTextLen) {
            const htmlSnippet = rawText.slice(0, 1200).trim()
            return conn.sendMessage(m.chat, {
                document: Buffer.from(rawText, 'utf-8'),
                fileName: `source_${Date.now()}.html`,
                mimetype: 'text/html',
                caption:
                    header +
                    `*KODE SUMBER HTML (CUPLIKAN):*\n` +
                    `\`\`\`html\n${htmlSnippet}\n\`\`\`\n\n` +
                    `_Kode HTML lengkap (${cleanSize}) dilampirkan dalam berkas dokumen._`
            }, { quoted: m })
        }

        return m.reply(
            header +
            `*KODE SUMBER HTML:*\n` +
            `\`\`\`html\n${rawText}\n\`\`\``
        )
    }

    // Format Plain Text biasa
    const textHeader =
        `╭── ✦ *WEB FETCHER: TEXT* ✦\n` +
        `• *URL:* ${finalUrl}\n` +
        `• *Status:* ${res.status} ${esc(res.statusText)}\n` +
        `• *Ukuran:* ${fmtSize(Buffer.byteLength(rawText, 'utf-8'))}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    if (rawText.length > CFG.maxTextLen) {
        return conn.sendMessage(m.chat, {
            document: Buffer.from(rawText, 'utf-8'),
            fileName: `response_${Date.now()}.txt`,
            mimetype: 'text/plain',
            caption: textHeader + `${trunc(rawText, 1200)}\n\n_Konten teks lengkap dilampirkan._`
        }, { quoted: m })
    }

    return m.reply(textHeader + rawText)
}

handler.help    = ['get *<url>*', 'fetch *<url>*']
handler.tags    = ['tools']
handler.command = /^(get|fetch|curl)$/i

export default handler