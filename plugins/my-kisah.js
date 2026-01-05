let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    let chat = global.db.data.chats[m.chat]
    if (!chat) global.db.data.chats[m.chat] = {}
    
    let [action] = text.split(' ')
    action = action?.toLowerCase()

    switch (action) {
        case 'on':
            if (chat.isMikuOn) return m.reply('*Miku udah aktif kok di sini.*')
            chat.isMikuOn = true
            m.reply('*Mode Miku AI diaktifkan.*\n\nSekarang Miku bakal ngerespon semua chat yang masuk di sini.')
            break
            
        case 'off':
            if (!chat.isMikuOn) return m.reply('*Miku emang lagi gak aktif.*')
            chat.isMikuOn = false
            m.reply('*Mode Miku AI dimatiin.*\n\nMiku gak bakal ngerespon chat lagi, tapi riwayat obrolan kita masih aman simpen.')
            break
            
        case 'reset':
            // --- BAGIAN PERBAIKAN (FIX RESET) ---
            // 1. Pastikan struktur database aman (Safe Check)
            if (!global.mikuDb) global.mikuDb = { data: {} }
            if (!global.mikuDb.data) global.mikuDb.data = {}

            // 2. Cek apakah ada data di chat ini
            if (global.mikuDb.data[m.chat]) {
                // SOLUSI: Timpa dengan array kosong [] agar benar-benar bersih 
                // (Jangan pakai 'delete' karena kadang suka nyangkut di memori)
                global.mikuDb.data[m.chat] = []
                
                m.reply('*Riwayat obrolan sama Miku udah dihapus.*\n\nSekarang kita mulai ngobrol dari awal lagi ya.')
            } else {
                m.reply('*Gak ada riwayat obrolan yang bisa dihapus.*')
            }
            break
            
        default:
            m.reply(
                `*MIKU AI ASSISTANT*\n\n` +
                `Pake perintah ini buat ngatur Miku:\n\n` +
                `• \`${usedPrefix + command}\` *on*\nBuat nyalain Miku AI di chat ini.\n\n` +
                `• \`${usedPrefix + command}\` *off*\nBuat matiin Miku AI di chat ini.\n\n` +
                `• \`${usedPrefix + command}\` *reset*\nBuat hapus semua riwayat obrolan sama Miku.`
            )
    }
}

handler.help = ['miku *on/off/reset*']
handler.tags = ['ai']
handler.command = /^miku$/i

export default handler