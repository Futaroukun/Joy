import fs from 'fs';
import path from 'path';

const POOL_PATH = path.join(process.cwd(), 'data', 'gacha-pool.json');

let memoryPool = null;

function loadPool() {
  if (memoryPool !== null) return memoryPool;
  try {
    if (fs.existsSync(POOL_PATH)) {
      const raw = fs.readFileSync(POOL_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (Array.isArray(data)) {
        memoryPool = new Set(data.filter((n) => typeof n === 'string' && /^\d{9,16}$/.test(n)));
        return memoryPool;
      }
    }
  } catch (err) {
    console.error('[GACHA POOL] Gagal membaca file:', err.message);
  }
  memoryPool = new Set();
  return memoryPool;
}

function savePool() {
  if (!memoryPool) return;
  try {
    const arr = Array.from(memoryPool);
    fs.writeFileSync(POOL_PATH, JSON.stringify(arr, null, 2), 'utf-8');
  } catch (err) {
    console.error('[GACHA POOL] Gagal menyimpan file:', err.message);
  }
}

/**
 * Mendapatkan jumlah total nomor aktif dalam pool
 */
export function getPoolCount() {
  return loadPool().size;
}

/**
 * Mendapatkan seluruh daftar nomor aktif
 */
export function getAllPool() {
  return Array.from(loadPool());
}

/**
 * Menambahkan nomor baru yang terverifikasi aktif ke pool (otomatis deduplikasi)
 */
export function addNumbersToPool(numbers) {
  if (!numbers) return 0;
  const list = Array.isArray(numbers) ? numbers : [numbers];
  const pool = loadPool();
  let addedCount = 0;

  for (const item of list) {
    if (typeof item === 'string') {
      const clean = item.replace(/\D/g, '');
      if (clean.length >= 9 && clean.length <= 16 && !pool.has(clean)) {
        pool.add(clean);
        addedCount++;
      }
    }
  }

  if (addedCount > 0) {
    savePool();
  }
  return addedCount;
}

/**
 * Mengambil 1 nomor acak dari database pool lokal
 */
export function getRandomFromPool() {
  const pool = loadPool();
  if (pool.size === 0) return null;
  const arr = Array.from(pool);
  const randomIndex = Math.floor(Math.random() * arr.length);
  return arr[randomIndex];
}
