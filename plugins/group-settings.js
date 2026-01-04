import moment from 'moment-timezone'
import { getCacheStats, clearCache } from '../function/antidelete.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'

function cleanLID(jid) {
    if (!jid) return null;
    
    const decoded = jidNormalizedUser(jid);
    
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':');
        const mainId = parts[0];
        return `${mainId}@lid`;
    }
    
    return decoded;
}

let handler = async (m, { conn, usedPrefix, command, args, isOwner, isAdmin, isROwner }) => {
    let type = (args[0] || '').toLowerCase()
    let isEnable
    let chat = global.db.data.chats[m.chat]
    let user = global.db.data.users[m.sender]
    let name = `${user.registered ? user.name : await conn.getName(m.sender)}`
    
    // ===== LOGIKA BARU UNTUK MUTE/UNMUTE =====
    if (/^mute/i.test(command)) {
        type = 'mute'
        isEnable = true
    } else if (/^unmute/i.test(command)) {
        type = 'mute'
        isEnable = false
    } else {
        // Logika lama untuk enable/disable
        isEnable = /true|enable|(turn)?on|1/i.test(command)
    }
    // ========================================
    
    const getStatus = (value) => value ? 'AKTIF' : 'NONAKTIF'
    
    const featureConfig = {
        welcome: {
            name: 'Welcome Message',
            description: 'Pesan selamat datang anggota baru',
            dbProperty: 'sambutan',
            access: 'admin',
            scope: 'group'
        },
        antilink: {
            name: 'Anti Link',
            description: 'Blokir pengiriman tautan otomatis',
            dbProperty: 'antilink',
            access: 'admin',
            scope: 'group'
        },
        antispam: {
            name: 'Anti Spam',
            description: 'Blokir pengiriman pesan spam',
            dbProperty: 'antispam',
            access: 'admin',
            scope: 'group'
        },
        antidelete: {
            name: 'Anti Delete',
            description: 'Deteksi dan kembalikan pesan yang dihapus',
            dbProperty: 'antidelete',
            access: 'admin',
            scope: 'group'
        },
        detect: {
            name: 'Detect Changes',
            description: 'Deteksi perubahan informasi grup',
            dbProperty: 'detect',
            access: 'admin',
            scope: 'group'
        },
        mute: {
            name: 'Mute Group',
            description: 'Bot tidak akan merespons command di grup',
            dbProperty: 'mute',
            access: 'admin',
            scope: 'group'
        },
        // ===========================================
        autoread: {
            name: 'Auto Read',
            description: 'Otomatis membaca pesan masuk',
            dbProperty: 'autoread',
            access: 'owner',
            scope: 'global'
        },
        anticall: {
            name: 'Anti Call',
            description: 'Otomatis reject panggilan masuk',
            dbProperty: 'antiCall',
            access: 'owner',
            scope: 'global'
        }
    }
    
    const createMenuMessage = () => {
        let menu = `*PENGATURAN BOT*\n\nHalo *${name}*! ${getGreeting()}\n`
        
        const availableFeatures = Object.entries(featureConfig).filter(([key, feature]) => {
            if (isOwner) return true
            return feature.scope === 'group' && m.isGroup
        })
        
        if (availableFeatures.length === 0) {
            if (!m.isGroup && !isOwner) {
                menu += '\n*AKSES DITOLAK*\n\nFitur pengaturan hanya dapat diakses di dalam grup atau oleh Owner.'
            } else {
                menu += '\n*Tidak ada fitur yang tersedia.*'
            }
            return menu
        }
        
        const groupFeatures = availableFeatures.filter(([k, f]) => f.scope === 'group')
        const globalFeatures = availableFeatures.filter(([k, f]) => f.scope === 'global')
        
        if (groupFeatures.length > 0 && m.isGroup) {
            menu += '\n*PENGATURAN GRUP:*\n'
            groupFeatures.forEach(([key, feature]) => {
                let status = getStatus(chat[feature.dbProperty])
                let accessLabel = feature.access === 'owner' ? '[OWNER]' : '[ADMIN]'
                menu += `*Status:* ${status}\n*Fitur:* ${feature.name} ${accessLabel}\n*Ket:* ${feature.description}\n\n`
            })
        }
        
        if (isOwner && globalFeatures.length > 0) {
            menu += '\n*PENGATURAN OWNER:*\n'
            globalFeatures.forEach(([key, feature]) => {
                const botLid = cleanLID(conn.user.lid)
                const settings = global.db.data.settings[botLid] || {}
                let status = getStatus(settings[feature.dbProperty])
                menu += `*Status:* ${status}\n*Fitur:* ${feature.name}\n*Ket:* ${feature.description}\n\n`
            })
        }
        
        if (m.isGroup && chat.antidelete) {
            const stats = getCacheStats()
            menu += `\n*STATISTIK ANTI-DELETE:*\n`
            menu += `* Cache: ${stats.totalMessages}/${stats.maxSize} pesan\n`
            menu += `* Durasi: ${stats.cacheDuration}\n\n`
            
            if (isOwner) {
                menu += `*Info Owner:* Gunakan ${usedPrefix}settings antidelete-clear untuk bersihkan cache\n\n`
            }
        }
        
        menu += `
*CARA PENGGUNAAN:*
- ${usedPrefix}enable <fitur>
- ${usedPrefix}disable <fitur>
- ${usedPrefix}mute / ${usedPrefix}unmute

*Daftar Fitur:* ${availableFeatures.map(([k]) => k).join(', ')}`.trim()
        
        return menu
    }
    
    if (type === 'antidelete-clear' && isOwner) {
        const clearedCount = clearCache()
        return m.reply(
            `*PEMBERSIHAN CACHE ANTI-DELETE*\n\n` +
            `Berhasil menghapus *${clearedCount}* pesan dari sistem cache.\n\n` +
            `Sistem akan mulai menyimpan pesan baru kembali.`
        )
    }
    
    if (!type) {
        return m.reply(createMenuMessage())
    }
    
    if (!featureConfig[type]) {
        let availableFeatures = Object.entries(featureConfig)
            .filter(([k, f]) => isOwner || f.scope === 'group')
            .map(([k]) => k)
            .join(', ')
        
        return m.reply(`*FITUR TIDAK DITEMUKAN*\n\nFitur "${type}" tidak tersedia dalam daftar.\n\n*Daftar Fitur:* ${availableFeatures}`)
    }
    
    const feature = featureConfig[type]
    
    if (feature.scope === 'group' && !m.isGroup) {
        return m.reply(`*FITUR KHUSUS GRUP*\n\nFitur *${feature.name}* hanya dapat digunakan di dalam grup.`)
    }
    
    if (feature.access === 'owner' && !isOwner) {
        return m.reply('*AKSES DITOLAK*\n\nFitur ini hanya dapat diakses oleh Owner Bot.')
    }
    
    if (feature.scope === 'group' && feature.access === 'admin') {
        if (!(isAdmin || isOwner)) {
            global.dFail('admin', m, conn)
            throw false
        }
    }
    
    if (feature.scope === 'group') {
        chat[feature.dbProperty] = isEnable
    } else {
        const botLid = cleanLID(conn.user.lid)
        if (!global.db.data.settings[botLid]) {
            global.db.data.settings[botLid] = {}
        }
        global.db.data.settings[botLid][feature.dbProperty] = isEnable
        
        if (type === 'autoread') {
            global.autoRead = isEnable
        }
    }
    
    if (type === 'mute') {
        const statusText = isEnable ? 'dinonaktifkan sementara' : 'diaktifkan kembali';
        const actionText = isEnable ? `Gunakan *${usedPrefix}unmute* untuk menyalakan.` : `Gunakan *${usedPrefix}mute* untuk mematikan.`;
        return m.reply(`*MODE GRUP DIUBAH*\n\nBot telah *${statusText}* di grup ini.\n${actionText}`);
    }
    
    if (type === 'antidelete') {
        const stats = getCacheStats()
        let response = `*${feature.name}* berhasil di *${isEnable ? 'Aktifkan' : 'Nonaktifkan'}*\n\n`
        
        if (isEnable) {
            response += `*FITUR ANTI-DELETE AKTIF*\n\n`
            response += `*Kemampuan Fitur:*\n`
            response += `* Deteksi pesan yang dihapus\n`
            response += `* Kirim ulang pesan asli otomatis\n`
            response += `* Menampilkan informasi pengirim\n`
            response += `* Mendukung teks, media, stiker, dan dokumen\n\n`
            response += `*Statistik Sistem:*\n`
            response += `* Kapasitas: ${stats.totalMessages}/${stats.maxSize} pesan\n`
            response += `* Durasi Penyimpanan: ${stats.cacheDuration}\n`
            response += `* Pembersihan otomatis: Setiap 5 menit\n\n`
            response += `*Catatan Penting:*\n`
            response += `* Pesan disimpan maksimal 24 jam\n`
            response += `* Pesan dari bot tidak akan direkam\n`
            response += `* Cache bersifat sementara di memori RAM`
        } else {
            response += `*FITUR ANTI-DELETE NONAKTIF*\n\n`
            response += `Pesan yang dihapus tidak akan dipantau lagi di grup ini.`
        }
        
        return m.reply(response)
    }
    
    await m.reply(`*${feature.name}* berhasil di *${isEnable ? 'Aktifkan' : 'Nonaktifkan'}*`)
}

// ===== UPDATE HANDLER =====
handler.help = ['settings']
handler.tags = ['group', 'owner']
handler.command = /^((en|dis)able|(tru|fals)e|(turn)?o(n|ff)|mute(group)?|unmute(group)?|settings?|seting)$/i
// ==========================

export default handler

function getGreeting() {
    const time = moment.tz('Asia/Jakarta').format('HH')
    if (time >= 4 && time < 11) return 'Selamat Pagi'
    if (time >= 11 && time < 15) return 'Selamat Siang'
    if (time >= 15 && time < 18) return 'Selamat Sore'
    return 'Selamat Malam'
}