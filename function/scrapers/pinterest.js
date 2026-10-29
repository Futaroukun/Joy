/*
 * @Author      : Rafli
 * @Feature     : Pinterest Core Engine (Modern PWS State Hydration, HD Video/Image Pipeline, Carousel & Anti-Duplicate)
 * @Description : Engine Pinterest dengan parser Redux/PWS state terbaru, multi-kualitas video MP4 (720p/1080p), smart pagination, dan anti-duplicate
 * @Version     : 5.0 (Latest Pinterest Architecture)
 */

import axios from 'axios'
import https from 'https'
import * as cheerio from 'cheerio'

const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 25,
    timeout: 12000
})

let cachedAuth = null
let cacheExpiry = 0

// ── Anti-Duplicate Seen Cache (Auto-Pruning LRU) ──────────────────────────────
const seenPinIds = new Set()
const MAX_SEEN = 600

function recordSeen(id) {
    if (!id) return
    seenPinIds.add(String(id))
    if (seenPinIds.size > MAX_SEEN) {
        const first = seenPinIds.values().next().value
        seenPinIds.delete(first)
    }
}

// ── URL Helpers ───────────────────────────────────────────────────────────────
export function extractPinterestUrl(text = '') {
    if (!text) return null
    const match = text.match(/https?:\/\/(?:[a-zA-Z0-9-]+\.)?pinterest\.[a-z.]+\/pin\/[^\s/$.?#].[^\s]*|https?:\/\/pin\.it\/[a-zA-Z0-9_\-]+/i)
    return match ? match[0] : null
}

export function isPinterestUrl(text = '') {
    if (!text) return false
    return /(?:pinterest\.[a-z.]+\/pin\/|pin\.it\/)/i.test(text)
}

// ── 1. Auto CSRF & Session Scraper ────────────────────────────────────────────
export async function getPinterestAuth() {
    const now = Date.now()
    if (cachedAuth && now < cacheExpiry) {
        return cachedAuth
    }

    try {
        const res = await axios.get('https://www.pinterest.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
            },
            httpsAgent,
            timeout: 8000
        })

        const rawCookies = res.headers['set-cookie'] || []
        const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies]
        const csrfCookie = cookies.find(c => typeof c === 'string' && c.includes('csrftoken='))
        const csrftoken = csrfCookie ? csrfCookie.match(/csrftoken=([^;]+)/)?.[1] || '3018373238855bf7d89b9a76b2633bf9' : '3018373238855bf7d89b9a76b2633bf9'
        const cookieHeader = cookies.map(c => String(c).split(';')[0]).filter(Boolean).join('; ')

        cachedAuth = {
            csrftoken,
            cookieHeader: cookieHeader ? `${cookieHeader}; csrftoken=${csrftoken}` : `csrftoken=${csrftoken}; _auth=1`
        }
        cacheExpiry = now + (2 * 60 * 60 * 1000)
        return cachedAuth
    } catch (_) {
        cachedAuth = {
            csrftoken: '3018373238855bf7d89b9a76b2633bf9',
            cookieHeader: 'csrftoken=3018373238855bf7d89b9a76b2633bf9; _auth=1'
        }
        cacheExpiry = now + (5 * 60 * 1000)
        return cachedAuth
    }
}

// ── 2. Multi-Page Search with Dynamic Diversity & Fallback ────────────────────
export async function searchPinterest(query, limit = 5) {
    if (!query || !query.trim()) throw new Error('Kata kunci pencarian Pinterest tidak boleh kosong.')

    const auth = await getPinterestAuth()
    const cleanQuery = query.trim()
    const targetLimit = Math.max(1, Math.min(Number(limit) || 5, 20))
    const sourceUrl = `/search/pins/?q=${encodeURIComponent(cleanQuery)}`
    const collectedPins = []
    let bookmark = null

    const headers = {
        'Accept': 'application/json, text/javascript, */*, q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'X-CSRFToken': auth.csrftoken,
        'X-Pinterest-Source-Url': sourceUrl,
        'X-Pinterest-AppState': 'active',
        'X-Pinterest-PWS-Handler': 'www/[username]/[slug].js',
        'Cookie': auth.cookieHeader,
        'Referer': 'https://www.pinterest.com/'
    }

    // Ambil halaman (hanya ambil halaman ke-2 jika hasil halaman pertama belum mencukupi)
    for (let page = 0; page < 2; page++) {
        try {
            const postData = {
                options: {
                    query: cleanQuery,
                    scope: 'pins',
                    bookmarks: bookmark ? [bookmark] : []
                },
                context: {}
            }

            const res = await axios.post(
                'https://www.pinterest.com/resource/BaseSearchResource/get/',
                new URLSearchParams({
                    source_url: sourceUrl,
                    data: JSON.stringify(postData)
                }).toString(),
                { headers, httpsAgent, timeout: 8000 }
            )

            const results = res.data?.resource_response?.data?.results || []
            const newBookmark = res.data?.resource_response?.bookmark

            for (const pin of results) {
                if (!pin || typeof pin !== 'object') continue

                // Resolusi bertingkat: orig -> 736x -> 564x -> 474x -> 236x
                const origImg = pin.images?.['orig']?.url
                const hdImg = pin.images?.['736x']?.url
                const medImg = pin.images?.['564x']?.url || pin.images?.['474x']?.url || pin.images?.['236x']?.url

                const baseImg = origImg || hdImg || medImg
                if (!baseImg) continue

                const bestOrig = origImg || (hdImg ? hdImg.replace(/\/736x\//, '/originals/') : (medImg ? medImg.replace(/\/\d+x\//, '/originals/') : ''))
                const bestHd = hdImg || medImg || baseImg

                collectedPins.push({
                    id          : String(pin.id || Math.random().toString(36).substring(2)),
                    title       : pin.title || pin.grid_title || pin.closeup_unified_description || 'Untitled Pin',
                    description : (pin.description || pin.closeup_unified_description || '').trim(),
                    imageUrl    : bestHd,
                    fallbackUrl : medImg || bestHd,
                    originalUrl : bestOrig || bestHd,
                    pinUrl      : pin.id ? `https://www.pinterest.com/pin/${pin.id}/` : `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(cleanQuery)}`,
                    author: {
                        name    : pin.pinner?.full_name || pin.pinner?.username || 'Unknown',
                        username: pin.pinner?.username || '',
                        url     : pin.pinner?.username ? `https://www.pinterest.com/${pin.pinner.username}/` : ''
                    }
                })
            }

            // Jika sudah cukup banyak dan tidak butuh pagination tambahan, stop
            if (collectedPins.length >= targetLimit * 3 || !newBookmark || newBookmark === '-end-' || newBookmark === bookmark || results.length === 0) {
                break
            }
            bookmark = newBookmark
        } catch (_) {
            break
        }
    }

    if (!collectedPins.length) throw new Error(`Tidak ada hasil ditemukan untuk "${cleanQuery}".`)

    // Filter duplikat dari history
    let freshPins = collectedPins.filter(p => !seenPinIds.has(p.id))
    if (freshPins.length < targetLimit) {
        freshPins = collectedPins
    }

    // Fisher-Yates shuffle
    for (let i = freshPins.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [freshPins[i], freshPins[j]] = [freshPins[j], freshPins[i]]
    }

    const selected = freshPins.slice(0, targetLimit)
    selected.forEach(p => recordSeen(p.id))

    return selected
}

// ── 3. Ultra-Fast Media Downloader with Multi-Fallback ────────────────────────
export async function downloadMedia(target) {
    const candidateUrls = []

    if (typeof target === 'string') {
        const clean = target.trim()
        candidateUrls.push(clean)
        if (clean.includes('/originals/')) {
            candidateUrls.push(clean.replace('/originals/', '/736x/'))
            candidateUrls.push(clean.replace('/originals/', '/564x/'))
        } else if (clean.includes('/736x/')) {
            candidateUrls.push(clean.replace('/736x/', '/originals/'))
            candidateUrls.push(clean.replace('/736x/', '/564x/'))
        }
    } else if (typeof target === 'object' && target !== null) {
        if (target.mediaUrl) candidateUrls.push(target.mediaUrl)
        if (target.imageUrl) candidateUrls.push(target.imageUrl)
        if (target.fallbackUrl) candidateUrls.push(target.fallbackUrl)
        if (target.url) candidateUrls.push(target.url)

        if (target.imageUrl && target.imageUrl.includes('/originals/')) {
            candidateUrls.push(target.imageUrl.replace('/originals/', '/736x/'))
        }
    }

    const uniqueCandidates = [...new Set(candidateUrls.filter(Boolean))]

    for (const url of uniqueCandidates) {
        try {
            const res = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Referer'   : 'https://www.pinterest.com/'
                },
                responseType: 'arraybuffer',
                httpsAgent,
                timeout     : 9000
            })
            if (res.status === 200 && res.data && res.data.length > 0) {
                return Buffer.from(res.data)
            }
        } catch (_) {}
    }

    throw new Error('Gagal mengunduh file media Pinterest (Network/404).')
}

// ── 4. Pinterest Downloader (PWS State Hydration & Media Extractor) ───────────
export async function downloadPinterest(rawInput) {
    const extracted = extractPinterestUrl(rawInput)
    const targetUrl = extracted || rawInput.trim()

    if (!targetUrl.startsWith('http')) {
        throw new Error('URL Pinterest tidak valid.')
    }

    const res = await axios.get(targetUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': 'https://www.pinterest.com/'
        },
        maxRedirects: 10,
        httpsAgent,
        timeout: 12000
    })

    const html = res.data || ''
    const finalUrl = res.request?.res?.responseUrl || res.config?.url || targetUrl
    const $ = cheerio.load(html)

    let title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'Pinterest Media'
    let desc = $('meta[property="og:description"]').attr('content') || ''
    let ogImage = $('meta[property="og:image"]').attr('content') || ''
    let videoUrl = $('meta[property="og:video"]').attr('content')
        || $('meta[property="og:video:secure_url"]').attr('content')
        || $('meta[name="twitter:player:stream"]').attr('content')
        || ''

    let authorName = ''
    let authorUrl = ''
    let originalImage = ''
    let likesCount = 0
    const carouselItems = []

    // ── A. Ekstraksi dari Redux / PWS State Hydration (Metode Modern Pinterest) ───
    const pwsScript = $('#__PWS_DATA__').html() || $('script[id="__PWS_DATA__"]').html() || $('script[type="application/json"]').filter((_, el) => $(el).text().includes('initialReduxState')).html()

    if (pwsScript) {
        try {
            const pwsJson = JSON.parse(pwsScript)
            const reduxState = pwsJson.props?.initialReduxState || pwsJson.initialReduxState || {}
            const pins = reduxState.pins || {}
            const pinKeys = Object.keys(pins)

            if (pinKeys.length > 0) {
                const pin = pins[pinKeys[0]]

                if (pin.title) title = pin.title
                if (pin.description) desc = pin.description
                if (pin.pinner) {
                    authorName = pin.pinner.full_name || pin.pinner.username || authorName
                    authorUrl = pin.pinner.username ? `https://www.pinterest.com/${pin.pinner.username}/` : authorUrl
                }
                if (pin.repin_count || pin.aggregated_pin_data?.aggregated_stats?.saves) {
                    likesCount = pin.repin_count || pin.aggregated_pin_data?.aggregated_stats?.saves || 0
                }

                // Ambil video kualitas terbaik (V_720P, V_EXP7, V_EXP6, V_EXP5, V_EXP4, MP4)
                if (pin.videos?.video_list) {
                    const vl = pin.videos.video_list
                    const priority = ['V_720P', 'V_EXP7', 'V_EXP6', 'V_EXP5', 'V_EXP4', 'V_EXP3', 'V_480P']
                    for (const quality of priority) {
                        if (vl[quality]?.url && vl[quality].url.endsWith('.mp4')) {
                            videoUrl = vl[quality].url
                            break
                        }
                    }
                    if (!videoUrl) {
                        for (const key of Object.keys(vl)) {
                            if (vl[key]?.url && vl[key].url.includes('.mp4')) {
                                videoUrl = vl[key].url
                                break
                            }
                        }
                    }
                }

                // Ambil gambar kualitas terbaik
                if (pin.images?.orig?.url) {
                    originalImage = pin.images.orig.url
                } else if (pin.images?.['736x']?.url) {
                    originalImage = pin.images['736x'].url.replace(/\/736x\//, '/originals/')
                }

                // Cek Carousel / Story Pin (Idea Pin)
                const storyPages = pin.story_pin_data?.pages || pin.story_pin_data_v2?.pages || []
                for (const page of storyPages) {
                    const block = page.blocks?.[0]
                    if (block) {
                        if (block.video?.video_list) {
                            const bvl = block.video.video_list
                            const bVid = bvl.V_720P?.url || bvl.V_EXP7?.url || bvl.V_EXP6?.url || Object.values(bvl).find(v => v?.url?.endsWith('.mp4'))?.url
                            if (bVid) carouselItems.push({ type: 'video', url: bVid })
                        } else if (block.image?.images?.orig?.url || block.image?.images?.['736x']?.url) {
                            const bImg = block.image.images.orig?.url || block.image.images['736x']?.url
                            if (bImg) carouselItems.push({ type: 'image', url: bImg })
                        }
                    }
                }
            }
        } catch (_) {}
    }

    // ── B. Ekstraksi dari JSON-LD (Schema.org) ─────────────────────────────────
    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).html() || '{}')
            if (data.image && !originalImage) originalImage = data.image
            if (data.headline && (!title || title.includes('Pinterest'))) title = data.headline
            if (data.author && !authorName) {
                authorName = data.author.name || data.author.alternateName || ''
                authorUrl = data.author.url || ''
            }
            if (data.video?.contentUrl && !videoUrl) videoUrl = data.video.contentUrl
            const stats = data.interactionStatistic || []
            for (const s of stats) {
                if (s.userInteractionCount && !likesCount) likesCount = s.userInteractionCount
            }
        } catch (_) {}
    })

    // ── C. Fallback Regex Video MP4 ────────────────────────────────────────────
    if (!videoUrl) {
        const v720Match = html.match(/"url"\s*:\s*"(https:[^"]+?\/videos\/[^"]+?\.mp4)"/)
        if (v720Match) {
            videoUrl = v720Match[1].replace(/\\u002F/g, '/').replace(/\\/g, '')
        }
    }
    if (!videoUrl) {
        const videoMatch = html.match(/https:\/\/[^"'\s<>]+\.pinimg\.com\/videos\/[^"'\s<>]+\.mp4/)
        if (videoMatch) videoUrl = videoMatch[0]
    }

    const bestImage = originalImage || (ogImage ? ogImage.replace(/\/736x\//, '/originals/') : '') || ogImage
    const isVideo = Boolean(videoUrl)
    const isGif = !isVideo && (bestImage.includes('.gif') || bestImage.includes('/gifs/'))
    const isCarousel = carouselItems.length > 1

    const mediaType = isCarousel ? 'carousel' : (isVideo ? 'video' : (isGif ? 'gif' : 'image'))
    const finalMediaUrl = isVideo ? videoUrl : bestImage

    if (!finalMediaUrl && !isCarousel) {
        throw new Error('Tidak dapat menemukan media gambar atau video pada link Pinterest tersebut.')
    }

    return {
        title: title.replace(/ \| Pinterest.*$/i, '').trim(),
        description: desc.trim(),
        author: {
            name: authorName || 'Unknown',
            url : authorUrl || ''
        },
        likes: likesCount,
        mediaType,
        mediaUrl: finalMediaUrl,
        fallbackUrl: ogImage || bestImage,
        slides: carouselItems,
        pageUrl: finalUrl
    }
}

export default {
    getPinterestAuth,
    searchPinterest,
    downloadPinterest,
    downloadMedia,
    isPinterestUrl,
    extractPinterestUrl
}
