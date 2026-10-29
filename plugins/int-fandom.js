import axios from 'axios';
import * as cheerio from 'cheerio';

const WIKI_ALIASES = {
    'genshin': 'genshin-impact',
    'gi': 'genshin-impact',
    'hsr': 'honkai-star-rail',
    'starrail': 'honkai-star-rail',
    'hi3': 'houkai3rd',
    'honkai': 'houkai3rd',
    'zzz': 'zenless-zone-zero',
    'wuwa': 'wutheringwaves',
    'wuthering': 'wutheringwaves',
    'op': 'onepiece',
    'onepiece': 'onepiece',
    'jjk': 'jujutsu-kaisen',
    'jujutsu': 'jujutsu-kaisen',
    'naruto': 'naruto',
    'boruto': 'naruto',
    'bleach': 'bleach',
    'dbz': 'dragonball',
    'dragonball': 'dragonball',
    'mha': 'myheroacademia',
    'bnha': 'myheroacademia',
    'aot': 'attackontitan',
    'titan': 'attackontitan',
    'csm': 'chainsaw-man',
    'chainsawman': 'chainsaw-man',
    'pokemon': 'pokemon',
    'mc': 'minecraft',
    'minecraft': 'minecraft',
    'roblox': 'roblox',
    'terraria': 'terraria',
    'fgo': 'typemoon',
    'fate': 'typemoon',
    'ba': 'bluearchive',
    'bluearchive': 'bluearchive',
    'arknights': 'arknights',
    'er': 'eldenring',
    'eldenring': 'eldenring',
    'marvel': 'marvel',
    'dc': 'dc',
    'mlp': 'mlp',
    'undertale': 'undertale',
    'deltarune': 'undertale',
    'jojo': 'jjba',
    'jjba': 'jjba',
    'gotoubun': '5hanayome',
    '5toubun': '5hanayome',
    'hxh': 'hunterxhunter',
    'hunter': 'hunterxhunter',
    'darksouls': 'darksouls',
    'overwatch': 'overwatch',
    'valorant': 'valorant',
    'lol': 'leagueoflegends',
    'league': 'leagueoflegends'
};

const SECTION_TITLE_MAP = {
    'introduction': 'PENDAHULUAN',
    'appearance': 'PENAMPILAN',
    'personality': 'KEPRIBADIAN',
    'history': 'SEJARAH & LATAR BELAKANG',
    'biography': 'BIOGRAFI',
    'abilities': 'KEMAMPUAN',
    'powers and abilities': 'KEKUATAN & KEMAMPUAN',
    'equipment': 'PERLENGKAPAN',
    'plot': 'ALUR CERITA',
    'synopsis': 'SINOPSIS',
    'overview': 'IKHTISAR',
    'relationships': 'HUBUNGAN',
    'availability': 'KETERSEDIAAN'
};

const INFOBOX_LABEL_MAP = {
    'birthday': 'Tanggal Lahir',
    'age': 'Umur',
    'gender': 'Jenis Kelamin',
    'height': 'Tinggi Badan',
    'weight': 'Berat Badan',
    'hair color': 'Warna Rambut',
    'eye color': 'Warna Mata',
    'blood type': 'Golongan Darah',
    'status': 'Status',
    'occupation': 'Pekerjaan',
    'occupations': 'Pekerjaan',
    'affiliation': 'Afiliasi',
    'affiliations': 'Afiliasi',
    'relationship': 'Hubungan',
    'relationships': 'Hubungan',
    'japanese voice': 'Pengisi Suara (JP)',
    'english voice': 'Pengisi Suara (EN)',
    'species': 'Spesies',
    'alias': 'Alias / Julukan',
    'region': 'Wilayah',
    'constellation': 'Konstelasi',
    'special dish': 'Makanan Khas',
    'namecard': 'Kartu Nama',
    'how to obtain': 'Cara Mendapatkan',
    'origin': 'Asal',
    'residence': 'Tempat Tinggal',
    'relatives': 'Keluarga / Kerabat'
};

async function deleteMsg(conn, m, msg) {
    if (!msg) return;
    try {
        const chatId = m.chat.replace('@t.me', '');
        if (global.tgBot && msg.message_id) {
            await global.tgBot.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        } else if (msg.key) {
            await conn.sendMessage(m.chat, { delete: msg.key }).catch(() => {});
        }
    } catch (e) {}
}

async function translateToId(text) {
    if (!text || typeof text !== 'string') return text;
    try {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=id&dt=t&q=${encodeURIComponent(text)}`;
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 6000
        });
        if (res.data?.[0]) {
            return res.data[0].map(item => item[0]).join('');
        }
    } catch (e) {}
    return text;
}

function cleanText(text) {
    if (!text) return '';
    return text
        .replace(/[\u00ad\u200b\u200e\u200f\ufeff]/g, '')
        .replace(/\[\d+\]/g, '')
        .replace(/\[note \d+\]/gi, '')
        .replace(/\[edit\]/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanQuote(text) {
    if (!text) return '';
    let q = text
        .replace(/\[(?:src|source|\d+|note \d+|edit)\]/gi, '')
        .replace(/[\u00ad\u200b\u200e\u200f\ufeff]/g, '')
        .replace(/[„“”]/g, '"')
        .replace(/"\s*"/g, ' " ')
        .replace(/""+/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
    q = q.replace(/"\s*([^"]+?)\s*"/g, '"$1"');
    q = q.replace(/^["'\s]+|["'\s]+$/g, '').trim();
    return q;
}

function extractInfoboxValue($, el) {
    const clone = el.clone();
    clone.find('sup.reference, .reference, style, script, noscript').remove();
    clone.find('br, hr, p, li, tr').after(' \n ');
    const raw = clone.text();
    const lines = raw.split('\n')
        .map(l => cleanText(l))
        .filter(Boolean);
    
    const unique = [...new Set(lines)];
    if (unique.length === 0) return '';
    if (unique.length === 1) return unique[0];
    return unique.join(', ');
}

async function searchFandomDirect(wikiName, term) {
    try {
        const searchUrl = `https://${wikiName}.fandom.com/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&format=json`;
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const results = res.data?.query?.search || [];
        if (results.length > 0) {
            const exact = results.find(r => r.title.toLowerCase() === term.toLowerCase());
            if (exact) return { wikiName, title: exact.title };

            const noSubpage = results.find(r => !r.title.includes('/'));
            if (noSubpage) return { wikiName, title: noSubpage.title };

            return { wikiName, title: results[0].title };
        }
    } catch {}
    return null;
}

async function resolveViaYahoo(query) {
    try {
        const url = `https://search.yahoo.com/search?p=${encodeURIComponent(query + ' fandom wiki')}`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            },
            timeout: 8000
        });

        const $ = cheerio.load(res.data);
        let resolved = null;

        $('a').each((i, el) => {
            try {
                const href = $(el).attr('href') || '';
                if (href.includes('.fandom.com/wiki/')) {
                    const match = href.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/([^?&#]+)/i);
                    if (match && !match[2].startsWith('Special:') && !match[2].startsWith('Category:')) {
                        resolved = {
                            wikiName: match[1],
                            title: decodeURIComponent(match[2].replace(/_/g, ' '))
                        };
                        return false;
                    }
                }

                const matchRu = href.match(/[\?&]RU=([^&/]+)/i) || href.match(/\/RU=([^/&]+)/i);
                if (matchRu) {
                    const realUrl = decodeURIComponent(matchRu[1]);
                    if (realUrl.includes('.fandom.com/wiki/')) {
                        const match = realUrl.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/([^?&#]+)/i);
                        if (match && !match[2].startsWith('Special:') && !match[2].startsWith('Category:')) {
                            resolved = {
                                wikiName: match[1],
                                title: decodeURIComponent(match[2].replace(/_/g, ' '))
                            };
                            return false;
                        }
                    }
                }
            } catch {}
        });

        return resolved;
    } catch {
        return null;
    }
}

async function resolveViaDDG(query) {
    try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' site:fandom.com/wiki/')}`;
        const res = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0'
            },
            timeout: 8000
        });

        const $ = cheerio.load(res.data);
        let resolved = null;

        $('a.result__url, a.result__title, .result__snippet a, a').each((i, el) => {
            const href = $(el).attr('href') || '';
            const matchUddg = href.match(/uddg=([^&]+)/i);
            const targetUrl = matchUddg ? decodeURIComponent(matchUddg[1]) : href;
            if (targetUrl.includes('.fandom.com/wiki/')) {
                const match = targetUrl.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/([^?&#]+)/i);
                if (match && !match[2].startsWith('Special:') && !match[2].startsWith('Category:')) {
                    resolved = {
                        wikiName: match[1],
                        title: decodeURIComponent(match[2].replace(/_/g, ' '))
                    };
                    return false;
                }
            }
        });

        return resolved;
    } catch {
        return null;
    }
}

export async function resolveWikiDetails(query) {
    const trimmed = query.trim();

    // 1. Direct Fandom URL Check
    const directUrlMatch = trimmed.match(/https?:\/\/([a-zA-Z0-9\-]+)\.fandom\.com\/wiki\/([^?&#]+)/i);
    if (directUrlMatch) {
        return {
            wikiName: directUrlMatch[1],
            title: decodeURIComponent(directUrlMatch[2].replace(/_/g, ' '))
        };
    }

    // 2. Direct Wiki Prefix Match (e.g. 'genshin: zhongli' or 'hsr acheron' or 'op / luffy')
    const prefixMatch = trimmed.match(/^([a-zA-Z0-9\-]+)[:|/\s]+(.+)$/);
    if (prefixMatch) {
        const potentialKey = prefixMatch[1].toLowerCase();
        const searchSubTerm = prefixMatch[2].trim();
        const mappedWiki = WIKI_ALIASES[potentialKey] || (potentialKey.length > 2 ? potentialKey : null);
        if (mappedWiki && searchSubTerm) {
            const directRes = await searchFandomDirect(mappedWiki, searchSubTerm);
            if (directRes) return directRes;
        }
    }

    // 3. Yahoo Search Resolver
    const yahooRes = await resolveViaYahoo(trimmed);
    if (yahooRes) return yahooRes;

    // 4. DuckDuckGo Resolver Fallback
    const ddgRes = await resolveViaDDG(trimmed);
    if (ddgRes) return ddgRes;

    return null;
}

async function fetchFandomData(wikiName, pageTitle) {
    const parseUrl = `https://${wikiName}.fandom.com/api.php?action=parse&page=${encodeURIComponent(pageTitle)}&prop=text|images|sections&redirects=1&format=json`;
    const imgUrl = `https://${wikiName}.fandom.com/api.php?action=query&prop=pageimages&titles=${encodeURIComponent(pageTitle)}&pithumbsize=1000&format=json`;

    const [parseRes, imgRes] = await Promise.all([
        axios.get(parseUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 }).catch(() => ({ data: null })),
        axios.get(imgUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 10000 }).catch(() => ({ data: null }))
    ]);

    const html = parseRes.data?.parse?.text?.['*'];
    if (!html) return null;

    const realTitle = parseRes.data?.parse?.title || pageTitle;
    const $ = cheerio.load(html);

    // 1. High Resolution Image
    let thumbnail = null;
    const infoboxImg = $('aside.portable-infobox figure.pi-item.pi-image img, aside.portable-infobox .pi-image img, .thumbimage, meta[property="og:image"]').first().attr('src');
    if (infoboxImg) {
        thumbnail = infoboxImg.split('/revision/')[0].split('?')[0];
    } else if (imgRes.data?.query?.pages) {
        const pages = imgRes.data.query.pages;
        const pageId = Object.keys(pages)[0];
        thumbnail = pages[pageId]?.thumbnail?.source || null;
    }

    // 2. Character Quote
    let quote = '';
    $('blockquote, .quote, .citation, .dialogue').each((i, el) => {
        if (!quote) {
            const txt = cleanQuote($(el).text());
            if (txt.length > 15 && txt.length < 280) {
                quote = txt;
            }
        }
    });

    // 3. Infobox Details
    const infoboxItems = [];
    const ignoredLabels = ['manga', 'anime', 'media', 'story', 'chapters & volumes', 'episodes', 'gallery', 'links', 'navigation', 'discussions', 'site navigation'];
    $('aside.portable-infobox').each((i, aside) => {
        $(aside).find('.pi-data').each((j, item) => {
            const rawLabel = cleanText($(item).find('.pi-data-label').text().replace(/:$/, ''));
            const value = extractInfoboxValue($, $(item).find('.pi-data-value'));
            if (rawLabel && value && value.length < 250) {
                const labelLower = rawLabel.toLowerCase();
                if (!ignoredLabels.some(ig => labelLower === ig || labelLower.startsWith(ig))) {
                    const translatedLabel = INFOBOX_LABEL_MAP[labelLower] || rawLabel;
                    infoboxItems.push({ label: translatedLabel, value });
                }
            }
        });
    });

    // 4. Content Sections
    const sections = [];
    let currentSec = { title: 'Introduction', paragraphs: [] };
    const utilityTitles = ['references', 'external links', 'navigation', 'site navigation', 'gallery', 'see also', 'footnotes', 'notes', 'quotes', 'trivia', 'translations', 'etymology'];

    $('.mw-parser-output').children().each((i, el) => {
        const tag = el.tagName ? el.tagName.toLowerCase() : '';
        if (tag === 'h2') {
            const title = cleanText($(el).find('.mw-headline').text() || $(el).text());
            const titleLower = title.toLowerCase();
            if (title && !utilityTitles.some(t => titleLower.includes(t))) {
                if (currentSec.paragraphs.length > 0) sections.push(currentSec);
                currentSec = { title, paragraphs: [] };
            }
        } else if (tag === 'p') {
            const pClone = $(el).clone();
            pClone.find('sup.reference, .reference, style, script, noscript').remove();
            const pText = cleanText(pClone.text());
            if (pText.length > 30) {
                currentSec.paragraphs.push(pText);
            }
        }
    });
    if (currentSec.paragraphs.length > 0) sections.push(currentSec);

    return {
        wikiName,
        title: realTitle,
        quote,
        thumbnail,
        infoboxItems,
        sections
    };
}

const handler = async (m, { conn, text, usedPrefix, command }) => {
    const query = text?.trim();
    if (!query) {
        return m.reply(`*FANDOM WIKI SEARCH*\n\n` +
            `*Format Penggunaan:*\n` +
            `• \`${usedPrefix + command} <kata kunci>\`\n` +
            `• \`${usedPrefix + command} <wiki>: <nama karakter/item>\`\n` +
            `• \`${usedPrefix + command} <link fandom wiki>\`\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix + command} genshin zhongli\`\n` +
            `• \`${usedPrefix + command} hsr: acheron\`\n` +
            `• \`${usedPrefix + command} onepiece luffy\`\n` +
            `• \`${usedPrefix + command} jjk: satoru gojo\``);
    }

    let loadingMsg = await m.reply(`_Mencari "${query}" di Fandom Wiki..._`);

    try {
        const resolved = await resolveWikiDetails(query);
        if (!resolved) {
            await deleteMsg(conn, m, loadingMsg);
            loadingMsg = null;
            return m.reply(`Tidak ditemukan halaman Fandom Wiki yang cocok untuk: *${query}*`);
        }

        const { wikiName, title } = resolved;
        const pageData = await fetchFandomData(wikiName, title);

        if (!pageData) {
            await deleteMsg(conn, m, loadingMsg);
            loadingMsg = null;
            return m.reply(`Gagal memuat data dari Wiki *${wikiName}* untuk "${title}".`);
        }

        // Translate Sections & Quote in parallel
        const quoteTask = pageData.quote ? translateToId(cleanQuote(pageData.quote)) : Promise.resolve('');

        // Prepare selected sections (Intro + up to 2 other content sections)
        const selectedSections = [];
        for (const sec of pageData.sections) {
            if (sec.title === 'Introduction') {
                if (sec.paragraphs.length > 0) {
                    selectedSections.push({ ...sec, isIntro: true });
                }
            } else {
                if (selectedSections.filter(s => !s.isIntro).length < 2 && sec.paragraphs.length > 0) {
                    selectedSections.push({ ...sec, isIntro: false });
                }
            }
        }

        const sectionsTask = Promise.all(
            selectedSections.map(async (sec) => {
                const bodyText = sec.paragraphs.slice(0, 2).join('\n\n');
                const translatedBody = await translateToId(bodyText);
                let titleHeader = '';
                if (!sec.isIntro) {
                    const lowerTitle = sec.title.toLowerCase();
                    titleHeader = SECTION_TITLE_MAP[lowerTitle] || (await translateToId(sec.title)).toUpperCase();
                }
                return {
                    isIntro: sec.isIntro,
                    title: titleHeader,
                    body: translatedBody
                };
            })
        );

        const [rawTranslatedQuote, translatedSections] = await Promise.all([quoteTask, sectionsTask]);
        const finalQuote = cleanQuote(rawTranslatedQuote);

        await deleteMsg(conn, m, loadingMsg);
        loadingMsg = null;

        const divider = '──────────────';
        const cleanTitle = pageData.title.replace(/_/g, ' ');
        let caption = `*FANDOM WIKI: ${cleanTitle.toUpperCase()}*\n`;
        caption += `*Universe:* \`${wikiName.toUpperCase()}\`\n`;
        caption += `${divider}\n\n`;

        if (finalQuote) {
            caption += `_"${finalQuote}"_\n\n`;
            caption += `${divider}\n\n`;
        }

        if (pageData.infoboxItems.length > 0) {
            caption += `*INFORMASI & PROFIL*\n`;
            caption += pageData.infoboxItems.slice(0, 15).map(item => `• *${item.label}:* ${item.value}`).join('\n') + `\n\n`;
            caption += `${divider}\n\n`;
        }

        for (const sec of translatedSections) {
            if (sec.isIntro) {
                caption += `*PENDAHULUAN*\n`;
                caption += `${sec.body}\n\n`;
            } else {
                caption += `*${sec.title}*\n`;
                caption += `${sec.body}\n\n`;
            }
        }

        caption += `*Sumber:* https://${wikiName}.fandom.com/wiki/${encodeURIComponent(pageData.title.replace(/ /g, '_'))}`;

        if (pageData.thumbnail) {
            try {
                await conn.sendMessage(m.chat, {
                    image: { url: pageData.thumbnail },
                    caption
                }, { quoted: m });
                return;
            } catch (imgErr) {
                console.error('[Fandom Image Send Fallback]', imgErr.message);
            }
        }

        await m.reply(caption);

    } catch (error) {
        console.error('[FANDOM ERROR]', error);
        await deleteMsg(conn, m, loadingMsg);
        m.reply(`*Terjadi kesalahan:* ${error.message}`);
    }
};

handler.help = ['fandom *karakter/wiki: nama*'];
handler.tags = ['internet'];
handler.command = /^(fandom|wikia|fanwiki)$/i;
handler.limit = false;

export default handler;