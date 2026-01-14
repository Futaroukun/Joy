import { jidNormalizedUser } from '@whiskeysockets/baileys'

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const botLid = jidNormalizedUser(conn.user.lid)
    // Pastikan object settings ada
    if (!global.db.data.settings[botLid]) global.db.data.settings[botLid] = {}
    const settings = global.db.data.settings[botLid]
    
    // Definisi Mode
    const modes = {
        'all': {
            title: 'Mode Publik',
            desc: 'Bot bisa digunakan di Grup & Chat Pribadi',
            value: ''
        },
        'gconly': {
            title: 'Mode Grup Only',
            desc: 'Bot hanya merespon di dalam Grup',
            value: 'gconly'
        },
        'pconly': {
            title: 'Mode Private Only',
            desc: 'Bot hanya merespon di Chat Pribadi',
            value: 'pconly'
        }
    }
    
    // --- TAMPILAN MENU (LIST MESSAGE) ---
    if (!args[0]) {
        const currentMode = settings.chatMode || ''
        let modeDisplay = currentMode === 'gconly' ? 'Group Only' : 
                         currentMode === 'pconly' ? 'Private Only' : 'Publik'
        
        // 1. Susun Baris (Rows) untuk List
        const rows = []
        for (let [key, mode] of Object.entries(modes)) {
            // Cek apakah mode ini yang sedang aktif
            const isActive = (key === 'all' && !currentMode) || (currentMode === mode.value)
            const prefix = isActive ? '✅ ' : '' // Kasih tanda centang kalau aktif
            
            rows.push({
                header: mode.title,
                title: prefix + key.toUpperCase(),
                description: mode.desc,
                id: `${usedPrefix + command} ${key}` // Command yang dijalankan saat diklik
            })
        }

        // 2. Susun Parameter JSON untuk Tombol List (single_select)
        const listParams = {
            title: "PILIH MODE",
            sections: [
                {
                    title: "Daftar Mode Tersedia",
                    rows: rows
                }
            ]
        }

        // 3. Susun Array Buttons (Native Flow)
        const buttons = [
            {
                name: "single_select",
                buttonParamsJson: JSON.stringify(listParams)
            }
        ]

        // 4. Susun Konten Pesan
        const content = {
            header: "PENGATURAN MODE BOT",
            body: `Status Mode Saat Ini: *${modeDisplay}*\n\nSilakan klik tombol di bawah untuk mengubah mode akses bot.`,
            footer: "System Config",
            buttons: buttons
        }

        // 5. Kirim menggunakan conn.sendButton
        return conn.sendButton(m.chat, content, { quoted: m })
    }
    
    // --- EKSEKUSI GANTI MODE ---
    const selectedMode = args[0].toLowerCase()
    
    // Validasi input
    if (!modes[selectedMode]) {
        return m.reply(`❌ Mode tidak valid!\nSilakan gunakan tombol List untuk memilih mode yang benar.`)
    }
    
    const newMode = modes[selectedMode].value
    const currentMode = settings.chatMode || ''
    
    // Cek jika mode sama
    if (newMode === currentMode) {
        return m.reply(`⚠️ Bot sudah berada dalam mode *${modes[selectedMode].title}*.\nTidak ada perubahan.`)
    }
    
    // Simpan ke database
    settings.chatMode = newMode
    global.db.data.settings[botLid] = settings
    
    // Kirim konfirmasi sukses
    return m.reply(`✅ *SUKSES GANTI MODE*\n\nMode Baru: *${modes[selectedMode].title}*\nKeterangan: ${modes[selectedMode].desc}`)
}

handler.help = ['setmode']
handler.tags = ['owner']
handler.command = /^(setmode|mode)$/i
handler.owner = true

export default handler