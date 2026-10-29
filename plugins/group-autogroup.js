/*
 * @Author     : Rafli & Antigravity
 * @Feature    : Auto Open & Close Group Configuration
 * @Description: Pengaturan jadwal buka dan tutup grup otomatis setiap hari dengan waktu kustom admin.
 */

import moment from 'moment-timezone'

function parseTime(input) {
    if (!input || typeof input !== 'string') return null
    const cleaned = input.trim().replace('.', ':')
    const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/)
    if (!match) return null

    let hours = parseInt(match[1], 10)
    let minutes = match[2] !== undefined ? parseInt(match[2], 10) : 0

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!m.isGroup) {
        return m.reply('Perintah ini hanya dapat digunakan di dalam grup.')
    }

    let chat = global.db.data?.chats?.[m.chat]
    if (!chat) {
        return m.reply('Gagal mengakses data grup.')
    }

    const sub = args[0]?.toLowerCase()
    const nowWib = moment.tz('Asia/Jakarta').format('HH:mm')

    // Tampilkan Status dan Panduan
    if (!sub || sub === 'status' || sub === 'info') {
        const statusText = chat.autoOpenClose ? '*AKTIF*' : '*NONAKTIF*'
        const openTime = chat.openTime || '06:00'
        const closeTime = chat.closeTime || '21:00'

        let text = `╭── ✦ *JADWAL BUKA TUTUP GRUP* ✦\n`
        text += `• Status: ${statusText}\n`
        text += `• Jam Buka: *${openTime} WIB*\n`
        text += `• Jam Tutup: *${closeTime} WIB*\n`
        text += `• Waktu Server: *${nowWib} WIB*\n`
        text += `• Frekuensi: Setiap hari otomatis\n\n`
        text += `› *Perintah Pengaturan:*\n`
        text += `• \`${usedPrefix + command} on\` › Aktifkan jadwal\n`
        text += `• \`${usedPrefix + command} off\` › Nonaktifkan jadwal\n`
        text += `• \`${usedPrefix + command} set <buka> <tutup>\` › Atur jam buka dan tutup\n`
        text += `• \`${usedPrefix + command} buka <jam>\` › Atur jam buka saja\n`
        text += `• \`${usedPrefix + command} tutup <jam>\` › Atur jam tutup saja\n\n`
        text += `› *Contoh Penggunaan:*\n`
        text += `• \`${usedPrefix + command} set 06:00 16:00\`\n`
        text += `• \`${usedPrefix + command} set 06.00 16.00\`\n`
        text += `╰━━━━━━━━━━━━━━━━━━━━━━━`
        return m.reply(text)
    }

    // Aktifkan Fitur
    if (/^(on|enable|aktif|1|true)$/i.test(sub)) {
        if (chat.autoOpenClose) {
            return m.reply(`Jadwal buka tutup grup sudah dalam status *AKTIF*.\nJam Buka: *${chat.openTime} WIB*\nJam Tutup: *${chat.closeTime} WIB*`)
        }
        chat.autoOpenClose = true
        global.saveData?.('chats', m.chat)
        return m.reply(`╭── ✦ *JADWAL GRUP DIAKTIFKAN* ✦\n• Jam Buka: *${chat.openTime || '06:00'} WIB*\n• Jam Tutup: *${chat.closeTime || '21:00'} WIB*\n• Mode: Berjalan otomatis setiap hari\n╰━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    // Nonaktifkan Fitur
    if (/^(off|disable|nonaktif|0|false)$/i.test(sub)) {
        if (!chat.autoOpenClose) {
            return m.reply('Jadwal buka tutup grup sudah dalam status *NONAKTIF*.')
        }
        chat.autoOpenClose = false
        global.saveData?.('chats', m.chat)
        return m.reply(`╭── ✦ *JADWAL GRUP DINONAKTIFKAN* ✦\n• Status: Jadwal otomatis buka/tutup grup telah dimatikan.\n• Pengaturan grup sekarang sepenuhnya manual.\n╰━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    // Atur Buka dan Tutup Sekaligus: set <buka> <tutup> atau langsung <jamBuka> <jamTutup>
    let openInput = ''
    let closeInput = ''

    if (sub === 'set') {
        openInput = args[1]
        closeInput = args[2]
    } else if (parseTime(args[0]) && parseTime(args[1])) {
        openInput = args[0]
        closeInput = args[1]
    }

    if (openInput && closeInput) {
        const parsedOpen = parseTime(openInput)
        const parsedClose = parseTime(closeInput)

        if (!parsedOpen || !parsedClose) {
            return m.reply(`Format waktu tidak valid.\nContoh yang benar: *${usedPrefix + command} set 06:00 16:00*`)
        }

        if (parsedOpen === parsedClose) {
            return m.reply('Waktu buka dan waktu tutup tidak boleh sama.')
        }

        chat.openTime = parsedOpen
        chat.closeTime = parsedClose
        chat.autoOpenClose = true
        global.saveData?.('chats', m.chat)

        return m.reply(`╭── ✦ *JADWAL BERHASIL DIATUR* ✦\n• Jam Buka: *${parsedOpen} WIB*\n• Jam Tutup: *${parsedClose} WIB*\n• Status: *AKTIF*\n• Berjalan otomatis setiap hari kecuali dinonaktifkan.\n╰━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    // Atur Jam Buka Saja
    if (/^(buka|open)$/i.test(sub)) {
        const timeInput = args[1]
        const parsed = parseTime(timeInput)
        if (!parsed) {
            return m.reply(`Format waktu buka tidak valid.\nContoh: *${usedPrefix + command} buka 06:00*`)
        }

        chat.openTime = parsed
        global.saveData?.('chats', m.chat)
        return m.reply(`╭── ✦ *WAKTU BUKA DIPERBARUI* ✦\n• Jam Buka Baru: *${parsed} WIB*\n• Jam Tutup: *${chat.closeTime || '21:00'} WIB*\n• Status: *${chat.autoOpenClose ? 'AKTIF' : 'NONAKTIF'}*\n╰━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    // Atur Jam Tutup Saja
    if (/^(tutup|close)$/i.test(sub)) {
        const timeInput = args[1]
        const parsed = parseTime(timeInput)
        if (!parsed) {
            return m.reply(`Format waktu tutup tidak valid.\nContoh: *${usedPrefix + command} tutup 16:00*`)
        }

        chat.closeTime = parsed
        global.saveData?.('chats', m.chat)
        return m.reply(`╭── ✦ *WAKTU TUTUP DIPERBARUI* ✦\n• Jam Tutup Baru: *${parsed} WIB*\n• Jam Buka: *${chat.openTime || '06:00'} WIB*\n• Status: *${chat.autoOpenClose ? 'AKTIF' : 'NONAKTIF'}*\n╰━━━━━━━━━━━━━━━━━━━━━━━`)
    }

    return m.reply(`Perintah tidak dikenali.\nGunakan: *${usedPrefix + command} status* untuk melihat panduan lengkap.`)
}

handler.help = ['autogrup *<on|off|set>*', 'autogroup *<on|off|set>*']
handler.tags = ['group']
handler.command = /^(autogrup|autogroup|jadwalgrup)$/i

handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler
