/*
- @Author: Rafli
- @Feature: Cooldown Manager
- @Description: Kelola pengaturan cooldown bot — set, reset, stats, toggle.
*/

import {
    DEFAULT_CONFIG,
    getCooldownStats,
    resetUserCooldown,
    resetAllCooldown,
    updateActiveConfig
} from '../function/events/cooldown.js'

function ensureSettings() {
    if (!global.db.data.pluginSettings) global.db.data.pluginSettings = {}
    if (!global.db.data.pluginSettings['cooldown.json']) {
        global.db.data.pluginSettings['cooldown.json'] = { config: { ...DEFAULT_CONFIG } }
    }
}

function saveConfig(config) {
    global.db.data.pluginSettings['cooldown.json'].config = config
    global.saveData('pluginSettings', 'GLOBAL_CONFIG')
    updateActiveConfig(config)
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    ensureSettings()
    const config = global.db.data.pluginSettings['cooldown.json'].config || { ...DEFAULT_CONFIG }
    const cmd    = args[0]?.toLowerCase()

    // ── Status ────────────────────────────────────────────────────────────────
    if (!cmd) {
        const stats = getCooldownStats()
        let info    =
            `*COOLDOWN SETTINGS*\n\n` +
            `*Status:* ${config.enabled ? 'ON' : 'OFF'}\n` +
            `*Global Default:* ${config.global / 1000}s\n` +
            `*Non-Premium Penalty:* ${(config.nonPremiumPenalty || 0) / 1000}s\n\n` +
            `*Stats:*\n` +
            `Total Users: ${stats.totalUsers}\n` +
            `Total Entries: ${stats.totalEntries}\n\n` +
            `*Kategori:*\n`
        for (const [cat, ms] of Object.entries(config.categories)) {
            info += `${cat}: ${ms / 1000}s\n`
        }
        info += `\nGunakan \`${usedPrefix}cooldown help\` untuk panduan lengkap.`
        return m.reply(info)
    }

    // ── Help ──────────────────────────────────────────────────────────────────
    if (cmd === 'help') return m.reply(
        `*COOLDOWN COMMAND GUIDE*\n\n` +
        `*Set Global:*\n\`${usedPrefix}cooldown set global 5000\`\n\n` +
        `*Set Kategori:*\n\`${usedPrefix}cooldown set category ai 15000\`\n\n` +
        `*Set Command:*\n\`${usedPrefix}cooldown set command menu 1000\`\n\n` +
        `*Toggle:*\n\`${usedPrefix}cooldown on\` atau \`${usedPrefix}cooldown off\`\n\n` +
        `*Reset:*\n` +
        `\`${usedPrefix}cooldown reset user 628xxx\`\n` +
        `\`${usedPrefix}cooldown reset command <cmd>\`\n` +
        `\`${usedPrefix}cooldown reset all\`\n\n` +
        `*Stats:* \`${usedPrefix}cooldown stats\`\n` +
        `*Export:* \`${usedPrefix}cooldown export\`\n\n` +
        `*Kategori tersedia:* ${Object.keys(config.categories).join(', ')}`
    )

    // ── Toggle ────────────────────────────────────────────────────────────────
    if (cmd === 'on' || cmd === 'off') {
        config.enabled = cmd === 'on'
        saveConfig(config)
        return m.reply(`Cooldown ${config.enabled ? 'diaktifkan' : 'dinonaktifkan'}.`)
    }

    // ── Stats ─────────────────────────────────────────────────────────────────
    if (cmd === 'stats') {
        const stats = getCooldownStats()
        let info    =
            `*COOLDOWN STATISTICS*\n\n` +
            `*Total Users:* ${stats.totalUsers}\n` +
            `*Total Entries:* ${stats.totalEntries}\n`

        if (stats.totalUsers > 0) {
            info += `\n*Top 5 Users:*\n`
            Object.entries(stats.data.users)
                .sort((a, b) => Object.keys(b[1]).length - Object.keys(a[1]).length)
                .slice(0, 5)
                .forEach(([jid, cmds], i) => {
                    info += `${i + 1}. ${jid.split('@')[0]} — ${Object.keys(cmds).length} commands\n`
                })
        }
        return m.reply(info)
    }

    // ── Reset ─────────────────────────────────────────────────────────────────
    if (cmd === 'reset') {
        const sub = args[1]?.toLowerCase()

        if (!sub) return m.reply(
            `*RESET COOLDOWN*\n\n` +
            `\`${usedPrefix}cooldown reset user <nomor>\`\n` +
            `\`${usedPrefix}cooldown reset command <cmd>\`\n` +
            `\`${usedPrefix}cooldown reset all\``
        )

        if (sub === 'all') {
            resetAllCooldown()
            return m.reply('Semua cooldown direset.')
        }

        if (sub === 'user') {
            if (!args[2]) return m.reply(`Masukkan nomor user.\nContoh: \`${usedPrefix}cooldown reset user 628xxx\``)
            const number = args[2].replace(/[^0-9]/g, '')
            const jidWA  = `${number}@s.whatsapp.net`
            const jidLID = conn.getLid ? conn.getLid(jidWA) : null
            if (jidLID) resetUserCooldown(jidLID)
            resetUserCooldown(jidWA)
            return m.reply(`Cooldown user ${number} direset.`)
        }

        if (sub === 'command') {
            if (!args[2]) return m.reply(`Masukkan nama command.\nContoh: \`${usedPrefix}cooldown reset command menu\``)
            const target = args[2].toLowerCase()
            const stats  = getCooldownStats()
            let count    = 0
            for (const jid in stats.data.users) {
                if (stats.data.users[jid][target]) {
                    resetUserCooldown(jid, target)
                    count++
                }
            }
            return m.reply(`Cooldown command "${target}" direset dari ${count} user.`)
        }
    }

    // ── Set ───────────────────────────────────────────────────────────────────
    if (cmd === 'set') {
        const sub = args[1]?.toLowerCase()

        if (!sub) return m.reply(
            `*SET COOLDOWN*\n\n` +
            `\`${usedPrefix}cooldown set global <ms>\`\n` +
            `\`${usedPrefix}cooldown set category <nama> <ms>\`\n` +
            `\`${usedPrefix}cooldown set command <nama> <ms>\``
        )

        if (sub === 'global') {
            if (!args[2] || isNaN(args[2])) return m.reply(`Masukkan nilai dalam milidetik.\nContoh: \`${usedPrefix}cooldown set global 5000\``)
            config.global = parseInt(args[2])
            saveConfig(config)
            return m.reply(`Global cooldown diubah ke ${config.global / 1000}s.`)
        }

        if (sub === 'category' || sub === 'cat') {
            if (!args[2]) return m.reply('Masukkan nama kategori.')
            if (!args[3] || isNaN(args[3])) return m.reply('Masukkan nilai dalam milidetik.')
            const cat = args[2].toLowerCase()
            if (!(cat in config.categories)) {
                return m.reply(`Kategori "${cat}" tidak ditemukan.\n\nKategori tersedia:\n${Object.keys(config.categories).join(', ')}`)
            }
            config.categories[cat] = parseInt(args[3])
            saveConfig(config)
            return m.reply(`Cooldown kategori "${cat}" diubah ke ${config.categories[cat] / 1000}s.`)
        }

        if (sub === 'command' || sub === 'cmd') {
            if (!args[2]) return m.reply('Masukkan nama command.')
            if (!args[3] || isNaN(args[3])) return m.reply('Masukkan nilai dalam milidetik.')
            const target = args[2].toLowerCase()
            const value  = parseInt(args[3])
            if (value === 0) delete config.commands[target]
            else config.commands[target] = value
            saveConfig(config)
            return m.reply(`Cooldown command "${target}" diubah ke ${value === 0 ? 'default (override dihapus)' : value / 1000 + 's'}.`)
        }
    }

    // ── Export ────────────────────────────────────────────────────────────────
    if (cmd === 'export') {
        return m.reply(`*COOLDOWN CONFIG:*\n\n\`\`\`${JSON.stringify(config, null, 2)}\`\`\``)
    }

    return m.reply(`Gunakan \`${usedPrefix}cooldown help\` untuk panduan lengkap.`)
}

handler.help    = ['cooldown']
handler.tags    = ['owner']
handler.command = /^(cooldown|cd)$/i
handler.owner   = true

export default handler