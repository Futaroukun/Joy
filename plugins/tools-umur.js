import moment from 'moment-timezone'

function getZodiac(day, month) {
    const zodiacs = [
        { sign: "Capricorn", start: [12, 22], end: [1, 19] },
        { sign: "Aquarius", start: [1, 20], end: [2, 18] },
        { sign: "Pisces", start: [2, 19], end: [3, 20] },
        { sign: "Aries", start: [3, 21], end: [4, 19] },
        { sign: "Taurus", start: [4, 20], end: [5, 20] },
        { sign: "Gemini", start: [5, 21], end: [6, 20] },
        { sign: "Cancer", start: [6, 21], end: [7, 22] },
        { sign: "Leo", start: [7, 23], end: [8, 22] },
        { sign: "Virgo", start: [8, 23], end: [9, 22] },
        { sign: "Libra", start: [9, 23], end: [10, 22] },
        { sign: "Scorpio", start: [10, 23], end: [11, 21] },
        { sign: "Sagittarius", start: [11, 22], end: [12, 21] },
    ]

    for (const z of zodiacs) {
        if ((month === z.start[0] && day >= z.start[1]) || (month === z.end[0] && day <= z.end[1])) {
            return z.sign
        }
    }
    return "Gak Diketahui"
}

function getChineseZodiac(year) {
    const animals = [
        'Monyet', 'Ayam', 'Anjing', 'Babi', 
        'Tikus', 'Kerbau', 'Macan', 'Kelinci', 
        'Naga', 'Ular', 'Kuda', 'Kambing'
    ]
    return animals[year % 12]
}

function getGeneration(year) {
    if (year >= 2025) return "Gen Beta"
    if (year >= 2013) return "Gen Alpha"
    if (year >= 1997) return "Gen Z"
    if (year >= 1981) return "Millennial"
    if (year >= 1965) return "Gen X"
    if (year >= 1946) return "Baby Boomer"
    if (year >= 1928) return "Silent Generation"
    return "Greatest Generation"
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*LIFE CALCULATOR*\n\n` +
            `Kirim tanggal lahir kamu buat liat statistik detail hidupmu.\n\n` +
            `*Cara Pakai:*\n` +
            `• \`${usedPrefix + command}\` *14-06-2006*\n` +
            `• \`${usedPrefix + command}\` *14 Juni 2006*\n` +
            `• \`${usedPrefix + command}\` *14062006*`
        )
    }

    try {
        const cleanText = text.replace(/-/g, ' ')
        const formats = ['DD MM YYYY', 'DD MMMM YYYY', 'DDMMYYYY']
        
        moment.locale('id')
        const birthDate = moment(cleanText, formats, 'id', true).tz('Asia/Jakarta')

        if (!birthDate.isValid()) {
            return m.reply(
                `*FORMAT SALAH*\n\n` +
                `Pastiin format tanggalnya bener ya:\n` +
                `*DD-MM-YYYY* (Contoh: *25-12-2000*)`
            )
        }
        
        const today = moment.tz('Asia/Jakarta')
        if (birthDate.isAfter(today)) {
            return m.reply('*Masa depen amat? Tanggal lahirnya yang bener dong.*')
        }

        const userName = await conn.getName(m.sender);

        const ageYears = today.diff(birthDate, 'years')
        const birthDatePlusYears = birthDate.clone().add(ageYears, 'years')
        const ageMonths = today.diff(birthDatePlusYears, 'months')
        const birthDatePlusMonths = birthDatePlusYears.clone().add(ageMonths, 'months')
        const ageDays = today.diff(birthDatePlusMonths, 'days')

        const totalDays = today.diff(birthDate, 'days')
        const totalHours = today.diff(birthDate, 'hours')
        const totalMinutes = today.diff(birthDate, 'minutes')

        let nextBirthday = birthDate.clone().year(today.year())
        if (nextBirthday.isBefore(today, 'day')) {
            nextBirthday.add(1, 'year')
        }
        const daysToNextBirthday = nextBirthday.diff(today, 'days')
        const nextBirthdayDay = nextBirthday.format('dddd')

        let resultText = `*LIFE STATISTICS REPORT*\n` +
                         `━━━━━━━━━━━━━━━━━━\n` +
                         `*PROFILE USER*\n` +
                         `• Nama: ${userName}\n` +
                         `• Tanggal Lahir: ${birthDate.format('DD MMMM YYYY')}\n` +
                         `• Hari Lahir: ${birthDate.format('dddd')}\n` +
                         `• Generasi: ${getGeneration(birthDate.year())}\n\n` +
                         `*USIA SAAT INI*\n` +
                         `• ${ageYears} Tahun, ${ageMonths} Bulan, ${ageDays} Hari\n\n` +
                         `*ASTROLOGI*\n` +
                         `• Zodiak: ${getZodiac(birthDate.date(), birthDate.month() + 1)}\n` +
                         `• Shio: ${getChineseZodiac(birthDate.year())}\n\n` +
                         `*TOTAL DURASI HIDUP*\n` +
                         `• ${new Intl.NumberFormat('id-ID').format(totalDays)} Hari\n` +
                         `• ${new Intl.NumberFormat('id-ID').format(totalHours)} Jam\n` +
                         `• ${new Intl.NumberFormat('id-ID').format(totalMinutes)} Menit\n\n` +
                         `*ULANG TAHUN BERIKUTNYA*\n` +
                         `• ${daysToNextBirthday} hari lagi\n` +
                         `• Jatuh pada hari: ${nextBirthdayDay}`

        await conn.reply(m.chat, resultText, m)

    } catch (error) {
        console.error(error)
        m.reply('*Gagal proses, coba cek lagi format tanggalnya.*')
    }
}

handler.help = ['umur *tgl-bln-thn*']
handler.tags = ['tools']
handler.command = /^(umur|age|usia|cekumur)$/i

export default handler