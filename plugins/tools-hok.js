import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

async function translate(text, lang = 'id') {
    if (!text) return ''
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
        const res = await fetch(url)
        const data = await res.json()
        return data[0].map(x => x[0]).join('')
    } catch (e) {
        return text
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*HONOR OF KINGS HERO DATABASE*\n` +
            `---------------------------------------\n` +
            `Cari dan tampilkan informasi lengkap mengenai hero pilihan Anda:\n` +
            `- Statistik Dasar & Biodata Hero (Role, Lane, Faction, dll)\n` +
            `- Panduan Skill (Pasif, Aktif, & Ultimate termasuk hero multi-form)\n` +
            `- Kisah Asal-usul (Lore) yang diterjemahkan ke Bahasa Indonesia\n\n` +
            `*Cara Penggunaan:*\n` +
            `\`${usedPrefix + command} <nama hero>\`\n\n` +
            `*Contoh Pencarian:*\n` +
            `\`${usedPrefix + command} Mulan\`\n` +
            `\`${usedPrefix + command} Lu Ban\`\n` +
            `---------------------------------------`
        )
    }
    
    let loadingMsg = null
    try {
        loadingMsg = await m.reply(
            `*DATABASE HOK*\n` +
            `---------------------------------------\n` +
            `Menghubungi server wiki untuk mengunduh biodata, kemampuan skill, dan menerjemahkan lore hero. Mohon tunggu sebentar...\n` +
            `---------------------------------------`
        )
        
        const apiBase = 'https://honor-of-kings.fandom.com/api.php'
        
        // 1. CARI HERO
        const searchRes = await fetch(`${apiBase}?action=query&list=search&srsearch=${text}&limit=1&format=json`)
        const searchJson = await searchRes.json()
        
        // Kalau hasil pencarian kosong, lempar error khusus
        if (!searchJson.query?.search?.length) {
            throw new Error('Hero_Not_Found')
        }
        
        const pageTitle = searchJson.query.search[0].title
        
        // 2. AMBIL DETAIL HALAMAN
        const detailRes = await fetch(`${apiBase}?action=parse&page=${pageTitle}&prop=text|images&format=json&disablepp=1`)
        const detailJson = await detailRes.json()
        
        if (!detailJson.parse?.text) {
            throw new Error('Parse_Failed')
        }
        
        const html = detailJson.parse.text['*']
        const $ = cheerio.load(html)
        
        // 3. AMBIL GAMBAR (DENGAN SAFE FALLBACK)
        let imageUrl = $('.portable-infobox .pi-image-thumbnail').attr('src')
        if (imageUrl) {
            imageUrl = imageUrl.split('/revision')[0]
        } else {
            // Gambar default yang stabil (Logo HoK dari Wikipedia)
            // Gambar wikia static sering error/forbidden buat bot
            imageUrl = 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e6/Honor_of_Kings_Logo.png/250px-Honor_of_Kings_Logo.png'
        }
        
        // 4. SCRAPING INFO
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
        
        // 5. SCRAPING SKILL
        let skills = []
        let abilityHeader = $('h2').filter((i, el) => $(el).text().trim().includes('Abilities') || $(el).text().trim().includes('Skills'))
        
        if (abilityHeader.length > 0) {
            let nextElem = abilityHeader.next()
            let sectionElements = []
            
            while (nextElem.length > 0) {
                if (nextElem[0].name === 'h2') break
                sectionElements.push(nextElem)
                nextElem = nextElem.next()
            }

            let currentName = ''
            let currentDesc = ''

            const processNode = (node) => {
                const tagName = node[0].name
                if (tagName === 'h3') {
                    if (currentName) {
                        skills.push({ name: currentName, desc: currentDesc.trim() })
                    }
                    currentName = node.find('.mw-headline').text().trim() || node.text().trim()
                    currentDesc = ''
                } else if (['p', 'div', 'table'].includes(tagName)) {
                    if (node.find('h3').length > 0) {
                        node.children().each((i, child) => {
                            processNode($(child))
                        })
                    } else {
                        const text = node.text().trim()
                        if (text && text.length > 5) {
                            if (!node.hasClass('wds-tabs__wrapper')) {
                                currentDesc += text + '\n'
                            }
                        }
                    }
                }
            }

            sectionElements.forEach(elem => {
                processNode(elem)
            })

            if (currentName) {
                skills.push({ name: currentName, desc: currentDesc.trim() })
            }
        }
        
        skills = skills.map((s, index) => {
            let label = ''
            if (index === 0) label = '[PASIF]'
            else if (index === skills.length - 1) label = '[ULTIMATE]'
            else label = `[SKILL ${index}]`
            return { label, ...s }
        })
        
        // 6. SCRAPING LORE
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
        
        const limit = 2000
        let isLoreTruncated = false
        if (loreText.length > limit) {
            let truncated = loreText.substring(0, limit)
            const lastDot = truncated.lastIndexOf('.')
            if (lastDot > 1000) {
                loreText = truncated.substring(0, lastDot + 1)
            } else {
                loreText = truncated
            }
            isLoreTruncated = true
        }

        // 7. TRANSLATE
        const translateQueue = [
            translate(loreText, 'id'),
            ...skills.map(s => translate(s.desc, 'id'))
        ]
        
        const translations = await Promise.all(translateQueue)
        
        let finalLore = translations[0]
        if (isLoreTruncated) {
            const wikiUrl = `https://honor-of-kings.fandom.com/wiki/${encodeURIComponent(pageTitle.replace(/ /g, '_'))}`
            finalLore = finalLore.trim() + `\n\nLanjutan kisah selengkapnya bisa dibaca di: ${wikiUrl}`
        }

        skills.forEach((s, i) => {
            s.indoDesc = translations[i + 1]
        })
        
        const species = infoBoxData.find(d => d.label?.toLowerCase() === 'species')?.value || 'N/A'
        const role = infoBoxData.find(d => d.label?.toLowerCase() === 'role')?.value || 'N/A'
        const specialty = infoBoxData.find(d => d.label?.toLowerCase() === 'specialty')?.value || 'N/A'
        const lanes = infoBoxData.find(d => d.label?.toLowerCase() === 'lanes' || d.label?.toLowerCase() === 'lane')?.value || 'N/A'
        const faction = infoBoxData.find(d => d.label?.toLowerCase() === 'faction')?.value || 'N/A'
        const price = infoBoxData.find(d => d.label?.toLowerCase() === 'price')?.value || 'N/A'

        // 8. SUSUN PESAN
        let captionMessage = `*HONOR OF KINGS HERO PROFILE*\n` +
            `---------------------------------------\n` +
            `Hero: *${pageTitle.toUpperCase()}* (Species: ${species})\n` +
            `Role: *${role}* | Specialty: *${specialty}*\n` +
            `Lanes: *${lanes}* | Faction: *${faction}*\n` +
            `Price: *${price}*\n` +
            `---------------------------------------`
        
        let detailMessage = `*ABILITAS & SKILL*\n` +
            `---------------------------------------\n`
        if (skills.length > 0) {
            skills.forEach(s => {
                detailMessage += `${s.label} *${s.name}*\n`
                detailMessage += `${s.indoDesc.trim() || 'Deskripsi tidak tersedia.'}\n\n`
            })
            detailMessage += `---------------------------------------\n\n`
        } else {
            detailMessage += `Data skill tidak tersedia.\n` +
                `---------------------------------------\n\n`
        }
        
        detailMessage += `*LATAR BELAKANG / LORE*\n`
        detailMessage += `${finalLore || "Lore tidak tersedia."}\n`
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        // 9. KIRIM PESAN (SAFE MODE)
        try {
            await conn.sendMessage(m.chat, {
                image: { url: imageUrl },
                caption: captionMessage.trim()
            }, { quoted: m })
            
            await conn.sendMessage(m.chat, {
                text: detailMessage.trim()
            }, { quoted: m })
        } catch (sendErr) {
            // Jika gambar gagal, kirim teks saja
            console.log('Gambar error, kirim teks only')
            const fallbackMessage = captionMessage + '\n\n' + detailMessage
            await m.reply(fallbackMessage.trim())
        }
            
    } catch (error) {
        console.error(error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        
        // --- PESAN ERROR YANG DIMINTA ---
        m.reply(`*Hero tidak ditemukan.*\n\nPastikan nama hero sudah benar. Contoh: \`${usedPrefix + command} Lu Ban\``)
    }
}

handler.help = ['hok *nama*']
handler.tags = ['tools']
handler.command = /^(hok|honorofkings)$/i
handler.limit = false

export default handler