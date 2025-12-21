import moment from 'moment-timezone'

let handler = async (m, { conn, usedPrefix, command, args, isOwner, isAdmin, isROwner }) => {
    let isEnable = /true|enable|(turn)?on|1/i.test(command)
    let chat = global.db.data.chats[m.chat]
    let user = global.db.data.users[m.sender]
    let name = `${user.registered ? user.name : await conn.getName(m.sender)}`
    let type = (args[0] || '').toLowerCase()

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
        detect: {
            name: 'Detect Changes',
            description: 'Deteksi perubahan informasi grup',
            dbProperty: 'detect',
            access: 'admin',
            scope: 'group'
        },
        autoread: {
            name: 'Auto Read',
            description: 'Otomatis membaca pesan masuk',
            dbProperty: 'autoread',
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
                const botLid = conn.user.lid
                const settings = global.db.data.settings[botLid] || {}
                let status = getStatus(settings[feature.dbProperty])
                menu += `*Status:* ${status}\n*Fitur:* ${feature.name}\n*Ket:* ${feature.description}\n\n`
            })
        }

        menu += `
*CARA PENGGUNAAN:*
* ${usedPrefix}enable <fitur> (Aktifkan)
* ${usedPrefix}disable <fitur> (Nonaktifkan)

*Daftar Fitur:* ${availableFeatures.map(([k]) => k).join(', ')}`.trim()
        
        return menu
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
            global.dfail('admin', m, conn)
            throw false
        }
    }

    if (feature.scope === 'group') {
        chat[feature.dbProperty] = isEnable
    } else {
        const botLid = conn.user.lid
        if (!global.db.data.settings[botLid]) {
            global.db.data.settings[botLid] = {}
        }
        global.db.data.settings[botLid][feature.dbProperty] = isEnable
        
        if (type === 'autoread') {
            global.autoRead = isEnable
        }
    }

    await m.reply(`*${feature.name}* berhasil di *${isEnable ? 'Aktifkan' : 'Nonaktifkan'}*`)
}

handler.help = ['enable <fitur>', 'disable <fitur>']
handler.tags = ['group', 'owner']
handler.command = /^((en|dis)able|(tru|fals)e|(turn)?o(n|ff)|settings?|seting)$/i

export default handler

function getGreeting() {
    const time = moment.tz('Asia/Jakarta').format('HH')
    if (time >= 4 && time < 11) return 'Selamat Pagi'
    if (time >= 11 && time < 15) return 'Selamat Siang'
    if (time >= 15 && time < 18) return 'Selamat Sore'
    return 'Selamat Malam'
}