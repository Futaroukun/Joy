import { join } from 'path'
import { readdirSync, unlinkSync, existsSync, statSync } from 'fs'

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { conn, usedPrefix, command, args }) => {
    try {
        const featuresDir = join(process.cwd(), 'plugins')
        let ar1 = []
        
        try {
            const files = readdirSync(featuresDir)
            ar1 = files.filter(file => file.endsWith('.js')).map(file => file.replace('.js', ''))
        } catch (error) {
            return m.reply(`*Pesan Error*\n\nGagal baca folder plugins: ${error.message}`)
        }
        
        if (!args[0]) {
            return m.reply(
                '*Masukan Nama Plugin*\n\n' +
                '*Format:*\n' +
                '*' + usedPrefix + command + ' <nama_plugin>*\n\n' +
                '*Contoh:*\n' +
                '*' + usedPrefix + command + ' menu*'
            )
        }

        if (!ar1.includes(args[0])) {
            return m.reply(
                '*Plugin Gak Ada*\n\n' +
                '*Daftar plugin yang bisa dihapus:*\n' +
                '━━━━━━━━━━━━━━━━━━━━\n' +
                ar1.map(v => '* ' + v).join('\n')
            )
        }
        
        const file = join(featuresDir, args[0] + '.js')
        
        if (!existsSync(file)) {
            return m.reply(`*File Hilang*\n\nFile \`plugins/${args[0]}.js\` gak ketemu di server.`)
        }

        const stats = statSync(file)
        const fileSize = formatSize(stats.size)
        
        unlinkSync(file)

        conn.reply(m.chat, 
            '*Plugin Berhasil Dihapus*\n\n' +
            '*Nama:* ' + args[0] + '.js\n' +
            '*Path:* `plugins/' + args[0] + '.js`\n' +
            '*Size:* *' + fileSize + '*\n\n' +
            '*Status:* File sudah dihapus permanen.', 
            m
        )
        
    } catch (error) {
        console.error(error)
        m.reply(`*Gagal Hapus*\n\n*Error:* ${error.message}`)
    }
}

handler.help = ['dp *nama_plugin*']
handler.tags = ['owner']
handler.command = /^(dp|deleteplugin)$/i
handler.owner = true

export default handler