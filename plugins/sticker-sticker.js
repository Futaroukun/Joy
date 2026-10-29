import { writeExifImg, writeExifVid } from '../function/media/exif.js'
import sharp from 'sharp'
import fs from 'fs'

let handler = async (m, { conn, command, usedPrefix, text }) => {
    try {
        let q = m.quoted ? m.quoted : m
        let mime = (q.msg || q).mimetype || ''

        if (m.quoted?.mtype === 'stickerMessage') {
            return m.reply(`Pesan yang kamu reply sudah berbentuk stiker.`)
        }

        const quotedId = m.quoted?.id
        const cachedAlbum = quotedId ? conn.albumCache?.get(quotedId) : null
        const isAlbumReply = m.quoted?.mtype === 'albumMessage' || (cachedAlbum && (cachedAlbum.albumId === quotedId || /all|masal|semua|-a/i.test(text || '')))

        if (isAlbumReply) {
            if (!cachedAlbum || !cachedAlbum.items?.length) {
                return m.reply(
                    `*Album Tidak Ditemukan*\n\n` +
                    `Album ini tidak tersimpan di cache sementara atau sudah kadaluarsa (maksimal 15 menit).\n` +
                    `Silakan kirim ulang media atau link-nya.`
                )
            }

            const imageItems = cachedAlbum.items.filter(item => item.type === 'image' || item.url || item.buffer)
            if (imageItems.length === 0) {
                return m.reply('Tidak ada gambar di dalam album ini yang bisa dijadikan stiker.')
            }

            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

            let [packname, author] = (text || '').split(`|`)
            let options = {
                packname: packname?.trim() || 'Created By Joy',
                author: author?.trim() || 'wa.me/6285722157719'
            }

            let successCount = 0
            for (let i = 0; i < imageItems.length; i++) {
                try {
                    const item = imageItems[i]
                    const file = await conn.getFile(item.buffer || item.url)
                    let media = file?.data
                    if (!media || !Buffer.isBuffer(media)) continue

                    try {
                        const metadata = await sharp(media).metadata()
                        const minSize = 512
                        if (metadata.width < minSize || metadata.height < minSize) {
                            const smallestSide = Math.min(metadata.width, metadata.height)
                            const multiplier = Math.ceil(minSize / smallestSide)
                            const newWidth = metadata.width * multiplier
                            const newHeight = metadata.height * multiplier
                            media = await sharp(media)
                                .resize(newWidth, newHeight, {
                                    kernel: sharp.kernel.lanczos3,
                                    fit: 'fill'
                                })
                                .toBuffer()
                        }
                    } catch (err) {
                        console.error('[Sharp Album Error]:', err)
                    }

                    let stiker = await writeExifImg(media, options)
                    if (stiker && stiker.length <= 1000000) {
                        await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
                        successCount++
                    }

                    if (i < imageItems.length - 1) {
                        await new Promise(res => setTimeout(res, 600))
                    }
                } catch (err) {
                    console.error(`[Album Sticker #${i + 1} Error]:`, err)
                }
            }

            if (successCount > 0) {
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
            } else {
                await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
                m.reply('Gagal mengonversi gambar di dalam album menjadi stiker.')
            }
            return
        }

        if (!mime || !/image|video/.test(mime)) {
            return m.reply(
                `*STICKER MAKER*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `Ubah gambar atau video pendek menjadi stiker WhatsApp.\n\n` +
                `*Cara Pakai:*\n` +
                `› Kirim gambar/video dengan caption \`${usedPrefix + command}\`\n` +
                `› Atau reply media dengan \`${usedPrefix + command}\`\n\n` +
                `*Catatan:*\n` +
                `• Format video maksimal durasi 8 detik\n` +
                `• Gambar kecil otomatis di-upscale ke HD\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (/video/.test(mime)) {
            if ((q.msg || q).seconds > 8) {
                return m.reply(
                    `*Video Terlalu Panjang*\n\n` +
                    `Durasi video yang bisa dijadikan stiker maksimal *8 detik*.\n` +
                    `Silakan potong videonya terlebih dahulu lalu coba lagi.`
                )
            }
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

        let media
        try {
            media = await q.download()
        } catch (err) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
            return m.reply(
                `*Gagal Mengunduh Media*\n\n` +
                `Tidak dapat mengambil file gambar/video dari server WhatsApp.\n\n` +
                `*Penyebab:*\n` +
                `• File media di server WhatsApp sudah kadaluarsa atau terhapus\n` +
                `• Gangguan koneksi sementara ke CDN WhatsApp\n\n` +
                `*Solusi:*\n` +
                `› Kirim atau teruskan (forward) kembali gambarnya, lalu coba lagi.`
            )
        }
        if (!media) throw new Error('Gagal mengunduh media.')

        if (/image/.test(mime)) {
            try {
                const metadata = await sharp(media).metadata()
                const minSize = 512

                if (metadata.width < minSize || metadata.height < minSize) {
                    const smallestSide = Math.min(metadata.width, metadata.height)
                    const multiplier = Math.ceil(minSize / smallestSide)
                    const newWidth = metadata.width * multiplier
                    const newHeight = metadata.height * multiplier

                    media = await sharp(media)
                        .resize(newWidth, newHeight, {
                            kernel: sharp.kernel.lanczos3,
                            fit: 'fill'
                        })
                        .toBuffer()

                    console.log(`Auto upscaled: ${metadata.width}x${metadata.height} -> ${newWidth}x${newHeight}`)
                }
            } catch (err) {
                console.warn('Auto upscale error:', err?.message || err)
            }
        }

        let stiker
        let [packname, author] = (text || '').split(`|`)
        let options = {
            packname: packname?.trim() || 'Created By Joy',
            author: author?.trim() || 'wa.me/6285722157719'
        }

        try {
            if (/image/.test(mime)) {
                stiker = await writeExifImg(media, options)
            } else if (/video/.test(mime)) {
                stiker = await writeExifVid(media, options)
            }
        } catch (e) {
            console.warn('[EXIF WARN]:', e?.message || e)
            stiker = media
        }

        if (stiker) {
            if (stiker.length > 1000000) {
                await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
                const sizeInMB = (stiker.length / 1000000).toFixed(2)
                return m.reply(
                    `*Stiker Terlalu Besar*\n\n` +
                    `Ukuran stiker yang dihasilkan *${sizeInMB} MB*, sedangkan batas maksimal WhatsApp adalah *1 MB*.\n\n` +
                    `Coba gunakan video yang lebih pendek atau gambar dengan lebih sedikit warna.`
                )
            }
            await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } else {
            throw new Error('Stiker gagal dibuat.')
        }

    } catch (e) {
        console.error(e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        m.reply(`*Gagal membuat stiker*\n\n${e.message}`)
    }
}

handler.help = ['stiker']
handler.tags = ['sticker']
handler.command = /^(s|stiker|sticker)$/i

export default handler