import fetch from 'node-fetch'
import FormData from 'form-data'

async function translate(text, lang) {
    if (!text) return { text: '', src: '' }
    try {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        }
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`
        const res = await fetch(url, options)
        const data = await res.json()
        
        if (data && data[0]) {
            return {
                text: data[0].map(item => item[0]).join(''),
                src: data[2] || 'auto'
            }
        }
        throw new Error('Gagal proses API.')
    } catch (e) {
        throw e
    }
}

async function ocrImage(buffer) {
    try {
        const form = new FormData()
        form.append('base64Image', 'data:image/jpeg;base64,' + buffer.toString('base64'))
        form.append('language', 'eng')
        form.append('apikey', 'helloworld')
        form.append('OCREngine', '2')
        
        const res = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: form
        })
        const json = await res.json()
        
        if (json.IsErroredOnProcessing) throw new Error(json.ErrorMessage)
        if (!json.ParsedResults || json.ParsedResults.length === 0) throw new Error('Gak ada teks yang kebaca.')
        
        return json.ParsedResults[0].ParsedText
    } catch (e) {
        console.error('OCR Error:', e)
        throw new Error('Gagal baca gambar, pastikan gambarnya jelas.')
    }
}

const langMap = {
    'auto': 'Otomatis',
    'ab': 'Abkhaz',
    'ace': 'Aceh',
    'ach': 'Acholi',
    'af': 'Afrikaans',
    'sq': 'Albania',
    'alz': 'Alur',
    'am': 'Amharik',
    'ar': 'Arab',
    'hy': 'Armenia',
    'as': 'Assam',
    'ava': 'Avar',
    'awa': 'Awadhi',
    'ay': 'Aymara',
    'az': 'Azerbaijan',
    'ban': 'Bali',
    'bal': 'Baluchi',
    'bm': 'Bambara',
    'bci': 'Baoule',
    'ba': 'Bashkir',
    'eu': 'Basque',
    'btx': 'Batak Karo',
    'bts': 'Batak Simalungun',
    'bbc': 'Batak Toba',
    'be': 'Belarusia',
    'bem': 'Bemba',
    'bn': 'Bengali',
    'bew': 'Betawi',
    'bho': 'Bhojpuri',
    'bik': 'Bikol',
    'bs': 'Bosnia',
    'br': 'Breton',
    'bg': 'Bulgaria',
    'bua': 'Buryat',
    'yue': 'Kanton',
    'ca': 'Katalan',
    'ceb': 'Cebuano',
    'cha': 'Chamorro',
    'ce': 'Chechen',
    'ny': 'Chichewa',
    'zh-cn': 'Mandarin (Sederhana)',
    'zh-tw': 'Mandarin (Tradisional)',
    'chk': 'Chuukese',
    'cv': 'Chuvash',
    'co': 'Korsika',
    'crh': 'Tatar Krimea',
    'hr': 'Kroasia',
    'cs': 'Ceko',
    'da': 'Denmark',
    'fa-af': 'Dari',
    'dv': 'Dhivehi',
    'din': 'Dinka',
    'doi': 'Dogri',
    'dbe': 'Dombe',
    'nl': 'Belanda',
    'dyu': 'Dyula',
    'dz': 'Dzongkha',
    'en': 'Inggris',
    'eo': 'Esperanto',
    'et': 'Estonia',
    'ee': 'Ewe',
    'fo': 'Faro',
    'fj': 'Fiji',
    'tl': 'Filipina',
    'fi': 'Finlandia',
    'fon': 'Fon',
    'fr': 'Prancis',
    'fy': 'Frisia',
    'ff': 'Fulani',
    'gaa': 'Ga',
    'gl': 'Galicia',
    'lg': 'Ganda',
    'ka': 'Georgia',
    'de': 'Jerman',
    'gom': 'Goan Konkani',
    'el': 'Yunani',
    'gn': 'Guarani',
    'gu': 'Gujarati',
    'ht': 'Kreol Haiti',
    'cnh': 'Hakha Chin',
    'ha': 'Hausa',
    'haw': 'Hawaii',
    'iw': 'Ibrani',
    'hi': 'Hindi',
    'hmn': 'Hmong',
    'hu': 'Hungaria',
    'hrx': 'Hunsrik',
    'iba': 'Iban',
    'is': 'Islandia',
    'ig': 'Igbo',
    'ilo': 'Iloko',
    'id': 'Indonesia',
    'ga': 'Irlandia',
    'it': 'Italia',
    'jam': 'Patois Jamaika',
    'ja': 'Jepang',
    'jw': 'Jawa',
    'kac': 'Jingpo',
    'kl': 'Kalaallisut',
    'kn': 'Kannada',
    'kr': 'Kanuri',
    'pam': 'Kapampangan',
    'kk': 'Kazakh',
    'kha': 'Khasi',
    'km': 'Khmer',
    'cgg': 'Kiga',
    'kg': 'Kikongo',
    'rw': 'Kinyarwanda',
    'ktu': 'Kituba',
    'trp': 'Kokborok',
    'kv': 'Komi',
    'kok': 'Konkani',
    'ko': 'Korea',
    'kri': 'Krio',
    'ku': 'Kurdi (Kurmanji)',
    'ckb': 'Kurdi (Sorani)',
    'ky': 'Kirgistan',
    'lo': 'Lao',
    'ltg': 'Latgalian',
    'la': 'Latin',
    'lv': 'Latvia',
    'lij': 'Ligurian',
    'li': 'Limburgish',
    'ln': 'Lingala',
    'lt': 'Lithuania',
    'lmo': 'Lombard',
    'luo': 'Luo',
    'lb': 'Luksemburg',
    'mk': 'Makedonia',
    'mad': 'Madura',
    'mai': 'Maithili',
    'mak': 'Makassar',
    'mg': 'Malagasi',
    'ms': 'Melayu',
    'ms-arab': 'Melayu (Jawi)',
    'ml': 'Malayalam',
    'mt': 'Malta',
    'mam': 'Mam',
    'gv': 'Manx',
    'mi': 'Maori',
    'mr': 'Marathi',
    'mh': 'Marshallese',
    'mwr': 'Marwadi',
    'mfe': 'Kreol Mauritus',
    'mhr': 'Meadow Mari',
    'mni': 'Meiteilon (Manipuri)',
    'min': 'Minang',
    'lus': 'Mizo',
    'mn': 'Mongolia',
    'my': 'Myanmar (Burma)',
    'nah': 'Nahuatl',
    'ndc': 'Ndau',
    'nr': 'Ndebele (Selatan)',
    'new': 'Newari',
    'ne': 'Nepal',
    'nqo': 'NKo',
    'no': 'Norwegia',
    'nus': 'Nuer',
    'oc': 'Occitan',
    'or': 'Odia',
    'om': 'Oromo',
    'os': 'Ossetia',
    'pag': 'Pangasinan',
    'pap': 'Papiamento',
    'ps': 'Pashto',
    'fa': 'Persia',
    'pl': 'Polandia',
    'pt': 'Portugis',
    'pa': 'Punjabi (Gurmukhi)',
    'pa-pk': 'Punjabi (Shahmukhi)',
    'qu': 'Quechua',
    'kek': 'Qeqchi',
    'rom': 'Romani',
    'ro': 'Rumania',
    'rn': 'Rundi',
    'ru': 'Rusia',
    'sm': 'Samoa',
    'sg': 'Sango',
    'sa': 'Sanskerta',
    'sat': 'Santali',
    'gd': 'Gaelik Skotlandia',
    'nso': 'Sepedi',
    'sr': 'Serbia',
    'st': 'Sesotho',
    'crs': 'Kreol Seychellois',
    'shn': 'Shan',
    'sn': 'Shona',
    'scn': 'Sisilia',
    'szl': 'Silesia',
    'sd': 'Sindhi',
    'si': 'Sinhala',
    'sk': 'Slovakia',
    'sl': 'Slovenia',
    'so': 'Somalia',
    'es': 'Spanyol',
    'su': 'Sunda',
    'sus': 'Susu',
    'sw': 'Swahili',
    'ss': 'Swati',
    'sv': 'Swedia',
    'ty': 'Tahiti',
    'tg': 'Tajik',
    'zgh': 'Tamazight',
    'tzm': 'Tamazight (Tifinagh)',
    'ta': 'Tamil',
    'tt': 'Tatar',
    'te': 'Telugu',
    'tet': 'Tetum',
    'th': 'Thailand',
    'bo': 'Tibet',
    'ti': 'Tigrinya',
    'tiv': 'Tiv',
    'tpi': 'Tok Pisin',
    'to': 'Tonga',
    'ts': 'Tsonga',
    'tn': 'Tswana',
    'tum': 'Tumbuka',
    'tr': 'Turki',
    'tk': 'Turkmen',
    'tyv': 'Tuvan',
    'ak': 'Twi',
    'udm': 'Udmurt',
    'uk': 'Ukraina',
    'ur': 'Urdu',
    'ug': 'Uyghur',
    'uz': 'Uzbek',
    've': 'Venda',
    'vi': 'Vietnam',
    'war': 'Waray',
    'cy': 'Wales',
    'wo': 'Wolof',
    'xh': 'Xhosa',
    'sah': 'Yakut',
    'yi': 'Yiddish',
    'yo': 'Yoruba',
    'yua': 'Yucatec Maya',
    'zap': 'Zapotec',
    'zu': 'Zulu'
};

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let lang = 'id' 
    let contentToTranslate = ''
    let isImage = false

    let args = text.trim().split(/\s+/)
    let firstArg = args[0] ? args[0].toLowerCase() : ''
    
    let isLangCode = Object.keys(langMap).includes(firstArg)

    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''
    
    if (mime && mime.startsWith('image/')) {
        isImage = true
    }

    if (text) {
        if (isLangCode) {
            lang = firstArg
            if (args.length > 1) contentToTranslate = args.slice(1).join(' ')
        } else {
            lang = 'id'
            contentToTranslate = text
        }
    }

    await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } })

    try {
        if (isImage && !contentToTranslate) {
            let media = await q.download()
            m.reply('*Bentar, lagi baca teks di gambarnya...*')
            contentToTranslate = await ocrImage(media)
        } 
        else if (m.quoted && !isImage && !contentToTranslate) {
            contentToTranslate = m.quoted.text || m.quoted.caption || ''
        }

        if (!contentToTranslate.trim()) {
            return m.reply(`*GAK ADA TEKSNYA*\n\nReply gambar atau teks terus ketik \`${usedPrefix + command}\``)
        }

        const result = await translate(contentToTranslate, lang)
        
        const targetName = langMap[lang] || lang.toUpperCase()
        const sourceName = langMap[result.src] || result.src.toUpperCase()

        let caption = `*TRANSLATE RESULT* ${isImage ? '(OCR)' : ''}\n`
        caption += `*${sourceName}* ➔ *${targetName}*\n`
        caption += `__________________________\n\n`
        
        caption += `*TEKS ASLI:*\n`
        caption += `${contentToTranslate.trim()}\n` 
        caption += `__________________________\n\n`
        
        caption += `*TERJEMAHAN:*\n`
        caption += `${result.text}`

        const thumbUrl = 'https://1000logos.net/wp-content/uploads/2020/05/Google-Translate-Logo.png'

        try {
            await conn.sendMessage(m.chat, {
                text: caption,
                contextInfo: {
                    externalAdReply: {
                        title: isImage ? "Image To Text Translate" : "Google Translate",
                        body: `Dari ${sourceName} ke ${targetName}`,
                        thumbnailUrl: thumbUrl, 
                        sourceUrl: 'https://translate.google.com/',
                        mediaType: 1,
                        renderLargerThumbnail: true
                    }
                }
            }, { quoted: m })
        } catch (errSend) {
            await conn.sendMessage(m.chat, { text: caption }, { quoted: m })
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (e) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        console.error(e)
        m.reply(`*GAGAL PROSES*\n\n*Error:* ${e.message}`)
    }
}

handler.help = ['translate *kode*']
handler.tags = ['tools']
handler.command = /^(tr|translate|terjemah)$/i

export default handler