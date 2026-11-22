import moment from 'moment-timezone'
import { buildAbsenRecap } from '../function/events/absen.js'

let handler = async (m, { conn, args, usedPrefix, command, isAdmin, isOwner }) => {
    if (!m.isGroup) {
        return m.reply('Perintah ini hanya dapat digunakan di dalam grup.')
    }

    if (!global.db.data) global.db.data = {}
    if (!global.db.data.chats) global.db.data.chats = {}
    if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {}
    const chat = global.db.data.chats[m.chat]

    const cmd = command.toLowerCase()
    const sub = cmd === 'hadir' ? 'hadir' : (args[0]?.toLowerCase() || '')

    if (sub === 'buka' || sub === 'open') {
        if (!isAdmin && !isOwner) {
            return m.reply('Perintah ini hanya untuk admin grup.')
        }

        const session = chat.absen
        const isSessionActive = Boolean(session && session.open && (!session.closeAt || Date.now() < session.closeAt))
        if (isSessionActive) {
            return m.reply(`Sesi absen masih aktif. Tutup sesi terlebih dahulu dengan perintah *${usedPrefix}absen tutup*.`)
        }

        let closeAt = null
        let title = ''
        const timeMatch = args[1]?.match(/^(\d{1,2})[:.](\d{1,2})$/)

        if (timeMatch) {
            const h = parseInt(timeMatch[1], 10)
            const min = parseInt(timeMatch[2], 10)
            if (h < 0 || h > 23 || min < 0 || min > 59) {
                return m.reply('Format jam tidak valid. Gunakan format HH:mm (00:00 - 23:59).')
            }
            const now = moment.tz('Asia/Jakarta')
            let target = moment.tz('Asia/Jakarta').set({ hour: h, minute: min, second: 0, millisecond: 0 })
            if (target.valueOf() <= now.valueOf()) {
                target.add(1, 'day')
            }
            closeAt = target.valueOf()
            title = args.slice(2).join(' ').trim()
        } else {
            title = args.slice(1).join(' ').trim()
        }

        if (!title) title = 'Absen'

        chat.absen = {
            open: true,
            title,
            startedAt: Date.now(),
            closeAt,
            list: []
        }
        global.saveData?.('chats', m.chat)

        let replyText = `╭── ✦ *SESI ABSEN DIBUKA* ✦\n`
        replyText += `• Judul: *${title}*\n`
        if (closeAt) {
            replyText += `• Ditutup Pada: *${moment(closeAt).tz('Asia/Jakarta').format('HH:mm')} WIB*\n`
        } else {
            replyText += `• Ditutup: *Manual oleh Admin*\n`
        }
        replyText += `• Cara Absen: Ketik \`${usedPrefix}hadir\` atau \`${usedPrefix}absen hadir\`\n`
        replyText += `╰━━━━━━━━━━━━━━━━━━━━━━━`
        return m.reply(replyText)
    }

    if (sub === 'tutup' || sub === 'close') {
        if (!isAdmin && !isOwner) {
            return m.reply('Perintah ini hanya untuk admin grup.')
        }

        const session = chat.absen
        if (!session || !session.open) {
            return m.reply('Tidak ada sesi absen yang sedang aktif.')
        }

        session.open = false
        global.saveData?.('chats', m.chat)

        const recap = buildAbsenRecap(session, { now: Date.now() })
        return m.reply(`*Sesi absen telah ditutup.*\n\n${recap}`)
    }

    if (sub === 'reset' || sub === 'hapus') {
        if (!isAdmin && !isOwner) {
            return m.reply('Perintah ini hanya untuk admin grup.')
        }

        chat.absen = null
        global.saveData?.('chats', m.chat)
        return m.reply('Data absen grup berhasil dihapus.')
    }

    if (sub === 'list' || sub === 'rekap' || sub === 'daftar') {
        const session = chat.absen
        if (!session || !session.startedAt) {
            return m.reply('Belum ada riwayat absen di grup ini.')
        }
        return m.reply(buildAbsenRecap(session, { now: Date.now() }))
    }

    if (sub === 'hadir') {
        const session = chat.absen
        const isSessionActive = Boolean(session && session.open && (!session.closeAt || Date.now() < session.closeAt))

        if (!isSessionActive) {
            if (!session || !session.startedAt) {
                return m.reply(`Sesi absen belum dibuka di grup ini.\nKetik *${usedPrefix}absen buka* untuk membuka sesi.`)
            }
            return m.reply(`Sesi absen sudah ditutup.\nKetik *${usedPrefix}absen list* untuk melihat rekap kehadiran.`)
        }

        const key = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
        const existing = session.list.find(item => item.key === key || item.jid === m.sender)

        if (existing) {
            const firstTime = moment(existing.time).tz('Asia/Jakarta').format('HH:mm')
            return m.reply(`Kamu sudah absen sebelumnya pada pukul *${firstTime} WIB*.`)
        }

        const users = global.db.data?.users || {}
        const nomor = m.sender ? m.sender.split('@')[0] : ''
        const name = users[key]?.name || users[m.sender]?.name || m.pushName || nomor

        session.list.push({
            key,
            jid: m.sender,
            name,
            time: Date.now()
        })
        global.saveData?.('chats', m.chat)

        try {
            if (m.react) {
                await m.react('✅')
            } else if (conn.sendMessage) {
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
            }
        } catch {}

        return m.reply(`*${name}* berhasil absen (urutan ke-${session.list.length}).`)
    }

    const session = chat.absen
    const isSessionActive = Boolean(session && session.open && (!session.closeAt || Date.now() < session.closeAt))

    let menu = `╭── ✦ *ABSENSI GRUP* ✦\n`
    if (isSessionActive) {
        menu += `• Status Sesi: *DIBUKA*\n`
        menu += `• Judul: *${session.title || 'Absen'}*\n`
        if (session.closeAt) {
            menu += `• Jam Tutup: *${moment(session.closeAt).tz('Asia/Jakarta').format('HH:mm')} WIB*\n`
        }
        menu += `• Total Hadir: *${session.list?.length || 0} orang*\n\n`
    } else {
        menu += `• Status Sesi: *TIDAK ADA SESI AKTIF*\n\n`
    }
    menu += `› *Perintah Anggota:*\n`
    menu += `• \`${usedPrefix}hadir\` atau \`${usedPrefix + command} hadir\` › Catat kehadiran\n`
    menu += `• \`${usedPrefix + command} list\` › Rekap daftar hadir\n\n`
    menu += `› *Perintah Admin:*\n`
    menu += `• \`${usedPrefix + command} buka <jam> <judul>\` › Buka sesi absen\n`
    menu += `• \`${usedPrefix + command} tutup\` › Tutup sesi & kirim rekap\n`
    menu += `• \`${usedPrefix + command} reset\` › Hapus data absen\n`
    menu += `╰━━━━━━━━━━━━━━━━━━━━━━━`
    return m.reply(menu)
}

handler.help = ['absen']
handler.tags = ['group']
handler.command = /^(absen|absensi|hadir)$/i
handler.group = true

export default handler
