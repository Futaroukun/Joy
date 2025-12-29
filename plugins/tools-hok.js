import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

async function translate(text, lang = 'id') {
    if (!text) return ''
    try {
        const limit = 2500
        const shortText = text.length > limit ? text.substring(0, limit) + '... (lanjut di web)' : text
        
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(shortText)}`
        const res = await fetch(url)
        const data = await res.json()
        return data[0].map(x => x[0]).join('')
    } catch (e) {
        return text
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(`*Masukan nama hero*\n\nContoh:\n*${usedPrefix + command} Lu ban*`)
    }
    
    let loadingMsg = null
    try {
        loadingMsg = await m.reply('*Tunggu bentar, lagi ambil data stats, skill, sama lore heronya...*')
        
        const apiBase = 'https://honor-of-kings.fandom.com/api.php'
        
        const searchRes = await fetch(`${apiBase}?action=query&list=search&srsearch=${text}&limit=1&format=json`)
        const searchJson = await searchRes.json()
        
        if (!searchJson.query?.search?.length) {
            throw new Error(`Hero *${text}* gak ketemu.`)
        }
        
        const pageTitle = searchJson.query.search[0].title
        
        const detailRes = await fetch(`${apiBase}?action=parse&page=${pageTitle}&prop=text|images&format=json&disablepp=1`)
        const detailJson = await detailRes.json()
        
        if (!detailJson.parse?.text) {
            throw new Error('Gagal ambil isi halamannya.')
        }
        
        const html = detailJson.parse.text['*']
        const $ = cheerio.load(html)
        
        let imageUrl = $('.portable-infobox .pi-image-thumbnail').attr('src')
        if (imageUrl) {
            imageUrl = imageUrl.split('/revision')[0]
        } else {
            imageUrl = 'https://static.wikia.nocookie.net/honorofkings/images/e/e6/Site-logo.png'
        }
        
        let infoBoxData = []
        $('.portable-infobox .pi-item').each((i, el) => {
            if ($(el).hasClass('pi-data')) {
                const label = $(el).find('.pi-data-label').text().trim()
                const value = $(el).find('.pi-data-value').text().trim()
                if (label && value) {
                    infoBoxData.push({ type: 'data', label, value })
                }
            }
            else if ($(el).hasClass('pi-header')) {
                const header = $(el).text().trim()
                infoBoxData.push({ type: 'header', text: header })
            }
        })
        
        let skills = []
        let abilityHeader = $('h2').filter((i, el) => $(el).text().trim().includes('Abilities') || $(el).text().trim().includes('Skills'))
        
        if (abilityHeader.length > 0) {
            let nextElem = abilityHeader.next()
            let currentName = ''
            let currentDesc = ''
            
            while (nextElem.length > 0) {
                const tagName = nextElem[0].name
                if (tagName === 'h2') break
                
                if (tagName === 'h3') {
                    if (currentName) skills.push({ name: currentName, desc: currentDesc })
                    currentName = nextElem.find('.mw-headline').text().trim() || nextElem.text().trim()
                    currentDesc = ''
                }
                
                if (['div', 'p', 'table'].includes(tagName)) {
                    const t = nextElem.text().trim()
                    if (t && t.length > 5) currentDesc += t + '\n'
                }
                nextElem = nextElem.next()
            }
            if (currentName) skills.push({ name: currentName, desc: currentDesc })
        }
        
        skills = skills.map((s, index) => {
            let label = ''
            if (index === 0) label = '[PASIF]'
            else if (index === skills.length - 1) label = '[ULTIMATE]'
            else label = `[SKILL ${index}]`
            return { label, ...s }
        })
        
        const getSectionContent = (keywords) => {
            let content = ''
            $('h2, h3').each((i, el) => {
                const headerText = $(el).text().toLowerCase().trim()
                if (keywords.some(k => headerText.includes(k))) {
                    let nextElem = $(el).next()
                    while (nextElem.length > 0) {
                        const tagName = nextElem[0].name
                        if (tagName === 'h2' || tagName === 'h3') break
                        if (tagName === 'p') {
                            const paraText = nextElem.text().trim()
                            if (paraText) content += paraText + '\n\n'
                        }
                        nextElem = nextElem.next()
                    }
                }
            })
            return content
        }
        
        let loreText = getSectionContent(['lore', 'story', 'background'])
        if (!loreText) loreText = getSectionContent(['biography', 'history'])
        if (!loreText) loreText = $('.mw-parser-output > p').first().text().trim()
        
        const translateQueue = [
            translate(loreText, 'id'),
            ...skills.map(s => translate(s.desc, 'id'))
        ]
        
        const translations = await Promise.all(translateQueue)
        
        const indoLore = translations[0]
        skills.forEach((s, i) => {
            s.indoDesc = translations[i + 1]
        })
        
        const role = infoBoxData.find(d => d.label?.toLowerCase() === 'role')?.value || 'N/A'
        const specialty = infoBoxData.find(d => d.label?.toLowerCase() === 'specialty')?.value || 'N/A'
        const wikiUrl = `https://honor-of-kings.fandom.com/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`
        
        let message = `*${pageTitle.toUpperCase()} - DETAIL HERO*\n\n`
        
        message += `*BIO & INFO*\n`
        infoBoxData.forEach(item => {
            if (item.type === 'data') {
                message += `* ${item.label}: ${item.value}\n`
            }
        })
        message += `\n`
        
        message += `*SKILLS*\n`
        if (skills.length > 0) {
            skills.forEach(s => {
                message += `*${s.label} ${s.name}*\n`
                message += `${s.indoDesc.trim() || 'Gak ada deskripsi.'}\n\n`
            })
        } else {
            message += `Gagal ambil data skill.\n\n`
        }
        
        message += `*LORE*\n`
        message += `${indoLore || "Gak ada cerita tersedia."}\n`
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        await conn.sendMessage(m.chat, {
            image: { url: imageUrl },
            caption: message.trim(),
            contextInfo: {
                externalAdReply: {
                    title: `${pageTitle.toUpperCase()}`,
                    body: `Role: ${role} | Specialty: ${specialty}`,
                    thumbnailUrl: imageUrl,
                    sourceUrl: wikiUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })
            
        
    } catch (error) {
        console.error(error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*Gagal:* ${error.message}`)
    }
}

handler.help = ['hok *nama*']
handler.tags = ['tools']
handler.command = /^(hok|honorofkings)$/i
handler.limit = false

export default handler