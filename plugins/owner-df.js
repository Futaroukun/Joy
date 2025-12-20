import fs from 'fs'
import path from 'path'

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

let handler = async (m, { text, usedPrefix, command }) => {
    // Validasi input path file
    if (!text) {
        return m.reply(
            '*PATH FILE DIPERLUKAN*\n\n' +
            '*Format penggunaan:*\n' +
            '*' + usedPrefix + command + ' <path/lokasi_file>*\n\n' +
            '*Contoh:*\n' +
            '• ' + usedPrefix + command + ' tmp/foto.jpg\n' +
            '• ' + usedPrefix + command + ' database.json'
        );
    }

    const filePath = path.join(process.cwd(), text);

    // Cek apakah file benar-benar ada
    if (!fs.existsSync(filePath)) {
        return m.reply(
            '*FILE TIDAK DITEMUKAN*\n\n' +
            'Lokasi: *' + text + '* tidak ditemukan atau sudah dihapus.'
        );
    }

    try {
        // Ambil info ukuran sebelum dihapus
        const stats = fs.statSync(filePath);
        const fileSize = formatSize(stats.size);

        // Proses penghapusan
        if (stats.isDirectory()) {
            // Jika yang diinput adalah folder, gunakan rmSync dengan recursive
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            // Jika file biasa
            fs.unlinkSync(filePath);
        }

        // Respon sukses
        return m.reply(
            '*FILE BERHASIL DIHAPUS*\n\n' +
            '*Lokasi:* ' + text + '\n' +
            '*Ukuran Dibersihkan:* *' + fileSize + '*\n\n' +
            '*Status: Penghapusan permanen berhasil*'
        );

    } catch (error) {
        console.error(error);
        return m.reply(
            '*GAGAL MENGHAPUS FILE*\n\n' +
            '*Kesalahan:* ' + error.message + '\n\n' +
            '*Catatan:* Pastikan bot memiliki izin akses atau file tidak sedang digunakan.'
        );
    }
}

handler.help = ['df *path*'];
handler.tags = ['owner'];
handler.command = /^(df|deletefile)$/i;
handler.owner = true;

export default handler;