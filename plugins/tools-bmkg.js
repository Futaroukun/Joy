/*
- @Author     : Rafli
- @Feature    : Info BMKG Terpadu & Siaga Bencana Nasional (Interactive Single-Select Menu)
- @Description: Layanan lengkap BMKG & PVMBG dengan antarmuka tombol interaktif single_select: Kategori Abjad Wilayah, Prakiraan Cuaca 3 Hari, Kualitas Udara (PM2.5/AQI), Cuaca Maritim & Gelombang, Peringatan Cuaca Ekstrem, dan Abu Vulkanik VONA MAGMA.
*/

import {
    getAutoGempa,
    getGempaTerkini,
    getGempaDirasakan,
    formatGempaCard,
    formatGempaList,
    fetchShakemapBuffer
} from '../function/scrapers/gempa.js'

import {
    getWeatherForecast,
    getAirQuality,
    getMaritimeForecast,
    getWeatherAlerts,
    getVonaAlerts,
    getPopularCities,
    getLetterGroups,
    getCitiesByAbjad,
    getAllCitySections
} from '../function/scrapers/cuaca.js'

let handler = async (m, { conn, usedPrefix, command, args, isOwner, isAdmin }) => {
    const cmd = command.toLowerCase().trim()
    const sub = (args[0] || '').toLowerCase().trim()

    // ─────────────────────────────────────────────────────────────────────────
    // 1. PRAKIRAAN CUACA BMKG (INTERAKTIF & MANUAL)
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === 'cuaca' || (cmd === 'bmkg' && sub === 'cuaca')) {
        const queryArgs = cmd === 'cuaca' ? args : args.slice(1)
        const subCuaca = (queryArgs[0] || '').toLowerCase().trim()

        // ── A. PEMILIHAN KOTA BERDASARKAN ABJAD TERTENTU (OPSIONAL) ──
        if (subCuaca === 'abjad') {
            const groupCode = queryArgs[1] || 'A'
            const cities = getCitiesByAbjad(groupCode, 50)

            if (cities.length === 0) {
                return m.reply(`Tidak ditemukan kota dengan kelompok abjad "${groupCode}".`)
            }

            const rows = cities.map(c => {
                let rawName = c.name
                    .replace(/^KAB\.\s*/i, 'Kab. ')
                    .replace(/^KOTA\s+ADM\.\s*/i, 'Kota Adm. ')
                    .replace(/^KOTA\.\s*/i, 'Kota ')
                    .replace(/^KOTA\s+/i, 'Kota ')

                const titleName = rawName.toLowerCase().replace(/(?:^|\s|\/|\-|\.)\S/g, m => m.toUpperCase())

                return {
                    title: titleName.slice(0, 24),
                    description: `Prakiraan cuaca 3 hari (${c.clean})`.slice(0, 72),
                    id: `${usedPrefix}cuaca ${c.clean}`
                }
            })

            const bodyText = `Silakan pilih salah satu kota/kabupaten dengan awalan *${groupCode.toUpperCase()}* di bawah ini untuk melihat prakiraan cuaca 3 hari resmi dari BMKG:`

            try {
                if (typeof conn.sendButton === 'function') {
                    return await conn.sendButton(m.chat, {
                        header: `KOTA ABJAD ${groupCode.toUpperCase()}`,
                        body: bodyText,
                        footer: `${global.info?.namabot || 'Joy'} • BMKG Weather`,
                        buttons: [{
                            name: 'single_select',
                            buttonParamsJson: JSON.stringify({
                                title: 'PILIH KOTA',
                                sections: [{
                                    title: `Wilayah Abjad ${groupCode.toUpperCase()}`,
                                    rows
                                }]
                            })
                        }]
                    }, { quoted: m })
                }
            } catch {}

            // Fallback pesan teks jika sendButton gagal
            let txt = `╭── ✦ *KOTA ABJAD ${groupCode.toUpperCase()}* ✦\n` +
                `Ketik \`${usedPrefix}cuaca <nama kota>\` untuk melihat prakiraan:\n\n`
            cities.forEach(c => {
                txt += `• \`${usedPrefix}cuaca ${c.clean}\` — ${c.name}\n`
            })
            txt += `╰━━━━━━━━━━━━━━━━━━━━━━━`
            return m.reply(txt)
        }

        // ── B. MENU UTAMA CUACA: 1 SINGLE SELECT LENGKAP SELURUH WILAYAH SE-INDONESIA ──
        if (queryArgs.length === 0 || subCuaca === 'list') {
            const allSections = getAllCitySections(usedPrefix, 'cuaca')

            const bodyText = `Silakan pilih kota/kabupaten di Indonesia melalui menu di bawah untuk melihat prakiraan cuaca 3 hari resmi dari BMKG.\n\n` +
                `_Gunakan kolom pencarian di dalam tombol list untuk menemukan kota dengan cepat._`

            try {
                if (typeof conn.sendButton === 'function') {
                    return await conn.sendButton(m.chat, {
                        header: 'PILIH WILAYAH CUACA',
                        body: bodyText,
                        footer: `${global.info?.namabot || 'Joy'} • BMKG Weather (500+ Kota)`,
                        buttons: [{
                            name: 'single_select',
                            buttonParamsJson: JSON.stringify({
                                title: 'DAFTAR KOTA SE-INDONESIA',
                                sections: allSections
                            })
                        }]
                    }, { quoted: m })
                }
            } catch {}

            // Fallback pesan teks
            const popular = getPopularCities()
            let txt = `╭── ✦ *PILIH WILAYAH CUACA* ✦\n` +
                `Gunakan format: \`${usedPrefix}cuaca <nama kota>\`\n\n` +
                `*Kota Populer:*\n`
            popular.forEach(p => {
                txt += `• \`${usedPrefix}cuaca ${p.clean}\` (${p.name})\n`
            })
            txt += `╰━━━━━━━━━━━━━━━━━━━━━━━`
            return m.reply(txt)
        }

        // ── C. PENCARIAN CUACA MANUAL BERDASARKAN KOTA/KODE ──
        const query = queryArgs.join(' ').trim()
        const loadingMsg = await m.reply('_Mengambil prakiraan cuaca dari BMKG..._')
        try {
            const res = await getWeatherForecast(query)
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return await m.reply(res.text)
        } catch (e) {
            console.error('[BMKG CUACA]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil prakiraan cuaca: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil prakiraan cuaca: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 2. KUALITAS UDARA & INDEKS POLUSI (PM2.5 / AQI)
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === 'udara' || cmd === 'aqi' || (cmd === 'bmkg' && /^(udara|aqi|polusi)$/i.test(sub))) {
        const queryArgs = (cmd === 'bmkg') ? args.slice(1) : args
        const query = queryArgs.join(' ').trim()

        if (!query || query === 'list') {
            const allSections = getAllCitySections(usedPrefix, 'udara')

            try {
                if (typeof conn.sendButton === 'function') {
                    return await conn.sendButton(m.chat, {
                        header: 'KUALITAS UDARA (AQI)',
                        body: 'Pilih salah satu kota di bawah untuk memantau konsentrasi PM2.5 dan indeks polusi udara secara langsung:\n\n_Gunakan kolom pencarian di dalam tombol list untuk menemukan kota dengan cepat._',
                        footer: `${global.info?.namabot || 'Joy'} • Air Quality (500+ Kota)`,
                        buttons: [{
                            name: 'single_select',
                            buttonParamsJson: JSON.stringify({
                                title: 'DAFTAR KOTA SE-INDONESIA',
                                sections: allSections
                            })
                        }]
                    }, { quoted: m })
                }
            } catch {}

            const popular = getPopularCities()
            let txt = `╭── ✦ *KUALITAS UDARA (AQI)* ✦\n` +
                `Gunakan format: \`${usedPrefix + cmd} <nama kota>\`\n\n` +
                `*Contoh Kota:*\n`
            popular.forEach(p => {
                txt += `• \`${usedPrefix + cmd} ${p.clean}\` (${p.name})\n`
            })
            txt += `╰━━━━━━━━━━━━━━━━━━━━━━━`
            return m.reply(txt)
        }

        const loadingMsg = await m.reply('_Mengambil data kualitas udara & indeks polusi..._')
        try {
            const res = await getAirQuality(query)
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return await m.reply(res.text)
        } catch (e) {
            console.error('[BMKG UDARA]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil data kualitas udara: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data kualitas udara: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 3. CUACA MARITIM & TINGGI GELOMBANG BMKG
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === 'maritim' || cmd === 'gelombang' || (cmd === 'bmkg' && /^(maritim|gelombang|laut)$/i.test(sub))) {
        const queryArgs = (cmd === 'bmkg') ? args.slice(1) : args
        const query = queryArgs.join(' ').trim()

        if (!query || query === 'list') {
            const popularAreas = [
                { name: 'Laut Jawa Bagian Tengah', id: 'M.20', desc: 'Perairan Pulau Jawa' },
                { name: 'Samudra Hindia S. Jabar', id: 'M.09', desc: 'Selatan Jawa Barat' },
                { name: 'Perairan Sabang Banda Aceh', id: 'P.A.04', desc: 'Ujung Barat Indonesia' },
                { name: 'Perairan Selatan Bali', id: 'P.P.04', desc: 'Wilayah Bali & Nusa Tenggara' },
                { name: 'Selat Badung', id: 'P.P.02', desc: 'Perlintasan Bali - Nusa Penida' },
                { name: 'Selat Sunda', id: 'sunda', desc: 'Perlintasan Jawa - Sumatera' },
                { name: 'Selat Bali', id: 'bali', desc: 'Perlintasan Ketapang - Gilimanuk' },
                { name: 'Selat Makassar', id: 'makassar', desc: 'Perlintasan Kalimantan - Sulawesi' }
            ]

            const rows = popularAreas.map(p => ({
                title: p.name.slice(0, 24),
                description: p.desc.slice(0, 72),
                id: `${usedPrefix}maritim ${p.id}`
            }))

            try {
                if (typeof conn.sendButton === 'function') {
                    return await conn.sendButton(m.chat, {
                        header: 'CUACA MARITIM BMKG',
                        body: 'Pilih salah satu wilayah perairan atau selat di bawah untuk melihat tinggi gelombang dan kecepatan angin laut:',
                        footer: `${global.info?.namabot || 'Joy'} • BMKG Maritime`,
                        buttons: [{
                            name: 'single_select',
                            buttonParamsJson: JSON.stringify({
                                title: 'PILIH PERAIRAN',
                                sections: [{
                                    title: 'Perairan & Selat Populer',
                                    rows
                                }]
                            })
                        }]
                    }, { quoted: m })
                }
            } catch {}

            const res = await getMaritimeForecast('')
            return m.reply(res.text)
        }

        const loadingMsg = await m.reply('_Mengambil data cuaca maritim BMKG..._')
        try {
            const res = await getMaritimeForecast(query)
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return await m.reply(res.text)
        } catch (e) {
            console.error('[BMKG MARITIM]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil data cuaca maritim: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data cuaca maritim: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 4. PERINGATAN DINI CUACA EKSTREM BMKG (NOWCASTING)
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === 'cuacaekstrem' || (cmd === 'bmkg' && /^(ekstrem|warning|alert|nowcast)$/i.test(sub))) {
        const loadingMsg = await m.reply('_Mengambil peringatan dini cuaca ekstrem BMKG..._')
        try {
            const res = await getWeatherAlerts(5)
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return await m.reply(res.text)
        } catch (e) {
            console.error('[BMKG EKSTREM]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil peringatan cuaca: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil peringatan cuaca: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 5. ABU VULKANIK & ERUPSI GUNUNG API (PVMBG MAGMA INDONESIA - VONA)
    // ─────────────────────────────────────────────────────────────────────────
    if (cmd === 'vona' || cmd === 'gunungapi' || cmd === 'erupsi' || (cmd === 'bmkg' && /^(vona|gunung|gunungapi|abu|erupsi)$/i.test(sub))) {
        const loadingMsg = await m.reply('_Mengambil data abu vulkanik dari PVMBG..._')
        try {
            const res = await getVonaAlerts(5)
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return await m.reply(res.text)
        } catch (e) {
            console.error('[MAGMA VONA]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil data VONA: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data VONA: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 6. SUBCOMMAND: AUTO GEMPA ON / OFF / STATUS
    // ─────────────────────────────────────────────────────────────────────────
    if (/^(auto|alert|notif|siaga|status)$/i.test(sub)) {
        if (!m.isGroup && !isOwner) {
            return m.reply('*AKSES DITOLAK*\nFitur Auto Gempa hanya dapat diatur di dalam grup.')
        }

        const chat = global.db.data.chats[m.chat] || {}
        const action = (sub === 'status' ? 'status' : (args[1] || '').toLowerCase().trim())

        if (/^(on|enable|1|aktif)$/i.test(action)) {
            if (!isAdmin && !isOwner) {
                return m.reply('*AKSES DITOLAK*\nAnda harus menjadi *Admin Grup* untuk mengaktifkan Auto Gempa.')
            }
            chat.autogempa = true
            global.saveData?.('chats', m.chat)
            return m.reply(
                `*AUTO GEMPA DIAKTIFKAN*\n\n` +
                `Grup ini akan menerima notifikasi siaga gempa bumi terbaru secara otomatis dari BMKG.`
            )
        } else if (/^(off|disable|0|mati)$/i.test(action)) {
            if (!isAdmin && !isOwner) {
                return m.reply('*AKSES DITOLAK*\nAnda harus menjadi *Admin Grup* untuk mematikan Auto Gempa.')
            }
            chat.autogempa = false
            global.saveData?.('chats', m.chat)
            return m.reply(
                `*AUTO GEMPA DINONAKTIFKAN*\n\n` +
                `Grup ini tidak akan menerima notifikasi siaga gempa otomatis.`
            )
        } else {
            const currentStatus = chat.autogempa ? 'AKTIF' : 'NONAKTIF'
            return m.reply(
                `*STATUS AUTO GEMPA GRUP*\n\n` +
                `• Status: *${currentStatus}*\n` +
                `• Sumber: Server BMKG Indonesia (Monitoring Realtime)\n\n` +
                `*Cara Mengatur:*\n` +
                `• Aktifkan: \`${usedPrefix + command} auto on\`\n` +
                `• Matikan: \`${usedPrefix + command} auto off\``
            )
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 7. SUBCOMMAND: GEMPA TERKINI & SHAKEMAP
    // ─────────────────────────────────────────────────────────────────────────
    if (/^(terkini|latest|now|shakemap|peta|gambar)$/i.test(sub)) {
        const loadingMsg = await m.reply('_Mengambil data gempa terkini dari BMKG..._')
        try {
            const gempa = await getAutoGempa()
            const card = formatGempaCard(gempa, false)

            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})

            if (card.shakemap) {
                const imageBuffer = await fetchShakemapBuffer(card.shakemap)
                if (imageBuffer) {
                    return await conn.sendMessage(m.chat, {
                        image: imageBuffer,
                        caption: card.text
                    }, { quoted: m })
                }
            }

            return await m.reply(card.text)

        } catch (e) {
            console.error('[GEMPA TERKINI]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil info gempa: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data gempa: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 8. SUBCOMMAND: GEMPA DIRASAKAN (MMI)
    // ─────────────────────────────────────────────────────────────────────────
    if (/^(dirasakan|mmi|skala|rasa)$/i.test(sub)) {
        const loadingMsg = await m.reply('_Mengambil data gempa dirasakan dari BMKG..._')
        try {
            const list = await getGempaDirasakan()
            const limit = parseInt(args[1]) || 5
            const text = formatGempaList(list, 'dirasakan', Math.min(Math.max(limit, 1), 10))

            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return m.reply(text)
        } catch (e) {
            console.error('[GEMPA DIRASAKAN]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil data gempa dirasakan: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data gempa: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 9. SUBCOMMAND: DAFTAR GEMPA M 5.0+
    // ─────────────────────────────────────────────────────────────────────────
    if (/^(list|m5|5|daftar|5plus)$/i.test(sub)) {
        const loadingMsg = await m.reply('_Mengambil daftar gempa M 5.0+ dari BMKG..._')
        try {
            const list = await getGempaTerkini()
            const limit = parseInt(args[1]) || 5
            const text = formatGempaList(list, 'm5', Math.min(Math.max(limit, 1), 10))

            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
            return m.reply(text)
        } catch (e) {
            console.error('[GEMPA LIST M5]', e)
            return conn.sendMessage(m.chat, {
                text: `Gagal mengambil daftar gempa M 5.0+: ${e.message}`,
                edit: loadingMsg.key
            }).catch(() => m.reply(`Gagal mengambil data gempa: ${e.message}`))
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // 10. DEFAULT: PUSAT MENU BMKG (INTERACTIVE SINGLE-SELECT)
    // ─────────────────────────────────────────────────────────────────────────
    const mainSections = [
        {
            title: 'Layanan Cuaca & Udara',
            rows: [
                {
                    title: 'Prakiraan Cuaca',
                    description: 'Pilih kota via abjad / kota populer',
                    id: `${usedPrefix}cuaca`
                },
                {
                    title: 'Kualitas Udara',
                    description: 'Pantau konsentrasi PM2.5 & polusi udara',
                    id: `${usedPrefix}udara`
                },
                {
                    title: 'Cuaca Maritim',
                    description: 'Tinggi gelombang laut & pelayaran',
                    id: `${usedPrefix}maritim`
                },
                {
                    title: 'Cuaca Ekstrem',
                    description: 'Peringatan hujan lebat, kilat & angin kencang',
                    id: `${usedPrefix}cuacaekstrem`
                }
            ]
        },
        {
            title: 'Geologi & Kebencanaan',
            rows: [
                {
                    title: 'Abu Vulkanik',
                    description: 'Laporan erupsi PVMBG MAGMA Indonesia',
                    id: `${usedPrefix}vona`
                },
                {
                    title: 'Gempa Mutakhir',
                    description: 'Info gempa terkini + peta guncangan',
                    id: `${usedPrefix}gempa terkini`
                },
                {
                    title: 'Gempa Dirasakan',
                    description: 'Daftar gempa terkini skala MMI',
                    id: `${usedPrefix}gempa dirasakan`
                },
                {
                    title: 'Gempa M 5.0+',
                    description: '15 gempa bumi signifikan terbaru',
                    id: `${usedPrefix}gempa list`
                },
                {
                    title: 'Auto Gempa Grup',
                    description: 'Cek status atau atur pemantau gempa grup',
                    id: `${usedPrefix}gempa status`
                }
            ]
        }
    ]

    try {
        if (typeof conn.sendButton === 'function') {
            return await conn.sendButton(m.chat, {
                header: 'BMKG & BENCANA',
                body: 'Selamat datang di Pusat Informasi Terpadu BMKG & PVMBG Indonesia.\nSilakan pilih layanan informasi cuaca atau bencana yang Anda butuhkan melalui tombol di bawah:',
                footer: `${global.info?.namabot || 'Joy'} • Official BMKG Services`,
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'PILIH LAYANAN',
                        sections: mainSections
                    })
                }]
            }, { quoted: m })
        }
    } catch {}

    // Fallback menu teks statis
    const helpText =
        `╭── ✦ *BMKG & BENCANA* ✦\n` +
        `│ Sumber: BMKG & PVMBG Indonesia\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*1. Informasi Gempa Bumi:*\n` +
        `• \`${usedPrefix}gempa terkini\` — Info gempa mutakhir + peta guncangan (*shakemap*)\n` +
        `• \`${usedPrefix}gempa dirasakan\` — Daftar gempa dirasakan masyarakat (skala MMI)\n` +
        `• \`${usedPrefix}gempa list\` — Riwayat kejadian gempa M 5.0+\n` +
        `• \`${usedPrefix}gempa auto <on/off>\` — Saklar siaga notifikasi gempa otomatis grup\n` +
        `• \`${usedPrefix}gempa status\` — Cek status pemantau gempa grup\n\n` +
        `*2. Prakiraan Cuaca 3 Hari (BMKG):*\n` +
        `• \`${usedPrefix}cuaca\` — Buka daftar wilayah interaktif per abjad\n` +
        `• \`${usedPrefix}cuaca <nama kota>\` — Cek langsung prakiraan cuaca kota\n\n` +
        `*3. Kualitas Udara & Indeks Polusi:*\n` +
        `• \`${usedPrefix}udara\` — Buka menu pemantauan AQI interaktif\n` +
        `• \`${usedPrefix}udara <nama kota>\` — Cek langsung PM2.5 & skor AQI\n\n` +
        `*4. Cuaca Maritim & Gelombang:*\n` +
        `• \`${usedPrefix}maritim\` — Daftar perairan & selat populer\n` +
        `• \`${usedPrefix}maritim <perairan>\` — Cek tinggi gelombang laut\n\n` +
        `*5. Peringatan Dini Cuaca Ekstrem:*\n` +
        `• \`${usedPrefix}cuacaekstrem\` — Peringatan aktif hujan lebat, petir & angin kencang\n\n` +
        `*6. Abu Vulkanik & Erupsi (PVMBG MAGMA):*\n` +
        `• \`${usedPrefix}vona\` — Peringatan abu vulkanik & status erupsi gunung api\n\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `_Data bersumber dari server resmi BMKG dan PVMBG MAGMA Indonesia._`

    return m.reply(helpText)
}

handler.help = [
    'bmkg',
    'gempa',
    'cuaca *kota*'
]
handler.tags = ['tools']
handler.command = /^(gempa|infogempa|bmkg|autogempa|cuaca|udara|aqi|maritim|gelombang|cuacaekstrem|vona|gunungapi|erupsi)$/i

export default handler