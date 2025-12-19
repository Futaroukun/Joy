import fs from 'fs'

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
    // Validasi input path/lokasi file
    if (!text) {
        return m.reply(
            '*PATH DIPERLUKAN*\n\n' +
            '*Format penggunaan:*\n' +
            '*' + usedPrefix + command + ' <path/lokasi_file>*\n\n' +
            '*Contoh:*\n' +
            '• ' + usedPrefix + command + ' plugins/test.js\n' +
            '• ' + usedPrefix + command + ' lib/helper.js'
        );
    }

    // Validasi pesan yang di-reply
    if (!m.quoted || !m.quoted.text) {
        return m.reply(
            '*TIDAK ADA KODE YANG DI-REPLY*\n\n' +
            'Silakan *reply* pesan yang berisi kode atau teks yang ingin disimpan ke dalam file.'
        );
    }

    try {
        let path = `${text}`;
        let content = m.quoted.text;
        let isUpdate = fs.existsSync(path);
        
        // Proses penyimpanan file
        await fs.writeFileSync(path, content);
        
        // Mendapatkan ukuran file
        let size = formatSize(content.length);

        // Respon sukses
        let response = isUpdate ? '*FILE BERHASIL DIUPDATE*\n\n' : '*FILE BERHASIL DISIMPAN*\n\n';
        response += '*Lokasi:* ' + path + '\n';
        response += '*Ukuran:* ' + size + '\n';
        response += '*Status:* Berhasil ditulis ke penyimpanan';

        return m.reply(response);

    } catch (error) {
        console.error(error);
        return m.reply(
            '*GAGAL MENYIMPAN FILE*\n\n' +
            '*Kesalahan:* ' + error.message + '\n\n' +
            '*Catatan:* Pastikan folder tujuan sudah ada atau bot memiliki izin akses.'
        );
    }
}

handler.help = ['sf <path>'];
handler.tags = ['owner'];
handler.command = /^(sf|savefile)$/i;
handler.owner = true;

export default handler;