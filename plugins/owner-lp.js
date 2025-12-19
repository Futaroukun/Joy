import { readdirSync, statSync } from 'fs'
import { join } from 'path'

/**
 * Fungsi untuk mengonversi ukuran byte menjadi satuan yang mudah dibaca
 */
const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { usedPrefix, command }) => {
    try {
        const pluginsDir = join(process.cwd(), 'plugins')
        const files = readdirSync(pluginsDir).filter(file => file.endsWith('.js'))
        
        if (files.length === 0) {
            return m.reply('*TIDAK ADA PLUGIN DITEMUKAN*\n\nFolder *plugins/* saat ini masih kosong.')
        }

        let totalSize = 0
        let list = files.map((file, index) => {
            const stats = statSync(join(pluginsDir, file))
            totalSize += stats.size
            const name = file.replace('.js', '')
            return `${index + 1}. *${name}* (${formatSize(stats.size)})`
        }).join('\n')

        let response = '*DAFTAR PLUGIN TERPASANG*\n\n'
        response += list
        response += '\n\n==================================\n'
        response += `*Total Plugin:* ${files.length}\n`
        response += `*Total Ukuran:* ${formatSize(totalSize)}\n`
        response += `*Gunakan:* ${usedPrefix}gp <nama_plugin> untuk melihat kode.`

        return m.reply(response)

    } catch (error) {
        console.error(error)
        return m.reply(`*GAGAL MEMBACA DAFTAR PLUGIN*\n\n*Kesalahan:* ${error.message}`)
    }
}

handler.help = ['lp']
handler.tags = ['owner']
handler.command = /^(lp|listplugin|plugins)$/i
handler.owner = true

export default handler