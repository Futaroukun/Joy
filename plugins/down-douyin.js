/*
 * @Author      : Rafli
 * @Feature     : Douyin Downloader (No Watermark)
 * @Description : Unduh video tanpa watermark, slide gambar, dan audio Douyin via Nexray Engine & TikWM.
 * @Version     : 1.1 (Full Nexray Support & Raw Share Link Parser)
 */

import axios from 'axios'

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

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

// ── 1. Nexray Engine (Primary) ────────────────────────────────────────────────
async function fetchNexray(url) {
    try {
        const res = await axios.get(`https://api.nexray.web.id/api/downloader/douyin?url=${encodeURIComponent(url)}`, {
            timeout: 25000,
            headers: { 'User-Agent': USER_AGENT }
        })
        if (res.data?.status && res.data?.result) {
            const r = res.data.result
            const mediaList = Array.isArray(r.media) ? r.media : []
            const videos = mediaList.filter(m => m.type === 'video').map(m => m.url)
            const audios = mediaList.filter(m => m.type === 'audio').map(m => m.url)
            const images = mediaList.filter(m => m.type === 'image').map(m => m.url)

            const video = videos[0] || r.video || r.url || null
            const audio = audios[0] || r.audio || null
            // Jika ada video, gambar yang ada biasanya thumbnail cover
            const isSlide = !video && images.length > 0

            return {
                title: r.title || 'Douyin Media',
                platform: r.platform || 'Douyin',
                thumbnail: r.thumbnail || (images[0] || null),
                video,
                audio,
                images: isSlide ? images : [],
                engine: 'Nexray Engine'
            }
        }
    } catch (_) {}
    return null
}

// ── 2. TikWM Engine (Fallback) ────────────────────────────────────────────────
async function fetchTikwm(url) {
    try {
        const res = await axios.get(`https://www.tikwm.com/api/?hd=1&url=${encodeURIComponent(url)}`, {
            timeout: 20000,
            headers: { 'User-Agent': USER_AGENT }
        })
        if (res.data?.code === 0 && res.data?.data) {
            const d = res.data.data
            return {
                title: d.title || 'Douyin Media',
                platform: 'Douyin',
                thumbnail: d.cover || null,
                video: d.hdplay || d.play || null,
                audio: d.music || null,
                images: Array.isArray(d.images) && d.images.length ? d.images : [],
                engine: 'TikWM'
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
            `  › \`${usedPrefix + command} https://v.douyin.com/bRoHJA4O3Bo/\`\n` +
            `  › \`${usedPrefix + command} https://www.douyin.com/video/7697497633551633683\`\n\n` +
            `• _Bisa langsung paste teks share utuh dari aplikasi Douyin._\n` +
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
        const result = (await fetchNexray(douyinUrl)) || (await fetchTikwm(douyinUrl))
        if (!result || (!result.video && (!result.images || result.images.length === 0))) {
            throw new Error('Gagal mengambil data dari server Douyin. Pastikan video publik dan tautan masih aktif.')
        }

        await deleteLoading()

        // ── KASUS 1: SLIDESHOW FOTO ───────────────────────────────────────────
        if (result.images && result.images.length > 0) {
            let captionText =
                `╭── ✦ *DOUYIN SLIDESHOW* ✦\n` +
                (result.title ? `• *Caption*: ${result.title}\n` : '') +
                `• *Total Foto*: ${result.images.length}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Engine: ${result.engine}`

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

        // ── KASUS 2: VIDEO NO WATERMARK ───────────────────────────────────────
        let captionText =
            `╭── ✦ *DOUYIN DOWNLOADER* ✦\n` +
            (result.title ? `• *Caption*: ${result.title}\n` : '') +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Kualitas: HD No-Watermark | Engine: ${result.engine}`

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
