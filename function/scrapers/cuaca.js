/*
- @Author     : Rafli
- @Feature    : BMKG Weather, Air Quality, Marine, Extreme Weather & PVMBG VONA
- @Description: Layanan lengkap prakiraan cuaca 3 hari BMKG, pemantauan kualitas udara (PM2.5/AQI), cuaca maritim & tinggi gelombang, peringatan dini cuaca ekstrem BMKG, serta peringatan abu vulkanik & erupsi gunung api PVMBG MAGMA Indonesia.
*/

import axios from 'axios'
import fs from 'fs'
import path from 'path'

const BMKG_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7'
}

const WILAYAH_FILE = path.join(process.cwd(), 'data', 'wilayah_kota.json')
let cachedWilayahList = null

/**
 * Muat daftar wilayah/kota (514 kabupaten & kota di Indonesia)
 */
export function loadWilayahList() {
    if (cachedWilayahList) return cachedWilayahList
    try {
        if (fs.existsSync(WILAYAH_FILE)) {
            cachedWilayahList = JSON.parse(fs.readFileSync(WILAYAH_FILE, 'utf-8'))
            return cachedWilayahList
        }
    } catch (e) {
        console.error('[CUACA] Gagal memuat wilayah_kota.json:', e.message)
    }
    return []
}

/**
 * Cari kode adm4 berdasarkan nama kota/kabupaten
 */
export function searchCityRegion(query) {
    const list = loadWilayahList()
    const q = (query || '').toLowerCase().trim()
    if (!q) return null

    // Cek jika input adalah kode adm4 langsung (misal: 31.71.01.1001)
    if (/^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(q)) {
        return { adm4: q, name: `Kode Wilayah ${q}`, clean: q, isKota: true }
    }

    const wantsKab = /^(kab|kabupaten)\s+/i.test(q)
    const wantsKota = /^kota\s+/i.test(q)
    const cleanQ = q.replace(/^(kab|kabupaten|kota|adm\.)\s+/i, '').trim()

    let found = null
    if (wantsKab) {
        found = list.find(d => !d.isKota && d.clean === cleanQ) ||
                list.find(d => !d.isKota && d.clean.includes(cleanQ))
    } else if (wantsKota) {
        found = list.find(d => d.isKota && d.clean === cleanQ) ||
                list.find(d => d.isKota && d.clean.includes(cleanQ))
    } else {
        found = list.find(d => d.isKota && d.clean === cleanQ) ||
                list.find(d => d.clean === cleanQ) ||
                list.find(d => d.isKota && d.clean.startsWith(cleanQ)) ||
                list.find(d => d.isKota && d.clean.includes(cleanQ)) ||
                list.find(d => d.clean.includes(cleanQ))
    }

    return found || null
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PRAKIRAAN CUACA BMKG (3 HARI)
// ─────────────────────────────────────────────────────────────────────────────

export async function getWeatherForecast(query) {
    const region = searchCityRegion(query)
    if (!region) {
        throw new Error(`Wilayah "${query}" tidak ditemukan dalam data kabupaten/kota. Masukkan nama kota yang valid (contoh: \`.cuaca Jakarta\`, \`.cuaca Bandung\`, \`.cuaca Surabaya\`).`)
    }

    const url = `https://api.bmkg.go.id/publik/prakiraan-cuaca?adm4=${encodeURIComponent(region.adm4)}`
    const { data } = await axios.get(url, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const lokasi = data?.lokasi
    const cuacaBlocks = data?.data?.[0]?.cuaca
    if (!cuacaBlocks || !Array.isArray(cuacaBlocks) || cuacaBlocks.length === 0) {
        throw new Error(`Data prakiraan cuaca untuk ${region.name} belum tersedia di server BMKG.`)
    }

    // Flatten daftar cuaca jika dalam bentuk array multi-dimensi (per-hari)
    const allForecasts = cuacaBlocks.flat()
    if (allForecasts.length === 0) {
        throw new Error(`Data prakiraan cuaca kosong untuk ${region.name}.`)
    }

    const current = allForecasts[0]
    const areaName = [lokasi?.desa, lokasi?.kecamatan, lokasi?.kotkab, lokasi?.provinsi].filter(Boolean).join(', ') || region.name

    let card = `╭── ✦ *CUACA BMKG* ✦\n` +
        `• Lokasi: *${areaName}*\n` +
        `• Waktu Analisis: ${current.local_datetime || current.datetime}\n` +
        `• Cuaca Saat Ini: *${current.weather_desc || '-'}*\n` +
        `• Suhu: *${current.t ?? '-'}°C*\n` +
        `• Kelembapan: *${current.hu ?? '-'}%*\n` +
        `• Angin: *${current.ws ?? '-'} km/jam* (Arah: ${current.wd || '-'} ke ${current.wd_to || '-'})\n` +
        `• Jarak Pandang: *${current.vs_text || (current.vs ? `${current.vs} m` : '-') }*\n` +
        `• Koordinat: ${lokasi?.lat ?? '-'}, ${lokasi?.lon ?? '-'}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Prakiraan Waktu Mendatang:*\n`

    // Tampilkan 4 periode prakiraan berikutnya
    const upcoming = allForecasts.slice(1, 5)
    upcoming.forEach((item, idx) => {
        const timeStr = item.local_datetime || item.datetime || '-'
        card += `• *${timeStr.replace('T', ' ')}*\n` +
            `  › Cuaca: ${item.weather_desc || '-'}\n` +
            `  › Suhu: ${item.t ?? '-'}°C | Lembap: ${item.hu ?? '-'}% | Angin: ${item.ws ?? '-'} km/jam\n`
    })

    card += `\n_Sumber Data Resmi: BMKG Indonesia (api.bmkg.go.id)_`

    return {
        text: card,
        lat: lokasi?.lat,
        lon: lokasi?.lon,
        lokasi
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KUALITAS UDARA & INDEKS POLUSI (PM2.5 / AQI)
// ─────────────────────────────────────────────────────────────────────────────

export async function getAirQuality(query) {
    let lat = null
    let lon = null
    let locationName = query

    // Coba ambil koordinat dari indeks lokal kota terlebih dahulu
    const region = searchCityRegion(query)
    if (region) {
        locationName = region.name
    }

    // Geocoding via Open-Meteo untuk akurasi koordinat global / Indonesia
    try {
        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(region?.clean || query)}&count=1&language=id&country_code=ID`
        const geoRes = await axios.get(geoUrl, { timeout: 8000 })
        const geoData = geoRes.data?.results?.[0]
        if (geoData) {
            lat = geoData.latitude
            lon = geoData.longitude
            locationName = `${geoData.name}, ${geoData.admin1 || 'Indonesia'}`
        }
    } catch {}

    if (!lat || !lon) {
        // Fallback default Jakarta jika geocoding gagal
        lat = -6.2088
        lon = 106.8456
        locationName = `${query} (Default Koordinat)`
    }

    const aqiUrl = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi`
    const { data } = await axios.get(aqiUrl, { timeout: 10000 })

    const cur = data?.current
    if (!cur) throw new Error(`Data kualitas udara untuk ${locationName} tidak ditemukan.`)

    const aqi = cur.us_aqi || 0
    let statusLabel = 'Baik'
    let healthAdvice = 'Kualitas udara sangat baik. Tidak ada risiko bagi kesehatan umum.'

    if (aqi > 300) {
        statusLabel = 'BERBAHAYA'
        healthAdvice = 'PERINGATAN DARURAT: Seluruh masyarakat harus menghindari semua aktivitas di luar ruangan. Tutup ventilasi dan gunakan filter udara.'
    } else if (aqi > 200) {
        statusLabel = 'Sangat Tidak Sehat'
        healthAdvice = 'Peringatan kesehatan kondisi darurat. Seluruh populasi berpotensi terdampak. Hindari aktivitas luar dan wajib masker medis/N95.'
    } else if (aqi > 150) {
        statusLabel = 'Tidak Sehat'
        healthAdvice = 'Setiap orang dapat mulai mengalami gangguan kesehatan. Kurangi aktivitas fisik berat di luar dan gunakan masker pelindung.'
    } else if (aqi > 100) {
        statusLabel = 'Tidak Sehat bagi Kelompok Sensitif'
        healthAdvice = 'Penderita asma, gangguan pernapasan, lansia, dan anak-anak sebaiknya mengurangi aktivitas di luar ruangan.'
    } else if (aqi > 50) {
        statusLabel = 'Sedang'
        healthAdvice = 'Kualitas udara dapat diterima. Kelompok yang sangat sensitif polusi udara dianjurkan berhati-hati.'
    }

    let card = `╭── ✦ *KUALITAS UDARA (AQI)* ✦\n` +
        `• Lokasi: *${locationName}*\n` +
        `• Status Udara: *${statusLabel}*\n` +
        `• Indeks AQI: *${aqi}* (Skala US AQI)\n` +
        `• PM2.5: *${cur.pm2_5 ?? '-'} µg/m³*\n` +
        `• PM10: *${cur.pm10 ?? '-'} µg/m³*\n` +
        `• Ozon (O3): *${cur.ozone ?? '-'} µg/m³*\n` +
        `• Nitrogen Dioksida (NO2): *${cur.nitrogen_dioxide ?? '-'} µg/m³*\n` +
        `• Belerang Dioksida (SO2): *${cur.sulphur_dioxide ?? '-'} µg/m³*\n` +
        `• Karbon Monoksida (CO): *${cur.carbon_monoxide ?? '-'} µg/m³*\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*Saran Kesehatan:*\n` +
        `• ${healthAdvice}\n\n` +
        `_Data bersumber dari pemantauan kualitas udara atmosfer & satelit Open-Meteo._`

    return { text: card, aqi, statusLabel }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CUACA MARITIM & TINGGI GELOMBANG BMKG
// ─────────────────────────────────────────────────────────────────────────────

export async function getMaritimeForecast(query) {
    const metaUrl = 'https://maritim.bmkg.go.id/marine2026-data/meta/area_province.json'
    const { data: metaData } = await axios.get(metaUrl, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const provinces = metaData?.data || []
    const allAreas = []
    for (const prov of provinces) {
        for (const a of (prov.areas || [])) {
            allAreas.push({ ...a, province: prov.province })
        }
    }

    const q = (query || '').toLowerCase().trim()
    if (!q) {
        // Tampilkan 8 perairan populer jika user tidak memberikan parameter
        const popular = allAreas.slice(0, 8)
        let listText = `╭── ✦ *CUACA MARITIM BMKG* ✦\n` +
            `Gunakan perintah: \`.maritim <nama perairan>\`\n` +
            `Contoh: \`.maritim Selat Sunda\` atau \`.maritim Laut Jawa\`\n\n` +
            `*Contoh Daftar Wilayah Perairan:*\n`
        popular.forEach((p, idx) => {
            listText += `• [${idx + 1}] ${p.name} (${p.province})\n`
        })
        listText += `╰━━━━━━━━━━━━━━━━━━━━━━━\n_Sumber: maritim.bmkg.go.id_`
        return { text: listText }
    }

    const matched = allAreas.find(a => a.name.toLowerCase().includes(q)) ||
                    allAreas.find(a => a.province.toLowerCase().includes(q))

    if (!matched) {
        throw new Error(`Wilayah perairan dengan kata kunci "${query}" tidak ditemukan. Coba gunakan nama laut/selat (contoh: \`jawa\`, \`sunda\`, \`bali\`, \`makassar\`, \`malaka\`).`)
    }

    const detailUrl = `https://maritim.bmkg.go.id/marine2026-data/perairan/${encodeURIComponent(matched.id)}.json`
    const { data: detail } = await axios.get(detailUrl, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const day1 = detail?.forecast_day1?.[0] || {}
    const waveCat = day1.wave_cat || 'Normal'
    const waveHeight = day1.wave_height ?? '-'

    let card = `╭── ✦ *CUACA MARITIM BMKG* ✦\n` +
        `• Wilayah: *${detail.name || matched.name}*\n` +
        `• Kode Wilayah: ${detail.code || matched.id}\n` +
        `• Stasiun Penerbit: ${detail.nama_stasiun || '-'}\n` +
        `• Waktu Berlaku: ${detail.valid_from || '-'} s/d ${detail.valid_to || '-'}\n` +
        `• Kondisi Cuaca: *${day1.weather || '-'}*\n` +
        `• Kategori Gelombang: *${waveCat}*\n` +
        `• Tinggi Gelombang: *${waveHeight} meter*\n` +
        `• Angin: *${day1.wind_speed ?? '-'} knot* (Hembusan: ${day1.wind_gust ?? '-'} knot)\n` +
        `• Arah Angin Dari: *${day1.wind_from || '-'}*\n` +
        `• Suhu Rata-rata: ${day1.temp_avg ?? '-'}°C | Kelembapan: ${day1.rh_avg ?? '-'}%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    if (/tinggi|ekstrem|sangat tinggi/i.test(waveCat)) {
        card += `*PERINGATAN KESELAMATAN PELAYARAN:*\n` +
            `• Waspadai potensi risiko tinggi terhadap perahu nelayan, kapal tongkang, dan kapal ferry.\n`
    } else {
        card += `_Tetap pantau kondisi cuaca laut sebelum melakukan pelayaran._\n`
    }

    card += `_Sumber Data: Stasiun Meteorologi Maritim BMKG Indonesia_`

    return { text: card, matched }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. PERINGATAN DINI CUACA EKSTREM BMKG (NOWCASTING)
// ─────────────────────────────────────────────────────────────────────────────

export async function getWeatherAlerts(limit = 5) {
    const rssUrl = 'https://www.bmkg.go.id/alerts/nowcast/id/rss.xml'
    const { data: xml } = await axios.get(rssUrl, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const items = []
    const regex = /<item>([\s\S]*?)<\/item>/gi
    let match
    while ((match = regex.exec(xml)) !== null) {
        const itemXml = match[1]
        const title = itemXml.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || ''
        const link = itemXml.match(/<link>([\s\S]*?)<\/link>/i)?.[1]?.trim() || ''
        const desc = itemXml.match(/<description>([\s\S]*?)<\/description>/i)?.[1]?.trim() || ''
        if (title && desc) {
            items.push({ title, link, desc })
        }
    }

    if (items.length === 0) {
        return {
            text: `╭── ✦ *CUACA EKSTREM BMKG* ✦\n` +
                `Saat ini tidak ada peringatan dini cuaca ekstrem aktif dari sistem Nowcasting BMKG.\n` +
                `Kondisi atmosfer secara umum terpantau aman terkendali.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n_Sumber: bmkg.go.id/alerts/nowcast_`
        }
    }

    const selected = items.slice(0, limit)
    let output = `╭── ✦ *CUACA EKSTREM BMKG* ✦\n` +
        `_Peringatan Dini Cuaca Aktif (${selected.length} Wilayah)_\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    selected.forEach((alert, index) => {
        output += `*[${index + 1}] ${alert.title}*\n` +
            `• Keterangan:\n  ${alert.desc.replace(/\n\s*/g, '\n  ')}\n`

        if (index < selected.length - 1) {
            output += `\n`
        }
    })

    output += `\n_Masyarakat dihimbau waspada genangan, pohon tumbang, dan kilat/petir._`

    return { text: output, items: selected }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. ABU VULKANIK & ERUPSI GUNUNG API (PVMBG MAGMA INDONESIA)
// ─────────────────────────────────────────────────────────────────────────────

export async function getVonaAlerts(limit = 5) {
    // 1. Coba ambil dari portal resmi Informasi Letusan (Bahasa Indonesia)
    try {
        const letusanUrl = 'https://magma.esdm.go.id/v1/gunung-api/informasi-letusan'
        const { data: html } = await axios.get(letusanUrl, {
            headers: BMKG_HEADERS,
            timeout: 10000
        })

        const chunks = html.split(/class="timeline-item"/).slice(1)
        const list = []

        for (const c of chunks) {
            const timeMatch = c.match(/class="timeline-time"[^>]*>([\s\S]*?)<\/div>/i)
            const titleMatch = c.match(/class="timeline-title"[^>]*>([\s\S]*?)<\/p>/i)
            const authorMatch = c.match(/class="timeline-author"[^>]*>([\s\S]*?)<\/p>/i)
            const textMatch = c.match(/class="timeline-text"[^>]*>([\s\S]*?)<\/p>/i)
            const linkMatch = c.match(/href="([^"]+)"[^>]*>Details/i) || c.match(/href="([^"]*(?:vona|laporan|informasi)[^"]*)"/i)

            const time = timeMatch ? timeMatch[1].replace(/<[^>]+>/g, '').trim() : ''
            const gunung = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''
            const author = authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''
            let desc = textMatch ? textMatch[1].replace(/&plusmn;/g, '±').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : ''

            if (gunung && desc) {
                const detailUrl = linkMatch
                    ? (linkMatch[1].startsWith('http') ? linkMatch[1] : `https://magma.esdm.go.id${linkMatch[1]}`)
                    : 'https://magma.esdm.go.id/v1/gunung-api/informasi-letusan'

                list.push({
                    gunung,
                    time,
                    author: author.replace(/^Dibuat oleh\s+/i, ''),
                    desc,
                    url: detailUrl
                })
            }
        }

        if (list.length > 0) {
            const selected = list.slice(0, limit)
            let output = `╭── ✦ *ABU VULKANIK (PVMBG)* ✦\n` +
                `_Layanan Resmi PVMBG / MAGMA Indonesia_\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

            selected.forEach((item, idx) => {
                output += `*[${idx + 1}] Gunung ${item.gunung} (${item.time})*\n` +
                    `• Petugas Pengamat: ${item.author || '-'}\n` +
                    `• Laporan Erupsi:\n  ${item.desc}\n` +
                    `• Tautan Resmi: ${item.url}\n`

                if (idx < selected.length - 1) {
                    output += `\n`
                }
            })

            output += `\n_Sumber: Pusat Vulkanologi dan Mitigasi Bencana Geologi (PVMBG - Badan Geologi)._`
            return { text: output, items: selected }
        }
    } catch (e) {
        console.warn('[MAGMA] Gagal ambil informasi letusan, fallback ke VONA:', e.message)
    }

    // 2. Fallback ke feed VONA jika informasi-letusan tidak terjangkau (diterjemahkan ke Bahasa Indonesia)
    const vonaUrl = 'https://magma.esdm.go.id/vona'
    const { data: html } = await axios.get(vonaUrl, {
        headers: BMKG_HEADERS,
        timeout: 10000
    })

    const chunks = html.split(/class="timeline-item"/).slice(1)
    const vonaList = []

    for (const c of chunks) {
        const titleMatch = c.match(/class="timeline-title"[^>]*>([\s\S]*?)<\/p>/i)
        const linkMatch = titleMatch ? titleMatch[1].match(/href="([^"]+)"[^>]*>([^<]+)<\/a>/i) : null
        const authorMatch = c.match(/class="timeline-author"[^>]*>([\s\S]*?)<\/p>/i)
        const textMatch = c.match(/class="timeline-text"[^>]*>([\s\S]*?)<\/p>/i)
        const colorMatch = c.match(/bg-(warning|danger|success|primary|info|secondary)/i)

        let colorCode = 'Normal'
        if (colorMatch) {
            const col = colorMatch[1]
            if (col === 'danger') colorCode = 'RED (Bahaya)'
            else if (col === 'warning') colorCode = 'ORANGE (Waspada Tinggi)'
            else if (col === 'info' || col === 'primary') colorCode = 'YELLOW (Waspada)'
            else if (col === 'success') colorCode = 'GREEN (Normal)'
        }

        if (linkMatch && textMatch) {
            let rawDetails = textMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
            // Terjemahkan detail VONA ke Bahasa Indonesia
            let idDetails = rawDetails
                .replace(/Eruption with volcanic ash cloud at/gi, 'Erupsi disertai sebaran awan abu vulkanik pada')
                .replace(/Eruption at/gi, 'Erupsi pada')
                .replace(/Ash-cloud is not observed/gi, 'Kolom abu tidak teramati')
                .replace(/Increasing in volcanic activity/gi, 'Peningkatan aktivitas vulkanik')
                .replace(/Best estimate of ash-cloud top is around/gi, 'Perkiraan puncak kolom abu sekitar')
                .replace(/above sea level/gi, 'di atas permukaan laut')
                .replace(/above summit/gi, 'di atas puncak kawah')
                .replace(/May be higher than what can be observed clearly/gi, 'Bisa lebih tinggi dari pengamatan visual')
                .replace(/Source of height data:\s*ground observer/gi, 'Sumber: pengamat pos darat')

            let authorText = (authorMatch ? authorMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '')
                .replace(/hours?\s+ago/gi, 'jam lalu')
                .replace(/minutes?\s+ago/gi, 'menit lalu')
                .replace(/days?\s+ago/gi, 'hari lalu')

            vonaList.push({
                title: linkMatch[2].trim(),
                url: linkMatch[1].trim(),
                author: authorText,
                details: idDetails,
                colorCode
            })
        }
    }

    if (vonaList.length === 0) {
        return {
            text: `╭── ✦ *ABU VULKANIK (PVMBG)* ✦\n` +
                `Tidak ada pemberitahuan erupsi atau abu vulkanik aktif saat ini.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n_Sumber: PVMBG - MAGMA Indonesia_`
        }
    }

    const selected = vonaList.slice(0, limit)
    let output = `╭── ✦ *ABU VULKANIK (PVMBG)* ✦\n` +
        `_Layanan Resmi PVMBG / MAGMA Indonesia_\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    selected.forEach((vona, idx) => {
        output += `*[${idx + 1}] ${vona.title}*\n` +
            `• Status Bahaya Penerbangan: *${vona.colorCode}*\n` +
            `• Waktu / Pelapor: ${vona.author}\n` +
            `• Laporan Erupsi: ${vona.details}\n` +
            `• Tautan Resmi: ${vona.url}\n`

        if (idx < selected.length - 1) {
            output += `\n`
        }
    })

    output += `\n_Data resmi navigasi penerbangan & kewaspadaan erupsi PVMBG._`

    return { text: output, items: selected }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. HELPER BUTTON LIST: KATEGORI ABJAD & WILAYAH POPULER
// ─────────────────────────────────────────────────────────────────────────────

export function getPopularCities() {
    return [
        { name: 'DKI Jakarta (Pusat)', clean: 'jakarta', desc: 'Ibu Kota Negara' },
        { name: 'Kota Surabaya', clean: 'surabaya', desc: 'Jawa Timur' },
        { name: 'Kota Bandung', clean: 'bandung', desc: 'Jawa Barat' },
        { name: 'Kota Medan', clean: 'medan', desc: 'Sumatera Utara' },
        { name: 'Kota Semarang', clean: 'semarang', desc: 'Jawa Tengah' },
        { name: 'Kota Makassar', clean: 'makassar', desc: 'Sulawesi Selatan' },
        { name: 'Kota Yogyakarta', clean: 'yogyakarta', desc: 'DI Yogyakarta' },
        { name: 'Kota Denpasar (Bali)', clean: 'denpasar', desc: 'Bali' },
        { name: 'Kota Palembang', clean: 'palembang', desc: 'Sumatera Selatan' },
        { name: 'Kota Balikpapan', clean: 'balikpapan', desc: 'Kalimantan Timur' }
    ]
}

export function getLetterGroups() {
    return [
        { group: 'A', title: 'Huruf A', desc: 'Aceh, Ambon, Asahan, Agam, dll.', letters: ['A'] },
        { group: 'B', title: 'Huruf B', desc: 'Bandung, Bekasi, Bogor, Bali, Batam, dll.', letters: ['B'] },
        { group: 'C', title: 'Huruf C', desc: 'Cirebon, Cimahi, Cilegon, Ciamis, dll.', letters: ['C'] },
        { group: 'D-G', title: 'Huruf D - G', desc: 'Depok, Denpasar, Gorontalo, Gresik, dll.', letters: ['D', 'E', 'F', 'G', 'H', 'I'] },
        { group: 'J', title: 'Huruf J', desc: 'Jakarta, Jambi, Jember, Jayapura, dll.', letters: ['J'] },
        { group: 'K', title: 'Huruf K', desc: 'Kediri, Kupang, Kendari, Karawang, dll.', letters: ['K'] },
        { group: 'L-M', title: 'Huruf L - M', desc: 'Malang, Medan, Makassar, Manado, Lampung, dll.', letters: ['L', 'M'] },
        { group: 'P', title: 'Huruf P', desc: 'Padang, Palembang, Pekanbaru, Pontianak, dll.', letters: ['P'] },
        { group: 'S', title: 'Huruf S', desc: 'Surabaya, Semarang, Solo, Samarinda, dll.', letters: ['S'] },
        { group: 'T-Z', title: 'Huruf T - Z', desc: 'Tangerang, Tasikmalaya, Tegal, Yogyakarta, dll.', letters: ['T', 'U', 'V', 'W', 'Y', 'Z'] }
    ]
}

export function getCitiesByAbjad(groupCode, max = 20) {
    const list = loadWilayahList()
    const groups = getLetterGroups()
    const foundGroup = groups.find(g => g.group.toLowerCase() === (groupCode || '').toLowerCase().trim())
    
    const letters = foundGroup ? foundGroup.letters : [groupCode.toUpperCase().charAt(0)]

    const seen = new Set()
    const matches = []

    for (const d of list) {
        if (!d.clean) continue
        const first = d.clean[0]?.toUpperCase()
        if (letters.includes(first) && !seen.has(d.clean)) {
            seen.add(d.clean)
            matches.push(d)
        }
    }

    // Prioritaskan Kota dibanding Kabupaten, lalu abjad nama
    matches.sort((a, b) => {
        if (a.isKota && !b.isKota) return -1
        if (!a.isKota && b.isKota) return 1
        return a.clean.localeCompare(b.clean)
    })

    return matches.slice(0, max)
}

export function getAllCitySections(usedPrefix = '.', cmdName = 'cuaca') {
    const list = loadWilayahList()
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
    const sectionsMap = {}
    alphabet.forEach(letter => sectionsMap[letter] = [])

    const popular = getPopularCities()
    const seen = new Set()

    for (const d of list) {
        if (!d.clean || seen.has(d.clean)) continue
        seen.add(d.clean)
        const first = d.clean[0]?.toUpperCase()
        if (sectionsMap[first]) {
            let rawName = d.name
                .replace(/^KAB\.\s*/i, 'Kab. ')
                .replace(/^KOTA\s+ADM\.\s*/i, 'Kota Adm. ')
                .replace(/^KOTA\.\s*/i, 'Kota ')
                .replace(/^KOTA\s+/i, 'Kota ')
            const titleName = rawName.toLowerCase().replace(/(?:^|\s|\/|\-|\.)\S/g, m => m.toUpperCase())
            sectionsMap[first].push({
                title: titleName.slice(0, 24),
                description: `Prakiraan cuaca 3 hari (${d.clean})`.slice(0, 72),
                id: `${usedPrefix}${cmdName} ${d.clean}`,
                isKota: d.isKota
            })
        }
    }

    const sections = [
        {
            title: 'Kota Populer Indonesia',
            rows: popular.map(p => ({
                title: p.name.slice(0, 24),
                description: p.desc.slice(0, 72),
                id: `${usedPrefix}${cmdName} ${p.clean}`
            }))
        }
    ]

    for (const letter of alphabet) {
        const rows = sectionsMap[letter]
        if (rows && rows.length > 0) {
            rows.sort((a, b) => (b.isKota ? 1 : 0) - (a.isKota ? 1 : 0))
            sections.push({
                title: `Wilayah Huruf ${letter} (${rows.length} Daerah)`,
                rows: rows.map(r => ({
                    title: r.title,
                    description: r.description,
                    id: r.id
                }))
            })
        }
    }

    return sections
}

