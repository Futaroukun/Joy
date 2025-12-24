import https from 'https'

const getInitialAuth = () => {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'id.pinterest.com',
            path: '/',
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36'
            }
        }
        https.get(options, res => {
            const cookies = res.headers['set-cookie']
            if (cookies) {
                const csrfCookie = cookies.find(c => c.startsWith('csrftoken='))
                const pinterestSessCookie = cookies.find(c => c.startsWith('_pinterest_sess='))
                if (csrfCookie && pinterestSessCookie) {
                    const csrftoken = csrfCookie.split(';')[0].split('=')[1]
                    const sess = pinterestSessCookie.split(';')[0]
                    resolve({ csrftoken, cookieHeader: `csrftoken=${csrftoken}; ${sess}` })
                    return
                }
            }
            reject(new Error('Gagal mendapatkan CSRF token atau session cookie.'))
        }).on('error', e => reject(e))
    })
}

const searchPinterestAPI = async (query, limit = 5) => {
    try {
        const { csrftoken, cookieHeader } = await getInitialAuth()
        let allResults = []
        let bookmark = null
        let fetchCount = 0
        const maxFetch = 3
        
        while (fetchCount < maxFetch) {
            const postData = {
                options: {
                    query: query,
                    scope: 'pins',
                    bookmarks: bookmark ? [bookmark] : []
                },
                context: {}
            }
            
            const sourceUrl = `/search/pins/?q=${encodeURIComponent(query)}`
            const dataString = `source_url=${encodeURIComponent(sourceUrl)}&data=${encodeURIComponent(JSON.stringify(postData))}`
            
            const options = {
                hostname: 'id.pinterest.com',
                path: '/resource/BaseSearchResource/get/',
                method: 'POST',
                headers: {
                    Accept: 'application/json, text/javascript, */*, q=0.01',
                    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': csrftoken,
                    'X-Pinterest-Source-Url': sourceUrl,
                    Cookie: cookieHeader
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
            
            const jsonResponse = JSON.parse(responseBody)
            
            if (jsonResponse.resource_response && jsonResponse.resource_response.data && jsonResponse.resource_response.data.results) {
                const pins = jsonResponse.resource_response.data.results
                pins.forEach(pin => {
                    const imageUrl = pin.images?.['736x']?.url || pin.images?.['orig']?.url
                    const pinLink = pin.link || `https://www.pinterest.com/pin/${pin.id}/`
                    const creatorName = pin.pinner?.full_name || pin.pinner?.username || 'Unknown'
                    const creatorUsername = pin.pinner?.username || ''
                    const creatorUrl = pin.pinner?.username ? `https://www.pinterest.com/${pin.pinner.username}/` : ''
                    
                    if (imageUrl) {
                        allResults.push({
                            imageUrl: imageUrl,
                            pinLink: pinLink,
                            title: pin.title || pin.grid_title || '',
                            creatorName: creatorName,
                            creatorUsername: creatorUsername,
                            creatorUrl: creatorUrl
                        })
                    }
                })
                
                bookmark = jsonResponse.resource_response.bookmark
                if (!bookmark || pins.length === 0) break
            } else {
                break
            }
            
            fetchCount++
        }
        
        for (let i = allResults.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allResults[i], allResults[j]] = [allResults[j], allResults[i]]
        }
        
        return allResults.slice(0, limit)
    } catch (e) {
        throw new Error(e.message)
    }
}

const downloadBuffer = (url) => {
    return new Promise((resolve, reject) => {
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
                'Referer': 'https://www.pinterest.com/'
            }
        }, (res) => {
            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => resolve(Buffer.concat(chunks)))
        }).on('error', reject)
    })
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const sendImagesWithDelay = async (conn, chatId, mediaArray, quotedMsg, delayMs = 2000) => {
    for (let i = 0; i < mediaArray.length; i++) {
        try {
            await conn.sendMessage(chatId, {
                image: mediaArray[i].image,
                caption: mediaArray[i].caption
            }, { quoted: quotedMsg })
            
            if (i < mediaArray.length - 1) {
                await delay(delayMs)
            }
        } catch (error) {
            console.error(error)
        }
    }
}

const handler = async (m, { usedPrefix, command, conn, text }) => {
    if (!text || text.trim() === '') {
        return m.reply(
            `*PINTEREST IMAGE SEARCH*\n\n` +
            `Gunakan format berikut:\n` +
            `*${usedPrefix + command} <query>*\n\n` +
            `*Contoh:*\n` +
            `*${usedPrefix + command} anime aesthetic*\n` +
            `*${usedPrefix + command} pemandangan alam*`
        )
    }
    
    const query = text.trim()
    let loadingMsg = null
    
    try {
        loadingMsg = await m.reply(`*Sedang mencari gambar untuk: ${query}...*`)
        
        const results = await searchPinterestAPI(query, 5)
        
        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
        
        if (!results || results.length === 0) {
            return m.reply('*Hasil tidak ditemukan.*')
        }
        
        const mediaForAlbum = []
        
        await m.reply(`*Berhasil menemukan ${results.length} gambar, memulai proses pengunduhan...*`)
        
        for (const result of results) {
            try {
                const buffer = await downloadBuffer(result.imageUrl)
                const creatorInfo = result.creatorUsername ?
                    `Kreator: ${result.creatorName} (@${result.creatorUsername})` :
                    result.creatorName !== 'Unknown' ? `Kreator: ${result.creatorName}` : ''
                
                mediaForAlbum.push({
                    image: buffer,
                    caption: `*${result.title || 'Pinterest Image'}*\n${creatorInfo}\n\n*Sumber:* ${result.pinLink}${result.creatorUrl ? `\n*Profil:* ${result.creatorUrl}` : ''}`
                })
            } catch (downloadError) {
                console.error(downloadError)
            }
        }
        
        if (mediaForAlbum.length === 0) {
            return m.reply('*Gagal memproses pengunduhan gambar.*')
        }
        
        if (typeof conn.sendAlbum === 'function') {
            try {
                await conn.sendAlbum(m.chat, mediaForAlbum, m)
            } catch (albumError) {
                await m.reply(`*Mengirim ${mediaForAlbum.length} gambar secara berurutan...*`)
                await sendImagesWithDelay(conn, m.chat, mediaForAlbum, m, 2000)
            }
        } else {
            await m.reply(`*Mengirim ${mediaForAlbum.length} gambar secara berurutan...*`)
            await sendImagesWithDelay(conn, m.chat, mediaForAlbum, m, 2000)
        }
        
    } catch (error) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Terjadi Kesalahan:* ${error.message}`)
    }
}

handler.help = ['pinterest *query*']
handler.tags = ['internet']
handler.command = /^(pin|pinterest)$/i
handler.limit = false

export default handler