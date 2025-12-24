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
        let results = []
        let bookmark = null
        let keepFetching = true

        while (keepFetching && results.length < limit) {
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
                    if (results.length < limit) {
                        const imageUrl = pin.images?.['736x']?.url || pin.images?.['orig']?.url
                        const pinLink = pin.link || `https://www.pinterest.com/pin/${pin.id}/`
                        
                        if (imageUrl) {
                            results.push({
                                imageUrl: imageUrl,
                                pinLink: pinLink,
                                title: pin.title || pin.grid_title || ''
                            })
                        }
                    }
                })

                bookmark = jsonResponse.resource_response.bookmark
                if (!bookmark || pins.length === 0) keepFetching = false
            } else {
                keepFetching = false
            }
        }

        return results.slice(0, limit)
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
            `Gunakan format berikut:\n` +
            `• ${usedPrefix + command} <query> -img (Output Image)\n` +
            `• ${usedPrefix + command} <query> -stc (Output Sticker)\n\n` +
            `*Contoh:*\n` +
            `• ${usedPrefix + command} alya -img\n` +
            `• ${usedPrefix + command} kucing lucu -stc`
        )
    }

    let isSticker = false
    let query = text

    if (text.toLowerCase().endsWith('-stc')) {
        isSticker = true
        query = text.replace(/-stc$/i, '').trim()
    } else if (text.toLowerCase().endsWith('-img')) {
        isSticker = false
        query = text.replace(/-img$/i, '').trim()
    }

    let loadingMsg = null

    try {
        loadingMsg = await m.reply(`*Sedang mencari ${isSticker ? 'sticker' : 'gambar'} untuk: ${query}...*`)

        const results = await searchPinterestAPI(query, 5)

        if (!results || results.length === 0) {
            if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            return m.reply('*Tidak ada hasil ditemukan.*')
        }

        if (isSticker) {
            
            if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key })
            
            for (let i = 0; i < results.length; i++) {
                try {
                    const buffer = await downloadBuffer(results[i].imageUrl)
                    await conn.sendMessage(m.chat, { 
                        sticker: buffer,
                        packname: global.info?.namabot || 'Pinterest',
                        author: query
                    }, { quoted: m })
                    
                    await new Promise(r => setTimeout(r, 1000))
                } catch (e) {
                    console.error('Error sending sticker:', e)
                }
            }
            
        } else {
            
            const push = []
            
            for (const result of results) {
                try {
                    const buffer = await downloadBuffer(result.imageUrl)
                    const { imageMessage } = await generateWAMessageContent(
                        { image: buffer },
                        { upload: conn.waUploadToServer }
                    )
                    
                    push.push({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: result.title || 'Pinterest Image'
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
                                }
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
        }

    } catch (error) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Error:* ${error.message}`)
    }
}

handler.help = ['pinterest <query> -img/-stc']
handler.tags = ['internet']
handler.command = /^(pin|pinterest)$/i
handler.limit = false

export default handler