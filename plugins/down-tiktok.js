import {
    downloadBuffer,
    remuxVideoFast,
    savetik,
    tiksnap,
    ssstik,
    resolveTikTokUrl,
    isValidVideoUrl,
    formatNumber,
    formatDuration,
    extractTikTokUrl
} from '../function/scrapers/tiktok.js'

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

    const rawTiktokUrl = extractTikTokUrl(text)
    if (!rawTiktokUrl) {
        return m.reply('Link tidak valid. Pastikan link berasal dari TikTok.')
    }

    let loadingMsg = await m.reply('_Memproses, tunggu sebentar..._')

    try {
        const tiktokUrl = await resolveTikTokUrl(rawTiktokUrl)

        const [savetikResult, tiksnapData, ssstikData] = await Promise.all([
            savetik(tiktokUrl),
            tiksnap(tiktokUrl),
            ssstik(tiktokUrl)
        ])

        if (!savetikResult && !tiksnapData && !ssstikData) {
            throw new Error('Gagal mengambil data dari server TikTok. Coba periksa tautan atau ulangi beberapa saat lagi.')
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
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            }
            return m.reply('Tidak ada media yang ditemukan. Coba cek link atau coba lagi nanti.')
        }

        const title = tiksnapData?.title || savetikResult?.caption || ssstikData?.caption || null
        const author = tiksnapData?.author
            ? `${tiksnapData.author.nickname} (@${tiksnapData.author.unique_id})`
            : (ssstikData?.author || null)
        const region = null
        const duration = tiksnapData?.duration ? formatDuration(tiksnapData.duration) : null
        const videoId = tiksnapData?.id || savetikResult?.videoId || null
        const stats = tiksnapData ? {
            views: formatNumber(tiksnapData.play_count),
            likes: formatNumber(tiksnapData.digg_count),
            comments: formatNumber(tiksnapData.comment_count),
            shares: formatNumber(tiksnapData.share_count)
        } : null

        if (isSlideshow) {
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

            const sourceName = chosenCandidate.source || 'TikTok'
            captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Media: ${sourceName}`

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
            if (albumItems.length > 1 && typeof conn.sendAlbum === 'function') {
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
                    }, { quoted: i === 0 ? m : undefined }).catch(() => {})
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
                } catch (audioErr) {
                    console.warn('[TikTok] Gagal mengirim audio:', audioErr?.message)
                }
            }

            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            }

        } else if (videoUrl) {
            const rawSize = (videoHD === tiksnapData?.hdplay ? tiksnapData?.hd_size : tiksnapData?.size) || tiksnapData?.size || 0
            const sizeInMB = rawSize ? (rawSize / (1024 * 1024)).toFixed(1) : null
            const isTooLargeForVideo = rawSize > 64 * 1024 * 1024
            const needsRemux = rawSize > 20 * 1024 * 1024

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

            const sourceName = videoHD === tiksnapData?.hdplay
                ? 'TikSnap (HD)'
                : (videoHD === savetikResult?.mp4HD
                    ? 'SaveTik (HD)'
                    : (videoUrl === tiksnapData?.play
                        ? 'TikSnap'
                        : (videoUrl === savetikResult?.mp4SD || videoUrl === savetikResult?.mp4
                            ? 'SaveTik'
                            : (videoUrl === ssstikData?.mp4 ? 'SSSTik' : 'TikTok Server'))))
            captionText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n> Kualitas: ${isHD ? 'HD' : 'SD'} | Source: ${sourceName}`

            if (isTooLargeForVideo) {
                captionText += `\n> ℹ️ *Catatan*: Dikirim sebagai dokumen karena ukuran file (${sizeInMB} MB) melebihi batas 64 MB video WhatsApp.`
                let docBuffer = null
                try {
                    docBuffer = await downloadBuffer(videoUrl, 90000)
                } catch (docErr) {
                    console.warn('[TikTok] Gagal download docBuffer primary:', docErr?.message)
                    const altHD = videoUrl === tiksnapData?.hdplay ? savetikResult?.mp4HD : (videoUrl === savetikResult?.mp4HD ? tiksnapData?.hdplay : null)
                    if (altHD && isValidVideoUrl(altHD, knownMusicUrls)) {
                        try {
                            docBuffer = await downloadBuffer(altHD, 90000)
                        } catch {}
                    }
                    if (!docBuffer && videoSD && videoSD !== videoUrl) {
                        try {
                            docBuffer = await downloadBuffer(videoSD, 90000)
                        } catch {}
                    }
                }
                await conn.sendMessage(m.chat, {
                    document: docBuffer || { url: videoUrl },
                    mimetype: 'video/mp4',
                    fileName: `tiktok_${videoId || Date.now()}_${isHD ? 'HD' : 'SD'}.mp4`,
                    caption: captionText
                }, { quoted: m })
            } else {
                let videoBuffer = null
                try {
                    videoBuffer = await downloadBuffer(videoUrl)
                } catch (dlErr) {
                    console.warn('[TikTok] Gagal download primary buffer, coba alternatif HD/SD:', dlErr?.message)
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
                            console.warn('[TikTok] Gagal download SD buffer fallback:', sdErr?.message)
                        }
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
                } catch (audioErr) {
                    console.warn('[TikTok] Gagal mengirim audio:', audioErr?.message)
                }
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