/*
 * @Author      : Rafli
 * @Feature     : Feature & Plugin Counter
 * @Description : Menampilkan total fitur dan plugin bot dengan statistik kategori lengkap dan visual progress bar.
 * @Version     : 2.1 (No Decorational Emoji & Categorized Breakdown)
 */

const categoryNames = {
    ai        : 'AI Assistant',
    downloader: 'Downloader',
    group     : 'Group Management',
    info      : 'Information',
    internet  : 'Internet & Search',
    keuangan  : 'Finance Tracker',
    sticker   : 'Sticker Maker',
    store     : 'Store & Shop',
    tools     : 'Tools & Utility',
    owner     : 'Owner Only'
}

let handler = async (m, { conn, usedPrefix, command }) => {
    try {
        const allPlugins = Object.entries(global.plugins || {})
            .filter(([_, plugin]) => plugin && plugin.help)

        const activePlugins = allPlugins.filter(([_, p]) => !p.disable && !p.disabled)
        const inactivePlugins = allPlugins.filter(([_, p]) => p.disable || p.disabled)

        const totalPlugins = allPlugins.length
        const activeCount = activePlugins.length
        const inactiveCount = inactivePlugins.length

        // Hitung per kategori
        const categoryStats = {}
        for (const [filename, plugin] of activePlugins) {
            const rawTags = plugin.tags
            const tags = Array.isArray(rawTags) ? rawTags : [rawTags].filter(Boolean)
            const primaryTag = tags[0] || 'lainnya'
            const catLabel = categoryNames[primaryTag] || `${primaryTag.charAt(0).toUpperCase() + primaryTag.slice(1)}`

            if (!categoryStats[catLabel]) {
                categoryStats[catLabel] = { plugins: 0, commands: 0 }
            }
            categoryStats[catLabel].plugins++
            const helps = Array.isArray(plugin.help) ? plugin.help : [plugin.help].filter(Boolean)
            categoryStats[catLabel].commands += Math.max(helps.length, 1)
        }

        let totalCommands = 0
        activePlugins.forEach(([_, p]) => {
            const helps = Array.isArray(p.help) ? p.help : [p.help].filter(Boolean)
            totalCommands += Math.max(helps.length, 1)
        })

        const barLength = 12
        const activeFill = totalPlugins > 0 ? Math.round((activeCount / totalPlugins) * barLength) : 0
        const bar = '█'.repeat(activeFill) + '░'.repeat(barLength - activeFill)
        const percent = totalPlugins > 0 ? ((activeCount / totalPlugins) * 100).toFixed(0) : '100'

        let text =
            `*TOTAL FITUR & PLUGIN BOT*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `• *Total Perintah:* ${totalCommands} Perintah Aktif\n` +
            `• *Total Plugin:* ${totalPlugins} File (${activeCount} Aktif, ${inactiveCount} Nonaktif)\n` +
            `• *Efisiensi Modul:* [${bar}] ${percent}%\n\n` +
            `*STATISTIK PER KATEGORI:*\n`

        const sortedCategories = Object.entries(categoryStats).sort((a, b) => b[1].commands - a[1].commands)
        sortedCategories.forEach(([cat, stat]) => {
            text += `• ${cat.padEnd(18, ' ')}: ${stat.commands} fitur (${stat.plugins} file)\n`
        })

        text +=
            `\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Ketik \`${usedPrefix}menu\` untuk melihat daftar seluruh perintah._`

        return m.reply(text.trim())

    } catch (error) {
        console.error('[TOTALFITUR ERROR]', error)
        return m.reply(`*Gagal menghitung statistik fitur:*\n_${error.message}_`)
    }
}

handler.help    = ['totalfitur']
handler.tags    = ['info']
handler.command = /^(totalfitur|totalcmd|totalplugins|fiturcount)$/i

export default handler