import { jidNormalizedUser } from '@whiskeysockets/baileys'

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const botLid = jidNormalizedUser(conn.user.lid)
    const settings = global.db.data.settings[botLid] || {}
    
    const modes = {
        'all': {
            name: 'Public Mode',
            desc: 'Bot dapat digunakan di semua chat (Private & Group)',
            value: ''
        },
        'gconly': {
            name: 'Group Only Mode',
            desc: 'Bot hanya dapat digunakan di Group Chat',
            value: 'gconly'
        },
        'pconly': {
            name: 'Private Only Mode',
            desc: 'Bot hanya dapat digunakan di Private Chat',
            value: 'pconly'
        }
    }
    
    if (!args[0]) {
        const currentMode = settings.chatMode || ''
        let modeDisplay
        
        if (currentMode === 'gconly') {
            modeDisplay = 'Group Only'
        } else if (currentMode === 'pconly') {
            modeDisplay = 'Private Only'
        } else {
            modeDisplay = 'Public (All Chat)'
        }
        
        let menu = '*BOT MODE CONFIGURATION*\n\n'
        menu += `*Mode Saat Ini:* ${modeDisplay}\n\n`
        menu += '*Daftar Mode yang Tersedia:*\n\n'
        
        for (let [key, mode] of Object.entries(modes)) {
            const isActive = (key === 'all' && !currentMode) || (currentMode === mode.value)
            const status = isActive ? '✅' : '❎'
            menu += `*Status:* ${status}\n`
            menu += `*Mode:* ${mode.name}\n`
            menu += `*Keterangan:* ${mode.desc}\n`
            menu += `*Command:* ${usedPrefix + command} ${key}\n\n`
        }
        
        menu += '*PENGGUNAAN:*\n'
        menu += `${usedPrefix + command} <mode>\n\n`
        menu += '*CONTOH:*\n'
        menu += `* ${usedPrefix + command} all\n`
        menu += `* ${usedPrefix + command} gconly\n`
        menu += `* ${usedPrefix + command} pconly`
        
        return m.reply(menu)
    }
    
    const selectedMode = args[0].toLowerCase()
    
    if (!modes[selectedMode]) {
        return m.reply(
            '*MODE TIDAK VALID*\n\n' +
            '*Daftar mode yang tersedia:*\n' +
            '* all (Public)\n' +
            '* gconly (Group Only)\n' +
            '* pconly (Private Only)\n\n' +
            `*Contoh:* ${usedPrefix + command} all`
        )
    }
    
    const newMode = modes[selectedMode].value
    settings.chatMode = newMode
    global.db.data.settings[botLid] = settings
    
    let response = '*PENGATURAN MODE BERHASIL*\n\n'
    response += `*Mode Baru:* ${modes[selectedMode].name}\n`
    response += `*Keterangan:* ${modes[selectedMode].desc}\n\n`
    
    if (selectedMode === 'all') {
        response += '*Status:* Bot sekarang merespons di semua tipe chat.'
    } else if (selectedMode === 'gconly') {
        response += '*Status:* Bot sekarang hanya merespons di dalam Grup.'
    } else if (selectedMode === 'pconly') {
        response += '*Status:* Bot sekarang hanya merespons di dalam Chat Pribadi.'
    }
    
    return m.reply(response)
}

handler.help = ['setmode *mode*']
handler.tags = ['owner']
handler.command = /^(setmode|mode)$/i
handler.owner = true

export default handler