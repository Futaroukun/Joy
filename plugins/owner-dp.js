import { join } from 'path'
import { readdirSync, unlinkSync, existsSync, statSync } from 'fs'

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { conn, usedPrefix, command, text }) => {
    try {
        const featuresDir = join(process.cwd(), 'plugins')

        // 1. Baca, filter, dan urutkan plugin secara alfabetis (SAMA SEPERTI LP & GP)
        const pluginFiles = readdirSync(featuresDir)
            .filter(file => file.endsWith('.js'))
            .sort();
        const pluginNames = pluginFiles.map(file => file.replace('.js', ''));
        
        // 2. Jika tidak ada input, tampilkan daftar plugin dengan nomor
        if (!text) {
            let response = '*DELETE PLUGIN - PILIH PLUGIN*\n\n'
            response += 'Gunakan nomor atau nama plugin untuk menghapusnya.\n\n'
            response += `*Format:*\n${usedPrefix + command} <nomor> | ${usedPrefix + command} <nama_plugin>\n\n`
            response += '*Daftar Plugin:*\n'
            response += pluginNames.map((name, i) => `${i + 1}. ${name}`).join('\n')
            return m.reply(response)
        }

        // 3. Tentukan target berdasarkan nomor atau nama
        let targetPlugin = null;
        const inputAsNumber = parseInt(text);

        if (!isNaN(inputAsNumber) && inputAsNumber > 0 && inputAsNumber <= pluginNames.length) {
            // Jika input adalah nomor yang valid
            targetPlugin = pluginNames[inputAsNumber - 1];
        } else if (pluginNames.includes(text)) {
            // Jika input adalah nama plugin yang valid
            targetPlugin = text;
        }

        // 4. Jika target tidak ditemukan
        if (!targetPlugin) {
            return m.reply(`*Plugin Tidak Ditemukan.*\n\nInput "${text}" tidak valid. Gunakan *.dp* tanpa argumen untuk melihat daftar plugin yang tersedia.`);
        }
        
        const file = join(featuresDir, targetPlugin + '.js')
        
        if (!existsSync(file)) {
            return m.reply(`*File Hilang*\n\nFile \`plugins/${targetPlugin}.js\` gak ketemu di server. Mungkin sudah dihapus?`)
        }

        const stats = statSync(file)
        const fileSize = formatSize(stats.size)
        
        unlinkSync(file)

        conn.reply(m.chat, 
            '*Plugin Berhasil Dihapus*\n\n' +
            '*Nama:* ' + targetPlugin + '.js\n' +
            '*Path:* `plugins/' + targetPlugin + '.js`\n' +
            '*Size:* *' + fileSize + '*\n\n' +
            '*Status:* File sudah dihapus permanen.', 
            m
        )
        
    } catch (error) {
        console.error(error)
        m.reply(`*Gagal Hapus*\n\n*Error:* ${error.message}`)
    }
}

// 5. Update help command
handler.help = ['dp *<nama_plugin|nomor>*']
handler.tags = ['owner']
handler.command = /^(dp|deleteplugin)$/i
handler.owner = true

export default handler