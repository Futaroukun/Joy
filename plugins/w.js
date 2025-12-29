let handler = async (m, { conn, usedPrefix, command, isAdmin, isOwner }) => {
    // Validasi: Hanya bisa digunakan di grup
    if (!m.isGroup) {
        return m.reply(
            '*FITUR KHUSUS GRUP*\n\n' +
            'Fitur mute hanya dapat digunakan di dalam grup.'
        )
    }

    // Ambil data chat dari database
    let chat = global.db.data.chats[m.chat]
    if (!chat) {
        global.db.data.chats[m.chat] = {
            antispam: false,
            antilink: false,
            antidelete: false,
            antivirtex: false,
            mute: false,
            detect: true,
            sambutan: true,
            sewa: false,
            sWelcome: "",
            sBye: "",
            sPromote: "",
            sDemote: "",
            sewaDate: -1
        }
        chat = global.db.data.chats[m.chat]
    }

    // Tentukan action berdasarkan command
    const isEnabling = /^(mute|mutegroup)$/i.test(command)
    const currentStatus = chat.mute

    // Cek apakah sudah dalam status yang sama
    if (isEnabling && currentStatus) {
        return m.reply(
            '*BOT SUDAH DALAM MODE MUTE*\n\n' +
            'Bot sudah tidak merespons command di grup ini.\n\n' +
            `Gunakan *${usedPrefix}unmute* untuk mengaktifkan kembali.`
        )
    }

    if (!isEnabling && !currentStatus) {
        return m.reply(
            '*BOT SUDAH AKTIF*\n\n' +
            'Bot sudah dalam mode aktif dan merespons command.\n\n' +
            `Gunakan *${usedPrefix}mute* untuk menonaktifkan.`
        )
    }

    // Toggle status mute
    chat.mute = isEnabling

    // Kirim notifikasi
    let responseMsg = ''
    
    if (isEnabling) {
        responseMsg = `*BOT MODE MUTE AKTIF*\n\n` +
                     `Bot sekarang *tidak akan merespons* semua command di grup ini.\n\n` +
                     `*Yang Masih Bisa Akses:*\n` +
                     `• Owner Bot\n` +
                     `• Admin Grup (jika Owner)\n\n` +
                     `*Cara Mengaktifkan Kembali:*\n` +
                     `Ketik *${usedPrefix}unmute*`
    } else {
        responseMsg = `*BOT MODE AKTIF*\n\n` +
                     `Bot sekarang *kembali merespons* semua command di grup ini.\n\n` +
                     `Semua fitur sudah bisa digunakan kembali.\n\n` +
                     `*Cara Menonaktifkan:*\n` +
                     `Ketik *${usedPrefix}mute*`
    }

    return m.reply(responseMsg)
}

handler.help = ['mute', 'unmute']
handler.tags = ['group']
handler.command = /^(mute|mutegroup|unmute|unmutegroup)$/i

// Hanya admin atau owner yang bisa pakai
handler.admin = true
handler.group = true

export default handler