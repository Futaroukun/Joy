/*
 * @Author      : Rafli
 * @Feature     : List Installed Plugins
 * @Description : Menampilkan daftar seluruh plugin yang terpasang beserta ukuran file dan status keaktifannya.
 * @Version     : 2.1 (No Decorational Emoji & Clean Overview)
 */

import { readdirSync, statSync } from 'fs'
import { join } from 'path'

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

let handler = async (m, { usedPrefix }) => {
    try {
        const pluginsDir = join(process.cwd(), 'plugins')
        const files      = readdirSync(pluginsDir).filter(f => f.endsWith('.js')).sort()

        if (files.length === 0) {
            return m.reply('Folder plugins saat ini masih kosong.')
        }

        const pluginSettings = global.db?.data?.pluginSettings || {}
        let totalSize = 0

        const list = files.map((file, i) => {
            const stats = statSync(join(pluginsDir, file))
            totalSize += stats.size
            const name = file.replace('.js', '')
            const isDisabled = pluginSettings[file]?.disabled
            return `${i + 1}. *${name}* (${formatSize(stats.size)})${isDisabled ? ' _[OFF]_' : ''}`
        }).join('\n')

        return m.reply(
            `*DAFTAR PLUGIN TERPASANG*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `${list}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Total Plugin:* ${files.length} file\n` +
            `• *Total Ukuran:* ${formatSize(totalSize)}\n\n` +
            `_Ketik \`${usedPrefix}gp <nomor|nama>\` untuk melihat kode source._`
        )

    } catch (e) {
        console.error('[LIST PLUGIN ERROR]', e)
        m.reply(`*Gagal membaca daftar plugin:*\n_${e.message}_`)
    }
}

handler.help    = ['lp']
handler.tags    = ['owner']
handler.command = /^(lp|listplugin)$/i
handler.owner   = true

export default handler