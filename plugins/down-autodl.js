import axios from 'axios'
import {
    downloadPinterest,
    downloadMedia,
    isPinterestUrl,
    extractPinterestUrl
} from '../function/scrapers/pinterest.js'
import {
    savetik,
    tikwm,
    downloadBuffer,
    remuxVideoFast,
    isValidVideoUrl,
    formatDuration,
    extractTikTokUrl,
    isTikTokUrl
} from '../function/scrapers/tiktok.js'
import { initChatSchema } from '../function/core/schema.js'

const activeChats = new Set()
const chatCooldowns = new Map()
const COOLDOWN_MS = 5000
const MAX_VIDEO_BUFFER_BYTES = 64 * 1024 * 1024 // 64 MB
const MAX_ABSOLUTE_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB
const delay = ms => new Promise(r => setTimeout(r, ms))

async function getMediaSize(url, timeoutMs = 7000) {
    if (!url || typeof url !== 'string' || !url.startsWith('http')) return 0
    try {
        const res = await axios.head(url, {
            timeout: timeoutMs,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
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

async function handleTikTokDownload(conn, m, targetUrl) {
    const [savetikResult, tikwmData] = await Promise.all([
        savetik(targetUrl),
        tikwm(targetUrl)
    ])

    if (!savetikResult && !tikwmData) {
        throw new Error('Gagal mengambil data dari server TikTok.')
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
        throw new Error('Tidak ada media video atau foto yang ditemukan pada tautan TikTok ini.')
    }

    const title = tikwmData?.title || savetikResult?.caption || null
    const author = tikwmData?.author
        ? `${tikwmData.author.nickname} (@${tikwmData.author.unique_id})`
        : null
    const duration = tikwmData?.duration ? formatDuration(tikwmData.duration) : null

    if (!videoUrl && images.length > 0) {
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
        if (typeof conn.sendAlbum === 'function') {
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
                }, { quoted: m })
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
    if (isHD && tikwmData?.hd_size) {
        estimatedSize = Number(tikwmData.hd_size) || 0
    } else if (tikwmData?.size) {
        estimatedSize = Number(tikwmData.size) || 0
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
        console.warn('[AutoDL TikTok] HD download fallback ke SD:', dlErr?.message)
        if (videoSD && videoSD !== videoUrl) {
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
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status Saat Ini:* ${status}\n\n` +
            `*Perintah:*\n` +
            `• \`${usedPrefix + command} on\` : Mengaktifkan auto download\n` +
            `• \`${usedPrefix + command} off\` : Menonaktifkan auto download\n\n` +
            `*Dukungan Platform:*\n` +
            `• *Pinterest:* Gambar, Video, GIF, dan Carousel / Slide\n` +
            `• *TikTok:* Video HD/SD, Slideshow Foto, dan Musik\n\n` +
            `*Cara Kerja:*\n` +
            `Kirimkan teks pesan apapun yang memuat tautan Pinterest atau TikTok valid, bot akan otomatis memproses dan mengirimkan media.\n` +
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

    if (/^(on|enable|aktif|1|true)$/i.test(opt)) {
        chat.autodownload = true
        if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* ON (Aktif)\n` +
            `• Bot sekarang akan otomatis mendownload setiap tautan Pinterest & TikTok yang dikirim di chat ini.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (/^(off|disable|mati|0|false)$/i.test(opt)) {
        chat.autodownload = false
        if (typeof global.saveData === 'function') global.saveData('chats', m.chat)
        return m.reply(
            `╭── ✦ *AUTO DOWNLOADER* ✦\n` +
            `• *Status:* OFF (Nonaktif)\n` +
            `• Fitur auto download telah dimatikan untuk chat ini.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    return m.reply(`Gunakan \`${usedPrefix + command} on\` atau \`${usedPrefix + command} off\``)
}

handler.before = async function (m, { conn, usedPrefix }) {
    if (!m.text || m.isBaileys || m.fromMe) return false
    if (usedPrefix) return false

    const chat = global.db.data?.chats?.[m.chat]
    if (!chat || !chat.autodownload) return false

    const detected = detectSupportedUrl(m.text)
    if (!detected) return false

    if (activeChats.has(m.chat)) return false

    const now = Date.now()
    const lastActive = chatCooldowns.get(m.chat) || 0
    if (now - lastActive < COOLDOWN_MS) return false

    activeChats.add(m.chat)
    const safetyTimer = setTimeout(() => activeChats.delete(m.chat), 60000)

    await m.react?.('⏳').catch(() => {})

    try {
        if (detected.type === 'pinterest') {
            await handlePinterestDownload(conn, m, detected.url)
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

handler.help = ['autodownload <on/off>', 'autodl <on/off>']
handler.tags = ['downloader']
handler.command = /^(autodownload|autodl)$/i

export default handler
