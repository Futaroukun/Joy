/*
 * @Author     : Rafli
 * @Feature    : System & Group Settings Manager
 * @Description: Manajemen konfigurasi saklar bot per-grup dan global/owner dengan dukungan interactive buttons dan sub-command terpadu.
 * @Version    : 2.1 (No Decorational Emoji)
 */

import moment from 'moment-timezone'
import { getCacheStats, clearCache, MAX_CACHE_PER_GROUP, CACHE_DURATION, CLEANUP_INTERVAL } from '../function/events/antidelete.js'
import { jidNormalizedUser } from '@whiskeysockets/baileys'

function cleanLID(jid) {
    if (!jid) return null
    const decoded = jidNormalizedUser(jid)
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':')
        return `${parts[0]}@lid`
    }
    return decoded
}

function getGreeting() {
    const time = moment.tz('Asia/Jakarta').format('HH')
    const h = parseInt(time)
    if (h >= 4 && h < 11) return 'Selamat Pagi'
    if (h >= 11 && h < 15) return 'Selamat Siang'
    if (h >= 15 && h < 18) return 'Selamat Sore'
    return 'Selamat Malam'
}

const featureConfig = {
    welcome: {
        name: 'Welcome Message',
        description: 'Mengirim pesan sambutan otomatis kepada member baru yang bergabung.',
        dbProperty: 'sambutan',
        access: 'admin',
        scope: 'group',
        aliases: ['welcome', 'sambutan', 'wel']
    },
    antilink: {
        name: 'Anti Link',
        description: 'Memblokir dan menghapus pesan tautan/link grup WhatsApp lain.',
        dbProperty: 'antilink',
        access: 'admin',
        scope: 'group',
        aliases: ['antilink', 'link', 'antiurl']
    },
    antidelete: {
        name: 'Anti Delete',
        description: 'Mendeteksi dan memulihkan kembali pesan yang telah dihapus di grup.',
        dbProperty: 'antidelete',
        access: 'admin',
        scope: 'group',
        aliases: ['antidelete', 'antihapus', 'antidel']
    },
    antivirtex: {
        name: 'Anti Virtex',
        description: 'Mendeteksi dan menghapus teks virtex/pesan berbahaya yang membuat lag.',
        dbProperty: 'antivirtex',
        access: 'admin',
        scope: 'group',
        aliases: ['antivirtex', 'virtex', 'antivirus']
    },
    detect: {
        name: 'Detect Changes',
        description: 'Memberi notifikasi otomatis jika ada perubahan info atau admin grup.',
        dbProperty: 'detect',
        access: 'admin',
        scope: 'group',
        aliases: ['detect', 'perubahan', 'notif']
    },
    mute: {
        name: 'Mute Group',
        description: 'Bot tidak akan merespons perintah/pesan biasa di dalam grup ini.',
        dbProperty: 'mute',
        access: 'admin',
        scope: 'group',
        aliases: ['mute', 'bisukan', 'diam']
    },
    autogempa: {
        name: 'Auto Gempa BMKG',
        description: 'Menerima peringatan dini gempa bumi terkini dari BMKG secara otomatis.',
        dbProperty: 'autogempa',
        access: 'admin',
        scope: 'group',
        aliases: ['autogempa', 'notifgempa', 'gempalert', 'alertgempa']
    },
    jualan: {
        name: 'Fitur Store/Jualan',
        description: 'Mengaktifkan respons otomatis sistem katalog/list produk toko di grup.',
        dbProperty: 'jualan',
        access: 'admin',
        scope: 'group',
        aliases: ['jualan', 'store', 'toko', 'katalog']
    },
    autogroup: {
        name: 'Auto Open/Close Group',
        description: 'Buka dan tutup grup otomatis setiap hari sesuai jadwal kustom.',
        dbProperty: 'autoOpenClose',
        access: 'admin',
        scope: 'group',
        aliases: ['autogroup', 'autogrup', 'autoopenclose', 'jadwalgrup']
    },
    autoread: {
        name: 'Auto Read Chat',
        description: 'Otomatis menandai seluruh pesan masuk sebagai terbaca (centang biru).',
        dbProperty: 'autoread',
        access: 'owner',
        scope: 'global',
        aliases: ['autoread', 'read', 'baca']
    },
    anticall: {
        name: 'Anti Call',
        description: 'Otomatis menolak semua panggilan telepon/video WhatsApp yang masuk.',
        dbProperty: 'antiCall',
        access: 'owner',
        scope: 'global',
        aliases: ['anticall', 'panggilan', 'call']
    },
    autobackup: {
        name: 'Auto Backup Database',
        description: 'Mencadangkan database SQLite secara otomatis dan berkala.',
        dbProperty: 'autobackup',
        access: 'owner',
        scope: 'global',
        aliases: ['autobackup', 'backup']
    },
    autoupdate: {
        name: 'Auto Update Script',
        description: 'Otomatis memeriksa dan sinkronisasi pembaruan dari repository.',
        dbProperty: 'autoupdate',
        access: 'owner',
        scope: 'global',
        aliases: ['autoupdate', 'update']
    }
}

function resolveFeatureKey(input) {
    if (!input) return null
    const clean = input.toLowerCase().trim()
    for (const [key, feat] of Object.entries(featureConfig)) {
        if (key === clean || feat.aliases.includes(clean)) return key
    }
    return null
}

let handler = async (m, { conn, usedPrefix, command, args, isOwner, isAdmin }) => {
    let chat = global.db.data.chats[m.chat] || {}
    const botLid = cleanLID(conn.user?.lid)
    if (!global.db.data.settings[botLid]) global.db.data.settings[botLid] = {}
    const botSettings = global.db.data.settings[botLid]

    const cmd = (command || '').toLowerCase()
    const arg0 = (args[0] || '').toLowerCase()
    const arg1 = (args[1] || '').toLowerCase()

    let type = ''
    let isEnable = null

    if (/^mute(group)?$/i.test(cmd)) {
        type = 'mute'
        isEnable = true
    } else if (/^unmute(group)?$/i.test(cmd)) {
        type = 'mute'
        isEnable = false
    } else if (/^(enable|turnon|on|true|1)$/i.test(cmd)) {
        type = resolveFeatureKey(arg0) || arg0
        isEnable = true
    } else if (/^(disable|turnoff|off|false|0)$/i.test(cmd)) {
        type = resolveFeatureKey(arg0) || arg0
        isEnable = false
    } else {
        if (/^(on|enable|turnon|1|true)$/i.test(arg0)) {
            type = resolveFeatureKey(arg1) || arg1
            isEnable = true
        } else if (/^(off|disable|turnoff|0|false)$/i.test(arg0)) {
            type = resolveFeatureKey(arg1) || arg1
            isEnable = false
        } else if (arg0 && /^(on|enable|turnon|1|true)$/i.test(arg1)) {
            type = resolveFeatureKey(arg0) || arg0
            isEnable = true
        } else if (arg0 && /^(off|disable|turnoff|0|false)$/i.test(arg1)) {
            type = resolveFeatureKey(arg0) || arg0
            isEnable = false
        } else if (arg0) {
            type = resolveFeatureKey(arg0) || arg0
            isEnable = null
        }
    }

    if ((type === 'antidelete-clear' || arg0 === 'antidelete-clear') && isOwner) {
        const clearedCount = clearCache()
        return m.reply(`*CACHE DIBERSIHKAN*\n\nSebanyak *${clearedCount} pesan* telah dihapus dari memori antidelete.`)
    }

    if (!type || arg0 === 'help' || arg0 === 'menu') {
        const name = m.name || m.pushName || (conn.getNumber ? conn.getNumber(m.sender) : '') || 'Pengguna'
        const availableFeatures = Object.entries(featureConfig).filter(([_, feature]) => {
            if (isOwner) return true
            return feature.scope === 'group' && m.isGroup
        })

        if (availableFeatures.length === 0) {
            return m.reply('*AKSES DITOLAK*\nFitur ini hanya dapat digunakan di dalam grup oleh Admin atau oleh Owner bot.')
        }

        const groupFeatures = availableFeatures.filter(([_, f]) => f.scope === 'group')
        const globalFeatures = availableFeatures.filter(([_, f]) => f.scope === 'global')
        const sections = []

        if (groupFeatures.length > 0 && m.isGroup) {
            const groupRows = groupFeatures.map(([key, feature]) => {
                const isActive = !!chat[feature.dbProperty]
                return {
                    header     : feature.name,
                    title      : `${isActive ? '[ON]' : '[OFF]'} - ${feature.name}`,
                    description: `${feature.description}`,
                    id         : `${usedPrefix}settings ${key} ${isActive ? 'off' : 'on'}`
                }
            })
            sections.push({ title: 'Pengaturan Grup', rows: groupRows })
        }

        if (isOwner && globalFeatures.length > 0) {
            const ownerRows = globalFeatures.map(([key, feature]) => {
                const isActive = !!botSettings[feature.dbProperty]
                return {
                    header     : feature.name,
                    title      : `${isActive ? '[ON]' : '[OFF]'} - ${feature.name}`,
                    description: `${feature.description}`,
                    id         : `${usedPrefix}settings ${key} ${isActive ? 'off' : 'on'}`
                }
            })
            sections.push({ title: 'Pengaturan Owner', rows: ownerRows })
        }

        if (m.isGroup && chat.antidelete && isOwner) {
            const stats = getCacheStats()
            sections.push({
                title: 'Utilitas Sistem',
                rows : [{
                    header     : 'Bersihkan Cache Antidelete',
                    title      : `Hapus ${stats.totalMessages} Pesan`,
                    description: `Estimasi Memory: ${stats.memoryEstimate}`,
                    id         : `${usedPrefix}settings antidelete-clear`
                }]
            })
        }

        let bodyText =
            `Halo *${name}*! ${getGreeting()}\n\n` +
            `Silakan atur saklar fitur bot di bawah ini:\n\n` +
            `*Format Cepat:*\n` +
            `• \`${usedPrefix}on <fitur>\` - Mengaktifkan fitur\n` +
            `• \`${usedPrefix}off <fitur>\` - Menonaktifkan fitur\n\n` +
            `_Contoh: \`${usedPrefix}on antilink\` atau \`${usedPrefix}off welcome\`_`

        try {
            return await conn.sendButton(m.chat, {
                body   : bodyText,
                footer : `${global.info?.namabot || 'Joy'} • System Settings`,
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({ title: 'PILIH FITUR', sections })
                }]
            }, { quoted: m })
        } catch {
            let txt = `*KONFIGURASI SISTEM BOT*\n━━━━━━━━━━━━━━━━━━━━━━\n\n`
            for (const sec of sections) {
                txt += `*${sec.title.toUpperCase()}*\n`
                for (const r of sec.rows) {
                    const isFeatureOn = r.title.includes('[ON]')
                    txt += `• *${r.header}:* ${isFeatureOn ? '*[ON]*' : '*[OFF]*'}\n`
                    txt += `  └ _Ubah:_ \`${r.id}\`\n`
                }
                txt += `\n`
            }
            txt += `*Format:* \`${usedPrefix}on <fitur>\` / \`${usedPrefix}off <fitur>\``
            return m.reply(txt.trim())
        }
    }

    if (!featureConfig[type]) {
        const validList = Object.entries(featureConfig)
            .filter(([_, f]) => (f.scope === 'group' && m.isGroup) || isOwner)
            .map(([k, f]) => `• \`${k}\` - ${f.name}`)
            .join('\n')

        return m.reply(
            `*FITUR TIDAK DITEMUKAN*\n\n` +
            `Fitur *"${type}"* tidak terdaftar di sistem.\n\n` +
            `*Daftar Fitur yang Tersedia:*\n${validList}\n\n` +
            `_Gunakan: \`${usedPrefix}on <nama_fitur>\` atau \`${usedPrefix}off <nama_fitur>\`_`
        )
    }

    const feature = featureConfig[type]

    if (feature.scope === 'group' && !m.isGroup) return m.reply('Fitur ini hanya dapat digunakan di dalam grup.')
    if (feature.access === 'owner' && !isOwner) return m.reply('Akses terbatas hanya untuk Owner bot.')
    if (feature.scope === 'group' && feature.access === 'admin' && !(isAdmin || isOwner)) {
        return global.dFail ? global.dFail('admin', m, conn) : m.reply('Hanya Admin grup yang dapat mengubah pengaturan ini.')
    }

    let currentStatus
    if (feature.scope === 'group') {
        currentStatus = !!chat[feature.dbProperty]
    } else {
        currentStatus = !!botSettings[feature.dbProperty]
    }

    if (isEnable === null) {
        isEnable = !currentStatus
    }

    if (currentStatus === isEnable) {
        const actionText = isEnable ? 'AKTIF (ON)' : 'NONAKTIF (OFF)'
        return m.reply(
            `*FITUR SUDAH ${actionText}*\n\n` +
            `Fitur *${feature.name}* saat ini sudah dalam keadaan *${actionText}*.\n\n` +
            `Gunakan \`${usedPrefix}${isEnable ? 'off' : 'on'} ${type}\` jika ingin mengubahnya.`
        )
    }

    if (feature.scope === 'group') {
        chat[feature.dbProperty] = isEnable
        global.db.data.chats[m.chat] = chat
        global.saveData('chats', m.chat)
    } else {
        botSettings[feature.dbProperty] = isEnable
        global.db.data.settings[botLid] = botSettings
        if (type === 'autoread') global.autoRead = isEnable
        global.saveData('settings', botLid)
    }

    if (type === 'mute') {
        const gcName = m.isGroup ? (await conn.groupMetadata(m.chat).catch(() => null))?.subject || 'Grup' : 'Grup'
        return m.reply(`*STATUS BOT DIUBAH*\n\nBot telah di-*${isEnable ? 'MUTE (Hening)' : 'UNMUTE (Aktif)'}* untuk grup *${gcName}*.`)
    }

    if (type === 'antidelete') {
        const stats = getCacheStats()
        let response = `*ANTI-DELETE ${isEnable ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}*\n\n`
        if (isEnable) {
            response += `*Status Cache:*\n`
            response += `• Total Grup: ${stats.totalGroups}\n`
            response += `• Total Pesan: ${stats.totalMessages}\n`
            response += `• Estimasi Memory: ${stats.memoryEstimate}\n\n`
            response += `*Konfigurasi:*\n`
            response += `• Kapasitas: ${MAX_CACHE_PER_GROUP} pesan/grup\n`
            response += `• Masa Simpan: ${CACHE_DURATION / (60 * 60 * 1000)} jam\n`
            response += `• Auto-Cleanup: ${CLEANUP_INTERVAL / (60 * 1000)} menit\n\n`
            response += `_Pesan yang dihapus akan dipulihkan secara otomatis._`
        } else {
            response += `Fitur pemulihan pesan terhapus telah dimatikan.`
        }
        return m.reply(response)
    }

    return m.reply(
        `*${feature.name.toUpperCase()} ${isEnable ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}*\n\n` +
        `• *Status:* ${isEnable ? 'ON (Aktif)' : 'OFF (Mati)'}\n` +
        `• *Keterangan:* ${feature.description}`
    )
}

handler.help    = ['settings'];
handler.tags    = ['group'];
handler.command = /^((en|dis)able|(tru|fals)e|(turn)?o(n|ff)|mute(group)?|unmute(group)?|settings?|seting)$/i;

export default handler