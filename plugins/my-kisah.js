let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!global.db.data.chats) global.db.data.chats = {}
    
    if (!global.db.data.chats[m.chat]) {
        global.db.data.chats[m.chat] = { isMikuOn: false }
    }
    
    let chat = global.db.data.chats[m.chat]
    
    let [action] = text.split(' ')
    action = action?.toLowerCase()
    
    switch (action) {
        case 'on':
            if (chat.isMikuOn) return m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Miku udah aktif kok di sini.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            chat.isMikuOn = true
            global.saveData('chats', m.chat)
            m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Mode Miku AI diaktifkan. Miku bakal ngerespon semua chat yang masuk di sini.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            break
            
        case 'off':
            if (!chat.isMikuOn) return m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Miku emang lagi gak aktif di sini.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            chat.isMikuOn = false
            global.saveData('chats', m.chat)
            m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Mode Miku AI dimatikan.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            break
            
        case 'reset':
            if (!global.mikuDb) global.mikuDb = { data: {} }
            if (!global.mikuDb.data) global.mikuDb.data = {}
            
            if (global.mikuDb.data[m.chat]) {
                delete global.mikuDb.data[m.chat]
                global.saveData('miku', m.chat)
                m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Riwayat obrolan Miku berhasil dihapus total.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            } else {
                m.reply('╭── ✦ *NAKANO MIKU* ✦\n• Gak ada riwayat obrolan yang tersimpan untuk dihapus.\n╰━━━━━━━━━━━━━━━━━━━━━━━')
            }
            break
            
        default:
            let status = chat.isMikuOn ? 'AKTIF' : 'NONAKTIF'
            m.reply(
                `╭── ✦ *NAKANO MIKU AI* ✦\n` +
                `• Status di chat ini: *${status}*\n\n` +
                `*Perintah Pengaturan:*\n` +
                `• \`${usedPrefix + command} on\`    › Nyalakan respon Miku\n` +
                `• \`${usedPrefix + command} off\`   › Matikan respon Miku\n` +
                `• \`${usedPrefix + command} reset\` › Hapus riwayat ingatan Miku\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
    }
}

handler.help = ['miku']
handler.tags = ['ai']
handler.command = /^miku$/i

export default handler