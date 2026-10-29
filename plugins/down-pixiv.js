/*
 * @Author      : Rafli
 * @Feature     : Pixiv Downloader (Single, Multi-page, Specific Page Targeting)
 * @Description : Unduh artwork Pixiv via link/ID. Support unduh halaman tertentu (misal: .pixivdl <id> 2)
 * @Version     : 4.0 (Enterprise Hardened)
 */

import {
    extractArtworkId,
    getArtwork,
    getPages,
    sendArtwork
} from '../function/scrapers/pixiv.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*PIXIV DOWNLOADER*\n\n` +
        `Download artwork Pixiv via link atau ID.\n\n` +
        `*Cara Pakai:*\n` +
        `• \`${usedPrefix}${command} <link/id>\` — Unduh semua/album (hingga 10 hal)\n` +
        `• \`${usedPrefix}${command} <link/id> <nomor_halaman>\` — Unduh halaman spesifik\n\n` +
        `*Contoh:*\n` +
        `\`${usedPrefix}${command} https://www.pixiv.net/en/artworks/141097547\`\n` +
        `\`${usedPrefix}${command} 141097547 2\``
    )

    const args = text.trim().split(/\s+/)
    const artworkId = extractArtworkId(args[0])

    if (!artworkId) return m.reply(
        `Link atau ID Pixiv tidak valid.\n\n` +
        `Contoh link: \`https://www.pixiv.net/en/artworks/141097547\`\n` +
        `Contoh ID: \`141097547\``
    )

    let targetPage = null
    if (args[1] && /^\d+$/.test(args[1])) {
        targetPage = parseInt(args[1], 10)
    }

    const loadMsg = await m.reply(`_Mengambil detail artwork ${targetPage ? `(Halaman ${targetPage})` : ''}..._`)

    try {
        const [detail, pages] = await Promise.all([
            getArtwork(artworkId),
            getPages(artworkId)
        ])

        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

        if (!pages.length) {
            return m.reply(
                `*Tidak bisa mengambil gambar.*\n\n` +
                `Artwork mungkin sudah dihapus atau di-private oleh author.\n\n` +
                `${detail.pageUrl}`
            )
        }

        if (targetPage !== null && (targetPage < 1 || targetPage > pages.length)) {
            return m.reply(
                `*Nomor halaman tidak valid.*\nArtwork ini memiliki *${pages.length} halaman* (Pilih antara 1 s/d ${pages.length}).`
            )
        }

        await sendArtwork(conn, m, detail, pages, targetPage)

    } catch (e) {
        console.error('[PIXIVDL ERROR]', e)
        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
        return m.reply(`*Gagal mengambil artwork.*\n\n${e.message}\n\nhttps://www.pixiv.net/en/artworks/${artworkId}`)
    }
}

handler.help    = ['pixivdl *link/id*']
handler.tags    = ['downloader']
handler.command = /^(pixivdl|pixivdown|pdl)$/i
handler.limit   = false

export default handler
