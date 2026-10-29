/*
 * @Author     : Joy Multi-Device Assistant
 * @Feature    : Engine Spesifikasi Gadget & Smartphone (GSMArena Direct & AI Fallback)
 * @Description: Scraper GSMArena level hardware bypass Turnstile via static QuickSearch index + direct device page parsing tanpa Cloudflare.
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_FILE = path.join(__dirname, '..', '..', 'data', 'gsmarena-index.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 Jam

const client = axios.create({
  baseURL: 'https://www.gsmarena.com',
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8'
  }
});

let inMemoryIndex = null;
let indexLoadingPromise = null;

/**
 * Muat atau perbarui indeks QuickSearch GSMArena secara lokal tanpa Cloudflare
 */
export async function loadGSMArenaIndex(forceRefresh = false) {
  if (inMemoryIndex && !forceRefresh) return inMemoryIndex;
  if (indexLoadingPromise) return indexLoadingPromise;

  indexLoadingPromise = (async () => {
    // 1. Cek cache disk
    try {
      if (!forceRefresh && fs.existsSync(CACHE_FILE)) {
        const stats = fs.statSync(CACHE_FILE);
        if (Date.now() - stats.mtimeMs < CACHE_TTL_MS) {
          const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
          const data = JSON.parse(raw);
          if (data && data.makers && data.list) {
            inMemoryIndex = data;
            return inMemoryIndex;
          }
        }
      }
    } catch (e) {
      console.warn('[GSMARENA-INDEX] Gagal membaca disk cache:', e.message);
    }

    // 2. Fetch fresh index dari GSMArena
    try {
      let quicksearchUrl = '/quicksearch-82842.jpg';
      try {
        const homeRes = await client.get('/');
        const match = homeRes.data.match(/AUTOCOMPLETE_LIST_URL\s*=\s*"([^"]+)"/);
        if (match && match[1]) {
          quicksearchUrl = match[1];
        }
      } catch {}

      const res = await client.get(quicksearchUrl);
      if (Array.isArray(res.data) && res.data.length >= 2) {
        const indexData = {
          makers: res.data[0],
          list: Object.values(res.data[1]),
          updatedAt: Date.now()
        };

        inMemoryIndex = indexData;

        // Simpan ke disk
        try {
          const dataDir = path.dirname(CACHE_FILE);
          if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
          fs.writeFileSync(CACHE_FILE, JSON.stringify(indexData));
        } catch {}

        return inMemoryIndex;
      }
    } catch (err) {
      console.error('[GSMARENA-INDEX] Gagal fetch fresh index:', err.message);
    }

    // 3. Fallback disk cache jika fetch gagal
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf-8');
        inMemoryIndex = JSON.parse(raw);
        return inMemoryIndex;
      }
    } catch {}

    return { makers: {}, list: [] };
  })();

  try {
    return await indexLoadingPromise;
  } finally {
    indexLoadingPromise = null;
  }
}

/**
 * Cari perangkat berdasarkan kata kunci dari indeks GSMArena
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array<{id: number, maker: string, name: string, slug: string, img: string|null}>>}
 */
export async function searchPhones(query, limit = 10) {
  const index = await loadGSMArenaIndex();
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];

  const results = [];
  const list = index.list || [];
  const makers = index.makers || {};

  for (const d of list) {
    const maker = makers[d[0]] || '';
    const phoneName = d[2] || '';
    const searchTags = d[3] || '';
    const fullName = `${maker} ${phoneName}`.trim();
    const fullSearchText = `${fullName} ${searchTags}`.toLowerCase();

    // Pastikan setiap token cocok, dengan aturan ketat untuk angka
    const isMatch = tokens.every(tok => {
      if (/^\d+$/.test(tok)) {
        // Angka harus cocok sebagai kata utuh atau model (misal "15" tidak boleh cocok dengan "150W" atau "GT5")
        const regex = new RegExp(`(?:^|\\s|[^a-zA-Z0-9])${tok}(?:$|\\s|[^a-zA-Z0-9])`, 'i');
        return regex.test(fullName);
      }
      return fullSearchText.includes(tok);
    });

    if (isMatch) {
      let slug = `${maker} ${phoneName}`.toLowerCase().replace(/\s+|-|\/|\./g, '_');
      slug += `-${d[1]}`;
      const img = d[4] ? `https://fdn2.gsmarena.com/vv/bigpic/${d[4]}` : null;
      results.push({
        id: d[1],
        maker,
        name: fullName,
        slug,
        img
      });
    }
  }

  // Sorting relevansi
  results.sort((a, b) => {
    const q = query.toLowerCase();
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    if (aName === q) return -1;
    if (bName === q) return 1;
    if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
    if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
    return 0;
  });

  return results.slice(0, limit);
}

/**
 * Ambil rincian spesifikasi lengkap perangkat dari GSMArena
 * @param {string|number} slugOrId
 * @returns {Promise<{title: string, card: string, img: string|null}|null>}
 */
export async function getDeviceDetail(slugOrId) {
  let targetSlug = String(slugOrId);

  // Jika input berupa angka ID, cari slug dari indeks
  if (/^\d+$/.test(targetSlug)) {
    const index = await loadGSMArenaIndex();
    const found = (index.list || []).find(d => String(d[1]) === targetSlug);
    if (found) {
      const maker = index.makers[found[0]] || '';
      const phoneName = found[2] || '';
      targetSlug = `${maker} ${phoneName}`.toLowerCase().replace(/\s+|-|\/|\./g, '_') + `-${found[1]}`;
    } else {
      targetSlug = `phone-${targetSlug}`;
    }
  }

  const url = `/${targetSlug}.php`;

  try {
    const res = await client.get(url, { maxRedirects: 5 });
    const $ = cheerio.load(res.data);

    const title = $('h1.specs-phone-name-title').text().trim() || $('title').text().trim();
    if (!title || title.includes('404 Not Found') || title.includes('Phone not found')) {
      return null;
    }

    const img = $('.specs-photo-main img').attr('src') || null;

    const tables = {};
    $('#specs-list table').each((i, tbl) => {
      const cat = $(tbl).find('th').text().trim().toLowerCase();
      if (!cat) return;
      tables[cat] = {};
      $(tbl).find('tr').each((j, tr) => {
        let k = $(tr).find('.ttl a').text().trim() || $(tr).find('.ttl').text().trim() || `extra_${j}`;
        let v = $(tr).find('.nfo').text().trim().replace(/\s+/g, ' ');
        if (v) tables[cat][k.toLowerCase()] = v;
      });
    });

    const get = (cat, key) => (tables[cat] && tables[cat][key.toLowerCase()]) || null;

    const out = [];
    out.push(`*SPESIFIKASI: ${title.toUpperCase()}*\n`);

    // 1. Informasi & Rilis
    out.push(`*Informasi & Rilis*`);
    if (get('launch', 'announced')) out.push(`- Diumumkan: ${get('launch', 'announced')}`);
    if (get('launch', 'status')) out.push(`- Status: ${get('launch', 'status')}`);
    if (get('misc', 'models')) out.push(`- Model: ${get('misc', 'models')}`);
    if (get('misc', 'price')) out.push(`- Estimasi Harga: ${get('misc', 'price')}`);
    out.push('');

    // 2. Bodi & Ketahanan
    out.push(`*Bodi & Ketahanan*`);
    if (get('body', 'dimensions')) out.push(`- Dimensi: ${get('body', 'dimensions')}`);
    if (get('body', 'weight')) out.push(`- Bobot: ${get('body', 'weight')}`);
    if (get('body', 'build')) out.push(`- Material: ${get('body', 'build')}`);
    if (get('body', 'sim')) out.push(`- SIM: ${get('body', 'sim')}`);
    const ipKey = Object.keys(tables['body'] || {}).find(k => k.startsWith('extra'));
    if (ipKey) out.push(`- Ketahanan: ${tables['body'][ipKey]}`);
    out.push('');

    // 3. Layar (Display)
    out.push(`*Layar (Display)*`);
    if (get('display', 'type')) out.push(`- Panel: ${get('display', 'type')}`);
    if (get('display', 'size')) out.push(`- Ukuran: ${get('display', 'size')}`);
    if (get('display', 'resolution')) out.push(`- Resolusi: ${get('display', 'resolution')}`);
    if (get('display', 'protection')) out.push(`- Proteksi: ${get('display', 'protection')}`);
    out.push('');

    // 4. Dapur Pacu & Sistem
    out.push(`*Dapur Pacu & Sistem*`);
    if (get('platform', 'os')) out.push(`- OS: ${get('platform', 'os')}`);
    if (get('platform', 'chipset')) out.push(`- Chipset: ${get('platform', 'chipset')}`);
    if (get('platform', 'cpu')) out.push(`- CPU: ${get('platform', 'cpu')}`);
    if (get('platform', 'gpu')) out.push(`- GPU: ${get('platform', 'gpu')}`);
    out.push('');

    // 5. Memori & Penyimpanan
    out.push(`*Memori & Penyimpanan*`);
    if (get('memory', 'internal')) out.push(`- Varian RAM/ROM: ${get('memory', 'internal')}`);
    if (get('memory', 'card slot')) out.push(`- Slot Memori: ${get('memory', 'card slot')}`);
    const ufsKey = Object.keys(tables['memory'] || {}).find(k => k.startsWith('extra'));
    if (ufsKey) out.push(`- Standar Storage: ${tables['memory'][ufsKey]}`);
    out.push('');

    // 6. Kamera Belakang
    out.push(`*Kamera Belakang*`);
    const camMainKey = Object.keys(tables['main camera'] || {}).find(k => ['single', 'dual', 'triple', 'quad', 'five'].includes(k));
    if (camMainKey) out.push(`- Modul Kamera: ${tables['main camera'][camMainKey]}`);
    if (get('main camera', 'features')) out.push(`- Fitur: ${get('main camera', 'features')}`);
    if (get('main camera', 'video')) out.push(`- Perekaman Video: ${get('main camera', 'video')}`);
    out.push('');

    // 7. Kamera Depan
    out.push(`*Kamera Depan*`);
    const camSelfKey = Object.keys(tables['selfie camera'] || {}).find(k => ['single', 'dual'].includes(k));
    if (camSelfKey) out.push(`- Kamera Selfie: ${tables['selfie camera'][camSelfKey]}`);
    if (get('selfie camera', 'video')) out.push(`- Video Selfie: ${get('selfie camera', 'video')}`);
    out.push('');

    // 8. Baterai & Pengisian
    out.push(`*Baterai & Pengisian*`);
    if (get('battery', 'type')) out.push(`- Kapasitas: ${get('battery', 'type')}`);
    if (get('battery', 'charging')) out.push(`- Pengisian Daya: ${get('battery', 'charging')}`);
    out.push('');

    // 9. Konektivitas & Sensor
    out.push(`*Konektivitas & Sensor*`);
    if (get('network', 'technology')) out.push(`- Jaringan: ${get('network', 'technology')}`);
    if (get('comms', 'wlan')) out.push(`- Wi-Fi: ${get('comms', 'wlan')}`);
    if (get('comms', 'bluetooth')) out.push(`- Bluetooth: ${get('comms', 'bluetooth')}`);
    if (get('comms', 'nfc')) out.push(`- NFC: ${get('comms', 'nfc')}`);
    if (get('comms', 'infrared port')) out.push(`- Infrared: ${get('comms', 'infrared port')}`);
    if (get('comms', 'usb')) out.push(`- USB: ${get('comms', 'usb')}`);
    if (get('features', 'sensors')) out.push(`- Sensor: ${get('features', 'sensors')}`);
    out.push('');

    // 10. Hasil Pengujian / Benchmark (jika ada)
    if (tables['our tests'] && Object.keys(tables['our tests']).length) {
      out.push(`*Hasil Pengujian / Benchmark*`);
      for (const [tk, tv] of Object.entries(tables['our tests'])) {
        out.push(`- ${tk.toUpperCase()}: ${tv}`);
      }
      out.push('');
    }

    return {
      title,
      card: out.join('\n'),
      img
    };
  } catch (err) {
    console.error('[GSMARENA-DETAIL-ERROR]', err.message);
    return null;
  }
}
