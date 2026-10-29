/*
 * @Author      : Rafli
 * @Feature     : Read View Once (Anti-View Once)
 * @Description : Membuka dan mengirim ulang pesan sekali lihat (view-once) untuk foto, video, maupun pesan suara (audio/PTT).
 * @Version     : 2.1 (Full Media Container Extraction & Audio PTT Support)
 */

import { downloadMediaMessage } from '@whiskeysockets/baileys'

let handler = async (m, { conn, usedPrefix, command }) => {
    const q = m.quoted ? m.quoted : null
    if (!q) {
        return m.reply(
            `*READ VIEW ONCE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Membuka dan menyimpan pesan sekali lihat (View Once).\n\n` +
            `*Cara Pakai:*\n` +
            `Reply pesan foto, video, atau audio sekali lihat dengan \`${usedPrefix + command}\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // Ekstraksi pesan dari berbagai varian container Baileys view-once
    let rawMsg = q.message || q.msg || q
    if (rawMsg.viewOnceMessage?.message) rawMsg = rawMsg.viewOnceMessage.message
    if (rawMsg.viewOnceMessageV2?.message) rawMsg = rawMsg.viewOnceMessageV2.message
    if (rawMsg.viewOnceMessageV2Extension?.message) rawMsg = rawMsg.viewOnceMessageV2Extension.message

    const msgKeys = Object.keys(rawMsg)
    const mediaKey = msgKeys.find(k => k.endsWith('Message'))
    const innerMsg = mediaKey ? rawMsg[mediaKey] : rawMsg

    const isViewOnce = !!(
        q.isViewOnce ||
        q.viewOnce ||
        innerMsg?.viewOnce ||
        rawMsg?.viewOnce ||
        mediaKey?.toLowerCase().includes('viewonce')
    )

    const mime = innerMsg?.mimetype || q.mimetype || q.mediaType || ''
    const isImage = mime.startsWith('image/') || mediaKey === 'imageMessage'
    const isVideo = mime.startsWith('video/') || mediaKey === 'videoMessage'
    const isAudio = mime.startsWith('audio/') || mediaKey === 'audioMessage'

    if (!isImage && !isVideo && !isAudio) {
        return m.reply('*Media tidak dikenali atau bukan pesan sekali lihat (gambar, video, audio).*')
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        let mediaBuffer = null

        // Coba download via helper internal m.quoted.download()
        try {
            mediaBuffer = await q.download()
        } catch (_) {}

        // Fallback jika download helper gagal, gunakan Baileys downloadMediaMessage
        if (!mediaBuffer || mediaBuffer.length === 0) {
            mediaBuffer = await downloadMediaMessage(
                {
                    key: q.key || m.key,
                    message: rawMsg
                },
                'buffer',
                {},
                {
                    logger: console,
                    reuploadRequest: conn.updateMediaMessage
                }
            )
        }

        if (!mediaBuffer || mediaBuffer.length === 0) {
            throw new Error('Gagal mengunduh media view-once dari server WhatsApp.')
        }

        const caption = innerMsg?.caption || q.text || ''
        const typeName = isImage ? 'FOTO' : isVideo ? 'VIDEO' : 'PESAN SUARA'

        if (isImage) {
            await conn.sendMessage(m.chat, {
                image: mediaBuffer,
                caption: caption ? `*${typeName} VIEW-ONCE*\n\n${caption}` : `*${typeName} VIEW-ONCE*`
            }, { quoted: m })
        } else if (isVideo) {
            await conn.sendMessage(m.chat, {
                video: mediaBuffer,
                caption: caption ? `*${typeName} VIEW-ONCE*\n\n${caption}` : `*${typeName} VIEW-ONCE*`
            }, { quoted: m })
        } else if (isAudio) {
            await conn.sendMessage(m.chat, {
                audio: mediaBuffer,
                mimetype: mime || 'audio/mp4',
                ptt: innerMsg?.ptt || true
            }, { quoted: m })
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (err) {
        console.error('[RVO ERROR]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(`*Gagal membuka media view-once:*\n\n_${err.message}_`)
    }
}

handler.help    = ['rvo']
handler.tags    = ['tools']
handler.command = /^(readviewonce|rvo|antiviewonce|buka)$/i

export default handler