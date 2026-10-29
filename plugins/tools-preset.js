/*
 * @Author      : Rafli
 * @Feature     : Alight Motion Preset Finder
 * @Description : Ekstraksi otomatis link preset Alight Motion, XML, Drive, & metadata dari URL TikTok
 */

import axios from 'axios'
import * as cheerio from 'cheerio'

const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B'
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
    return num.toString()
}

const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}m ${s}s` : `${s}s`
}

const formatDate = (timestamp) => {
    if (!timestamp) return '-'
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }) + ' WIB'
}

const extractTikTokUrl = (text) => {
    if (!text || typeof text !== 'string') return null
    const patterns = [
        /https?:\/\/(www\.)?(vt|vm|www)\.tiktok\.com\/[^\s]+/i,
        /https?:\/\/(www\.)?tiktok\.com\/@[^\/]+\/video\/\d+[^\s]*/i,
        /https?:\/\/[^\s]*tiktok\.com[^\s]*/i
    ]
    for (const pattern of patterns) {
        const match = text.match(pattern)
        if (match) return match[0].replace(/[.,;]+$/, '')
    }
    return null
}

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

async function fetchTikTokVideo(url) {
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
            if (res.data?.code === 0 && res.data?.data) {
                return res.data.data
            }
        } catch {}
    }
    return null
}

async function fetchVideoComments(url) {
    try {
        const res = await axios.get(`https://www.tikwm.com/api/comment/list?url=${encodeURIComponent(url)}&count=50`, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
        if (res.data?.code === 0 && Array.isArray(res.data?.data?.comments)) {
            return res.data.data.comments
        }
    } catch {}
    return []
}

async function fetchCommentReplies(commentId, videoId) {
    if (!commentId || !videoId) return []
    try {
        const res = await axios.get(`https://www.tikwm.com/api/comment/reply?comment_id=${commentId}&video_id=${videoId}`, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
        if (res.data?.code === 0 && Array.isArray(res.data?.data?.comments)) {
            return res.data.data.comments
        }
    } catch {}
    return []
}

async function scrapeAlightMetadata(amUrl) {
    try {
        const res = await axios.get(amUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
        const html = res.data
        if (typeof html !== 'string') return null

        const $ = cheerio.load(html)
        const title = $('meta[property="og:title"]').attr('content') || $('title').text() || null
        const description = $('meta[property="og:description"]').attr('content') || null
        const image = $('meta[property="og:image"]').attr('content') || null

        return { title, description, image }
    } catch {
        return null
    }
}

async function scrapeLinktreeLinks(linktreeUrl) {
    try {
        const res = await axios.get(linktreeUrl, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })
        const html = res.data
        if (typeof html !== 'string') return []

        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
        if (nextDataMatch) {
            const json = JSON.parse(nextDataMatch[1])
            const items = json?.props?.pageProps?.links || []
            return items.map(i => ({ title: i.title, url: i.url })).filter(i => i.url)
        }
    } catch {}
    return []
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const rawInput = text || m.quoted?.text || ''
    const targetUrl = extractTikTokUrl(rawInput)

    if (!targetUrl) {
        return m.reply(
            `╭── ✦ *ALIGHT MOTION PRESET FINDER* ✦\n` +
            `• Temukan & ekstrak link preset Alight Motion (5MB, XML, Drive, dsb) secara otomatis dari video TikTok.\n\n` +
            `• *Format*: \`${usedPrefix + command} <url tiktok>\`\n` +
            `• *Contoh*:\n` +
            `  › \`${usedPrefix + command} https://vt.tiktok.com/ZSgf7vPtV/\`\n` +
            `  › \`${usedPrefix + command} https://www.tiktok.com/@user/video/1234567890\`\n\n` +
            `• _Tips: Anda juga bisa mereply pesan yang berisi link TikTok lalu ketik \`${usedPrefix + command}\`_\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    try {
        const videoData = await fetchTikTokVideo(targetUrl)
        if (!videoData) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return m.reply('*Gagal mengambil data video TikTok.* Pastikan URL valid dan video tidak dalam status privat.')
        }

        const textCorpus = []
        if (videoData.title) {
            textCorpus.push(videoData.title)
        }

        const comments = await fetchVideoComments(targetUrl)
        const candidateReplies = []

        for (const c of comments) {
            if (!c?.text) continue
            const isAuthor = c.user?.unique_id === videoData.author?.unique_id
            const hasKeyword = /preset|xml|5mb|alight|am|drive|mediafire|sfile|link|http/i.test(c.text)

            if (isAuthor || c.is_pinned || hasKeyword) {
                textCorpus.push(c.text)
                if (c.reply_total > 0 && candidateReplies.length < 8) {
                    candidateReplies.push(c)
                }
            }
        }

        // Ambil komentar balasan (reply)
        for (const cand of candidateReplies) {
            const replies = await fetchCommentReplies(cand.id, videoData.id)
            for (const r of replies) {
                if (r?.text) textCorpus.push(r.text)
            }
        }

        // Filter tautan
        const linkRegex = /https?:\/\/[^\s"'<>)\]]+/gi
        const amLinks = new Set()
        const xmlLinks = new Set()
        const bioLinks = new Set()
        const otherLinks = new Set()

        for (const textItem of textCorpus) {
            const found = textItem.match(linkRegex) || []
            for (let l of found) {
                l = l.replace(/[.,;]+$/, '').trim()
                if (!l) continue

                if (/alight\.link|alightcreative\.com/i.test(l)) {
                    amLinks.add(l)
                } else if (/drive\.google\.com|mediafire\.com|sfile\.mobi|mega\.nz|mega\.io|dropbox\.com|\.xml(\?|$)/i.test(l)) {
                    xmlLinks.add(l)
                } else if (/linktr\.ee|heylink\.me|campsite\.bio|beacons\.ai|s\.id|bit\.ly/i.test(l)) {
                    bioLinks.add(l)
                } else if (!/tiktok\.com/i.test(l)) {
                    otherLinks.add(l)
                }
            }
        }

        // Jika link preset langsung belum ditemukan, cek isi Linktree jika ada
        if (amLinks.size === 0 && bioLinks.size > 0) {
            for (const bio of Array.from(bioLinks)) {
                if (/linktr\.ee/i.test(bio)) {
                    const treeItems = await scrapeLinktreeLinks(bio)
                    for (const item of treeItems) {
                        if (/alight\.link|alightcreative\.com/i.test(item.url)) {
                            amLinks.add(item.url)
                        } else if (/drive\.google\.com|mediafire\.com|sfile\.mobi|mega\.nz|\.xml/i.test(item.url)) {
                            xmlLinks.add(item.url)
                        }
                    }
                }
            }
        }

        // Ambil OpenGraph Alight Motion jika ada tautan AM
        let amMetadata = null
        if (amLinks.size > 0) {
            const mainAmUrl = Array.from(amLinks)[0]
            amMetadata = await scrapeAlightMetadata(mainAmUrl)
        }

        // Susun teks respon
        const title = videoData.title || '-'
        const authorName = videoData.author?.nickname || 'Creator'
        const authorUser = videoData.author?.unique_id ? `@${videoData.author.unique_id}` : ''
        const duration = formatDuration(videoData.duration)
        const uploadDate = formatDate(videoData.create_time)
        const views = formatNumber(videoData.play_count)
        const likes = formatNumber(videoData.digg_count)
        const totalComments = formatNumber(videoData.comment_count)
        const soundTitle = videoData.music_info?.title || videoData.music || '-'
        const soundAuthor = videoData.music_info?.author || '-'
        const canonicalUrl = `https://www.tiktok.com/@${videoData.author?.unique_id || 'user'}/video/${videoData.id}`

        let caption =
            `╭── ✦ *ALIGHT MOTION PRESET FINDER* ✦\n` +
            `• *Judul*: ${title}\n` +
            `• *Creator*: ${authorName} (${authorUser})\n` +
            `• *Tanggal Upload*: ${uploadDate}\n` +
            `• *Durasi*: ${duration}\n` +
            `• *Statistik*: ${views} Views • ${likes} Likes • ${totalComments} Komentar\n` +
            `• *Audio / Sound*: ${soundTitle} (${soundAuthor})\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        let hasPreset = false

        if (amLinks.size > 0) {
            hasPreset = true
            caption += `╭── ✦ *PRESET ALIGHT MOTION (5MB)* ✦\n`
            if (amMetadata?.title) {
                caption += `• *Nama Projek*: ${amMetadata.title}\n`
            }
            if (amMetadata?.description) {
                caption += `• *Info Paket*: ${amMetadata.description}\n`
            }
            Array.from(amLinks).forEach((link, idx) => {
                caption += `• *Link AM [${idx + 1}]*: ${link}\n`
            })
            caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        if (xmlLinks.size > 0) {
            hasPreset = true
            caption += `╭── ✦ *PRESET XML / CLOUD DRIVE* ✦\n`
            Array.from(xmlLinks).forEach((link, idx) => {
                let label = 'File Cloud'
                if (/drive\.google\.com/i.test(link)) label = 'Google Drive'
                else if (/mediafire\.com/i.test(link)) label = 'MediaFire'
                else if (/sfile\.mobi/i.test(link)) label = 'Sfile Mobi'
                else if (/mega\.nz|mega\.io/i.test(link)) label = 'Mega'
                else if (/\.xml(\?|$)/i.test(link)) label = 'XML Direct'

                caption += `• *${label} [${idx + 1}]*: ${link}\n`
            })
            caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        if (bioLinks.size > 0 || otherLinks.size > 0) {
            caption += `╭── ✦ *TAUTAN TERKAIT / BIO* ✦\n`
            const extra = [...bioLinks, ...otherLinks]
            extra.slice(0, 5).forEach((link, idx) => {
                caption += `• *Link [${idx + 1}]*: ${link}\n`
            })
            caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        if (!hasPreset) {
            caption +=
                `╭── ✦ *STATUS PRESET* ✦\n` +
                `• _Tidak ditemukan link preset (Alight Link / XML Drive) di caption maupun komentar video ini._\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        caption +=
            `╭── ✦ *MEDIA LAINNYA* ✦\n` +
            (videoData.music_info?.play_url ? `• *Download Audio*: ${videoData.music_info.play_url}\n` : '') +
            `• *Sumber Video*: ${canonicalUrl}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`

        const videoDownloadUrl = videoData.hdplay || videoData.play || null
        const previewImage = amMetadata?.image || videoData.origin_cover || videoData.cover || videoData.author?.avatar

        let sent = false

        if (videoDownloadUrl) {
            try {
                let videoBuf = await downloadBuffer(videoDownloadUrl)
                const isTooLarge = videoBuf.length > 64 * 1024 * 1024

                if (isTooLarge) {
                    await conn.sendMessage(m.chat, {
                        document: videoBuf,
                        mimetype: 'video/mp4',
                        fileName: `preset_tt_${videoData.id || Date.now()}.mp4`,
                        caption: caption.trim()
                    }, { quoted: m })
                } else {
                    await conn.sendMessage(m.chat, {
                        video: videoBuf,
                        mimetype: 'video/mp4',
                        caption: caption.trim()
                    }, { quoted: m })
                }
                sent = true
            } catch (dlErr) {
                console.warn('[Preset Finder] Gagal download/kirim video HD, fallback ke SD/foto:', dlErr?.message)
                if (videoData.play && videoData.play !== videoDownloadUrl) {
                    try {
                        const sdBuf = await downloadBuffer(videoData.play)
                        await conn.sendMessage(m.chat, {
                            video: sdBuf,
                            mimetype: 'video/mp4',
                            caption: caption.trim()
                        }, { quoted: m })
                        sent = true
                    } catch {}
                }
            }
        }

        if (!sent && previewImage) {
            try {
                await conn.sendMessage(m.chat, {
                    image: { url: previewImage },
                    caption: caption.trim()
                }, { quoted: m })
                sent = true
            } catch {}
        }

        if (!sent) {
            await m.reply(caption.trim())
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        return m.reply(`*Gagal memproses Preset Finder:*\n_${err.message}_`)
    }
}

handler.help = ['preset *url*']
handler.tags = ['tools']
handler.command = /^(preset(am|finder)?|amfinder|findpreset)$/i

export default handler
