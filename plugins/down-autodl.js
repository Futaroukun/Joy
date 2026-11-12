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

const activeProcessing = new Set()
const delay = ms => new Promise(r => setTimeout(r, ms))

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
        const dlSlides = await Promise.all(detail.slides.map(async (item, i) => {
            try {
                const buf = await downloadMedia(item.url)
                return {
                    index: i,
                    image: buf,
                    caption: i === 0 ? caption : ''
                }
            } catch {
                return null
            }
        }))

        const validSlides = dlSlides.filter(Boolean).sort((a, b) => a.index - b.index)
        if (validSlides.length > 0) {
            if (typeof conn.sendAlbum === 'function') {
                try {
                    return await conn.sendAlbum(m.chat, validSlides.map(s => ({
                        image: s.image,
                        caption: s.caption
                    })), { quoted: m, delay: 500 })
                } catch (albumErr) {
                    console.warn('[AutoDL Pin] sendAlbum fallback:', albumErr.message)
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

    const buffer = await downloadMedia(detail.mediaUrl).catch(async () => {
        if (detail.fallbackUrl && detail.fallbackUrl !== detail.mediaUrl) {
            return await downloadMedia(detail.fallbackUrl)
        }
        throw new Error('Gagal mengambil file media Pinterest.')
    })

    if (detail.mediaType === 'video') {
        return await conn.sendMessage(m.chat, {
            video: buffer,
            caption,
            mimetype: 'video/mp4'
        }, { quoted: m })
    }

    if (detail.mediaType === 'gif') {
        return await conn.sendMessage(m.chat, {
            video: buffer,
            caption,
            gifPlayback: true,
            mimetype: 'video/mp4'
        }, { quoted: m })
    }

    return await conn.sendMessage(m.chat, {
        image: buffer,
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
        const chunkSize = 5
        for (let i = 0; i < images.length; i += chunkSize) {
            const chunk = images.slice(i, i + chunkSize)
            const chunkBuffers = await Promise.all(
                chunk.map(imgUrl => downloadBuffer(imgUrl, 25000).catch(() => null))
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
                const audioBuffer = await downloadBuffer(audioUrl, 25000).catch(() => null)
                await conn.sendMessage(m.chat, {
                    audio: audioBuffer || { url: audioUrl },
                    mimetype: 'audio/mpeg'
                }, { quoted: m }).catch(() => {})
            } catch {}
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

    let videoBuffer = null
    try {
        videoBuffer = await downloadBuffer(videoUrl)
    } catch (dlErr) {
        console.warn('[AutoDL TikTok] HD download fallback ke SD:', dlErr?.message)
        if (videoSD && videoSD !== videoUrl) {
            try {
                videoBuffer = await downloadBuffer(videoSD)
            } catch {}
        }
    }

    if (videoBuffer) {
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

    const processKey = `${m.chat}_${m.id || detected.url}`
    if (activeProcessing.has(processKey)) return false
    activeProcessing.add(processKey)

    setTimeout(() => activeProcessing.delete(processKey), 30000)

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
        console.error(`[AUTODL ERROR - ${detected.type}]:`, err)
        await m.react?.('❌').catch(() => {})
        return false
    }
}

handler.help = ['autodownload <on/off>', 'autodl <on/off>']
handler.tags = ['downloader']
handler.command = /^(autodownload|autodl)$/i

export default handler
