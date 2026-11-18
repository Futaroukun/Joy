/*
 * @Author      : Rafli
 * @Feature     : TikTok Scraper Engine (Savetik & TikWM)
 * @Description : Ekstraksi video HD, audio MP3, dan slideshow foto TikTok
 */

import * as cheerio from 'cheerio'
import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { unlinkSync, readFileSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

export async function downloadBuffer(url, timeoutMs = 60000) {
    let referer = 'https://www.tiktok.com/'
    let origin = undefined
    if (url.includes('tiksnap.es')) {
        referer = 'https://www.tiksnap.es/id/unduh-tiktok-hd'
        origin = 'https://www.tiksnap.es'
    } else if (url.includes('snapcdn.app') || url.includes('savetik')) {
        referer = 'https://savetik.io/'
        origin = 'https://savetik.io'
    } else if (url.includes('tikcdn.io') || url.includes('ssstik')) {
        referer = 'https://ssstik.io/'
        origin = 'https://ssstik.io'
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': referer
    }
    if (origin) headers['Origin'] = origin

    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers
    })
    return Buffer.from(res.data)
}

export async function remuxVideoFast(videoInput) {
    const tmpDir = process.env.TMPDIR || tmpdir()
    const inputPath = join(tmpDir, `tt_in_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`)
    const outputPath = join(tmpDir, `tt_remux_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`)
    const isBuffer = Buffer.isBuffer(videoInput)
    try {
        if (isBuffer) {
            writeFileSync(inputPath, videoInput)
        }
        const source = isBuffer ? `"${inputPath}"` : `"${videoInput}"`
        await execAsync(`ffmpeg -y -loglevel error -i ${source} -map 0:v:0 -map 0:a:0? -c copy -movflags +faststart "${outputPath}"`, {
            timeout: 90000,
            maxBuffer: 10 * 1024 * 1024
        })
        if (existsSync(outputPath)) {
            const buffer = readFileSync(outputPath)
            try { unlinkSync(outputPath) } catch {}
            if (isBuffer && existsSync(inputPath)) {
                try { unlinkSync(inputPath) } catch {}
            }
            return buffer
        }
    } catch (e) {
        console.warn('[TikTok Scraper] ffmpeg remux failed, fallback to original:', e.message)
    } finally {
        if (existsSync(outputPath)) {
            try { unlinkSync(outputPath) } catch {}
        }
        if (isBuffer && existsSync(inputPath)) {
            try { unlinkSync(inputPath) } catch {}
        }
    }
    return isBuffer ? videoInput : null
}

export async function resolveTikTokUrl(url) {
    if (!url || typeof url !== 'string') return url
    if (!/(?:vt|vm|v\.t)\.tiktok\.com/i.test(url)) return url
    try {
        const res = await fetch(url, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(6000)
        })
        if (res.url && res.url !== url && /tiktok\.com/i.test(res.url)) {
            return res.url
        }
    } catch (err) {
        console.warn('[TikTok] resolveTikTokUrl warning:', err?.message)
    }
    return url
}

export async function savetik(url) {
    try {
        const body = new URLSearchParams({
            q: url,
            cursor: '0',
            page: '0',
            lang: 'id'
        }).toString()

        const res = await fetch('https://savetik.io/api/ajaxSearch', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'x-requested-with': 'XMLHttpRequest',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'origin': 'https://savetik.io',
                'referer': 'https://savetik.io/id/download-tiktok-photos',
                'accept': '*/*'
            },
            body,
            signal: AbortSignal.timeout(12000)
        })

        if (!res.ok) return null
        const json = await res.json().catch(() => null)
        const html = typeof json?.data === 'string' ? json.data : ''
        if (!html) return null

        const $ = cheerio.load(html)

        const images = []
        $('.photo-list ul.download-box li, ul.download-box li').each((_, el) => {
            const img = $(el).find("a[title*='Unduh'], a[title*='Download'], a[title*='Gambar'], a[title*='Photo']").attr('href') || $(el).find('a').attr('href')
            if (img && (img.startsWith('http') || img.startsWith('//'))) {
                images.push(img.startsWith('//') ? 'https:' + img : img)
            }
        })

        const isPhoto = images.length > 0 || $('.photo-list').length > 0
        const mp4HD = isPhoto ? null : ($('a:contains("Unduh MP4 HD"), a:contains("Download MP4 HD")').attr('href') || null)
        const mp4SD = isPhoto ? null : (
            $('a:contains("Unduh MP4 [1]"), a:contains("Download MP4 [1]")').attr('href') ||
            $('a:contains("Unduh MP4 [2]"), a:contains("Download MP4 [2]")').attr('href') ||
            $('a:contains("Unduh MP4"), a:contains("Download MP4")').attr('href') ||
            null
        )

        const mp4 = mp4HD || mp4SD || null
        const mp3 = $('a:contains("Unduh MP3"), a:contains("Download MP3")').attr('href') || null

        const caption =
            $('.content .clearfix h3').text().trim() ||
            $('.content h3').text().trim() ||
            $('h3').first().text().trim() ||
            null

        const videoId = $('#TikTokId').val() || null

        return { mp4, mp4HD, mp4SD, mp3, images, caption, videoId }
    } catch {
        return null
    }
}

export async function tiksnap(url) {
    try {
        const res = await fetch('https://www.tiksnap.es/api/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Origin': 'https://www.tiksnap.es',
                'Referer': 'https://www.tiksnap.es/id/unduh-tiktok-hd'
            },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(15000)
        })

        if (!res.ok) return null
        const json = await res.json().catch(() => null)
        if (!json?.success || !json?.videoInfo) return null

        const { videoInfo, signed } = json
        const base = 'https://www.tiksnap.es'

        const videoOpt = videoInfo.downloadOptions?.find(o => o.type === 'video')
        const audioOpt = videoInfo.downloadOptions?.find(o => o.type === 'audio')

        const isPhotos = Array.isArray(videoInfo.images) && videoInfo.images.length > 0
        const images = isPhotos
            ? (signed?.images?.map(img => `${base}${img.signedUrl || img.url}`) || videoInfo.images)
            : []

        const videoHD = isPhotos ? null : (signed?.original ? `${base}${signed.original}` : null)
        const videoSD = isPhotos ? null : (videoOpt?.signedUrl ? `${base}${videoOpt.signedUrl}` : (videoOpt?.url || null))
        const audio = audioOpt?.signedUrl ? `${base}${audioOpt.signedUrl}` : (audioOpt?.url || null)

        return {
            id: videoInfo.id,
            title: videoInfo.description || null,
            author: videoInfo.author ? {
                nickname: videoInfo.author.nickname,
                unique_id: videoInfo.author.uniqueId
            } : null,
            duration: videoInfo.duration || null,
            hdplay: videoHD,
            play: videoSD,
            videoHD,
            videoSD,
            music: audio,
            images,
            play_count: videoInfo.stats?.playCount || 0,
            digg_count: videoInfo.stats?.diggCount || 0,
            comment_count: videoInfo.stats?.commentCount || 0,
            share_count: videoInfo.stats?.shareCount || 0,
            stats: videoInfo.stats || null
        }
    } catch {
        return null
    }
}

export const tikwm = tiksnap

export async function ssstik(url) {
    try {
        const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        const resHome = await fetch('https://ssstik.io/en', {
            headers: { 'User-Agent': UA },
            signal: AbortSignal.timeout(8000)
        })
        if (!resHome.ok) return null
        const homeHtml = await resHome.text()
        const ttMatch = homeHtml.match(/data-tt="([^"]+)"/) || homeHtml.match(/s_tt\s*=\s*'([^']+)'/)
        const ttVal = ttMatch ? ttMatch[1] : ''

        const postRes = await fetch('https://ssstik.io/abc?url=dl', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'user-agent': UA,
                'hx-request': 'true',
                'hx-target': 'target',
                'hx-current-url': 'https://ssstik.io/en'
            },
            body: new URLSearchParams({
                id: url,
                locale: 'en',
                tt: ttVal
            }),
            signal: AbortSignal.timeout(12000)
        })

        if (!postRes.ok) return null
        const postHtml = await postRes.text()
        const $ = cheerio.load(postHtml)

        const images = []
        $('.splide__slide img, .download-box img, ul.download-box li a').each((_, el) => {
            const src = $(el).attr('href') || $(el).attr('data-splide-lazy') || $(el).attr('src')
            if (src && (src.startsWith('http') || src.startsWith('//'))) {
                images.push(src.startsWith('//') ? 'https:' + src : src)
            }
        })

        const isPhoto = images.length > 0 || $('.splide__slide').length > 0 || $('a.slide').length > 0
        const mp4 = isPhoto ? null : (
            $('a.without_watermark[href]').attr('href') ||
            $('a.without_watermark_direct[href]').attr('href') ||
            $('a[href*="tikcdn.io/ssstik/"]').not('.slide').not('.slides_zip').not('.slides_video').attr('href') ||
            null
        )
        const mp3 = $('a.music[href]').attr('href') ||
            $('a[href*="/m/"]').attr('href') ||
            null

        const caption = $('p.maintext').text().trim() || $('h2').first().text().trim() || null
        const author = $('h2').first().text().trim() || null

        if (!mp4 && images.length === 0) return null

        return {
            mp4,
            mp4SD: mp4,
            mp3,
            images,
            caption,
            author
        }
    } catch {
        return null
    }
}

export const isValidVideoUrl = (url, musicUrls = []) => {
    if (!url || typeof url !== 'string') return false
    for (const mUrl of musicUrls) {
        if (mUrl && url === mUrl) return false
    }
    if (
        url.includes('mime_type=audio_mp4') ||
        url.includes('mime_type=audio_mpeg') ||
        url.includes('mime_type=audio') ||
        url.includes('-music.') ||
        url.includes('/music/') ||
        url.endsWith('.mp3')
    ) {
        return false
    }
    return true
}

export const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toString()
}

export const formatDuration = (seconds) => {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export const extractTikTokUrl = (text = '') => {
    if (!text) return null
    const patterns = [
        /https?:\/\/(?:www\.)?(?:vt|vm|v\.t|www)\.tiktok\.com\/[^\s]+/i,
        /https?:\/\/(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/\d+[^\s]*/i,
        /https?:\/\/(?:[a-zA-Z0-9-]+\.)?tiktok\.com\/[^\s]+/i
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) {
            // Trim trailing punctuation like . , ) !
            return match[0].replace(/[.,)!?]+$/, '')
        }
    }
    return null
}

export const isTikTokUrl = (text = '') => {
    if (!text) return false
    return /(?:tiktok\.com|vt\.tiktok\.com|vm\.tiktok\.com)/i.test(text)
}
