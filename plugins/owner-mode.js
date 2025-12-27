import { jidNormalizedUser } from '@whiskeysockets/baileys'

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const botLid = jidNormalizedUser(conn.user.lid)
    const settings = global.db.data.settings[botLid] || {}
    
    const modes = {
        'all': {
            name: 'Publik',
            desc: 'Bisa dipakai dimana aja',
            value: ''
        },
        'gconly': {
            name: 'Group Only',
            desc: 'Cuma bisa di grup',
            value: 'gconly'
        },
        'pconly': {
            name: 'Private Only',
            desc: 'Cuma bisa di chat pribadi',
            value: 'pconly'
        }
    }
    
    // Tampilan utama
    if (!args[0]) {
        const currentMode = settings.chatMode || ''
        let modeDisplay = currentMode === 'gconly' ? 'Group Only' : 
                         currentMode === 'pconly' ? 'Private Only' : 'Publik'
        
        let menu = `Mode Bot\n`
        menu += `Mode sekarang: ${modeDisplay}\n\n`
        
        menu += `Pilihan Mode:\n`
        for (let [key, mode] of Object.entries(modes)) {
            const isActive = (key === 'all' && !currentMode) || (currentMode === mode.value)
            const status = isActive ? '[AKTIF]' : ''
            menu += `${status} ${mode.name}\n`
            menu += `   - ${mode.desc}\n`
            menu += `   - ${usedPrefix + command} ${key}\n\n`
        }
        
        menu += `Cara pakai:\n`
        menu += `${usedPrefix + command} <mode>\n`
        menu += `Contoh: ${usedPrefix + command} gconly`
        
        return m.reply(menu)
    }
    
    // Ganti mode
    const selectedMode = args[0].toLowerCase()
    
    if (!modes[selectedMode]) {
        return m.reply(`Mode tidak valid!\n\nPilihan mode:\n- all (Mode publik)\n- gconly (Group only)\n- pconly (Private only)\n\nContoh: ${usedPrefix + command} all`)
    }
    
    const newMode = modes[selectedMode].value
    const currentMode = settings.chatMode || ''
    
    // Validasi: cek apakah mode yang diminta sudah aktif
    if (newMode === currentMode) {
        const modeName = selectedMode === 'all' ? 'Publik' : 
                        selectedMode === 'gconly' ? 'Group Only' : 'Private Only'
        return m.reply(`Bot sudah dalam mode ${modeName}.\n\nTidak ada perubahan yang dilakukan.`)
    }
    
    settings.chatMode = newMode
    global.db.data.settings[botLid] = settings
    
    const mode = modes[selectedMode]
    
    let successMsg = `Mode berhasil diganti!\n\n`
    successMsg += `Mode baru: ${mode.name}\n`
    successMsg += `Keterangan: ${mode.desc}\n\n`
    
    if (selectedMode === 'all') {
        successMsg += `Bot sekarang bisa dipakai di semua chat`
    } else if (selectedMode === 'gconly') {
        successMsg += `Bot cuma bakal respon di grup`
    } else if (selectedMode === 'pconly') {
        successMsg += `Bot cuma bakal respon di chat pribadi`
    }
    
    return m.reply(successMsg)
}

handler.help = ['setmode <mode>']
handler.tags = ['owner']
handler.command = /^(setmode|mode)$/i
handler.owner = true

export default handler