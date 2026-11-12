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
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://www.tiktok.com/'
        }
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
            signal: AbortSignal.timeout(15000)
        })

        const json = await res.json()
        const html = typeof json.data === 'string' ? json.data : ''
        if (!html) return null

        const $ = cheerio.load(html)
        const mp4HD = $('a:contains("Unduh MP4 HD"), a:contains("Download MP4 HD")').attr('href') || null
        const mp4SD =
            $('a:contains("Unduh MP4 [1]"), a:contains("Download MP4 [1]")').attr('href') ||
            $('a:contains("Unduh MP4 [2]"), a:contains("Download MP4 [2]")').attr('href') ||
            $('a:contains("Unduh MP4"), a:contains("Download MP4")').attr('href') ||
            null

        const mp4 = mp4HD || mp4SD || null
        const mp3 = $('a:contains("Unduh MP3"), a:contains("Download MP3")').attr('href') || null

        const images = []
        $('.photo-list ul.download-box li, ul.download-box li').each((_, el) => {
            const img = $(el).find("a[title*='Unduh'], a[title*='Download'], a[title*='Gambar'], a[title*='Photo']").attr('href') || $(el).find('a').attr('href')
            if (img && (img.startsWith('http') || img.startsWith('//'))) {
                images.push(img.startsWith('//') ? 'https:' + img : img)
            }
        })

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

export async function tikwm(url) {
    const endpoints = [
        `https://www.tikwm.com/api/?hd=1&url=${encodeURIComponent(url)}`,
        `https://sparkling-water-5288.mraflisetiawan075.workers.dev/api/?hd=1&url=${encodeURIComponent(url)}`
    ]

    for (const ep of endpoints) {
        try {
            const res = await axios.get(ep, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            })
            if (res.data?.code === 0) return res.data.data
        } catch {}
    }
    return null
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
