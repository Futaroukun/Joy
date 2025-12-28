import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const clean = (str) => str?.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() || '';

// FUNGSI BARU: Mencari URL halaman karakter yang benar via search
async function findCharacterUrl(query) {
    const searchUrl = `https://honor-of-kings.fandom.com/wiki/Special:Search?query=${encodeURIComponent(query)}`;
    try {
        const res = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (!res.ok) return null;

        const html = await res.text();
        const $ = cheerio.load(html);
        
        // Ambil link pertama dari hasil pencarian
        const firstResultUrl = $('.unified-search*result*title').first().attr('href');
        
        // Kalo link ada, kembalikan URL lengkapnya, kalo nggak ya null
        return firstResultUrl ? firstResultUrl : null;

    } catch (error) {
        console.error('Error finding character URL:', error);
        return null;
    }
}


// FUNGSI UTAMA (DIMODIFIKASI)
export async function scrapeHokCharacter(query) {
    try {
        // Step 1: Cari URL halaman karakter yang paling relevan
        const characterPageUrl = await findCharacterUrl(query);

        // Jika URL tidak ditemukan, berarti karakter ga ada
        if (!characterPageUrl) {
            console.log(`Scrape HOK Gagal: Tidak ada hasil pencarian untuk "${query}"`);
            return null;
        }

        // Step 2: Lanjutkan scraping menggunakan URL yang sudah ditemukan
        const res = await fetch(characterPageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        if (!res.ok) {
            console.error(`Scrape HOK Gagal: Status ${res.status} untuk URL ${characterPageUrl}`);
            return null;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        const title = clean($('#firstHeading').text());
        if (!title || title.toLowerCase().includes('page does not exist')) {
            return null;
        }

        let image = $('.pi-image-collection-tabs .wds-tab__content.wds-is-current .pi-image img').attr('src') 
                 || $('.pi-image img').attr('src') 
                 || $('meta[property="og:image"]').attr('content') 
                 || null;
        if (image) {
            image = image.split('/revision/')[0];
        }

        const profile = {};
        $('.pi-item.pi-data').each((_, el) => {
            const label = clean($(el).find('.pi-data-label').text());
            const value = clean($(el).find('.pi-data-value').text());
            if (label && value) {
                profile[label] = value;
            }
        });

        const bio = clean($('.mw-parser-output > p').first().text());

        let loreParts = [];
        $('h2:contains("Lore"), h2:contains("Background")').first().nextUntil('h2').each((_, el) => {
            if ($(el).is('p')) {
                const txt = clean($(el).text());
                if (txt) loreParts.push(txt);
            }
        });
        const lore = loreParts.length ? loreParts.join('\n\n') : null;

        return {
            title,
            image,
            profile,
            bio,
            lore,
            url: characterPageUrl // Return URL yang berhasil ditemukan
        };

    } catch (error) {
        console.error('Error di HOK Scraper:', error);
        return null;
    }
}