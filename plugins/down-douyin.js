/*
 * @Author      : Rafli
 * @Feature     : Douyin Downloader (No Watermark)
 * @Description : Unduh video tanpa watermark, slide gambar, dan audio Douyin via TikWM & Nexray Engine.
 * @Version     : 1.0 (Dual Engine)
 */

import axios from 'axios'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function formatNumber(num) {
    if (!num || isNaN(num)) return '0'
    const n = Number(num)
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B'
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
    return n.toLocaleString('id-ID')
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return null
    const s = Math.round(Number(sec))
    const m = Math.floor(s / 60)
    const rem = s % 60
    return `${m}:${rem.toString().padStart(2, '0')}`
}

function extractDouyinUrl(text = '') {
    const regex = /(https?:\/\/(?:[a-zA-Z0-9_-]+\.)?(?:douyin\.com|iesdouyin\.com)\/[a-zA-Z0-9_\-\/]+)/i
    return text.match(regex)?.[0] || null
}

async function downloadBuffer(url, timeoutMs = 60000) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        headers: {
            'User-Agent': USER_AGENT,
            'Referer': 'https://www.douyin.com/'
        }
    })
    return Buffer.from(res.data)
}

// ── 1. TikWM Engine (Primary) ─────────────────────────────────────────────────
async function fetchTikwm(url) {
    try {
        const res = await axios.get(`https://www.tikwm.com/api/?hd=1&url=${encodeURIComponent(url)}`, {
            timeout: 20000,
            headers: { 'User-Agent': USER_AGENT }
        })
        if (res.data?.code === 0 && res.data?.data) {
            const d = res.data.data
            const video = d.hdplay || d.play || null
            const images = Array.isArray(d.images) ? d.images : []
            return {
                title: d.title || 'Douyin Media',
                author: d.author ? `${d.author.nickname} (@${d.author.unique_id})` : 'Douyin Creator',
                video,
                images,
                audio: d.music || d.music_info?.play || null,
                duration: d.duration ? formatDuration(d.duration) : null,
                stats: {
                    views: formatNumber(d.play_count),
                    likes: formatNumber(d.digg_count),
                    comments: formatNumber(d.comment_count),
                    shares: formatNumber(d.share_count)
                },
                engine: 'TikWM'
            }
        }
    } catch (_) {}
    return null
}

// ── 2. Nexray Engine (Fallback) ───────────────────────────────────────────────
async function fetchNexray(url) {
    try {
        const res = await axios.get(`https://api.nexray.web.id/api/downloader/douyin?url=${encodeURIComponent(url)}`, {
            timeout: 25000,
            headers: { 'User-Agent': USER_AGENT }
        })
        if (res.data?.status && res.data?.result) {
            const r = res.data.result
            const video = r.video_hd || r.video || r.url || null
            const images = Array.isArray(r.images) ? r.images : (r.type === 'image' && r.url ? [r.url] : [])
            return {
                title: r.title || r.desc || 'Douyin Media',
                author: r.author || r.nickname || 'Douyin Creator',
                video,
                images,
                audio: r.audio || r.music || null,
                duration: null,
                stats: null,
                engine: 'Nexray'
            }
        }
    } catch (_) {}
    return null
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const input = m.quoted?.text || text || ''
    const douyinUrl = extractDouyinUrl(input)

    if (!douyinUrl) {
        return m.reply(
            `╭── ✦ *DOUYIN DOWNLOADER* ✦\n` +
            `• Unduh video tanpa watermark dan slide foto dari Douyin (TikTok China).\n\n` +
            `• *Cara pakai:*\n` +
            `  › \`${usedPrefix + command} <link douyin>\`\n\n` +
            `• *Contoh:*\n` +
            `  › \`${usedPrefix + command} https://v.douyin.com/i8sxxx/\`\n` +
            `  › \`${usedPrefix + command} https://www.douyin.com/video/71234567890\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})
    const loadingMsg = await m.reply('_Mengunduh media Douyin, tunggu sebentar..._')

    const deleteLoading = async () => {
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
        }
    }

    try {
        const result = (await fetchTikwm(douyinUrl)) || (await fetchNexray(douyinUrl))
        if (!result || (!result.video && (!result.images || result.images.length === 0))) {
            throw new Error('Gagal mengambil data dari server Douyin. Pastikan tautan masih aktif atau coba beberapa saat lagi.')
        }

        await deleteLoading()

        // ── KASUS 1: SLIDESHOW GAMBAR ─────────────────────────────────────────
        if (result.images && result.images.length > 0) {
            let captionText =
                `╭── ✦ *DOUYIN SLIDESHOW* ✦\n` +
                (result.title ? `• *Caption*: ${result.title.slice(0, 200)}\n` : '') +
                `• *Creator*: ${result.author}\n` +
                `• *Total Foto*: ${result.images.length}\n`

            if (result.stats) {
                captionText +=
                    `\n╭── ✦ *STATISTIK* ✦\n` +
                    `• *Views*: ${result.stats.views}\n` +
                    `• *Likes*: ${result.stats.likes}\n` +
                    `• *Shares*: ${result.stats.shares}\n`
            }
            captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Engine: ${result.engine}`

            if (typeof conn.sendAlbum === 'function') {
                const albumItems = result.images.map((imgUrl, idx) => ({
                    image: { url: imgUrl },
                    caption: idx === 0 ? captionText : ''
                }))
                await conn.sendAlbum(m.chat, albumItems, { quoted: m, delay: 800 }).catch(async () => {
                    for (let i = 0; i < result.images.length; i++) {
                        await conn.sendMessage(m.chat, {
                            image: { url: result.images[i] },
                            caption: i === 0 ? captionText : `*Slide ${i + 1}/${result.images.length}*`
                        }, { quoted: m })
                        if (i < result.images.length - 1) await new Promise(r => setTimeout(r, 600))
                    }
                })
            } else {
                for (let i = 0; i < result.images.length; i++) {
                    await conn.sendMessage(m.chat, {
                        image: { url: result.images[i] },
                        caption: i === 0 ? captionText : `*Slide ${i + 1}/${result.images.length}*`
                    }, { quoted: m })
                    if (i < result.images.length - 1) await new Promise(r => setTimeout(r, 600))
                }
            }

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return
        }

        // ── KASUS 2: VIDEO TANPA WATERMARK ────────────────────────────────────
        let captionText =
            `╭── ✦ *DOUYIN DOWNLOADER* ✦\n` +
            (result.title ? `• *Caption*: ${result.title.slice(0, 200)}\n` : '') +
            `• *Creator*: ${result.author}\n` +
            (result.duration ? `• *Durasi*: ${result.duration}\n` : '')

        if (result.stats) {
            captionText +=
                `\n╭── ✦ *STATISTIK* ✦\n` +
                `• *Views*: ${result.stats.views}\n` +
                `• *Likes*: ${result.stats.likes}\n` +
                `• *Komentar*: ${result.stats.comments}\n` +
                `• *Shares*: ${result.stats.shares}\n`
        }
        captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Kualitas: HD No-Watermark | Engine: ${result.engine}`

        let videoBuffer = null
        try {
            videoBuffer = await downloadBuffer(result.video)
        } catch (_) {}

        await conn.sendMessage(m.chat, {
            video: videoBuffer || { url: result.video },
            mimetype: 'video/mp4',
            caption: captionText
        }, { quoted: m })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (err) {
        console.error('[DOUYIN ERROR]:', err.message)
        await deleteLoading()
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        return m.reply(
            `╭── ✦ *GAGAL MENGUNDUH* ✦\n` +
            `• *Error:* ${err.message}\n` +
            `• _Pastikan tautan Douyin benar dan dapat dibuka di browser._\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }
}

handler.help = ['douyin *url*']
handler.tags = ['downloader']
handler.command = /^(douyin|dy|dydl)$/i
handler.limit = false

export default handler
