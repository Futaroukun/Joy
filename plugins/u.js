import https from 'https'

// --- FUNGSI SCRAPER PINTEREST (Diadaptasi dari down-pinterest.js) ---

// Fungsi untuk mendapatkan token awal & cookie
const getInitialAuth = () => {
    return new Promise((resolve, reject) => {
        https.get('https://id.pinterest.com/', res => {
            const cookies = res.headers['set-cookie']
            if (cookies) {
                const csrfToken = cookies.find(c => c.startsWith('csrftoken='))?.split(';')[0].split('=')[1]
                const sessionCookie = cookies.find(c => c.startsWith('_pinterest_sess='))?.split(';')[0]
                if (csrfToken && sessionCookie) {
                    resolve({
                        csrftoken: csrfToken,
                        cookieHeader: `csrftoken=${csrfToken}; ${sessionCookie}`
                    })
                    return
                }
            }
            reject(new Error('Gagal mendapatkan token Pinterest.'))
        }).on('error', e => reject(e))
    })
}

// Fungsi utama untuk scraping hasil pencarian
const searchPinterestAPI = async (query, limit = 5) => {
    try {
        const { csrftoken, cookieHeader } = await getInitialAuth()
        const postData = {
            options: { query: query, scope: 'pins', bookmarks: [] },
            context: {}
        }
        const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`
        const dataString = `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(postData))}`

        const options = {
            hostname: 'id.pinterest.com',
            path: '/resource/BaseSearchResource/get/',
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/javascript, */*',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
                'X-Requested-With': 'XMLHttpRequest',
                'X-CSRFToken': csrftoken,
                'Cookie': cookieHeader
            }
        }

        const responseBody = await new Promise((resolve, reject) => {
            const req = https.request(options, res => {
                let body = ''
                res.on('data', chunk => body += chunk)
                res.on('end', () => resolve(body))
            })
            req.on('error', e => reject(e))
            req.write(dataString)
            req.end()
        })

        const json = JSON.parse(responseBody)
        const pins = json.resource_response?.data?.results || []

        if (pins.length === 0) return []

        const results = pins.map(pin => {
            const imageUrl = pin.images?.['736x']?.url || pin.images?.['orig']?.url
            if (imageUrl) {
                return {
                    imageUrl: imageUrl,
                    title: pin.title || pin.grid_title || query
                }
            }
            return null
        }).filter(Boolean)
        
        // Acak hasil dan ambil sesuai limit
        for (let i = results.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [results[i], results[j]] = [results[j], results[i]]
        }

        return results.slice(0, limit)
    } catch (e) {
        throw new Error(`Gagal scraping Pinterest: ${e.message}`)
    }
}

// --- HANDLER UTAMA ---

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*PINTEREST SEARCH*\n\n` +
            `Gunakan format berikut untuk mencari gambar:\n` +
            `*${usedPrefix + command} <query>*\n\n` +
            `*Contoh:*\n` +
            `*${usedPrefix + command} Nao Tomori*`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply(`*Sedang mencari gambar untuk: ${text}...*`)

        // Panggil fungsi scraper yang sudah kita buat
        const results = await searchPinterestAPI(text, 5)

        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })

        if (!results || results.length === 0) {
            return m.reply('*Gambar tidak ditemukan.* Coba gunakan kata kunci lain.')
        }

        await m.reply(`*Berhasil menemukan ${results.length} gambar, sedang menyiapkan album...*`)

        // Siapkan array untuk fungsi sendAlbum
        const mediaForAlbum = await Promise.all(
            results.map(async (result) => {
                try {
                    // Kita tidak perlu download buffer-nya karena sendAlbum bisa handle URL
                    return {
                        image: { url: result.imageUrl },
                        caption: `*Hasil pencarian:* ${result.title}`
                    }
                } catch (downloadError) {
                    console.error('Gagal memproses gambar:', downloadError)
                    return null
                }
            })
        )

        // Filter hasil yang gagal di-download
        const validMedia = mediaForAlbum.filter(Boolean)

        if (validMedia.length === 0) {
            return m.reply('*Gagal memproses semua gambar yang ditemukan.*')
        }

        // Kirim gambar sebagai album menggunakan fungsi bawaan bot lu
        await conn.sendAlbum(m.chat, validMedia, { quoted: m })

    } catch (error) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        console.error(error)
        m.reply(`*Terjadi Kesalahan:* ${error.message}`)
    }
}

// Konsistensi handler
handler.help = ['pinterest *query*']
handler.tags = ['internet']
handler.command = /^tes$/i // Command-nya gua benerin jadi 'pinterest' atau 'pin'
handler.limit = true

export default handler