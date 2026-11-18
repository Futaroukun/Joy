import axios from 'axios'
import sharp from 'sharp'
import {
    downloadPinterest,
    downloadMedia,
    isPinterestUrl,
    extractPinterestUrl
} from '../function/scrapers/pinterest.js'
import {
    savetik,
    tiksnap,
    ssstik,
    resolveTikTokUrl,
    downloadBuffer,
    remuxVideoFast,
    isValidVideoUrl,
    formatDuration,
    extractTikTokUrl,
    isTikTokUrl
} from '../function/scrapers/tiktok.js'
import { writeExifImg, writeExifVid } from '../function/media/exif.js'
import { initChatSchema } from '../function/core/schema.js'

const activeChats = new Set()
const chatCooldowns = new Map()
const pendingModeSessions = new Map()
const COOLDOWN_MS = 5000
const MAX_VIDEO_BUFFER_BYTES = 64 * 1024 * 1024 // 64 MB
const MAX_ABSOLUTE_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB
const delay = ms => new Promise(r => setTimeout(r, ms))

async function getMediaSize(url, timeoutMs = 7000) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return 0
    let referer = 'https://www.tiktok.com/'
    if (url.includes('tiksnap.es')) referer = 'https://www.tiksnap.es/id/unduh-tiktok-hd'
    else if (url.includes('snapcdn.app') || url.includes('savetik')) referer = 'https://savetik.io/'
    else if (url.includes('tikcdn.io') || url.includes('ssstik')) referer = 'https://ssstik.io/'

    try {
        const res = await axios.head(url, {
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Referer': referer
            },
            maxRedirects: 5,
            validateStatus: s => s >= 200 && s < 400
        })
        const len = parseInt(res.headers?.['content-length'], 10)
        if (!isNaN(len) && len > 0) return len
    } catch {}

    try {
        const rangeRes = await axios.get(url, {
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Referer': referer,
                'Range': 'bytes=0-0'
            },
            maxRedirects: 5,
            validateStatus: s => s === 206 || (s >= 200 && s < 400)
        })
        const contentRange = rangeRes.headers?.['content-range']
        if (contentRange) {
            const match = contentRange.match(/\/(\d+)/)
            if (match) {
                const total = parseInt(match[1], 10)
                if (!isNaN(total) && total > 0) return total
            }
        }
        const len = parseInt(rangeRes.headers?.['content-length'], 10)
        if (!isNaN(len) && len > 1) return len
    } catch {}

    return 0
}

function detectSupportedUrl(text = '') {
    if (!text || typeof text !== 'string') return null

    if (isPinterestUrl(text)) {
        const pinUrl = extractPinterestUrl(text)
        if (pinUrl) return { type: 'pinterest', url: pinUrl.replace(/[.,)!?]+$/, '') }
    }

    if (isTikTokUrl(text)) {
        const ttUrl = extractTikTokUrl(text)
        if (ttUrl) return { type: 'tiktok', url: ttUrl.replace(/[.,)!?]+$/, '') }
    }

    return null
}

async function handlePinterestDownload(conn, m, targetUrl) {
    const detail = await downloadPinterest(targetUrl)

    const caption = [
        `╭── ✦ *AUTODL PINTEREST* ✦`,
        `• *Judul:* ${detail.title || '-'}`,
        detail.author?.name && detail.author.name !== 'Unknown' ? `• *Author:* ${detail.author.name}` : '',
        detail.likes ? `• *Likes:* ${detail.likes.toLocaleString('id-ID')}` : '',
        `• *Format:* ${detail.mediaType.toUpperCase()}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n${detail.pageUrl}`
    ].filter(Boolean).join('\n')

    if (detail.mediaType === 'carousel' && detail.slides?.length > 0) {
        const CHUNK_SIZE = 4
        const validSlides = []
        for (let i = 0; i < detail.slides.length; i += CHUNK_SIZE) {
            const chunk = detail.slides.slice(i, i + CHUNK_SIZE)
            const chunkResults = await Promise.all(
                chunk.map(async (item, idx) => {
                    const globalIdx = i + idx
                    try {
                        const buf = await downloadMedia(item.url)
                        return {
                            index: globalIdx,
                            image: buf,
                            caption: globalIdx === 0 ? caption : ''
                        }
                    } catch (err) {
                        console.warn(`[AUTODL] Gagal download slide Pin #${globalIdx}:`, err?.message || err)
                        return {
                            index: globalIdx,
                            image: { url: item.url },
                            caption: globalIdx === 0 ? caption : ''
                        }
                    }
                })
            )
            validSlides.push(...chunkResults.filter(Boolean))
            if (i + CHUNK_SIZE < detail.slides.length) {
                await delay(300)
            }
        }

        if (validSlides.length > 0) {
            validSlides.sort((a, b) => a.index - b.index)
            if (typeof conn.sendAlbum === 'function') {
                try {
                    return await conn.sendAlbum(m.chat, validSlides.map(s => ({
                        image: s.image,
                        caption: s.caption
                    })), { quoted: m, delay: 500 })
                } catch (albumErr) {
                    console.warn('[AUTODL] sendAlbum Pinterest fallback:', albumErr?.message)
                }
            }

            for (const slide of validSlides) {
                await conn.sendMessage(m.chat, {
                    image: slide.image,
                    caption: slide.caption
                }, { quoted: m })
                await delay(500)
            }
            return
        }
    }

    if (detail.mediaType === 'video') {
        const estSize = await getMediaSize(detail.mediaUrl)
        if (estSize > MAX_ABSOLUTE_VIDEO_BYTES) {
            const sizeMB = (estSize / (1024 * 1024)).toFixed(1)
            return await m.reply(
                `╭── ✦ *AUTODL PINTEREST* ✦\n` +
                `• *Status:* Video terlalu besar (${sizeMB} MB)\n` +
                `• *Batas Maksimal:* 64 MB\n` +
                `• Tautan langsung:\n${detail.mediaUrl}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (estSize > MAX_VIDEO_BUFFER_BYTES) {
            const sizeMB = (estSize / (1024 * 1024)).toFixed(1)
            console.warn(`[AUTODL] Video Pinterest (${sizeMB} MB) > 64MB, kirim langsung via dokumen stream`)
            return await conn.sendMessage(m.chat, {
                document: { url: detail.mediaUrl },
                mimetype: 'video/mp4',
                fileName: `pinterest_${Date.now()}.mp4`,
                caption: caption + `\n\n_Catatan: Dikirim sebagai dokumen (${sizeMB} MB)._`
            }, { quoted: m })
        }

        const buffer = await downloadMedia(detail.mediaUrl).catch(async (err) => {
            console.warn('[AUTODL] Gagal download video Pinterest:', err?.message)
            if (detail.fallbackUrl && detail.fallbackUrl !== detail.mediaUrl) {
                return await downloadMedia(detail.fallbackUrl).catch(fbErr => {
                    console.warn('[AUTODL] Gagal fallback video Pinterest:', fbErr?.message)
                    return null
                })
            }
            return null
        })

        if (buffer && buffer.length > MAX_VIDEO_BUFFER_BYTES) {
            const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1)
            return await conn.sendMessage(m.chat, {
                document: buffer,
                mimetype: 'video/mp4',
                fileName: `pinterest_${Date.now()}.mp4`,
                caption: caption + `\n\n_Catatan: Dikirim sebagai dokumen (${sizeMB} MB)._`
            }, { quoted: m })
        }

        const videoPayload = buffer || { url: detail.mediaUrl }
        try {
            return await conn.sendMessage(m.chat, {
                video: videoPayload,
                caption,
                mimetype: 'video/mp4'
            }, { quoted: m })
        } catch (sendErr) {
            console.warn('[AUTODL] Kirim video Pinterest gagal, fallback dokumen:', sendErr?.message)
            return await conn.sendMessage(m.chat, {
                document: videoPayload,
                caption,
                mimetype: 'video/mp4',
                fileName: `pinterest_${Date.now()}.mp4`
            }, { quoted: m })
        }
    }

    const buffer = await downloadMedia(detail.mediaUrl).catch(async (err) => {
        console.warn('[AUTODL] Gagal download media Pinterest:', err?.message)
        if (detail.fallbackUrl && detail.fallbackUrl !== detail.mediaUrl) {
            return await downloadMedia(detail.fallbackUrl).catch(fbErr => {
                console.warn('[AUTODL] Gagal fallback media Pinterest:', fbErr?.message)
                return null
            })
        }
        return null
    })

    const payload = buffer || { url: detail.mediaUrl }

    if (detail.mediaType === 'gif') {
        return await conn.sendMessage(m.chat, {
            video: payload,
            caption,
            gifPlayback: true,
            mimetype: 'video/mp4'
        }, { quoted: m })
    }

    return await conn.sendMessage(m.chat, {
        image: payload,
        caption
    }, { quoted: m })
}

async function handlePinterestSticker(conn, m, targetUrl) {
    const detail = await downloadPinterest(targetUrl)
    const options = {
        packname: global.packname || 'Created By Joy',
        author: global.author || 'wa.me/6285722157719'
    }

    if (detail.mediaType === 'carousel' && detail.slides?.length > 0) {
        const maxSlides = Math.min(detail.slides.length, 5)
        for (let i = 0; i < maxSlides; i++) {
            try {
                let buf = await downloadMedia(detail.slides[i].url)
                if (!buf) continue
                try {
                    const meta = await sharp(buf).metadata()
                    const minSize = 512
                    if (meta.width && meta.height && (meta.width < minSize || meta.height < minSize)) {
                        const smallestSide = Math.min(meta.width, meta.height)
                        const mult = Math.ceil(minSize / smallestSide)
                        buf = await sharp(buf)
                            .resize(meta.width * mult, meta.height * mult, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
                            .toBuffer()
                    }
                } catch {}
                const stiker = await writeExifImg(buf, options)
                if (stiker) {
                    await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
                    if (i < maxSlides - 1) await delay(500)
                }
            } catch (err) {
                console.warn(`[AUTODL STIKER] Slide #${i} error:`, err?.message)
            }
        }
        return
    }

    if (detail.mediaType === 'video' || detail.mediaType === 'gif') {
        const buf = await downloadMedia(detail.mediaUrl).catch(async () => {
            if (detail.fallbackUrl && detail.fallbackUrl !== detail.mediaUrl) {
                return await downloadMedia(detail.fallbackUrl).catch(() => null)
            }
            return null
        })
        if (!buf) throw new Error('Gagal mengunduh media Pinterest.')
        const stiker = await writeExifVid(buf, options).catch(() => null)
        if (stiker) {
            return await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
        }
        return await conn.sendMessage(m.chat, {
            video: buf,
            caption: `╭── ✦ *AUTODL PINTEREST* ✦\n• *Catatan:* Media video tidak dapat dikonversi ke stiker (durasi > 8s atau format tidak didukung).\n╰━━━━━━━━━━━━━━━━━━━━━━━`,
            mimetype: 'video/mp4'
        }, { quoted: m })
    }

    let buf = await downloadMedia(detail.mediaUrl).catch(async () => {
        if (detail.fallbackUrl && detail.fallbackUrl !== detail.mediaUrl) {
            return await downloadMedia(detail.fallbackUrl).catch(() => null)
        }
        return null
    })
    if (!buf) throw new Error('Gagal mengunduh gambar Pinterest.')

    try {
        const meta = await sharp(buf).metadata()
        const minSize = 512
        if (meta.width && meta.height && (meta.width < minSize || meta.height < minSize)) {
            const smallestSide = Math.min(meta.width, meta.height)
            const mult = Math.ceil(minSize / smallestSide)
            buf = await sharp(buf)
                .resize(meta.width * mult, meta.height * mult, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
                .toBuffer()
        }
    } catch {}

    const stiker = await writeExifImg(buf, options)
    if (!stiker) throw new Error('Gagal mengonversi gambar ke stiker.')

    return await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
}

async function handleTikTokDownload(conn, m, targetUrl) {
    const resolvedUrl = await resolveTikTokUrl(targetUrl)
    const [savetikResult, tiksnapData, ssstikData] = await Promise.all([
        savetik(resolvedUrl),
        tiksnap(resolvedUrl),
        ssstik(resolvedUrl)
    ])

    if (!savetikResult && !tiksnapData && !ssstikData) {
        throw new Error('Gagal mengambil data dari server TikTok.')
    }

    const audioUrl =
        savetikResult?.mp3 ||
        tiksnapData?.music ||
        ssstikData?.mp3 ||
        null
    const knownMusicUrls = [
        savetikResult?.mp3,
        tiksnapData?.music,
        ssstikData?.mp3
    ].filter(Boolean)

    const imageCandidates = [
        { source: 'TikSnap', list: tiksnapData?.images || [] },
        { source: 'SaveTik', list: savetikResult?.images || [] },
        { source: 'SSSTik', list: ssstikData?.images || [] }
    ].filter(item => Array.isArray(item.list) && item.list.length > 0)

    imageCandidates.sort((a, b) => b.list.length - a.list.length)
    const chosenCandidate = imageCandidates[0] || { source: '', list: [] }
    const images = chosenCandidate.list
    const isSlideshow = images.length > 0

    let videoHD = null
    let videoSD = null

    if (!isSlideshow) {
        if (isValidVideoUrl(tiksnapData?.hdplay, knownMusicUrls)) {
            videoHD = tiksnapData.hdplay
        } else if (isValidVideoUrl(savetikResult?.mp4HD, knownMusicUrls)) {
            videoHD = savetikResult.mp4HD
        } else if (isValidVideoUrl(ssstikData?.mp4HD, knownMusicUrls)) {
            videoHD = ssstikData.mp4HD
        }

        if (isValidVideoUrl(tiksnapData?.play, knownMusicUrls)) {
            videoSD = tiksnapData.play
        } else if (isValidVideoUrl(savetikResult?.mp4SD, knownMusicUrls)) {
            videoSD = savetikResult.mp4SD
        } else if (isValidVideoUrl(savetikResult?.mp4, knownMusicUrls)) {
            videoSD = savetikResult.mp4
        } else if (isValidVideoUrl(ssstikData?.mp4SD, knownMusicUrls)) {
            videoSD = ssstikData.mp4SD
        } else if (isValidVideoUrl(ssstikData?.mp4, knownMusicUrls)) {
            videoSD = ssstikData.mp4
        }
    }

    const videoUrl = !isSlideshow ? (videoHD || videoSD || null) : null
    const isHD = Boolean(videoHD)

    if (!isSlideshow && !videoUrl) {
        throw new Error('Tidak ada media video atau foto yang ditemukan pada tautan TikTok ini.')
    }

    const title = tiksnapData?.title || savetikResult?.caption || ssstikData?.caption || null
    const author = tiksnapData?.author
        ? `${tiksnapData.author.nickname} (@${tiksnapData.author.unique_id})`
        : (ssstikData?.author || null)
    const duration = tiksnapData?.duration ? formatDuration(tiksnapData.duration) : null

    if (isSlideshow) {
        const captionText = [
            `╭── ✦ *AUTODL TIKTOK SLIDESHOW* ✦`,
            title ? `• *Caption:* ${title}` : '',
            author ? `• *Creator:* ${author}` : '',
            `• *Total Foto:* ${images.length}`,
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        ].filter(Boolean).join('\n')

        const albumItems = []
        const chunkSize = 4
        for (let i = 0; i < images.length; i += chunkSize) {
            const chunk = images.slice(i, i + chunkSize)
            const chunkBuffers = await Promise.all(
                chunk.map(imgUrl => downloadBuffer(imgUrl, 25000).catch(imgErr => {
                    console.warn('[AUTODL] TikTok image download fallback:', imgErr?.message)
                    return null
                }))
            )
            chunkBuffers.forEach((buf, idx) => {
                const originalIdx = i + idx
                albumItems.push({
                    image: buf || { url: images[originalIdx] },
                    caption: originalIdx === 0 ? captionText : ''
                })
            })
            if (i + chunkSize < images.length) {
                await delay(300)
            }
        }

        let albumSent = false
        if (albumItems.length > 1 && typeof conn.sendAlbum === 'function') {
            try {
                await conn.sendAlbum(m.chat, albumItems, { quoted: m, delay: 800 })
                albumSent = true
            } catch (albumErr) {
                console.warn('[AutoDL TikTok] sendAlbum fallback:', albumErr?.message)
            }
        }

        if (!albumSent) {
            for (let i = 0; i < albumItems.length; i++) {
                await conn.sendMessage(m.chat, {
                    image: albumItems[i].image,
                    caption: albumItems[i].caption
                }, { quoted: i === 0 ? m : undefined })
                await delay(600)
            }
        }

        if (audioUrl) {
            try {
                const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(aErr => {
                    console.warn('[AUTODL] Audio slideshow buffer gagal:', aErr?.message)
                    return null
                })
                await conn.sendMessage(m.chat, {
                    audio: audioBuffer || { url: audioUrl },
                    mimetype: 'audio/mpeg'
                }, { quoted: m }).catch(aSendErr => {
                    console.warn('[AUTODL] Kirim audio slideshow gagal:', aSendErr?.message)
                })
            } catch (audioErr) {
                console.warn('[AUTODL] Audio slideshow process gagal:', audioErr?.message)
            }
        }
        return
    }

    const captionText = [
        `╭── ✦ *AUTODL TIKTOK* ✦`,
        title ? `• *Caption:* ${title}` : '',
        author ? `• *Creator:* ${author}` : '',
        duration ? `• *Durasi:* ${duration}` : '',
        `• *Kualitas:* ${isHD ? 'HD' : 'SD'}`,
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    ].filter(Boolean).join('\n')

    let estimatedSize = 0
    if (isHD && tiksnapData?.hd_size) {
        estimatedSize = Number(tiksnapData.hd_size) || 0
    } else if (tiksnapData?.size) {
        estimatedSize = Number(tiksnapData.size) || 0
    }

    if (!estimatedSize && videoUrl) {
        estimatedSize = await getMediaSize(videoUrl)
    }

    if (estimatedSize > MAX_ABSOLUTE_VIDEO_BYTES) {
        const sizeMB = (estimatedSize / (1024 * 1024)).toFixed(1)
        return await m.reply(
            `╭── ✦ *AUTODL TIKTOK* ✦\n` +
            `• *Status:* Video terlalu besar (${sizeMB} MB)\n` +
            `• *Batas Maksimal:* 64 MB\n` +
            `• Tautan langsung:\n${videoUrl}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (estimatedSize > MAX_VIDEO_BUFFER_BYTES) {
        const sizeMB = (estimatedSize / (1024 * 1024)).toFixed(1)
        console.warn(`[AUTODL] Ukuran video TikTok (${sizeMB} MB) > 64MB, kirim langsung via dokumen stream`)
        await conn.sendMessage(m.chat, {
            document: { url: videoUrl },
            mimetype: 'video/mp4',
            fileName: `tiktok_${Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
            caption: captionText + `\n\n_Catatan: Dikirim sebagai dokumen (${sizeMB} MB)._`
        }, { quoted: m })

        if (audioUrl) {
            try {
                const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(aErr => {
                    console.warn('[AUTODL] Audio buffer TikTok gagal:', aErr?.message)
                    return null
                })
                await conn.sendMessage(m.chat, {
                    audio: audioBuffer || { url: audioUrl },
                    mimetype: 'audio/mpeg'
                }, { quoted: m }).catch(aSendErr => {
                    console.warn('[AUTODL] Kirim audio TikTok gagal:', aSendErr?.message)
                })
            } catch (audioErr) {
                console.warn('[AUTODL] Audio processing TikTok gagal:', audioErr?.message)
            }
        }
        return
    }

    let videoBuffer = null
    try {
        videoBuffer = await downloadBuffer(videoUrl)
    } catch (dlErr) {
        console.warn('[AutoDL TikTok] Gagal unduh buffer primary, coba alternatif HD/SD:', dlErr?.message)
        const altHD = videoUrl === tiksnapData?.hdplay ? savetikResult?.mp4HD : (videoUrl === savetikResult?.mp4HD ? tiksnapData?.hdplay : null)
        if (altHD && isValidVideoUrl(altHD, knownMusicUrls)) {
            try {
                videoBuffer = await downloadBuffer(altHD)
            } catch {}
        }
        if (!videoBuffer && videoSD && videoSD !== videoUrl) {
            try {
                videoBuffer = await downloadBuffer(videoSD)
            } catch (sdErr) {
                console.warn('[AUTODL] TikTok SD download gagal:', sdErr?.message)
            }
        }
    }

    if (videoBuffer && videoBuffer.length > MAX_VIDEO_BUFFER_BYTES) {
        const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1)
        console.warn(`[AUTODL] Buffer video TikTok (${sizeMB} MB) melebihi 64MB, kirim via dokumen`)
        await conn.sendMessage(m.chat, {
            document: videoBuffer,
            mimetype: 'video/mp4',
            fileName: `tiktok_${Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
            caption: captionText + `\n\n_Catatan: Dikirim sebagai dokumen (${sizeMB} MB)._`
        }, { quoted: m })
    } else {
        if (videoBuffer && videoBuffer.length <= 45 * 1024 * 1024) {
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
            console.warn('[AutoDL TikTok] Kirim video gagal, fallback ke dokumen:', sendErr?.message)
            await conn.sendMessage(m.chat, {
                document: videoPayload,
                mimetype: 'video/mp4',
                fileName: `tiktok_${Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
                caption: captionText
            }, { quoted: m })
        }
    }

    if (audioUrl) {
        try {
            const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(aErr => {
                console.warn('[AUTODL] Download audio buffer gagal:', aErr?.message)
                return null
            })
            await conn.sendMessage(m.chat, {
                audio: audioBuffer || { url: audioUrl },
                mimetype: 'audio/mpeg'
            }, { quoted: m }).catch(sendAudErr => {
                console.warn('[AUTODL] Kirim audio gagal:', sendAudErr?.message)
            })
        } catch (audioErr) {
            console.warn('[AUTODL] Audio processing gagal:', audioErr?.message)
        }
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isAdmin, isOwner }) => {
    if (!global.db.data.chats) global.db.data.chats = {}
    if (!global.db.data.chats[m.chat]) {
        global.db.data.chats[m.chat] = initChatSchema(global.db.data.chats[m.chat])
    }
    const chat = global.db.data.chats[m.chat]

    const opt = (text || '').trim().toLowerCase()

    if (!opt || opt === 'status') {
        const status = chat.autodownload ? 'ON (Aktif)' : 'OFF (Nonaktif)'
        const modeText = chat.autodownloadMode === 'sticker'
            ? 'Stiker (Khusus Pinterest, TikTok Nonaktif)'
            : 'Media Biasa (Pinterest & TikTok)'

        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* ${status}\n` +
            (chat.autodownload ? `• *Mode:* ${modeText}\n\n` : '\n') +
            `*Perintah Pengaturan:*\n` +
            `• \`${usedPrefix + command} on\` : Mengaktifkan dengan pilihan mode\n` +
            `• \`${usedPrefix + command} on media\` : Langsung aktif Mode Media\n` +
            `• \`${usedPrefix + command} on stiker\` : Langsung aktif Mode Stiker\n` +
            `• \`${usedPrefix + command} off\` : Menonaktifkan auto download\n\n` +
            `*Dukungan Mode:*\n` +
            `› *Mode Media (1):* Unduh foto/video otomatis dari Pinterest & TikTok.\n` +
            `› *Mode Stiker (2):* Unduh foto Pinterest langsung jadi stiker (TikTok dinonaktifkan).\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (m.isGroup && !isAdmin && !isOwner) {
        return m.reply(
            `╭── ✦ *AKSES DITOLAK* ✦\n` +
            `• Pengaturan Auto Downloader grup hanya dapat diubah oleh Admin atau Owner.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (/^(off|disable|mati|0|false)$/i.test(opt)) {
        chat.autodownload = false
        if (pendingModeSessions.has(m.chat)) {
            clearTimeout(pendingModeSessions.get(m.chat).timer)
            pendingModeSessions.delete(m.chat)
        }
        if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* OFF (Nonaktif)\n` +
            `• Fitur auto download telah dimatikan untuk chat ini.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // Direct shortcut: on 1 / on media / on biasa / media
    if (/^(on\s+(1|media|biasa)|1|media|biasa)$/i.test(opt)) {
        chat.autodownload = true
        chat.autodownloadMode = 'media'
        if (pendingModeSessions.has(m.chat)) {
            clearTimeout(pendingModeSessions.get(m.chat).timer)
            pendingModeSessions.delete(m.chat)
        }
        if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* ON (Aktif)\n` +
            `• *Mode:* Media Biasa\n` +
            `• Bot otomatis mengunduh & mengirim foto/video dari Pinterest dan TikTok.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // Direct shortcut: on 2 / on stiker / on sticker / 2 / stiker / sticker
    if (/^(on\s+(2|stiker|sticker)|2|stiker|sticker)$/i.test(opt)) {
        chat.autodownload = true
        chat.autodownloadMode = 'sticker'
        if (pendingModeSessions.has(m.chat)) {
            clearTimeout(pendingModeSessions.get(m.chat).timer)
            pendingModeSessions.delete(m.chat)
        }
        if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* ON (Aktif)\n` +
            `• *Mode:* Stiker (Khusus Pinterest)\n` +
            `• Setiap link Pinterest bergambar otomatis langsung dikonversi menjadi stiker.\n` +
            `• Tautan TikTok tidak aktif pada mode ini.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // "on" or "aktif" or "enable" -> show interactive mode prompt
    if (/^(on|enable|aktif|true)$/i.test(opt)) {
        if (pendingModeSessions.has(m.chat)) {
            clearTimeout(pendingModeSessions.get(m.chat).timer)
        }

        pendingModeSessions.set(m.chat, {
            sender: m.sender,
            timer: setTimeout(() => {
                pendingModeSessions.delete(m.chat)
            }, 60000)
        })

        return m.reply(
            `╭── ✦ *PILIH MODE AUTO DOWNLOAD* ✦\n` +
            `Silakan pilih mode auto download untuk chat ini:\n\n` +
            `1. *Mode Media (Biasa)*\n` +
            `   › Unduh & kirim foto/video dari Pinterest & TikTok.\n\n` +
            `2. *Mode Stiker (Khusus Pinterest)*\n` +
            `   › Otomatis ubah gambar Pinterest langsung jadi stiker.\n` +
            `   › URL TikTok dinonaktifkan.\n\n` +
            `• Balas *1* untuk Mode Media\n` +
            `• Balas *2* untuk Mode Stiker\n` +
            `• Balas *0* untuk Batal\n` +
            `• _Waktu tunggu: 60 detik_\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    return m.reply(`Gunakan \`${usedPrefix + command} on\` atau \`${usedPrefix + command} off\``)
}

handler.before = async function (m, { conn, usedPrefix, isAdmin, isOwner }) {
    if (!m.text || m.isBaileys || m.fromMe) return false

    // Cek sesi interaktif pemilihan mode
    if (pendingModeSessions.has(m.chat)) {
        const session = pendingModeSessions.get(m.chat)
        const isAuthorized = !m.isGroup || m.sender === session.sender || isAdmin || isOwner
        const answer = m.text.trim().toLowerCase()

        if (isAuthorized) {
            if (/^(1|media|biasa)$/i.test(answer)) {
                clearTimeout(session.timer)
                pendingModeSessions.delete(m.chat)
                const chat = global.db.data?.chats?.[m.chat]
                if (chat) {
                    chat.autodownload = true
                    chat.autodownloadMode = 'media'
                    if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
                }
                await m.reply(
                    `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
                    `• *Status:* ON (Aktif)\n` +
                    `• *Mode:* Media Biasa\n` +
                    `• Bot otomatis mengunduh & mengirim foto/video dari Pinterest dan TikTok.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
                return true
            }

            if (/^(2|stiker|sticker)$/i.test(answer)) {
                clearTimeout(session.timer)
                pendingModeSessions.delete(m.chat)
                const chat = global.db.data?.chats?.[m.chat]
                if (chat) {
                    chat.autodownload = true
                    chat.autodownloadMode = 'sticker'
                    if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
                }
                await m.reply(
                    `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
                    `• *Status:* ON (Aktif)\n` +
                    `• *Mode:* Stiker (Khusus Pinterest)\n` +
                    `• Setiap link Pinterest bergambar otomatis langsung dikonversi menjadi stiker.\n` +
                    `• Tautan TikTok tidak aktif pada mode ini.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
                return true
            }

            if (/^(0|batal|cancel|n)$/i.test(answer)) {
                clearTimeout(session.timer)
                pendingModeSessions.delete(m.chat)
                await m.reply('Aktivasi auto download dibatalkan.')
                return true
            }
        }
    }

    if (usedPrefix) return false

    const chat = global.db.data?.chats?.[m.chat]
    if (!chat || !chat.autodownload) return false

    const detected = detectSupportedUrl(m.text)
    if (!detected) return false

    const isStickerMode = chat.autodownloadMode === 'sticker'

    // Pada Mode Stiker: hanya URL Pinterest yang diterima, TikTok diabaikan total
    if (isStickerMode && detected.type !== 'pinterest') {
        return false
    }

    if (activeChats.has(m.chat)) return false

    const now = Date.now()
    const lastActive = chatCooldowns.get(m.chat) || 0
    if (now - lastActive < COOLDOWN_MS) return false

    activeChats.add(m.chat)
    const safetyTimer = setTimeout(() => activeChats.delete(m.chat), 60000)

    await m.react?.('⏳').catch(() => {})

    try {
        if (detected.type === 'pinterest') {
            if (isStickerMode) {
                await handlePinterestSticker(conn, m, detected.url)
            } else {
                await handlePinterestDownload(conn, m, detected.url)
            }
        } else if (detected.type === 'tiktok') {
            await handleTikTokDownload(conn, m, detected.url)
        }
        await m.react?.('✅').catch(() => {})
        return true
    } catch (err) {
        console.error(`[AUTODL ERROR - ${detected.type}]:`, err?.message || err)
        await m.react?.('❌').catch(() => {})
        return false
    } finally {
        clearTimeout(safetyTimer)
        activeChats.delete(m.chat)
        chatCooldowns.set(m.chat, Date.now())
        setTimeout(() => {
            if (chatCooldowns.get(m.chat) && Date.now() - chatCooldowns.get(m.chat) >= COOLDOWN_MS) {
                chatCooldowns.delete(m.chat)
            }
        }, COOLDOWN_MS + 1000)
    }
}

handler.help = ['autodownload <on/off>']
handler.tags = ['downloader']
handler.command = /^(autodownload|autodl)$/i

export default handler
