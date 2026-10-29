/*
 * @Author      : Rafli
 * @Feature     : User Age, Life Analytics & Astrology Engine
 * @Description : Menghitung umur detail, akumulasi masa hidup, astrologi zodiak & shio, weton Jawa kuno, serta countdown ulang tahun berikutnya.
 * @Version     : 3.0 (Strict Registration Linkage, Weton Jawa & No Direct Edit)
 */

import moment from 'moment-timezone'

const ZODIAC_LIST = [
    { sign: 'Capricorn', start: [12, 22], end: [1, 19], element: 'Tanah (Earth)', planet: 'Saturnus' },
    { sign: 'Aquarius',  start: [1, 20],  end: [2, 18], element: 'Udara (Air)',    planet: 'Uranus' },
    { sign: 'Pisces',    start: [2, 19],  end: [3, 20], element: 'Air (Water)',    planet: 'Neptunus' },
    { sign: 'Aries',     start: [3, 21],  end: [4, 19], element: 'Api (Fire)',     planet: 'Mars' },
    { sign: 'Taurus',    start: [4, 20],  end: [5, 20], element: 'Tanah (Earth)', planet: 'Venus' },
    { sign: 'Gemini',    start: [5, 21],  end: [6, 20], element: 'Udara (Air)',    planet: 'Merkurius' },
    { sign: 'Cancer',    start: [6, 21],  end: [7, 22], element: 'Air (Water)',    planet: 'Bulan' },
    { sign: 'Leo',       start: [7, 23],  end: [8, 22], element: 'Api (Fire)',     planet: 'Matahari' },
    { sign: 'Virgo',     start: [8, 23],  end: [9, 22], element: 'Tanah (Earth)', planet: 'Merkurius' },
    { sign: 'Libra',     start: [9, 23],  end: [10, 22], element: 'Udara (Air)',   planet: 'Venus' },
    { sign: 'Scorpio',   start: [10, 23], end: [11, 21], element: 'Air (Water)',   planet: 'Pluto & Mars' },
    { sign: 'Sagittarius', start: [11, 22], end: [12, 21], element: 'Api (Fire)',   planet: 'Jupiter' }
]

function getZodiac(day, month) {
    for (const z of ZODIAC_LIST) {
        if ((month === z.start[0] && day >= z.start[1]) || (month === z.end[0] && day <= z.end[1])) {
            return z
        }
    }
    return { sign: 'Capricorn', element: 'Tanah (Earth)', planet: 'Saturnus' }
}

function getChineseZodiac(year) {
    const animals = ['Monyet', 'Ayam', 'Anjing', 'Babi', 'Tikus', 'Kerbau', 'Macan', 'Kelinci', 'Naga', 'Ular', 'Kuda', 'Kambing']
    const elements = ['Logam', 'Logam', 'Air', 'Air', 'Kayu', 'Kayu', 'Api', 'Api', 'Tanah', 'Tanah']
    const animal = animals[year % 12]
    const element = elements[year % 10]
    return `${animal} ${element}`
}

function getGeneration(year) {
    if (year >= 2025) return 'Gen Beta'
    if (year >= 2013) return 'Gen Alpha'
    if (year >= 1997) return 'Gen Z'
    if (year >= 1981) return 'Millennial (Gen Y)'
    if (year >= 1965) return 'Gen X'
    if (year >= 1946) return 'Baby Boomer'
    return 'Silent Generation'
}

function getWeton(dateObj) {
    const pasarans = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon']
    const hariArr = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']

    const baseDate = new Date(Date.UTC(1945, 7, 17)) // 17 Agustus 1945 = Jumat Legi
    const targetDate = new Date(Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()))

    const diffDays = Math.round((targetDate - baseDate) / (1000 * 60 * 60 * 24))
    const pasaranIndex = ((diffDays % 5) + 5) % 5
    const pasaran = pasarans[pasaranIndex]
    const hari = hariArr[targetDate.getUTCDay()]

    const neptuHari = { 'Minggu': 5, 'Senin': 4, 'Selasa': 3, 'Rabu': 7, 'Kamis': 8, 'Jumat': 6, 'Sabtu': 9 }
    const neptuPasaran = { 'Legi': 5, 'Pahing': 9, 'Pon': 7, 'Wage': 4, 'Kliwon': 8 }
    const totalNeptu = (neptuHari[hari] || 0) + (neptuPasaran[pasaran] || 0)

    return {
        hari,
        pasaran,
        weton: `${hari} ${pasaran}`,
        neptu: totalNeptu
    }
}

function formatNumber(num) {
    return new Intl.NumberFormat('id-ID').format(Math.floor(num))
}

function parseDateInput(rawText) {
    moment.locale('id')
    const formats = [
        'DD-MM-YYYY', 'D-M-YYYY', 'DD/MM/YYYY', 'D/M/YYYY', 'DD.MM.YYYY',
        'DD MM YYYY', 'D M YYYY', 'DD MMMM YYYY', 'D MMMM YYYY', 'DD MMM YYYY',
        'YYYY-MM-DD', 'YYYY/MM/DD', 'DDMMYYYY'
    ]

    let clean = rawText.trim()
        .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
        .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
        .replace(/[-/.,]/g, ' ')

    return moment(clean, formats, 'id', true).tz('Asia/Jakarta')
}

function buildAnalyticsText({ name, birthDate, isSelf = true, usedPrefix, command }) {
    const today = moment().tz('Asia/Jakarta')

    const ageYears = today.diff(birthDate, 'years')
    const birthDatePlusYears = birthDate.clone().add(ageYears, 'years')
    const ageMonths = today.diff(birthDatePlusYears, 'months')
    const birthDatePlusMonths = birthDatePlusYears.clone().add(ageMonths, 'months')
    const ageDays = today.diff(birthDatePlusMonths, 'days')

    const totalMonths = today.diff(birthDate, 'months')
    const totalWeeks = today.diff(birthDate, 'weeks')
    const totalDays = today.diff(birthDate, 'days')
    const totalHours = today.diff(birthDate, 'hours')
    const totalMinutes = today.diff(birthDate, 'minutes')
    const totalSeconds = today.diff(birthDate, 'seconds')

    const zodiac = getZodiac(birthDate.date(), birthDate.month() + 1)
    const shio = getChineseZodiac(birthDate.year())
    const weton = getWeton(birthDate.toDate())
    const generation = getGeneration(birthDate.year())

    let nextBirthday = birthDate.clone().year(today.year())
    if (nextBirthday.isBefore(today, 'day')) {
        nextBirthday.add(1, 'year')
    }
    const daysToNext = nextBirthday.diff(today, 'days')
    const nextAge = ageYears + 1

    const progressDays = Math.max(0, 365 - daysToNext)
    const progressPct = Math.min(100, Math.round((progressDays / 365) * 100))
    const barLen = 10
    const filled = Math.round((progressPct / 100) * barLen)
    const progressBar = '█'.repeat(filled) + '░'.repeat(barLen - filled)

    let txt =
        `╭── ✦ *ANALISIS USIA & STATISTIK HIDUP* ✦\n` +
        `• *Nama:* ${name}\n` +
        `• *Tanggal Lahir:* ${birthDate.format('DD MMMM YYYY')}\n` +
        `• *Hari & Weton:* ${weton.weton} (Neptu ${weton.neptu})\n` +
        `• *Generasi:* ${generation}\n\n` +
        `• *Status Usia:* *${ageYears} Tahun, ${ageMonths} Bulan, ${ageDays} Hari*\n\n` +
        `╭── ✦ *AKUMULASI WAKTU HIDUP* ✦\n` +
        `• Total Bulan: ${formatNumber(totalMonths)} bulan\n` +
        `• Total Minggu: ${formatNumber(totalWeeks)} minggu\n` +
        `• Total Hari: ${formatNumber(totalDays)} hari\n` +
        `• Total Jam: ${formatNumber(totalHours)} jam\n` +
        `• Total Menit: ${formatNumber(totalMinutes)} menit\n` +
        `• Total Detik: ${formatNumber(totalSeconds)} detik\n\n` +
        `╭── ✦ *ASTROLOGI & ZODIAK* ✦\n` +
        `• Zodiak: *${zodiac.sign}* (${zodiac.element})\n` +
        `• Planet Penguasa: ${zodiac.planet}\n` +
        `• Shio: *${shio}*\n\n` +
        `╭── ✦ *TARGET ULANG TAHUN KE-${nextAge}* ✦\n` +
        `• Hitung Mundur: *${daysToNext === 0 ? 'HARI INI!' : `${daysToNext} hari lagi`}*\n` +
        `• Tanggal: ${nextBirthday.format('dddd, DD MMMM YYYY')}\n` +
        `• Progres: [${progressBar}] ${progressPct}%\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`

    return txt
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const senderLID = m.sender.endsWith('@lid') ? m.sender : (conn.getLid ? conn.getLid(m.sender) : m.sender)
    let user = global.db?.data?.users?.[senderLID] || global.db?.data?.users?.[m.sender] || {}

    const args = (text || '').trim().split(/\s+/)
    const sub = args[0]?.toLowerCase()

    // ── 1. CEK USIA PENGGUNA LAIN (MENTION ATAU QUOTED) ───────────────────────
    let targetJid = null
    if (m.mentionedJid && m.mentionedJid[0]) {
        targetJid = m.mentionedJid[0]
    } else if (m.quoted && m.quoted.sender) {
        targetJid = m.quoted.sender
    }

    if (targetJid && sub !== 'cek' && sub !== 'calc') {
        const targetLID = targetJid.endsWith('@lid') ? targetJid : (conn.getLid ? conn.getLid(targetJid) : targetJid)
        const targetUser = global.db?.data?.users?.[targetLID] || global.db?.data?.users?.[targetJid]

        if (!targetUser || !targetUser.register || !targetUser.birthdate || targetUser.age === -1) {
            return m.reply(`Pengguna @${targetJid.split('@')[0]} belum mendaftarkan akun & umur di bot via \`${usedPrefix}daftar\`.`, { mentions: [targetJid] })
        }

        const birthDate = moment(targetUser.birthdate, 'DD-MM-YYYY', 'id', true).tz('Asia/Jakarta')
        if (!birthDate.isValid()) {
            return m.reply('Format tanggal lahir pengguna tersebut tidak valid.')
        }

        const textOutput = buildAnalyticsText({
            name: targetUser.name || `@${targetJid.split('@')[0]}`,
            birthDate,
            isSelf: false,
            usedPrefix,
            command
        })
        return m.reply(textOutput, { mentions: [targetJid] })
    }

    // ── 2. MODE HITUNG TANGGAL SPONTAN (CEK / CALC TANPA UBAH DATABASE) ───────
    if (sub === 'cek' || sub === 'calc') {
        const dateString = args.slice(1).join(' ')
        if (!dateString) {
            return m.reply(
                `╭── ✦ *KALKULATOR TANGGAL* ✦\n` +
                `• Masukkan tanggal yang ingin dihitung.\n` +
                `• Contoh: \`${usedPrefix + command} cek 17-08-1945\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const birthDate = parseDateInput(dateString)
        if (!birthDate.isValid()) {
            return m.reply('Format tanggal tidak valid. Gunakan format: `tgl-bln-thn` (contoh: `17-08-1945`).')
        }

        if (birthDate.isAfter(moment())) {
            return m.reply('Tanggal tidak boleh berada di masa depan.')
        }

        const textOutput = buildAnalyticsText({
            name: 'Kalkulasi Tanggal',
            birthDate,
            isSelf: false,
            usedPrefix,
            command
        })
        return m.reply(textOutput)
    }

    // ── 3. DETEKSI UPAYA SET/EDIT LANGSUNG VIA .UMUR ───────────────────────────
    if (text) {
        return m.reply(
            `╭── ✦ *PENGATURAN UMUR TERPUSAT* ✦\n` +
            `• Input umur profil tidak dapat dilakukan melalui perintah \`${usedPrefix + command}\`.\n` +
            `• Setiap pengguna *wajib* mendaftarkan data profil & umur melalui menu:\n` +
            `  \`${usedPrefix}daftar <nama> | <tgl lahir / umur>\`\n\n` +
            `• *Contoh Pendaftaran:*\n` +
            `  › \`${usedPrefix}daftar ${user.name || 'Nama'} | 14-06-2006\`\n` +
            `  › \`${usedPrefix}daftar ${user.name || 'Nama'} | 18\`\n\n` +
            `• Untuk menghitung tanggal tanpa menyimpan ke profil, gunakan:\n` +
            `  \`${usedPrefix + command} cek <tgl-bln-thn>\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 4. TAMPILKAN DATA STATISTIK USER DARI DATABASE ────────────────────────
    if (!user.register || !user.birthdate || user.age === -1) {
        return m.reply(
            `╭── ✦ *STATISTIK USIA* ✦\n` +
            `• Kamu belum mendaftarkan akun & umur.\n` +
            `• Pendaftaran umur wajib melalui perintah:\n` +
            `  \`${usedPrefix}daftar <nama> | <tgl lahir / umur>\`\n\n` +
            `• *Contoh Pendaftaran:*\n` +
            `  › \`${usedPrefix}daftar ${m.pushName || 'Nama'} | 14-06-2006\`\n` +
            `  › \`${usedPrefix}daftar ${m.pushName || 'Nama'} | 18\`\n\n` +
            `• *Menu Lainnya:*\n` +
            `  › \`${usedPrefix + command} cek <tgl-bln-thn>\` (Hitung tanggal spontan)\n` +
            `  › \`${usedPrefix + command} @user\` (Cek usia teman)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const birthDate = moment(user.birthdate, 'DD-MM-YYYY', 'id', true).tz('Asia/Jakarta')
    if (!birthDate.isValid()) {
        return m.reply(`Data tanggal lahir kamu (${user.birthdate}) tidak valid. Silakan daftarkan ulang melalui \`${usedPrefix}daftar\`.`)
    }

    const textOutput = buildAnalyticsText({
        name: user.name || m.pushName || 'Pengguna',
        birthDate,
        isSelf: true,
        usedPrefix,
        command
    })

    return m.reply(textOutput)
}

handler.help = ['umur *cek/user*']
handler.tags    = ['tools']
handler.command = /^(umur|usia|weton)$/i

export default handler