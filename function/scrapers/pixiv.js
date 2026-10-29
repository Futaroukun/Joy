/*
 * @Author      : Rafli
 * @Feature     : Pixiv Core Engine (Anti-Ban Hardened + Dual Auth + High-Power Features)
 * @Description : Centralized Pixiv API client with token auto-refresh, jitter queue, artist search & media pipeline
 * @Version     : 6.0 (Enterprise Hardened)
 */

import fetch from 'node-fetch'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

// ── Official OAuth Credentials (Rotated & Active) ────────────────────────────
const CLIENT_ID     = 'MOBrBDS8blbauoSck0ZfDbtuzpyT'
const CLIENT_SECRET = 'lsACyCD94FhDUtGTXi3QzcFE2uU1hqtDaKeqrdwj'
const HASH_SALT     = '28c1fdd170a5204386cb1313c7077b34f83e4aaf4aa829ce78c231e05b0bae2c'

const DATA_DIR  = path.join(process.cwd(), 'data')
const FILE_PATH = path.join(DATA_DIR, 'pixiv.json')

const WEB_HEADERS = {
    'User-Agent'     : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept'         : 'application/json',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    'Referer'        : 'https://www.pixiv.net/',
    'Cache-Control'  : 'no-cache'
}

// ── Anti-Ban Request Throttle / Jitter Queue ──────────────────────────────────
let lastReqTime = 0
async function throttleRequest(minIntervalMs = 180) {
    const now = Date.now()
    const diff = now - lastReqTime
    const jitter = Math.floor(Math.random() * 80)
    const delay = (minIntervalMs + jitter) - diff
    if (delay > 0) {
        await new Promise(r => setTimeout(r, delay))
    }
    lastReqTime = Date.now()
}

// ── Storage Helpers ───────────────────────────────────────────────────────────
export function loadConfig() {
    if (!fs.existsSync(FILE_PATH)) return {}
    try {
        return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'))
    } catch (_) {
        return {}
    }
}

export function saveConfig(patch) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
    const current = loadConfig()
    const updated = { ...current, ...patch, updatedAt: new Date().toISOString() }
    fs.writeFileSync(FILE_PATH, JSON.stringify(updated, null, 2), 'utf-8')
    global.pixiv = { ...global.pixiv, ...updated }
    return updated
}

function getAppHeaders() {
    const time = new Date().toISOString()
    const hash = crypto.createHash('md5').update(time + HASH_SALT).digest('hex')
    return {
        'User-Agent'     : 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
        'Content-Type'   : 'application/x-www-form-urlencoded',
        'Accept-Language': 'en_US',
        'App-OS'         : 'ios',
        'App-OS-Version' : '14.6',
        'X-Client-Time'  : time,
        'X-Client-Hash'  : hash
    }
}

// ── Retry Helper with Exponential Backoff ─────────────────────────────────────
export async function withRetry(fn, max = 3) {
    let lastErr
    for (let i = 1; i <= max; i++) {
        try {
            await throttleRequest(150)
            return await fn()
        } catch (e) {
            lastErr = e
            const status = e?.status ?? 0
            if (e.name === 'AbortError' || (status >= 400 && status < 500 && status !== 429)) break
            if (i < max) {
                const backoff = (800 * Math.pow(2, i - 1)) + Math.floor(Math.random() * 200)
                await new Promise(r => setTimeout(r, backoff))
            }
        }
    }
    throw lastErr
}

// ── OAuth Token Auto-Refresher ────────────────────────────────────────────────
export async function getValidAccessToken() {
    const conf = loadConfig()
    if (!conf.refreshToken) return null

    if (conf.accessToken && conf.expiresAt && Date.now() < (conf.expiresAt - 5 * 60 * 1000)) {
        return conf.accessToken
    }

    try {
        const res = await fetch('https://oauth.secure.pixiv.net/auth/token', {
            method : 'POST',
            headers: getAppHeaders(),
            body   : new URLSearchParams({
                client_id     : CLIENT_ID,
                client_secret : CLIENT_SECRET,
                get_secure_url: '1',
                grant_type    : 'refresh_token',
                refresh_token : conf.refreshToken
            })
        })

        const json = await res.json().catch(() => ({}))
        if (!res.ok || json.has_error || !json.response?.access_token) {
            return null
        }

        const resp = json.response
        saveConfig({
            accessToken : resp.access_token,
            refreshToken: resp.refresh_token || conf.refreshToken,
            expiresAt   : Date.now() + ((resp.expires_in || 3600) * 1000),
            userId      : String(resp.user?.id || conf.userId || ''),
            userName    : resp.user?.name || conf.userName || '',
            isPremium   : !!resp.user?.is_premium
        })

        return resp.access_token
    } catch (_) {
        return null
    }
}

// ── HTTP Request Dispatcher ───────────────────────────────────────────────────
export async function getAuthHeaders() {
    const token = await getValidAccessToken().catch(() => null)
    if (token) {
        return {
            'User-Agent'     : 'PixivIOSApp/7.13.3 (iOS 14.6; iPhone13,2)',
            'Accept'         : 'application/json',
            'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
            'Authorization'  : `Bearer ${token}`,
            'Referer'        : 'https://app-api.pixiv.net/'
        }
    }

    const conf   = loadConfig()
    const cookie = global.pixiv?.cookie || conf.cookie || process.env.PIXIV_COOKIE || ''
    return {
        ...WEB_HEADERS,
        ...(cookie ? { 'Cookie': `PHPSESSID=${cookie}` } : {})
    }
}

export async function pixivReq(url) {
    return withRetry(async () => {
        const ctrl  = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        try {
            const headers = await getAuthHeaders()
            const res = await fetch(url, { headers, signal: ctrl.signal })
            if (!res.ok) {
                const err = new Error(`HTTP ${res.status}`)
                err.status = res.status
                throw err
            }
            const json = await res.json()
            if (json.error) {
                const err = new Error(json.message || 'Pixiv API error')
                err.status = 400
                throw err
            }
            return json.body !== undefined ? json.body : json
        } finally {
            clearTimeout(timer)
        }
    })
}

// ── Session Health Checker ────────────────────────────────────────────────────
export async function checkSessionHealth() {
    const conf     = loadConfig()
    const cookie   = global.pixiv?.cookie || conf.cookie || ''
    const hasToken = !!conf.refreshToken

    let tokenOk = false
    if (hasToken) {
        const tok = await getValidAccessToken()
        tokenOk = !!tok
    }

    let cookieOk   = false
    let userDetail = null

    if (cookie) {
        const ctrl  = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 12000)
        try {
            const userId = cookie.split('_')[0] || conf.userId || ''
            const res = await fetch('https://www.pixiv.net/ajax/user/extra?lang=en', {
                headers: { ...WEB_HEADERS, 'Cookie': `PHPSESSID=${cookie}` },
                signal : ctrl.signal
            })
            const json = await res.json().catch(() => ({}))
            cookieOk = res.ok && !json.error && typeof json.body === 'object' && !Array.isArray(json.body)

            if (cookieOk && userId) {
                try {
                    const resUser = await fetch(`https://www.pixiv.net/ajax/user/${userId}?full=1&lang=en`, {
                        headers: { ...WEB_HEADERS, 'Cookie': `PHPSESSID=${cookie}` },
                        signal : ctrl.signal
                    })
                    const jsonUser = await resUser.json().catch(() => ({}))
                    userDetail = jsonUser.body
                } catch (_) {}
            }
        } catch (_) {}
        finally { clearTimeout(timer) }
    }

    const name = userDetail?.name || conf.userName || 'Unknown'
    const id   = conf.userId || cookie.split('_')[0] || '-'

    if (userDetail?.name && userDetail.name !== conf.userName) {
        saveConfig({ userName: userDetail.name })
    }

    return {
        hasSession: tokenOk || cookieOk,
        tokenOk,
        cookieOk,
        userId    : id,
        userName  : name,
        cookie    : cookie,
        refreshToken: conf.refreshToken || ''
    }
}

// ── Artwork Normalizer & Fetchers ─────────────────────────────────────────────
export function normalizeArtwork(item) {
    const id = String(item.id || item.illust_id || '')
    const userObj = item.user || {}
    const tagsArr = Array.isArray(item.tags)
        ? item.tags.map(t => typeof t === 'object' ? (t.tag || t.name) : t)
        : (item.tags?.tags?.map(t => t.tag) || [])

    return {
        id           : id,
        title        : item.title || 'Untitled',
        tags         : tagsArr.filter(Boolean),
        userId       : String(item.userId || item.user_id || item.authorId || userObj.id || ''),
        userName     : item.userName || item.user_name || item.authorName || userObj.name || 'Unknown',
        width        : Number(item.width || 0),
        height       : Number(item.height || 0),
        pageCount    : Number(item.pageCount || item.illust_page_count || item.page_count || 1),
        likeCount    : Number(item.likeCount || item.total_bookmarks || 0),
        bookmarkCount: Number(item.bookmarkCount || item.total_bookmarks || item.bookmarks || 0),
        viewCount    : Number(item.viewCount || item.total_view || 0),
        createDate   : item.createDate || item.create_date || item.create_at || '',
        isR18        : (item.xRestrict ?? item.x_restrict ?? (tagsArr.includes('R-18') ? 1 : 0)) > 0,
        pageUrl      : `https://www.pixiv.net/en/artworks/${id}`
    }
}

export async function getArtwork(id) {
    const b = await pixivReq(`https://www.pixiv.net/ajax/illust/${id}?lang=en`)
    return normalizeArtwork(b)
}

export async function getPages(id) {
    const body = await pixivReq(`https://www.pixiv.net/ajax/illust/${id}/pages?lang=en`)
    if (!Array.isArray(body)) return []
    return body.map(p => ({
        small   : p.urls?.small || p.urls?.regular || p.urls?.original || '',
        regular : p.urls?.regular || p.urls?.small || p.urls?.original || '',
        original: p.urls?.original || p.urls?.regular || ''
    }))
}

// ── Artist / Creator Profile & Artworks ───────────────────────────────────────
export async function getArtistArtworks(userId, { limit = 20 } = {}) {
    const body = await pixivReq(`https://www.pixiv.net/ajax/user/${userId}/profile/top?lang=en`)
    const illusts = body?.illusts || {}
    const items = Object.values(illusts).map(normalizeArtwork)
    return {
        userId     : String(userId),
        extra      : body?.extra || {},
        artworks   : items.slice(0, limit)
    }
}

// ── Related / Recommendation Artworks ─────────────────────────────────────────
export async function getRelatedArtworks(illustId, { limit = 15 } = {}) {
    const token = await getValidAccessToken().catch(() => null)
    if (token) {
        try {
            const res = await pixivReq(`https://app-api.pixiv.net/v2/illust/related?illust_id=${illustId}`)
            const illusts = res?.illusts || []
            if (illusts.length) return illusts.slice(0, limit).map(normalizeArtwork)
        } catch (_) {}
    }

    // Web fallback for recommendations
    const body = await pixivReq(`https://www.pixiv.net/ajax/illust/${illustId}/recommend/init?limit=${limit}&lang=en`)
    const illusts = body?.illusts || []
    return illusts.slice(0, limit).map(normalizeArtwork)
}

// ── Search & Ranking ──────────────────────────────────────────────────────────
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]] }; return a }

export async function searchPixiv(keyword, { mode = 'safe', limit = 20 } = {}) {
    const enc  = encodeURIComponent(keyword)
    const base = `https://www.pixiv.net/ajax/search/artworks/${enc}?word=${enc}&order=popular_d&mode=${mode}&s_mode=s_tag&type=illust&lang=en`

    const [res1, res2] = await Promise.allSettled([
        pixivReq(`${base}&p=1`),
        pixivReq(`${base}&p=2`)
    ])

    const seen = new Map()
    for (const res of [res1, res2]) {
        if (res.status !== 'fulfilled') continue
        const data = res.value?.illustManga?.data || []
        data.forEach(item => {
            if (item.id && !seen.has(item.id)) seen.set(item.id, normalizeArtwork(item))
        })
    }

    if (seen.size < 5) {
        try {
            const fallbackUrl = `https://www.pixiv.net/ajax/search/artworks/${enc}?word=${enc}&order=popular_d&mode=${mode}&s_mode=s_tc&type=illust&lang=en&p=1`
            const fb = await pixivReq(fallbackUrl)
            const data = fb?.illustManga?.data || []
            data.forEach(item => {
                if (item.id && !seen.has(item.id)) seen.set(item.id, normalizeArtwork(item))
            })
        } catch (_) {}
    }

    if (seen.size === 0) throw new Error('Tidak ada hasil ditemukan')

    return shuffle([...seen.values()]).slice(0, limit)
}

export const RANKING_MODES = {
    daily     : 'daily',
    harian    : 'daily',
    weekly    : 'weekly',
    mingguan  : 'weekly',
    monthly   : 'monthly',
    bulanan   : 'monthly',
    rookie    : 'rookie',
    original  : 'original',
    pria      : 'male',
    male      : 'male',
    wanita    : 'female',
    female    : 'female',
    r18       : 'daily_r18',
    r18_daily : 'daily_r18',
    r18_weekly: 'weekly_r18'
}

export async function getRanking(rawMode = 'daily', limit = 20) {
    const mode = RANKING_MODES[rawMode.toLowerCase()] || 'daily'
    return withRetry(async () => {
        const ctrl  = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 15000)
        try {
            const headers = await getAuthHeaders()
            const res  = await fetch(`https://www.pixiv.net/ranking.php?mode=${mode}&format=json&p=1`, { headers, signal: ctrl.signal })
            if (!res.ok) {
                const err = new Error(`HTTP ${res.status}`)
                err.status = res.status
                throw err
            }
            const json = await res.json()
            const contents = json.contents || []
            return shuffle(contents).slice(0, limit).map(item => ({
                ...normalizeArtwork(item),
                rank: item.rank,
                isR18: mode.includes('r18')
            }))
        } finally {
            clearTimeout(timer)
        }
    })
}

// ── Ultra-Fast Media Downloader with Auto-Fallback ────────────────────────────
export async function downloadImage(target) {
    const candidateUrls = []
    if (typeof target === 'string') {
        candidateUrls.push(target)
    } else if (typeof target === 'object' && target !== null) {
        if (target.small) candidateUrls.push(target.small)
        if (target.regular) candidateUrls.push(target.regular)
        if (target.original) candidateUrls.push(target.original)
    }

    for (const url of candidateUrls) {
        if (!url) continue
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer'   : 'https://www.pixiv.net/'
                },
                responseType: 'arraybuffer',
                timeout     : 12000
            })
            if (res.status === 200 && res.data) {
                return Buffer.from(res.data)
            }
        } catch (_) {}
    }

    throw new Error('Gagal mengunduh gambar Pixiv')
}

export function extractArtworkId(input) {
    if (!input) return null
    const text = input.trim()
    const patterns = [
        /pixiv\.net\/(?:en\/)?artworks\/(\d+)/i,
        /pixiv\.net\/i\/(\d+)/i,
        /illust_id=(\d+)/i,
        /pixiv:\/\/illust\/(\d+)/i,
        /^(\d{6,12})$/
    ]
    for (const p of patterns) {
        const m = text.match(p)
        if (m) return m[1]
    }
    return null
}

export const fmtNum  = n => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n||0)
export const fmtDate = iso => {
    try {
        return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
        return iso
    }
}

export function buildCaption(art) {
    const tags = art.tags?.slice(0, 6).map(t => `#${t}`).join(' ') || ''
    return (
        `*${art.title}${art.isR18 ? ' [R18]' : ''}*\n` +
        `Creator: ${art.userName} (ID: ${art.userId || '-'})\n` +
        `Likes: ${fmtNum(art.likeCount)}  Bookmarks: ${fmtNum(art.bookmarkCount)}  Views: ${fmtNum(art.viewCount)}\n` +
        `Size: ${art.width}×${art.height}  Pages: ${art.pageCount}` +
        (art.createDate ? `  Date: ${fmtDate(art.createDate)}` : '') +
        (tags ? `\n${tags}` : '') +
        `\n${art.pageUrl}`
    )
}

export async function sendArtwork(conn, m, detail, pages, targetPage = null) {
    const caption = buildCaption(detail)

    // Jika user minta halaman spesifik (1-indexed)
    if (targetPage !== null && targetPage > 0 && targetPage <= pages.length) {
        const idx = targetPage - 1
        const pageObj = pages[idx]
        const target = pageObj.regular || pageObj.small || pageObj
        const buffer = await downloadImage(target)
        const customCaption = `*${detail.title} (Halaman ${targetPage}/${pages.length})*\n\n${caption}`
        await conn.sendMessage(m.chat, { image: buffer, caption: customCaption }, { quoted: m })
        return
    }

    const maxPages = Math.min(pages.length, 10)

    if (maxPages > 1) {
        const downloadPromises = pages.slice(0, maxPages).map((pageObj, idx) =>
            downloadImage(pageObj)
                .then(buffer => ({ index: idx, buffer }))
                .catch(() => null)
        )
        const settled = await Promise.all(downloadPromises)
        const buffers = settled.filter(Boolean).sort((a, b) => a.index - b.index)

        if (!buffers.length) return m.reply(`*Semua halaman gagal didownload.*\n\n${detail.pageUrl}`)

        const albumItems = buffers.map((item, i) => ({
            image  : item.buffer,
            caption: i === 0 ? caption : `_${detail.title} — ${item.index + 1}/${pages.length}_`
        }))

        try {
            await conn.sendAlbum(m.chat, albumItems, { quoted: m })
        } catch {
            for (let i = 0; i < buffers.length; i++) {
                await conn.sendMessage(m.chat, {
                    image  : buffers[i].buffer,
                    caption: i === buffers.length - 1 ? caption : `_${detail.title} — ${buffers[i].index + 1}/${pages.length}_`
                }, { quoted: i === 0 ? m : undefined })
                if (i < buffers.length - 1) await new Promise(r => setTimeout(r, 400))
            }
        }
    } else {
        const pageObj = pages[0] || {}
        const target = pageObj.regular || pageObj.small || pageObj
        const buffer = await downloadImage(target)
        await conn.sendMessage(m.chat, { image: buffer, caption }, { quoted: m })
    }

    if (pages.length > 10) {
        await m.reply(`_Artwork ini punya *${pages.length} halaman*. Hanya 10 pertama yang dikirim._\n\n${detail.pageUrl}`)
    }
}

export default {
    loadConfig,
    saveConfig,
    withRetry,
    getValidAccessToken,
    getAuthHeaders,
    pixivReq,
    checkSessionHealth,
    normalizeArtwork,
    getArtwork,
    getPages,
    getArtistArtworks,
    getRelatedArtworks,
    searchPixiv,
    RANKING_MODES,
    getRanking,
    downloadImage,
    extractArtworkId,
    fmtNum,
    fmtDate,
    buildCaption,
    sendArtwork
}
