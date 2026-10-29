/*
- @Author     : Rafli
- @Feature    : BMKG Earthquake System & Auto-Alert Monitor
- @Description: Layanan lengkap data gempa BMKG (Terkini, M 5.0+, Dirasakan) beserta sistem pemantau siaga gempa otomatis per-grup.
*/

import axios from 'axios'
import fs from 'fs'
import path from 'path'

const BMKG_AUTOGEMPA_URL     = 'https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json'
const BMKG_GEMPATERKINI_URL   = 'https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json'
const BMKG_GEMPADIRASAKAN_URL = 'https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json'
const BMKG_SHAKEMAP_BASE_URL  = 'https://data.bmkg.go.id/DataMKG/TEWS/'

const BMKG_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache'
}

const STATE_FILE = path.join(process.cwd(), 'data', 'autogempa_state.json')

let autoGempaInterval = null
let isPolling = false

/**
 * Membaca state autogempa tersimpan
 */
export function loadAutoGempaState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'))
        }
    } catch (e) {
        console.error('[GEMPA] Gagal membaca state:', e.message)
    }
    return {
        lastGempaId: null,
        lastCheckTime: 0,
        lastNotifiedTime: 0
    }
}

/**
 * Menyimpan state autogempa ke file
 */
export function saveAutoGempaState(state) {
    try {
        const dir = path.dirname(STATE_FILE)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2))
    } catch (e) {
        console.error('[GEMPA] Gagal menyimpan state:', e.message)
    }
}

/**
 * Download buffer gambar Shakemap dengan fallback aman
 */
export async function fetchShakemapBuffer(shakemapFile) {
    if (!shakemapFile) return null
    try {
        const url = shakemapFile.startsWith('http')
            ? shakemapFile
            : `${BMKG_SHAKEMAP_BASE_URL}${shakemapFile}`

        const response = await axios.get(url, {
            headers: BMKG_HEADERS,
            responseType: 'arraybuffer',
            timeout: 15000
        })
        if (response.status === 200 && response.data) {
            return Buffer.from(response.data)
        }
    } catch (e) {
        console.warn(`[GEMPA] Shakemap buffer tidak dapat diunduh (${shakemapFile}):`, e.message)
    }
    return null
}

/**
 * Mengambil data gempa terbaru / autogempa (M 5.0+ / Shakemap)
 */
export async function getAutoGempa() {
    const { data } = await axios.get(BMKG_AUTOGEMPA_URL, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const gempa = data?.Infogempa?.gempa
    if (!gempa) throw new Error('Data gempa tidak ditemukan dalam respon BMKG.')
    return gempa
}

/**
 * Mengambil daftar gempa M 5.0+ terkini (15 list)
 */
export async function getGempaTerkini() {
    const { data } = await axios.get(BMKG_GEMPATERKINI_URL, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const list = data?.Infogempa?.gempa
    if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Daftar gempa M 5.0+ tidak ditemukan.')
    }
    return list
}

/**
 * Mengambil daftar gempa yang dirasakan terkini (15 list)
 */
export async function getGempaDirasakan() {
    const { data } = await axios.get(BMKG_GEMPADIRASAKAN_URL, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const list = data?.Infogempa?.gempa
    if (!Array.isArray(list) || list.length === 0) {
        throw new Error('Daftar gempa dirasakan tidak ditemukan.')
    }
    return list
}

/**
 * Format kartu info gempa tunggal (tanpa border frame & tanpa emoji)
 */
export function formatGempaCard(gempa, isAuto = false) {
    const {
        Tanggal = '-',
        Jam = '-',
        Magnitude = '-',
        Kedalaman = '-',
        Wilayah = '-',
        Lintang = '-',
        Bujur = '-',
        Coordinates = '',
        Potensi = 'Tidak berpotensi tsunami',
        Dirasakan = '',
        Shakemap = ''
    } = gempa

    const magNum = parseFloat(Magnitude) || 0
    let skalaLabel = 'Skala Sedang'
    if (magNum >= 7.0) skalaLabel = 'Sangat Kuat'
    else if (magNum >= 6.0) skalaLabel = 'Kuat'
    else if (magNum < 4.0) skalaLabel = 'Ringan'

    const rawCoords = Coordinates || `${Lintang}, ${Bujur}`
    const mapQuery = encodeURIComponent(Coordinates ? Coordinates.replace(/\s+/g, '') : `${Lintang},${Bujur}`)
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`

    const title = isAuto
        ? `*PERINGATAN SIAGA GEMPA BUMI*\n_Sistem Monitoring Otomatis BMKG_`
        : `*INFORMASI GEMPA BUMI TERKINI*\n_Sumber Data: BMKG Indonesia_`

    let card = `${title}\n\n` +
        `• Kekuatan: *${Magnitude} SR* (${skalaLabel})\n` +
        `• Waktu: ${Jam} | ${Tanggal}\n` +
        `• Lokasi: ${Wilayah}\n` +
        `• Kedalaman: ${Kedalaman}\n` +
        `• Koordinat: ${rawCoords}\n` +
        `• Potensi Tsunami: ${Potensi}\n`

    if (Dirasakan && Dirasakan !== '-') {
        card += `• Dirasakan (MMI): ${Dirasakan}\n`
    }

    card += `\n• Google Maps: ${mapUrl}\n` +
        `_Tetap tenang dan selalu pantau arahan resmi dari BMKG._`

    return {
        text: card,
        shakemap: Shakemap,
        mapUrl,
        magnitude: Magnitude
    }
}

/**
 * Format daftar gempa berkala (M 5.0+ / Dirasakan) tanpa border frame
 */
export function formatGempaList(list, type = 'm5', limit = 5) {
    const items = list.slice(0, limit)
    const isDirasakan = type === 'dirasakan'

    const title = isDirasakan
        ? `*DAFTAR GEMPA DIRASAKAN TERKINI*\n_Sumber Data: BMKG (Top ${items.length} Kejadian)_`
        : `*DAFTAR GEMPA M 5.0+ TERKINI*\n_Sumber Data: BMKG (Top ${items.length} Kejadian)_`

    let output = `${title}\n\n`

    items.forEach((item, index) => {
        const mag = item.Magnitude || '-'
        const date = item.Tanggal || '-'
        const time = item.Jam || '-'
        const area = item.Wilayah || '-'
        const depth = item.Kedalaman || '-'
        const coords = item.Coordinates || `${item.Lintang || ''}, ${item.Bujur || ''}`

        output += `*[${index + 1}] Magnitudo ${mag} SR*\n` +
            `• Waktu: ${time} (${date})\n` +
            `• Lokasi: ${area}\n` +
            `• Kedalaman: ${depth} | Posisi: ${coords}\n`

        if (isDirasakan && item.Dirasakan && item.Dirasakan !== '-') {
            output += `• Skala MMI: ${item.Dirasakan}\n`
        }
        if (item.Potensi && !isDirasakan) {
            output += `• Potensi: ${item.Potensi}\n`
        }

        if (index < items.length - 1) {
            output += `\n`
        }
    })

    output += `\n_Ketik \`.gempa terkini\` untuk melihat peta guncangan terbaru._`

    return output
}

/**
 * Poller pemantau gempa otomatis (Auto-Gempa Monitor)
 */
async function checkNewEarthquake(connGetter) {
    if (isPolling) return
    isPolling = true

    try {
        const conn = typeof connGetter === 'function' ? connGetter() : connGetter
        if (!conn || !conn.user) {
            isPolling = false
            return
        }

        // Cari semua grup dengan autogempa aktif terlebih dahulu
        const chats = global.db?.data?.chats || {}
        const targetChats = Object.keys(chats).filter(chatId => {
            return chats[chatId] && chats[chatId].autogempa === true
        })

        // Jika tidak ada grup yang mengaktifkan autogempa, lewati proses
        if (targetChats.length === 0) {
            isPolling = false
            return
        }

        const state = loadAutoGempaState()
        const gempa = await getAutoGempa()

        const currentId = `${gempa.DateTime || (gempa.Tanggal + '_' + gempa.Jam)}_${gempa.Coordinates || gempa.Wilayah}`

        // Jika ini inisialisasi pertama kali saat bot baru berjalan
        if (!state.lastGempaId) {
            state.lastGempaId = currentId
            state.lastCheckTime = Date.now()
            saveAutoGempaState(state)
            isPolling = false
            return
        }

        // Jika terdeteksi gempa baru
        if (state.lastGempaId !== currentId) {
            console.log(`[AUTOGEMPA] Gempa baru terdeteksi: ${gempa.Magnitude} SR di ${gempa.Wilayah}`)

            state.lastGempaId = currentId
            state.lastCheckTime = Date.now()
            state.lastNotifiedTime = Date.now()
            saveAutoGempaState(state)

            const card = formatGempaCard(gempa, true)
            const imageBuffer = card.shakemap ? await fetchShakemapBuffer(card.shakemap) : null

            for (const jid of targetChats) {
                try {
                    if (imageBuffer) {
                        await conn.sendMessage(jid, {
                            image: imageBuffer,
                            caption: card.text
                        })
                    } else {
                        await conn.sendMessage(jid, {
                            text: card.text
                        })
                    }
                    // Stagger delay 500ms antar chat untuk mencegah rate limit Baileys
                    await new Promise(r => setTimeout(r, 500))
                } catch (sendErr) {
                    console.error(`[AUTOGEMPA] Gagal kirim ke grup ${jid}:`, sendErr.message)
                }
            }

            console.log(`[AUTOGEMPA] Berhasil membroadcast peringatan ke ${targetChats.length} grup.`)
        }
    } catch (e) {
        // Silent catch agar background job tidak mengganggu runtime bot
        if (e.response?.status !== 403 && e.code !== 'ECONNABORTED') {
            // Log hanya jika bukan error transient umum
        }
    } finally {
        isPolling = false
    }
}

/**
 * Inisialisasi scheduler pemantau gempa
 */
export function initAutoGempaScheduler(connGetter, intervalMs = 60000) {
    if (autoGempaInterval) {
        clearInterval(autoGempaInterval)
    }

    // Jalankan pengecekan perdana 10 detik setelah bot running
    setTimeout(() => {
        checkNewEarthquake(connGetter)
    }, 10000)

    // Rutin setiap intervalMs (default 60 detik)
    autoGempaInterval = setInterval(() => {
        checkNewEarthquake(connGetter)
    }, intervalMs)
}

/**
 * Menghentikan scheduler
 */
export function stopAutoGempaScheduler() {
    if (autoGempaInterval) {
        clearInterval(autoGempaInterval)
        autoGempaInterval = null
    }
}
