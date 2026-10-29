import axios from 'axios'

const cooldowns = new Map()
const CD_TIME = 10000

class StickerLy {
    constructor() {
        this.headers = {
            'User-Agent': 'androidapp.stickerly/1.13.3 (G011A; U; Android 22; pt-BR; br;)',
            'Content-Type': 'application/json',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip'
        }
    }

    async search(query) {
        try {
            const { data } = await axios.post('https://api.sticker.ly/v4/stickerPack/smartSearch', {
                keyword: query,
                enabledKeywordSearch: true,
                filter: {
                    extendSearchResult: false,
                    sortBy: 'RECOMMENDED',
                    languages: ['ALL'],
                    minStickerCount: 5,
                    searchBy: 'ALL',
                    stickerType: 'ALL'
                }
            }, { headers: this.headers, timeout: 10000 })

            if (!data?.result?.stickerPacks) return []
            return data.result.stickerPacks.slice(0, 10).map(pack => ({
                name: (pack.name || 'Pack').slice(0, 24),
                author: pack.authorName || pack.user?.userName || 'Sticker.ly',
                stickerCount: pack.resourceFiles?.length || pack.stickerCount || 0,
                url: pack.shareUrl || `https://sticker.ly/s/${pack.packId}`
            }))
        } catch (e) {
            return []
        }
    }

    async detail(url) {
        try {
            const match = url.match(/\/s\/([^\/\?#]+)/) || url.match(/^([a-zA-Z0-9_-]+)$/)
            if (!match) throw new Error('Link yang diberikan tidak valid.')
            const { data } = await axios.get(`https://api.sticker.ly/v4/stickerPack/${match[1]}?needRelation=true`, { 
                headers: this.headers, 
                timeout: 10000 
            })
            
            if (!data?.result?.stickers) throw new Error('Gagal mengambil data stiker.')
            return {
                name: data.result.name,
                stickers: data.result.stickers.map(s => ({
                    url: `${data.result.resourceUrlPrefix}${s.fileName}`
                }))
            }
        } catch (e) {
            throw e
        }
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const stly = new StickerLy()
    const userId = m.sender
    const now = Date.now()

    if (!isOwner) {
        if (cooldowns.has(userId)) {
            const expirationTime = cooldowns.get(userId) + CD_TIME
            if (now < expirationTime) {
                const timeLeft = (expirationTime - now) / 1000
                return m.reply(`*Sabar.* Tunggu *${timeLeft.toFixed(1)}* detik lagi baru bisa menggunakan perintah ini.`)
            }
        }
    }

    if (text && (text.includes('sticker.ly/s/') || /^[a-zA-Z0-9_-]{5,8}$/.test(text.trim()))) {
        try {
            const res = await stly.detail(text.trim())
            const randomStickers = (res.stickers || [])
                .sort(() => Math.random() - 0.5) 
                .slice(0, 6)

            if (randomStickers.length === 0) return m.reply('*Pack ini tidak memiliki stiker.*')

            cooldowns.set(userId, now)
            await m.reply(`*Mengambil 6 stiker acak* dari pack *${res.name}*...`)

            for (let s of randomStickers) {
                if (typeof conn.sendSticker === 'function') {
                    await conn.sendSticker(m.chat, s.url, m, {
                        packname: global.info?.namabot || 'Joy',
                        packpublish: res.name
                    })
                } else {
                    await conn.sendStickerImage(m.chat, s.url, m, {
                        packname: global.info?.namabot || 'Joy',
                        author: res.name
                    })
                }
                await conn.delay(1500)
            }
            
            return conn.sendMessage(m.chat, { text: `*Berhasil.* 6 stiker dari pack *${res.name}* terkirim.` }, { quoted: m })
        } catch (e) {
            return m.reply('*Gagal mengambil stiker dari pack tersebut.*')
        }
    }

    if (!text) {
        return m.reply(
            `╭── ✦ *STICKER.LY SEARCH* ✦\n` +
            `• Cari dan download stiker dari Sticker.ly\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Penggunaan:* \`${usedPrefix + command}\` *<kata kunci/link>*\n` +
            `*Contoh:* \`${usedPrefix + command} kucing\``
        )
    }

    let loadingMsg = await m.reply('*Sedang mencari pack stiker...*')
    const results = await stly.search(text.trim())

    if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
    if (results.length === 0) return m.reply('*Tidak ditemukan hasil.* Coba gunakan kata kunci lain.')

    cooldowns.set(userId, now)

    const rows = results.map((v, i) => ({
        header: `Pack ${i + 1}`,
        title: v.name,
        description: `Oleh: ${v.author} | Total: ${v.stickerCount} Stiker`,
        id: `${usedPrefix + command} ${v.url}`
    }))

    await conn.sendButton(m.chat, {
        header: 'HASIL PENCARIAN STICKER.LY',
        body: `Hasil pencarian untuk *${text}*.\n\nSilakan pilih pack stiker di bawah ini:`,
        footer: `Sticker.ly • ${global.info?.namabot || 'Joy'}`,
        buttons: [{
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: "Pilih Pack",
                sections: [{ title: "Daftar Pack", rows: rows }]
            })
        }]
    }, { quoted: m })
}

handler.help = ['stly *query/link*']
handler.tags = ['sticker']
handler.command = /^(stly|stickerly)$/i

export default handler
