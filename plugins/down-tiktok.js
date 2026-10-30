/*
- @Author: Rafli
- @Feature: TikTok Downloader (HD Priority)
- @Description: Download video HD, slide foto, dan audio tanpa watermark dengan scraper SaveTik & TikWM.
*/

import * as cheerio from 'cheerio'
import axios from 'axios'
import { exec } from 'child_process'
import { promisify } from 'util'
import { join } from 'path'
import { unlinkSync, readFileSync, existsSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

const execAsync = promisify(exec)

async function downloadBuffer(url, timeoutMs = 60000) {
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

async function remuxVideoFast(videoInput) {
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
        console.warn('[TikTok] ffmpeg remux failed, fallback to original:', e.message)
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

async function savetik(url) {
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

async function tikwm(url) {
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

const isValidVideoUrl = (url, musicUrls = []) => {
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

const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toString()
}

const formatDuration = (seconds) => {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const extractTikTokUrl = (text) => {
    const patterns = [
        /https?:\/\/(www\.)?(vt|vm|www)\.tiktok\.com\/[^\s]+/gi,
        /https?:\/\/(www\.)?tiktok\.com\/@[^\/]+\/video\/\d+/gi,
        /https?:\/\/[^\s]*tiktok[^\s]*/gi
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[0]
    }
    return null
}

let handler = async (m, { conn, text, usedPrefix, command, reportError }) => {
    if (!text) {
        return m.reply(
            `╭── ✦ *TIKTOK DOWNLOADER* ✦\n` +
            `• Download video & slideshow TikTok tanpa watermark (HD Prioritas).\n\n` +
            `• *Cara Pakai*: \`${usedPrefix + command} <url>\`\n` +
            `• *Contoh*:\n` +
            `  › \`${usedPrefix + command} https://vt.tiktok.com/xxx\`\n` +
            `  › \`${usedPrefix + command} https://www.tiktok.com/@user/video/123\`\n\n` +
            `• _Support: Video HD, Slideshow Foto, & Audio MP3_\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const tiktokUrl = extractTikTokUrl(text)
    if (!tiktokUrl) {
        return m.reply('Link tidak valid. Pastikan link berasal dari TikTok.')
    }

    let loadingMsg = await m.reply('_Memproses, tunggu sebentar..._')

    try {
        const [savetikResult, tikwmData] = await Promise.all([
            savetik(tiktokUrl),
            tikwm(tiktokUrl)
        ])

        if (!savetikResult && !tikwmData) {
            throw new Error('Gagal mengambil data dari server TikTok. Coba periksa tautan atau ulangi beberapa saat lagi.')
        }

        const audioUrl = savetikResult?.mp3 || tikwmData?.music || tikwmData?.music_info?.play || null
        const knownMusicUrls = [
            savetikResult?.mp3,
            tikwmData?.music,
            tikwmData?.music_info?.play
        ].filter(Boolean)

        let videoHD = null
        if (isValidVideoUrl(tikwmData?.hdplay, knownMusicUrls)) {
            videoHD = tikwmData.hdplay
        } else if (isValidVideoUrl(savetikResult?.mp4HD, knownMusicUrls)) {
            videoHD = savetikResult.mp4HD
        }

        let videoSD = null
        if (isValidVideoUrl(tikwmData?.play, knownMusicUrls)) {
            videoSD = tikwmData.play
        } else if (isValidVideoUrl(savetikResult?.mp4SD, knownMusicUrls)) {
            videoSD = savetikResult.mp4SD
        } else if (isValidVideoUrl(savetikResult?.mp4, knownMusicUrls)) {
            videoSD = savetikResult.mp4
        }

        const videoUrl = videoHD || videoSD || null
        const isHD = Boolean(videoHD)

        const images = (tikwmData?.images?.length ? tikwmData.images : savetikResult?.images) || []

        if (!videoUrl && images.length === 0) {
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            }
            return m.reply('Tidak ada media yang ditemukan. Coba cek link atau coba lagi nanti.')
        }

        const title = tikwmData?.title || savetikResult?.caption || null
        const author = tikwmData?.author
            ? `${tikwmData.author.nickname} (@${tikwmData.author.unique_id})`
            : null
        const region = tikwmData?.region || null
        const duration = tikwmData?.duration ? formatDuration(tikwmData.duration) : null
        const videoId = tikwmData?.id || savetikResult?.videoId || null
        const stats = tikwmData ? {
            views: formatNumber(tikwmData.play_count),
            likes: formatNumber(tikwmData.digg_count),
            comments: formatNumber(tikwmData.comment_count),
            shares: formatNumber(tikwmData.share_count)
        } : null

        if (!videoUrl && images.length > 0) {
            let captionText =
                `╭── ✦ *TIKTOK SLIDESHOW* ✦\n` +
                (title ? `• *Caption*: ${title}\n` : '') +
                (author ? `• *Creator*: ${author}\n` : '') +
                (region ? `• *Region*: ${region}\n` : '') +
                `• *Total Foto*: ${images.length}\n` +
                (videoId ? `• *ID*: ${videoId}\n` : '')

            if (stats) {
                captionText +=
                    `\n╭── ✦ *STATS* ✦\n` +
                    `• *Views*: ${stats.views}\n` +
                    `• *Likes*: ${stats.likes}\n` +
                    `• *Shares*: ${stats.shares}\n`
            }

            captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Media: ${tikwmData?.images?.length ? 'TikWM' : 'SaveTik'}`

            // Unduh buffer gambar (chunk 5) untuk mencegah undici 'terminated' saat stream di Baileys
            const albumItems = []
            const chunkSize = 5
            for (let i = 0; i < images.length; i += chunkSize) {
                const chunk = images.slice(i, i + chunkSize)
                const chunkBuffers = await Promise.all(
                    chunk.map(imgUrl =>
                        downloadBuffer(imgUrl, 25000).catch(() => null)
                    )
                )
                chunkBuffers.forEach((buf, idx) => {
                    const originalIdx = i + idx
                    albumItems.push({
                        image: buf || { url: images[originalIdx] },
                        caption: originalIdx === 0 ? captionText : ''
                    })
                })
            }

            let albumSent = false
            if (typeof conn.sendAlbum === 'function') {
                try {
                    await conn.sendAlbum(m.chat, albumItems, { quoted: m, delay: 800 })
                    albumSent = true
                } catch (albumErr) {
                    console.warn('[TikTok] sendAlbum gagal, fallback 1-by-1:', albumErr?.message || albumErr)
                }
            }

            if (!albumSent) {
                for (let i = 0; i < albumItems.length; i++) {
                    const item = albumItems[i]
                    await conn.sendMessage(m.chat, {
                        ...item,
                        caption: i === 0 ? captionText : `*Slide ${i + 1}/${albumItems.length}*`
                    }, { quoted: m }).catch(() => {})
                    if (i < albumItems.length - 1) await new Promise(r => setTimeout(r, 600))
                }
            }

            if (audioUrl) {
                try {
                    const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(() => null)
                    await conn.sendMessage(m.chat, {
                        audio: audioBuffer || { url: audioUrl },
                        mimetype: 'audio/mpeg'
                    }, { quoted: m }).catch(() => {})
                } catch {}
            }

            // Hapus loading setelah media terkirim
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            }

        } else if (videoUrl) {
            const rawSize = (videoHD === tikwmData?.hdplay ? tikwmData?.hd_size : tikwmData?.size) || tikwmData?.size || 0
            const sizeInMB = rawSize ? (rawSize / (1024 * 1024)).toFixed(1) : null
            const isTooLargeForVideo = rawSize > 64 * 1024 * 1024 // Batas video WhatsApp (64 MB)
            const needsRemux = rawSize > 20 * 1024 * 1024 // > 20 MB: rapikan multi-audio track & moov atom faststart

            let captionText =
                `╭── ✦ *TIKTOK DOWNLOADER* ✦\n` +
                (title ? `• *Caption*: ${title}\n` : '') +
                (author ? `• *Creator*: ${author}\n` : '') +
                (region ? `• *Region*: ${region}\n` : '') +
                (duration ? `• *Durasi*: ${duration}\n` : '') +
                `• *Kualitas*: ${isHD ? 'HD (High Definition)' : 'SD (Standard)'}\n` +
                (sizeInMB ? `• *Ukuran*: ${sizeInMB} MB\n` : '') +
                (videoId ? `• *ID*: ${videoId}\n` : '')

            if (stats) {
                captionText +=
                    `\n╭── ✦ *STATS* ✦\n` +
                    `• *Views*: ${stats.views}\n` +
                    `• *Likes*: ${stats.likes}\n` +
                    `• *Comments*: ${stats.comments}\n` +
                    `• *Shares*: ${stats.shares}\n`
            }

            captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Kualitas: ${isHD ? 'HD' : 'SD'} | Source: ${videoHD === tikwmData?.hdplay ? 'TikWM (HD)' : (videoHD === savetikResult?.mp4HD ? 'SaveTik (HD)' : 'SD Fallback')}`

            if (isTooLargeForVideo) {
                captionText += `\n> ℹ️ *Catatan*: Dikirim sebagai dokumen karena ukuran file (${sizeInMB} MB) melebihi batas 64 MB video WhatsApp.`
                let docBuffer = null
                try {
                    docBuffer = await downloadBuffer(videoUrl, 90000)
                } catch {}
                await conn.sendMessage(m.chat, {
                    document: docBuffer || { url: videoUrl },
                    mimetype: 'video/mp4',
                    fileName: `tiktok_${videoId || Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
                    caption: captionText
                }, { quoted: m })
            } else {
                let videoBuffer = null
                // Unduh buffer langsung dengan User-Agent & Referer browser agar tidak diblokir/hang oleh CDN TikTok
                try {
                    videoBuffer = await downloadBuffer(videoUrl)
                } catch (dlErr) {
                    console.warn('[TikTok] Gagal download HD buffer, fallback ke SD:', dlErr?.message)
                    if (videoSD && videoSD !== videoUrl) {
                        try {
                            videoBuffer = await downloadBuffer(videoSD)
                        } catch {}
                    }
                }

                if (videoBuffer && needsRemux) {
                    const remuxed = await remuxVideoFast(videoBuffer)
                    if (remuxed) videoBuffer = remuxed
                }

                const videoPayload = videoBuffer || { url: videoUrl }

                try {
                    await conn.sendMessage(m.chat, {
                        video: videoPayload,
                        mimetype: 'video/mp4',
                        caption: captionText
                    }, { quoted: m })
                } catch (sendErr) {
                    console.warn('[TikTok] Gagal kirim sebagai video, fallback ke dokumen:', sendErr?.message || sendErr)
                    const docCaption = captionText + `\n> ℹ️ *Catatan*: Dikirim sebagai dokumen karena batas format video WhatsApp.`
                    await conn.sendMessage(m.chat, {
                        document: videoPayload,
                        mimetype: 'video/mp4',
                        fileName: `tiktok_${videoId || Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
                        caption: docCaption
                    }, { quoted: m })
                }
            }

            // Hapus pesan loading HANYA SETELAH media berhasil terkirim
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            }

            if (audioUrl) {
                try {
                    const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(() => null)
                    await conn.sendMessage(m.chat, {
                        audio: audioBuffer || { url: audioUrl },
                        mimetype: 'audio/mpeg'
                    }, { quoted: m }).catch(() => {})
                } catch {}
            }
        }

    } catch (error) {
        console.error('TikTok Download Error:', error)

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
        }

        const isTerminated = error?.message?.includes('terminated')
        const isNoSpace = error?.message?.includes('ENOSPC') || error?.code === 'ENOSPC'
        const errMsg = isNoSpace
            ? 'Penyimpanan (disk) server bot penuh. Bersihkan storage VPS/panel hosting.'
            : isTerminated
            ? 'Koneksi unduhan terputus (undici timeout). Silakan coba ulangi beberapa saat lagi.'
            : error.message

        const userMsg =
            `╭── ✦ *GAGAL MENGUNDUH* ✦\n` +
            `• ${errMsg}\n\n` +
            `• ${isNoSpace ? 'Kosongkan ruang disk hosting lalu coba lagi.' : 'Coba periksa tautan atau ulangi beberapa saat lagi.'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`

        if (typeof reportError === 'function') {
            await reportError(error, userMsg)
        } else if (typeof m.reportError === 'function') {
            await m.reportError(error, userMsg)
        } else {
            await m.reply(userMsg)
        }
    }
}

handler.help = ['tiktok *url*']
handler.tags = ['downloader']
handler.command = /^(tiktok|tt)$/i

export default handler