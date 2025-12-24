import https from 'https'
import { generateWAMessageContent, generateWAMessageFromContent, proto } from 'baileys'

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
        const maxFetch = 3 // Fetch multiple pages for more variety

        // Fetch multiple pages to get more results
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

        // Shuffle results randomly
        for (let i = allResults.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allResults[i], allResults[j]] = [allResults[j], allResults[i]]
        }

        // Return random selection
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

const handler = async (m, { usedPrefix, command, conn, text }) => {
    if (!text || text.trim() === '') {
        return m.reply(
            `*PINTEREST SEARCH*\n\n` +
            `Gunakan format:\n` +
            `• ${usedPrefix + command} <query>\n\n` +
            `*Contoh:*\n` +
            `• ${usedPrefix + command} alya\n` +
            `• ${usedPrefix + command} kucing lucu\n` +
            `• ${usedPrefix + command} anime aesthetic`
        )
    }

    const query = text.trim()
    let loadingMsg = null

    try {
        loadingMsg = await m.reply(`*Sedang mencari gambar untuk: ${query}...*`)

        const results = await searchPinterestAPI(query, 5)

        if (!results || results.length === 0) {
            if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            return m.reply('*Tidak ada hasil ditemukan.*')
        }

        const push = []
        
        for (const result of results) {
            try {
                const buffer = await downloadBuffer(result.imageUrl)
                const { imageMessage } = await generateWAMessageContent(
                    { image: buffer },
                    { upload: conn.waUploadToServer }
                )
                
                const creatorInfo = result.creatorUsername 
                    ? `\n📌 By: ${result.creatorName} (@${result.creatorUsername})`
                    : result.creatorName !== 'Unknown' 
                    ? `\n📌 By: ${result.creatorName}`
                    : ''

                push.push({
                    body: proto.Message.InteractiveMessage.Body.create({
                        text: (result.title || 'Pinterest Image') + creatorInfo
                    }),
                    footer: proto.Message.InteractiveMessage.Footer.create({
                        text: global.info?.namabot || 'Pinterest Search'
                    }),
                    header: proto.Message.InteractiveMessage.Header.create({
                        title: '',
                        hasMediaAttachment: true,
                        imageMessage: imageMessage
                    }),
                    nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                        buttons: [
                            {
                                name: 'cta_url',
                                buttonParamsJson: JSON.stringify({
                                    display_text: 'Source Link',
                                    url: result.pinLink,
                                    merchant_url: result.pinLink
                                })
                            },
                            ...(result.creatorUrl ? [{
                                name: 'cta_url',
                                buttonParamsJson: JSON.stringify({
                                    display_text: 'Creator Profile',
                                    url: result.creatorUrl,
                                    merchant_url: result.creatorUrl
                                })
                            }] : [])
                        ]
                    })
                })
            } catch (imgError) {
                continue
            }
        }

        if (push.length === 0) {
            if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            return m.reply('*Gagal memuat gambar.*')
        }

        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })

        // Try carousel first
        try {
            const carouselMsg = generateWAMessageFromContent(
                m.chat,
                {
                    viewOnceMessage: {
                        message: {
                            messageContextInfo: {
                                deviceListMetadata: {},
                                deviceListMetadataVersion: 2
                            },
                            interactiveMessage: proto.Message.InteractiveMessage.create({
                                body: proto.Message.InteractiveMessage.Body.create({
                                    text: `*PINTEREST RESULT: ${query.toUpperCase()}*`
                                }),
                                footer: proto.Message.InteractiveMessage.Footer.create({
                                    text: `Tap gambar untuk melihat full size`
                                }),
                                header: proto.Message.InteractiveMessage.Header.create({
                                    hasMediaAttachment: false
                                }),
                                carouselMessage: proto.Message.InteractiveMessage.CarouselMessage.create({
                                    cards: push
                                })
                            })
                        }
                    }
                },
                { quoted: m }
            )

            await conn.relayMessage(m.chat, carouselMsg.message, {
                messageId: carouselMsg.key.id
            })
        } catch (carouselError) {
            // Fallback to regular image sending
            console.error('Carousel failed, using fallback:', carouselError)
            
            await m.reply(`*PINTEREST RESULT: ${query.toUpperCase()}*\n_Mengirim ${results.length} gambar..._`)
            
            for (let i = 0; i < results.length; i++) {
                const result = results[i]
                try {
                    const buffer = await downloadBuffer(result.imageUrl)
                    
                    const creatorInfo = result.creatorUsername 
                        ? `📌 By: ${result.creatorName} (@${result.creatorUsername})`
                        : result.creatorName !== 'Unknown' 
                        ? `📌 By: ${result.creatorName}`
                        : ''
                    
                    const caption = `*${result.title || 'Pinterest Image'}*\n${creatorInfo}\n\n🔗 Source: ${result.pinLink}${result.creatorUrl ? `\n👤 Profile: ${result.creatorUrl}` : ''}`
                    
                    await conn.sendMessage(m.chat, {
                        image: buffer,
                        caption: caption
                    }, { quoted: m })
                    
                    // Delay to avoid flooding
                    if (i < results.length - 1) {
                        await new Promise(r => setTimeout(r, 1500))
                    }
                } catch (sendError) {
                    console.error(`Failed to send image ${i + 1}:`, sendError)
                }
            }
        }

    } catch (error) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Error:* ${error.message}`)
    }
}

handler.help = ['pinterest <query>']
handler.tags = ['internet']
handler.command = /^(pin|pinterest)$/i
handler.limit = false

export default handler