import fetch from 'node-fetch'
import FormData from 'form-data'

const LANG_MAP = {
    'auto': 'Otomatis', 'ab': 'Abkhaz', 'ace': 'Aceh', 'ach': 'Acholi',
    'af': 'Afrikaans', 'sq': 'Albania', 'alz': 'Alur', 'am': 'Amharik',
    'ar': 'Arab', 'hy': 'Armenia', 'as': 'Assam', 'ava': 'Avar',
    'awa': 'Awadhi', 'ay': 'Aymara', 'az': 'Azerbaijan', 'ban': 'Bali',
    'bal': 'Baluchi', 'bm': 'Bambara', 'bci': 'Baoule', 'ba': 'Bashkir',
    'eu': 'Basque', 'btx': 'Batak Karo', 'bts': 'Batak Simalungun',
    'bbc': 'Batak Toba', 'be': 'Belarusia', 'bem': 'Bemba', 'bn': 'Bengali',
    'bew': 'Betawi', 'bho': 'Bhojpuri', 'bik': 'Bikol', 'bs': 'Bosnia',
    'br': 'Breton', 'bg': 'Bulgaria', 'bua': 'Buryat', 'yue': 'Kanton',
    'ca': 'Katalan', 'ceb': 'Cebuano', 'cha': 'Chamorro', 'ce': 'Chechen',
    'ny': 'Chichewa', 'zh-cn': 'Mandarin (Sederhana)', 'zh-tw': 'Mandarin (Tradisional)',
    'chk': 'Chuukese', 'cv': 'Chuvash', 'co': 'Korsika', 'crh': 'Tatar Krimea',
    'hr': 'Kroasia', 'cs': 'Ceko', 'da': 'Denmark', 'fa-af': 'Dari',
    'dv': 'Dhivehi', 'din': 'Dinka', 'doi': 'Dogri', 'dbe': 'Dombe',
    'nl': 'Belanda', 'dyu': 'Dyula', 'dz': 'Dzongkha', 'en': 'Inggris',
    'eo': 'Esperanto', 'et': 'Estonia', 'ee': 'Ewe', 'fo': 'Faro',
    'fj': 'Fiji', 'tl': 'Filipina', 'fi': 'Finlandia', 'fon': 'Fon',
    'fr': 'Prancis', 'fy': 'Frisia', 'ff': 'Fulani', 'gaa': 'Ga',
    'gl': 'Galicia', 'lg': 'Ganda', 'ka': 'Georgia', 'de': 'Jerman',
    'gom': 'Goan Konkani', 'el': 'Yunani', 'gn': 'Guarani', 'gu': 'Gujarati',
    'ht': 'Kreol Haiti', 'cnh': 'Hakha Chin', 'ha': 'Hausa', 'haw': 'Hawaii',
    'iw': 'Ibrani', 'hi': 'Hindi', 'hmn': 'Hmong', 'hu': 'Hungaria',
    'hrx': 'Hunsrik', 'iba': 'Iban', 'is': 'Islandia', 'ig': 'Igbo',
    'ilo': 'Iloko', 'id': 'Indonesia', 'ga': 'Irlandia', 'it': 'Italia',
    'jam': 'Patois Jamaika', 'ja': 'Jepang', 'jw': 'Jawa', 'kac': 'Jingpo',
    'kl': 'Kalaallisut', 'kn': 'Kannada', 'kr': 'Kanuri', 'pam': 'Kapampangan',
    'kk': 'Kazakh', 'kha': 'Khasi', 'km': 'Khmer', 'cgg': 'Kiga',
    'kg': 'Kikongo', 'rw': 'Kinyarwanda', 'ktu': 'Kituba', 'trp': 'Kokborok',
    'kv': 'Komi', 'kok': 'Konkani', 'ko': 'Korea', 'kri': 'Krio',
    'ku': 'Kurdi (Kurmanji)', 'ckb': 'Kurdi (Sorani)', 'ky': 'Kirgistan',
    'lo': 'Lao', 'ltg': 'Latgalian', 'la': 'Latin', 'lv': 'Latvia',
    'lij': 'Ligurian', 'li': 'Limburgish', 'ln': 'Lingala', 'lt': 'Lithuania',
    'lmo': 'Lombard', 'luo': 'Luo', 'lb': 'Luksemburg', 'mk': 'Makedonia',
    'mad': 'Madura', 'mai': 'Maithili', 'mak': 'Makassar', 'mg': 'Malagasi',
    'ms': 'Melayu', 'ms-arab': 'Melayu (Jawi)', 'ml': 'Malayalam', 'mt': 'Malta',
    'mam': 'Mam', 'gv': 'Manx', 'mi': 'Maori', 'mr': 'Marathi',
    'mh': 'Marshallese', 'mwr': 'Marwadi', 'mfe': 'Kreol Mauritus',
    'mhr': 'Meadow Mari', 'mni': 'Meiteilon (Manipuri)', 'min': 'Minang',
    'lus': 'Mizo', 'mn': 'Mongolia', 'my': 'Myanmar (Burma)', 'nah': 'Nahuatl',
    'ndc': 'Ndau', 'nr': 'Ndebele (Selatan)', 'new': 'Newari', 'ne': 'Nepal',
    'nqo': 'NKo', 'no': 'Norwegia', 'nus': 'Nuer', 'oc': 'Occitan',
    'or': 'Odia', 'om': 'Oromo', 'os': 'Ossetia', 'pag': 'Pangasinan',
    'pap': 'Papiamento', 'ps': 'Pashto', 'fa': 'Persia', 'pl': 'Polandia',
    'pt': 'Portugis', 'pa': 'Punjabi (Gurmukhi)', 'pa-pk': 'Punjabi (Shahmukhi)',
    'qu': 'Quechua', 'kek': 'Qeqchi', 'rom': 'Romani', 'ro': 'Rumania',
    'rn': 'Rundi', 'ru': 'Rusia', 'sm': 'Samoa', 'sg': 'Sango',
    'sa': 'Sanskerta', 'sat': 'Santali', 'gd': 'Gaelik Skotlandia',
    'nso': 'Sepedi', 'sr': 'Serbia', 'st': 'Sesotho', 'crs': 'Kreol Seychellois',
    'shn': 'Shan', 'sn': 'Shona', 'scn': 'Sisilia', 'szl': 'Silesia',
    'sd': 'Sindhi', 'si': 'Sinhala', 'sk': 'Slovakia', 'sl': 'Slovenia',
    'so': 'Somalia', 'es': 'Spanyol', 'su': 'Sunda', 'sus': 'Susu',
    'sw': 'Swahili', 'ss': 'Swati', 'sv': 'Swedia', 'ty': 'Tahiti',
    'tg': 'Tajik', 'zgh': 'Tamazight', 'tzm': 'Tamazight (Tifinagh)',
    'ta': 'Tamil', 'tt': 'Tatar', 'te': 'Telugu', 'tet': 'Tetum',
    'th': 'Thailand', 'bo': 'Tibet', 'ti': 'Tigrinya', 'tiv': 'Tiv',
    'tpi': 'Tok Pisin', 'to': 'Tonga', 'ts': 'Tsonga', 'tn': 'Tswana',
    'tum': 'Tumbuka', 'tr': 'Turki', 'tk': 'Turkmen', 'tyv': 'Tuvan',
    'ak': 'Twi', 'udm': 'Udmurt', 'uk': 'Ukraina', 'ur': 'Urdu',
    'ug': 'Uyghur', 'uz': 'Uzbek', 've': 'Venda', 'vi': 'Vietnam',
    'war': 'Waray', 'cy': 'Wales', 'wo': 'Wolof', 'xh': 'Xhosa',
    'sah': 'Yakut', 'yi': 'Yiddish', 'yo': 'Yoruba', 'yua': 'Yucatec Maya',
    'zap': 'Zapotec', 'zu': 'Zulu'
};

const LANG_ALIASES = {
    'id': 'id', 'indo': 'id', 'indonesia': 'id',
    'en': 'en', 'eng': 'en', 'inggris': 'en', 'english': 'en',
    'ja': 'ja', 'jp': 'ja', 'jpn': 'ja', 'jepang': 'ja', 'japan': 'ja', 'japanese': 'ja',
    'ko': 'ko', 'kor': 'ko', 'korea': 'ko', 'korean': 'ko',
    'ar': 'ar', 'arab': 'ar', 'arabic': 'ar',
    'zh': 'zh-cn', 'cn': 'zh-cn', 'mandarin': 'zh-cn', 'chinese': 'zh-cn', 'cina': 'zh-cn',
    'tw': 'zh-tw', 'taiwan': 'zh-tw',
    'ru': 'ru', 'rusia': 'ru', 'russian': 'ru',
    'de': 'de', 'jerman': 'de', 'german': 'de',
    'fr': 'fr', 'prancis': 'fr', 'french': 'fr',
    'es': 'es', 'spanyol': 'es', 'spanish': 'es',
    'it': 'it', 'italia': 'it', 'italian': 'it',
    'jw': 'jw', 'jv': 'jw', 'jawa': 'jw', 'javanese': 'jw',
    'su': 'su', 'sunda': 'su', 'sundanese': 'su',
    'th': 'th', 'thai': 'th', 'thailand': 'th',
    'vi': 'vi', 'viet': 'vi', 'vietnam': 'vi',
    'ms': 'ms', 'melayu': 'ms', 'malay': 'ms',
    'pt': 'pt', 'portugis': 'pt', 'portuguese': 'pt',
    'tr': 'tr', 'turki': 'tr', 'turkish': 'tr',
    'nl': 'nl', 'belanda': 'nl', 'dutch': 'nl',
    'la': 'la', 'latin': 'la',
    'hi': 'hi', 'hindi': 'hi', 'india': 'hi',
    'tl': 'tl', 'filipina': 'tl', 'tagalog': 'tl', 'pinoy': 'tl', 'fil': 'tl'
};

function resolveLang(input) {
    if (!input) return null;
    const lower = input.toLowerCase().trim();
    if (LANG_ALIASES[lower]) return LANG_ALIASES[lower];
    if (LANG_MAP[lower]) return lower;
    return null;
}

function parseTranslationInput(rawText) {
    if (!rawText) return { targetLang: 'id', sourceLang: 'auto', content: '', wantAudio: false };

    let text = rawText.trim();
    let wantAudio = false;

    if (/--vn\b|--audio\b|-v\b/i.test(text)) {
        wantAudio = true;
        text = text.replace(/--vn\b|--audio\b|-v\b/gi, '').trim();
    }

    const args = text.split(/\s+/);
    const firstArg = args[0] || '';

    // 1. Check pair format: id>en, en:ja, id-fr, etc.
    const pairMatch = firstArg.match(/^([a-zA-Z\-]+)(?:>|:|->|=>|-)([a-zA-Z\-]+)$/);
    if (pairMatch) {
        const src = resolveLang(pairMatch[1]);
        const tgt = resolveLang(pairMatch[2]);
        if (tgt) {
            return {
                targetLang: tgt,
                sourceLang: src || 'auto',
                content: args.slice(1).join(' ').trim(),
                wantAudio
            };
        }
    }

    // 2. Check single lang target in firstArg
    const resolvedTgt = resolveLang(firstArg);
    if (resolvedTgt) {
        return {
            targetLang: resolvedTgt,
            sourceLang: 'auto',
            content: args.slice(1).join(' ').trim(),
            wantAudio
        };
    }

    // 3. Default to id target with all text as content
    return {
        targetLang: 'id',
        sourceLang: 'auto',
        content: text.trim(),
        wantAudio
    };
}

async function translate(text, targetLang = 'id', sourceLang = 'auto') {
    if (!text || !text.trim()) return { text: '', src: '', romaji: '' };

    // 1. Primary: Google Translate (dict-chrome-ex client)
    try {
        let sl = sourceLang;
        let url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${sl}&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
        let res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        let data = await res.json();
        let detected = (data?.[2] || sl).toLowerCase();

        // Fix 1: Auto-detection returned the same language as target (e.g. 'halo' detected as 'en')
        if (sourceLang === 'auto' && detected === targetLang.toLowerCase()) {
            const fallbackSrc = targetLang.toLowerCase() === 'id' ? 'en' : 'id';
            url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${fallbackSrc}&tl=${targetLang}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;
            res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 8000
            });
            const reData = await res.json();
            if (reData?.[0]) {
                data = reData;
                detected = fallbackSrc;
            }
        }

        // Fix 2: Auto-detected Malay ('ms') normalized to Indonesian ('id') in bot context
        if (sourceLang === 'auto' && detected === 'ms') {
            detected = 'id';
        }

        if (Array.isArray(data?.[0])) {
            let translatedText = '';
            let romaji = '';
            for (const item of data[0]) {
                if (item[0]) {
                    translatedText += item[0];
                }
                if (item[2]) {
                    romaji += (romaji ? ' ' : '') + item[2];
                }
            }
            return { text: translatedText.trim(), src: detected, romaji: romaji.trim() };
        }
    } catch (err) {
        console.error('[Google Translate Error]', err.message);
    }

    // 2. Secondary Fallback: MyMemory API
    try {
        const pair = `${sourceLang === 'auto' ? 'autodetect' : sourceLang}|${targetLang}`;
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(pair)}`;
        const res = await fetch(url, { timeout: 8000 });
        const data = await res.json();
        if (data?.responseData?.translatedText) {
            let detected = data.responseData.detectedLanguage || sourceLang;
            if (sourceLang === 'auto' && detected.toLowerCase() === 'ms') {
                detected = 'id';
            }
            return {
                text: data.responseData.translatedText.trim(),
                src: detected,
                romaji: ''
            };
        }
    } catch (err2) {
        console.error('[MyMemory Translate Error]', err2.message);
    }

    throw new Error('Gagal memproses terjemahan dari semua server.');
}

async function getTTSAudio(text, lang = 'ja') {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.slice(0, 200))}&tl=${lang}&client=tw-ob`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        if (!res.ok) return null;
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (e) {
        console.error('[TTS Audio Error]', e.message);
        return null;
    }
}

async function ocrImage(buffer) {
    try {
        const form = new FormData();
        form.append('base64Image', 'data:image/jpeg;base64,' + buffer.toString('base64'));
        form.append('language', 'eng');
        form.append('apikey', 'helloworld');
        form.append('OCREngine', '2');

        const res = await fetch('https://api.ocr.space/parse/image', {
            method: 'POST',
            body: form,
            timeout: 15000
        });
        const json = await res.json();

        if (json.IsErroredOnProcessing) throw new Error(json.ErrorMessage);
        if (!json.ParsedResults?.length) throw new Error('Tidak ada teks yang terdeteksi pada gambar.');

        return json.ParsedResults[0].ParsedText.trim();
    } catch (e) {
        console.error('OCR Error:', e);
        throw new Error('Gagal membaca teks dari gambar. Pastikan gambar cukup jelas.');
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const rawText = text?.trim() || '';
    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || '';
    const isImage = mime.startsWith('image/');

    const parsed = parseTranslationInput(rawText);
    let { targetLang, sourceLang, content: contentToTranslate, wantAudio } = parsed;

    // Tampilkan bantuan jika tidak ada input sama sekali
    if (!rawText && !isImage && !m.quoted) {
        return m.reply(
            `╭── ✦ *GOOGLE TRANSLATE* ✦\n` +
            `• Terjemahkan teks atau OCR gambar ke berbagai bahasa dengan pelafalan & audio.\n\n` +
            `*Format Penggunaan:*\n` +
            `› \`${usedPrefix + command} <teks>\` (Default: Indonesia)\n` +
            `› \`${usedPrefix + command} <bahasa> <teks>\`\n` +
            `› \`${usedPrefix + command} <asal>><tujuan> <teks>\`\n` +
            `› Tambahkan flag \`--vn\` untuk kirim voice note audio\n` +
            `› Reply teks/gambar + \`${usedPrefix + command} [bahasa]\`\n\n` +
            `*Contoh:*\n` +
            `› \`${usedPrefix + command} selamat pagi\`\n` +
            `› \`${usedPrefix + command} en terima kasih banyak\`\n` +
            `› \`${usedPrefix + command} ja halo apa kabar --vn\`\n` +
            `› \`${usedPrefix + command} id>ja selamat datang\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });

    try {
        // Ambil teks dari gambar via OCR
        if (isImage && !contentToTranslate) {
            const media = await q.download();
            await m.reply('_Sedang membaca teks dari gambar..._');
            contentToTranslate = await ocrImage(media);
        }

        // Ambil teks dari pesan yang di-reply
        if (m.quoted && !isImage && !contentToTranslate) {
            contentToTranslate = m.quoted.text || m.quoted.caption || '';
        }

        if (!contentToTranslate.trim()) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply('Tidak ada teks yang dapat diterjemahkan.');
        }

        const result = await translate(contentToTranslate, targetLang, sourceLang);
        const sourceCode = result.src.toLowerCase();
        const targetCode = targetLang.toLowerCase();

        const sourceName = LANG_MAP[sourceCode] || result.src.toUpperCase();
        const targetName = LANG_MAP[targetCode] || targetLang.toUpperCase();

        let caption = `╭── ✦ *GOOGLE TRANSLATE${isImage ? ' (OCR)' : ''}* ✦\n`;
        caption += `• *Bahasa:* ${sourceName} ➔ ${targetName}\n\n`;
        caption += `*Teks Asli:*\n${contentToTranslate.trim()}\n\n`;
        caption += `*Hasil Terjemahan:*\n${result.text}`;

        if (result.romaji && result.romaji.toLowerCase() !== result.text.toLowerCase()) {
            caption += `\n\n*Pelafalan / Romaji:*\n_${result.romaji}_`;
        }
        caption += `\n╰━━━━━━━━━━━━━━━━━━━━━━━`;

        try {
            await conn.sendMessage(m.chat, {
                text: caption,
                contextInfo: {
                    externalAdReply: {
                        title: isImage ? 'Terjemahan Gambar (OCR)' : 'Google Translate',
                        body: `${sourceName} ➔ ${targetName}`,
                        thumbnailUrl: 'https://1000logos.net/wp-content/uploads/2020/05/Google-Translate-Logo.png',
                        mediaType: 1,
                        renderLargerThumbnail: false
                    }
                }
            }, { quoted: m });
        } catch {
            await conn.sendMessage(m.chat, { text: caption }, { quoted: m });
        }

        // Kirim audio VN jika flag diminta
        if (wantAudio) {
            const audioBuffer = await getTTSAudio(result.text, targetCode);
            if (audioBuffer) {
                await conn.sendMessage(m.chat, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp4',
                    ptt: true
                }, { quoted: m });
            }
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error('[TRANSLATE ERROR]', e);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply(`*Gagal menerjemahkan:*\n${e.message}`);
    }
};

handler.help    = ['translate *kode teks*']
handler.tags    = ['tools']
handler.command = /^(translate|tr|terjemah|terjemahkan)$/i

export default handler