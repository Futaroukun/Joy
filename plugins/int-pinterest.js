/*
 * @Author      : Rafli
 * @Feature     : Pinterest Search & Media Downloader (HD Image, HD Video MP4, GIF, Carousel)
 * @Description : Cari gambar di Pinterest atau unduh media dari link pin.it / pinterest.com
 * @Version     : 4.0 (React-Driven Pipeline)
 */

import {
    searchPinterest,
    downloadPinterest,
    downloadMedia,
    isPinterestUrl,
    extractPinterestUrl
} from '../function/scrapers/pinterest.js'

const delay = ms => new Promise(r => setTimeout(r, ms))

async function sendMedia(conn, chatId, buffer, mediaType, caption, quotedMsg) {
    try {
        switch (mediaType) {
            case 'video':
                return await conn.sendMessage(chatId, {
                    video: buffer,
                    caption,
                    mimetype: 'video/mp4'
                }, { quoted: quotedMsg })

            case 'gif':
                return await conn.sendMessage(chatId, {
                    video: buffer,
                    caption,
                    gifPlayback: true,
                    mimetype: 'video/mp4'
                }, { quoted: quotedMsg })

            default:
                return await conn.sendMessage(chatId, {
                    image: buffer,
                    caption
                }, { quoted: quotedMsg })
        }
    } catch (err) {
        console.error('[PINTEREST SENDMEDIA FALLBACK]:', err.message)
        const ext = mediaType === 'video' ? 'mp4' : 'jpg'
        return await conn.sendFile(chatId, buffer, `pinterest.${ext}`, caption, quotedMsg)
    }
}

let handler = async (m, { usedPrefix, command, conn, text }) => {
    const rawInput = (text || m.quoted?.text || '').trim()

    // ── 1. HELP / GUIDE ───────────────────────────────────────────────────────
    if (!rawInput || /^(help|menu|panduan|\?)$/i.test(rawInput)) {
        return m.reply(
            `╭── ✦ *PINTEREST* ✦\n\n` +
            `*Cara Pakai:*\n` +
            `• *Cari Gambar:* \`${usedPrefix + command} <kata kunci> [jumlah]\`\n` +
            `• *Unduh Media:* \`${usedPrefix + command} <link pin.it / pinterest>\`\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix + command} anime aesthetic wallpaper 5\`\n` +
            `• \`${usedPrefix + command} https://pin.it/5WsTKkFxl\`\n\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 2. DOWNLOADER (Link Pinterest / pin.it) ───────────────────────────────
    if (isPinterestUrl(rawInput)) {
        const cleanUrl = extractPinterestUrl(rawInput) || rawInput
        await m.react?.('⏳').catch(() => {})

        try {
            const detail = await downloadPinterest(cleanUrl)

            const caption = [
                `╭── ✦ *PINTEREST DOWNLOADER* ✦`,
                `│ • *Judul:* ${detail.title || '-'}`,
                detail.author?.name && detail.author.name !== 'Unknown' ? `│ • *Author:* ${detail.author.name}` : '',
                detail.likes ? `│ • *Likes:* ${detail.likes.toLocaleString('id-ID')}` : '',
                `│ • *Format:* ${detail.mediaType.toUpperCase()}`,
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n${detail.pageUrl}`
            ].filter(Boolean).join('\n')

            await m.react?.('📤').catch(() => {})

            // Handle Carousel / Multi-slide Idea Pin
            if (detail.mediaType === 'carousel' && detail.slides?.length > 0) {
                const dlSlides = await Promise.all(detail.slides.map(async (item, i) => {
                    try {
                        const buf = await downloadMedia(item.url)
                        return {
                            index: i,
                            image: buf,
                            caption: i === 0 ? caption : ''
                        }
                    } catch (_) {
                        return null
                    }
                }))

                const validSlides = dlSlides.filter(Boolean).sort((a, b) => a.index - b.index)

                if (!validSlides.length) {
                    await m.react?.('❌').catch(() => {})
                    return m.reply('Gagal mengunduh slide Pinterest.')
                }

                if (validSlides.length === 1) {
                    await conn.sendMessage(m.chat, {
                        image: validSlides[0].image,
                        caption: validSlides[0].caption
                    }, { quoted: m })
                } else {
                    const albumItems = validSlides.map(s => ({
                        image: s.image,
                        caption: s.caption
                    }))
                    try {
                        await conn.sendAlbum(m.chat, albumItems, { quoted: m, delay: 500 })
                    } catch (_) {
                        for (let i = 0; i < albumItems.length; i++) {
                            await conn.sendMessage(m.chat, {
                                image: albumItems[i].image,
                                caption: albumItems[i].caption
                            }, { quoted: i === 0 ? m : undefined })
                            if (i < albumItems.length - 1) await delay(500)
                        }
                    }
                }

                await m.react?.('✅').catch(() => {})
                return
            }

            // Single Media (Video / GIF / Image)
            const buffer = await downloadMedia(detail.mediaUrl)
            await sendMedia(conn, m.chat, buffer, detail.mediaType, caption, m)
            await m.react?.('✅').catch(() => {})
            return

        } catch (e) {
            console.error('[PINTEREST DL ERROR]', e)
            await m.react?.('❌').catch(() => {})
            return m.reply(`*Gagal mengunduh Pinterest:*\n${e.message}`)
        }
    }

    // ── 3. SEARCH (Kata Kunci + Dynamic Count) ─────────────────────────────────
    let query = rawInput
    let count = 5

    // Parse count dari query: e.g. "anime 8", "10 cats", "aesthetic --6"
    const flagMatch = query.match(/--?(\d+)\b/)
    const endMatch = query.match(/\s+(\d+)$/)
    const startMatch = query.match(/^(\d+)\s+/)

    if (flagMatch) {
        count = parseInt(flagMatch[1], 10)
        query = query.replace(flagMatch[0], '').trim()
    } else if (endMatch) {
        count = parseInt(endMatch[1], 10)
        query = query.replace(endMatch[0], '').trim()
    } else if (startMatch) {
        count = parseInt(startMatch[1], 10)
        query = query.replace(startMatch[0], '').trim()
    }

    count = Math.max(1, Math.min(count, 10))

    if (!query) {
        return m.reply(`Tentukan kata kunci pencarian. Contoh: \`${usedPrefix + command} aesthetic wallpaper\``)
    }

    await m.react?.('⏳').catch(() => {})

    try {
        const results = await searchPinterest(query, count)

        if (!results.length) {
            await m.react?.('❌').catch(() => {})
            return m.reply(`Tidak ada hasil ditemukan untuk *"${query}"*.`)
        }

        const downloadPromises = results.map(async (item, idx) => {
            try {
                const buffer = await downloadMedia(item)
                const captionLines = [
                    item.title && item.title !== 'Untitled Pin' ? `*${item.title}*` : '',
                    item.author?.name && item.author.name !== 'Unknown' ? `*Kreator:* ${item.author.name}` : '',
                    `*Sumber:* ${item.pinUrl}`
                ].filter(Boolean)

                return {
                    index: idx,
                    image: buffer,
                    caption: captionLines.join('\n')
                }
            } catch (e) {
                console.error('[PINTEREST SEARCH DL ERROR]', e)
                return null
            }
        })

        const settled = await Promise.all(downloadPromises)
        const mediaForAlbum = settled.filter(Boolean).sort((a, b) => a.index - b.index)

        if (!mediaForAlbum.length) {
            await m.react?.('❌').catch(() => {})
            return m.reply('Gagal mengunduh gambar Pinterest. Silakan coba lagi.')
        }

        await m.react?.('📤').catch(() => {})

        // Single Image Direct Send
        if (mediaForAlbum.length === 1) {
            await sendMedia(conn, m.chat, mediaForAlbum[0].image, 'image', mediaForAlbum[0].caption, m)
            await m.react?.('✅').catch(() => {})
            return
        }

        // Multiple Images: Selalu kirim via sendAlbum
        const albumItems = mediaForAlbum.map(item => ({
            image: item.image,
            caption: item.caption
        }))

        try {
            await conn.sendAlbum(m.chat, albumItems, { quoted: m, delay: 500 })
        } catch (err) {
            console.error('[PINTEREST SEND ALBUM ERROR]', err)
            for (let i = 0; i < albumItems.length; i++) {
                await sendMedia(conn, m.chat, albumItems[i].image, 'image', albumItems[i].caption, i === 0 ? m : undefined)
                if (i < albumItems.length - 1) await delay(500)
            }
        }

        await m.react?.('✅').catch(() => {})
        return

    } catch (e) {
        console.error('[PINTEREST SEARCH ERROR]', e)
        await m.react?.('❌').catch(() => {})
        return m.reply(`*Pencarian Pinterest gagal:*\n${e.message}`)
    }
}

handler.help    = ['pinterest']
handler.tags    = ['internet']
handler.command = /^(pin|pinterest|pindl)$/i
handler.limit   = false

export default handler
