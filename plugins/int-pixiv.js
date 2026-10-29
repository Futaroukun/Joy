/*
 * @Author      : Rafli
 * @Feature     : Pixiv Search, Ranking, Artist Works & Recommendations
 * @Description : Cari artwork, ranking harian/mingguan/R18, karya artis/kreator, dan karya rekomendasi serupa
 * @Version     : 4.0 (Enterprise Hardened)
 */

import {
    searchPixiv,
    getRanking,
    getArtistArtworks,
    getRelatedArtworks,
    getArtwork,
    getPages,
    sendArtwork,
    fmtDate,
    extractArtworkId
} from '../function/scrapers/pixiv.js'

// ── Cache State ───────────────────────────────────────────────────────────────
const searchCache = new Map()
const CACHE_TTL   = 5 * 60 * 1000

const getCacheKey = (chat, sender) => `${chat}_${sender}`
const setCache    = (chat, sender, data, msgId = null) => searchCache.set(getCacheKey(chat, sender), { data, ts: Date.now(), msgId })
const getCache    = (chat, sender) => {
    const key = getCacheKey(chat, sender)
    const e   = searchCache.get(key)
    if (!e || Date.now() - e.ts > CACHE_TTL) { searchCache.delete(key); return null }
    return e
}
const deleteCache = (chat, sender) => searchCache.delete(getCacheKey(chat, sender))

// ── Helpers ───────────────────────────────────────────────────────────────────
const VALID_SEARCH_MODES = ['safe', 'all', 'r18']
const RANKING_LABELS = {
    daily     : 'Harian',
    weekly    : 'Mingguan',
    monthly   : 'Bulanan',
    rookie    : 'Rookie',
    original  : 'Original',
    male      : 'Pria',
    female    : 'Wanita',
    r18       : 'R18 (Harian)',
    r18_daily : 'R18 (Harian)',
    r18_weekly: 'R18 (Mingguan)'
}

function makeRows(results) {
    return results.map((art, i) => {
        const dateStr = art.createDate ? fmtDate(art.createDate) : ''
        const tagSnippet = art.tags?.slice(0, 3).join(' • ') || '-'
        return {
            header     : art.userName,
            title      : art.title.substring(0, 72),
            description: `${dateStr ? dateStr + ' | ' : ''}${tagSnippet} | ${art.pageCount} hal${art.isR18 ? ' | R18' : ''}`,
            id         : `pixiv_pick_${i}`
        }
    })
}

// ── Main Handler ──────────────────────────────────────────────────────────────
let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {

    // ── 1. RANKING (.pixivrank [mode]) ────────────────────────────────────────
    if (/^pixivrank$/i.test(command)) {
        const rawMode = text?.toLowerCase().trim() || 'daily'
        const label   = RANKING_LABELS[rawMode] || rawMode.toUpperCase()
        const loadMsg = await m.reply(`_Mengambil ranking Pixiv (${label})..._`)

        try {
            const results = await getRanking(rawMode, 20)
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

            if (!results.length) return m.reply('Ranking kosong saat ini.')

            const sentMsg = await conn.sendButton(m.chat, {
                header : `PIXIV RANKING — ${label.toUpperCase()}`,
                body   :
                    `Menampilkan *${results.length}* artwork teratas.\n\n` +
                    `Pilih artwork di bawah untuk download.\n` +
                    `_Tidak bisa klik button? Ketik angkanya (1-${results.length})_`,
                footer : 'Pixiv.net',
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'PILIH ARTWORK',
                        sections: [{ title: `Ranking ${label}`, highlight_label: 'Artwork', rows: makeRows(results) }]
                    })
                }]
            }, { quoted: m })

            setCache(m.chat, m.sender, results, sentMsg?.key?.id)
            return

        } catch (e) {
            console.error('[PIXIV RANK ERROR]', e)
            await conn.sendMessage(m.chat, { text: `*Gagal mengambil ranking.*\n\n${e.message}`, edit: loadMsg.key }).catch(() => m.reply(`*Gagal:* ${e.message}`))
            return
        }
    }

    // ── 2. ARTIST ARTWORKS (.pixivuser / .pixivartist <user_id>) ──────────────
    if (/^(pixivuser|pixivartist|puser)$/i.test(command)) {
        if (!text) return m.reply(
            `*PIXIV ARTIST EXPLORER*\n\n` +
            `Lihat daftar artwork terbaru karya kreator/artis.\n\n` +
            `*Cara Pakai:* \`${usedPrefix + command} <user_id/link_profil>\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} 117268539\`\n` +
            `\`${usedPrefix + command} https://www.pixiv.net/en/users/117268539\``
        )

        const match = text.match(/users\/(\d+)/i) || text.match(/^(\d+)$/)
        const userId = match ? match[1] : text.trim()

        const loadMsg = await m.reply(`_Mengambil karya kreator (ID: ${userId})..._`)
        try {
            const { artworks } = await getArtistArtworks(userId, { limit: 20 })
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

            if (!artworks.length) return m.reply(`Tidak ada artwork yang ditemukan dari user ID *${userId}*.`)

            const authorName = artworks[0]?.userName || `User ${userId}`

            const sentMsg = await conn.sendButton(m.chat, {
                header : `ARTWORKS OLEH: ${authorName.toUpperCase()}`,
                body   :
                    `Ditemukan *${artworks.length}* karya dari kreator *${authorName}*.\n\n` +
                    `Pilih karya di bawah untuk melihat & mengunduh.\n` +
                    `_Tidak bisa klik button? Ketik angkanya (1-${artworks.length})_`,
                footer : 'Pixiv.net',
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'PILIH KARYA',
                        sections: [{ title: `Karya ${authorName}`, highlight_label: 'Artwork', rows: makeRows(artworks) }]
                    })
                }]
            }, { quoted: m })

            setCache(m.chat, m.sender, artworks, sentMsg?.key?.id)
            return
        } catch (e) {
            await conn.sendMessage(m.chat, { text: `*Gagal mengambil profil artis:* ${e.message}`, edit: loadMsg.key }).catch(() => m.reply(`*Gagal:* ${e.message}`))
            return
        }
    }

    // ── 3. RELATED RECOMMENDATIONS (.pixivrelated <id>) ───────────────────────
    if (/^(pixivrelated|prelated)$/i.test(command)) {
        const id = extractArtworkId(text)
        if (!id) return m.reply(`Masukkan ID atau link artwork Pixiv.\n\nContoh: \`${usedPrefix + command} 141097547\``)

        const loadMsg = await m.reply(`_Mencari karya serupa & rekomendasi terkait..._`)
        try {
            const results = await getRelatedArtworks(id, { limit: 20 })
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

            if (!results.length) return m.reply(`Tidak ada artwork rekomendasi ditemukan untuk ID *${id}*.`)

            const sentMsg = await conn.sendButton(m.chat, {
                header : 'PIXIV REKOMENDASI TERKAIT',
                body   :
                    `Ditemukan *${results.length}* karya serupa untuk ID *${id}*.\n\n` +
                    `Pilih artwork di bawah untuk download.\n` +
                    `_Tidak bisa klik button? Ketik angkanya (1-${results.length})_`,
                footer : 'Pixiv.net',
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'PILIH ARTWORK REKOMENDASI',
                        sections: [{ title: `Serupa dengan ID: ${id}`, highlight_label: 'Artwork', rows: makeRows(results) }]
                    })
                }]
            }, { quoted: m })

            setCache(m.chat, m.sender, results, sentMsg?.key?.id)
            return
        } catch (e) {
            await conn.sendMessage(m.chat, { text: `*Gagal mencari karya terkait:* ${e.message}`, edit: loadMsg.key }).catch(() => m.reply(`*Gagal:* ${e.message}`))
            return
        }
    }

    // ── 4. HELP / GUIDE DASHBOARD ────────────────────────────────────────────
    if (!text || /^(help|menu|panduan|\?)$/i.test(text.trim())) {
        let helpText =
            `*PIXIV SUITE — PUSAT FITUR & PANDUAN*\n\n` +
            `*1. Pencarian Artwork*\n` +
            `• \`${usedPrefix}pixiv <kata kunci>\` — Cari artwork (SFW)\n` +
            `• \`${usedPrefix}pixiv <kata kunci> all\` — Cari semua konten\n` +
            (isOwner ? `• \`${usedPrefix}pixiv <kata kunci> r18\` — Cari konten 18+\n` : '') +
            `_Contoh: \`${usedPrefix}pixiv hatsune miku\`_\n\n` +
            `*🏆 2. Ranking Terpopuler*\n` +
            `• \`${usedPrefix}pixivrank\` — Ranking harian (Daily)\n` +
            `• \`${usedPrefix}pixivrank mingguan\` — Ranking mingguan\n` +
            `• \`${usedPrefix}pixivrank bulanan\` — Ranking bulanan\n` +
            (isOwner ? `• \`${usedPrefix}pixivrank r18\` — Ranking 18+ harian\n` : '') +
            `\n*📥 3. Downloader Artwork*\n` +
            `• \`${usedPrefix}pixivdl <link/id>\` — Unduh album lengkap (hingga 10 hal)\n` +
            `• \`${usedPrefix}pixivdl <link/id> <hal>\` — Unduh halaman tertentu\n` +
            `_Contoh: \`${usedPrefix}pixivdl 141097547 2\`_\n\n` +
            `*👤 4. Eksplorasi Artis & Rekomendasi*\n` +
            `• \`${usedPrefix}pixivuser <user_id>\` — Lihat karya terbaru artis\n` +
            `• \`${usedPrefix}pixivrelated <id_artwork>\` — Cari karya serupa/mirip\n` +
            `_Contoh: \`${usedPrefix}pixivuser 117268539\`_\n`

        if (isOwner) {
            helpText +=
                `\n*🔐 5. Pengaturan Sesi & Akun (Owner)*\n` +
                `• \`${usedPrefix}pcheck\` — Cek status OAuth & Web Cookie\n` +
                `• \`${usedPrefix}pcookie <PHPSESSID>\` — Pasang cookie web browser\n` +
                `• \`${usedPrefix}pcookie reset\` — Hapus semua sesi tersimpan\n`
        }

        helpText += `\n_Tips: Anda bisa memilih artwork via tombol interaktif atau membalas dengan nomor urut (1-20)._`
        return m.reply(helpText)
    }

    // ── 5. SEARCH (.pixiv <keyword> [mode]) ────────────────────────────────────
    const args    = text.trim().split(/\s+/)
    const lastArg = args[args.length - 1].toLowerCase()
    let mode      = 'safe'
    let keyword   = text.trim()

    if (VALID_SEARCH_MODES.includes(lastArg)) {
        mode    = lastArg === 'r18' && !isOwner ? 'safe' : lastArg
        keyword = args.slice(0, -1).join(' ')
    }

    if (!keyword) return m.reply('Kata kunci pencarian tidak boleh kosong.')

    const loadMsg = await m.reply(`_Mencari "${keyword}" di Pixiv..._`)

    try {
        const results = await searchPixiv(keyword, { mode, limit: 20 })
        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

        if (!results.length) return m.reply(`Tidak ada hasil untuk *"${keyword}"*.\n\nCoba kata kunci lain.`)

        const sentMsg = await conn.sendButton(m.chat, {
            header : 'PIXIV SEARCH RESULTS',
            body   :
                `Ditemukan *${results.length}* artwork untuk *"${keyword}"*\n` +
                `_Mode: ${mode.toUpperCase()}_\n\n` +
                `Pilih artwork dari daftar di bawah.\n` +
                `_Tidak bisa klik button? Ketik angkanya (1-${results.length})_`,
            footer : 'Pixiv.net',
            buttons: [{
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                    title: 'PILIH ARTWORK',
                    sections: [{ title: `Hasil: ${keyword}`, highlight_label: 'Artwork', rows: makeRows(results) }]
                })
            }]
        }, { quoted: m })

        setCache(m.chat, m.sender, results, sentMsg?.key?.id)
        return

    } catch (e) {
        console.error('[PIXIV SEARCH ERROR]', e)
        await conn.sendMessage(m.chat, { text: `*Pencarian gagal.*\n\n${e.message}\n\nCoba lagi nanti.`, edit: loadMsg.key }).catch(() => m.reply(`*Gagal:* ${e.message}`))
    }
}

// ── Before Handler (Pilihan Button List / Angka) ──────────────────────────────
handler.before = async (m, { conn }) => {
    if (!m.text) return false

    const cacheEntry = getCache(m.chat, m.sender)
    let index        = -1

    if (m.text.startsWith('pixiv_pick_')) {
        index = parseInt(m.text.replace('pixiv_pick_', ''), 10)
    } else if (/^\d+$/.test(m.text.trim()) && cacheEntry) {
        const isQuotedMatch = m.quoted && cacheEntry.msgId && m.quoted.id === cacheEntry.msgId
        const isRecent      = (Date.now() - cacheEntry.ts) < 2 * 60 * 1000

        if (isQuotedMatch || isRecent) {
            index = parseInt(m.text.trim(), 10) - 1
        }
    }

    if (!cacheEntry || index < 0 || index >= cacheEntry.data.length) return false

    const art = cacheEntry.data[index]
    deleteCache(m.chat, m.sender)

    const loadMsg = await m.reply(`_Mengambil detail & gambar (${art.title})..._`)

    try {
        const [detail, pages] = await Promise.all([
            getArtwork(art.id),
            getPages(art.id)
        ])

        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

        if (!pages.length) {
            return m.reply(
                `*Tidak bisa mengambil gambar.*\n\nArtwork mungkin dihapus atau memerlukan autentikasi login.\n\n${detail.pageUrl}`
            )
        }

        await sendArtwork(conn, m, detail, pages)

    } catch (e) {
        console.error('[PIXIV BEFORE ERROR]', e)
        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
        await m.reply(`*Gagal mengambil artwork.*\n\n${e.message}\n\nhttps://www.pixiv.net/en/artworks/${art.id}`)
    }

    return true
}

handler.help = ['pixiv *keyword/rank/user*']
handler.tags    = ['internet']
handler.command = /^(pixiv|pixivrank|pixivuser|pixivrelated)$/i
handler.limit   = false

export default handler
