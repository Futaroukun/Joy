import fs from 'fs' // WAJIB ADA: Buat tulis ke file json

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
            // --- BAGIAN PERBAIKAN (FIX RESET PERMANEN) ---
            
            // 1. Pastikan struktur memori aman
            if (!global.mikuDb) global.mikuDb = { data: {} }
            if (!global.mikuDb.data) global.mikuDb.data = {}

            // 2. Cek apakah ada data di chat ini
            if (global.mikuDb.data[m.chat]) {
                
                // LANGKAH 1: Kosongkan di Memori (RAM)
                global.mikuDb.data[m.chat] = []
                
                // LANGKAH 2: SIMPAN KE FILE (DISK) AGAR PERMANEN
                // Ini kuncinya! Kita paksa tulis ulang file json-nya.
                try {
                    // Pastikan path filenya sesuai dengan lokasi database kamu
                    // Biasanya ada di folder 'database' atau 'data'
                    // Kita coba tulis ke './database/miku.json' atau './data/miku.json'
                    // Sesuaikan string path di bawah ini dengan lokasi file kamu sebenarnya
                    
                    const dbPath = './data/miku.json'; // <--- GANTI KALAU LOKASI FILE BEDA
                    
                    // Cek kalau folder data ada, tulis file
                    if (global.mikuDb.data) {
                        fs.writeFileSync(dbPath, JSON.stringify(global.mikuDb.data, null, 2));
                    }
                    
                    m.reply('*Riwayat obrolan sama Miku udah dihapus permanen.*\n\nMemori di file database juga sudah di-reset jadi 0.')
                    
                } catch (e) {
                    console.error('Gagal menyimpan file:', e)
                    m.reply('*Berhasil reset di memori, tapi gagal nyimpen ke file json.*\n(Mungkin path foldernya salah, cek console).')
                }

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