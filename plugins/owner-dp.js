import { join } from 'path'
import { readdirSync, unlinkSync, existsSync, statSync } from 'fs'

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

let handler = async (m, { conn, usedPrefix, command, args }) => {
    try {
        const featuresDir = join(process.cwd(), 'plugins')
        let ar1 = []
        
        // Membaca daftar plugin yang tersedia
        try {
            const files = readdirSync(featuresDir)
            ar1 = files.filter(file => file.endsWith('.js')).map(file => file.replace('.js', ''))
        } catch (error) {
            return m.reply(`*KESALAHAN SISTEM*\n\nGagal membaca direktori plugins: ${error.message}`)
        }
        
        // Validasi input nama plugin
        if (!args[0]) {
            return m.reply(
                '*NAMA PLUGIN DIPERLUKAN*\n\n' +
                '*Format penggunaan:*\n' +
                '*' + usedPrefix + command + ' <nama_plugin>*\n\n' +
                '*Contoh:*\n' +
                usedPrefix + command + ' *test-fitur*'
            )
        }

        // Cek apakah plugin ada di dalam daftar
        if (!ar1.includes(args[0])) {
            return m.reply(
                '*PLUGIN TIDAK DITEMUKAN*\n\n' +
                'Daftar plugin yang tersedia:\n' +
                '==================================\n' +
                ar1.map(v => ' ' + v).join('\n')
            )
        }
        
        const file = join(featuresDir, args[0] + '.js')
        
        // Cek keberadaan file secara fisik
        if (!existsSync(file)) {
            return m.reply(`*FILE TIDAK DITEMUKAN*\n\nFile *plugins/${args[0]}.js* tidak ada di penyimpanan.`)
        }

        // Mengambil ukuran file sebelum dihapus
        const stats = statSync(file)
        const fileSize = formatSize(stats.size)
        
        // Proses penghapusan
        unlinkSync(file)

        // Respon sukses (disesuaikan dengan gaya sp)
        conn.reply(m.chat, 
            '*PLUGIN BERHASIL DIHAPUS*\n\n' +
            '*Nama Plugin:* ' + args[0] + '.js\n' +
            '*Lokasi:* plugins/' + args[0] + '.js\n' +
            '*Ukuran Dibersihkan:* *' + fileSize + '*\n\n' +
            '*Status: File telah dihapus permanen*', 
            m
        )
        
    } catch (error) {
        console.error(error)
        m.reply(`*GAGAL MENGHAPUS PLUGIN*\n\n*Kesalahan:* ${error.message}`)
    }
}

handler.help = ['dp <nama_plugin>']
handler.tags = ['owner']
handler.command = /^(dp|deleteplugin)$/i
handler.owner = true // Menggunakan owner agar seragam dengan sp

export default handler