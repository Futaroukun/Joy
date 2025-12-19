import fs from 'fs'
import path from 'path'

const formatSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { text, usedPrefix, command }) => {
    // Validasi 1: Cek apakah ada nama plugin
    if (!text || text.trim() === '') {
        return m.reply(
            '*NAMA PLUGIN DIPERLUKAN*\n\n' +
            '*Format penggunaan:*\n' +
            '*' + usedPrefix + command + ' <nama_plugin>*\n\n' +
            '*Contoh:*\n' +
            usedPrefix + command + ' *test-fitur*\n' +
            usedPrefix + command + ' *menu-admin*\n' +
            usedPrefix + command + ' *ai-chatgpt*\n\n' +
            '*Cara Kerja:*\n' +
            '1. *Reply* pesan yang berisi kode plugin\n' +
            '2. Ketik *' + usedPrefix + command + ' <nama_plugin>*\n' +
            '3. Plugin akan disimpan di folder *plugins/*\n\n' +
            '*Catatan:*\n' +
            '- Nama plugin tidak perlu ekstensi *.js*\n' +
            '- Gunakan *huruf kecil* dan tanda strip *(-)*\n' +
            '- Hindari *spasi* dalam nama plugin'
        );
    }
    
    // Validasi 2: Cek apakah ada pesan yang di-reply
    if (!m.quoted) {
        return m.reply(
            '*TIDAK ADA PESAN YANG DI-REPLY*\n\n' +
            '*Cara penggunaan yang benar:*\n' +
            '1. *Reply* pesan yang berisi kode plugin\n' +
            '2. Ketik *' + usedPrefix + command + ' <nama_plugin>*\n\n' +
            '*Contoh:*\n' +
            '- Seseorang mengirim kode plugin\n' +
            '- Anda *reply* pesan tersebut\n' +
            '- Ketik: *' + usedPrefix + command + ' test-fitur*\n\n' +
            '*Tips:*\n' +
            '- Pastikan pesan yang di-reply berisi *kode JavaScript*\n' +
            '- Kode harus *valid* dan siap digunakan\n' +
            '- Plugin akan disimpan di folder *plugins/*'
        );
    }
    
    // Validasi 3: Cek apakah pesan yang di-reply mengandung teks
    if (!m.quoted.text || m.quoted.text.trim() === '') {
        return m.reply(
            '*PESAN YANG DI-REPLY KOSONG*\n\n' +
            'Pesan yang Anda reply *tidak mengandung teks atau kode*.\n\n' +
            '*Cara penggunaan yang benar:*\n' +
            '1. Reply pesan yang *BERISI KODE PLUGIN*\n' +
            '2. Ketik *' + usedPrefix + command + ' <nama_plugin>*\n\n' +
            '*Pastikan:*\n' +
            '- Pesan berisi *kode JavaScript* yang valid\n' +
            '- Bukan *gambar, video, atau sticker*\n' +
            '- Bukan pesan *kosong* atau hanya spasi'
        );
    }
    
    // Sanitasi nama plugin
    let pluginName = text.trim().toLowerCase()
        .replace(/\s+/g, '-') // Ganti spasi dengan strip
        .replace(/[^a-z0-9\-_]/g, '') // Hapus karakter spesial
        .replace(/^-+|-+$/g, ''); // Hapus strip di awal/akhir
    
    // Validasi nama plugin setelah sanitasi
    if (!pluginName || pluginName === '') {
        return m.reply(
            '*NAMA PLUGIN TIDAK VALID*\n\n' +
            'Nama plugin yang Anda masukkan tidak valid setelah diproses.\n\n' +
            '*Aturan penamaan plugin:*\n' +
            '- Hanya *huruf, angka, strip (-), dan underscore (_)*\n' +
            '- Tidak boleh hanya *spasi* atau *karakter spesial*\n' +
            '- Minimal *1 karakter* setelah diproses\n\n' +
            '*Contoh nama yang valid:*\n' +
            '- *test-fitur*\n' +
            '- *menu_admin*\n' +
            '- *ai-chatgpt-v2*\n' +
            '- *tool_downloader*'
        );
    }
    
    let pluginPath = path.join('plugins', `${pluginName}.js`);
    let pluginCode = m.quoted.text.trim();
    
    // Validasi 4: Cek apakah kode seperti JavaScript
    if (!pluginCode.includes('handler') && !pluginCode.includes('export')) {
        return m.reply(
            '*KODE PLUGIN TIDAK VALID*\n\n' +
            'Kode yang Anda reply tidak terlihat seperti *plugin WhatsApp Bot*.\n\n' +
            '*Plugin yang valid harus mengandung:*\n' +
            '- Fungsi *handler*\n' +
            '- *Export default handler*\n' +
            '- Minimal *struktur dasar* plugin\n\n' +
            '*Contoh struktur minimal:*\n' +
            '```let handler = async (m, { conn }) => {\n' +
            '    // kode di sini\n' +
            '}\n' +
            'handler.command = /^test$/i\n' +
            'export default handler```\n\n' +
            '*Periksa kembali* kode yang Anda kirim.'
        );
    }
    
    // Validasi 5: Cek apakah file sudah ada (untuk info saja)
    let isUpdate = fs.existsSync(pluginPath);
    let oldSize = 0;
    
    if (isUpdate) {
        try {
            const oldContent = await fs.promises.readFile(pluginPath, 'utf8');
            oldSize = oldContent.length;
        } catch (error) {
            // Jika gagal baca file lama, abaikan saja
            oldSize = 0;
        }
    }
    
    try {
        // Tulis file plugin (overwrite jika sudah ada)
        await fs.promises.writeFile(pluginPath, pluginCode, 'utf8');
        
        // Berikan feedback sukses dengan detail
        if (isUpdate) {
            // Jika update file yang sudah ada
            return m.reply(
                '*PLUGIN BERHASIL DIUPDATE*\n\n' +
                '*Nama Plugin:* ' + pluginName + '.js\n' +
                '*Lokasi:* ' + pluginPath + '\n\n' +
                '*Perubahan:*\n' +
                '- Ukuran Lama: *' + formatSize(oldSize) + '*\n' +
                '- Ukuran Baru: *' + formatSize(pluginCode.length) + '*\n' +
                '- Selisih: *' + formatSize(pluginCode.length - oldSize) + '*\n\n' +
                '*Status: Plugin berhasil diperbarui*\n\n' +
                '*Langkah selanjutnya:*\n' +
                '1. Plugin akan *otomatis* ter-reload\n' +
                '2. Atau *restart bot* untuk memastikan\n' +
                '3. *Tes plugin* dengan command yang ditentukan\n\n' +
                '*Perintah terkait:*\n' +
                '- Lihat plugin: *' + usedPrefix + 'gp ' + pluginName + '*\n' +
                '- Hapus plugin: *' + usedPrefix + 'dp ' + pluginName + '*'
            );
        } else {
            // Jika create file baru
            return m.reply(
                '*PLUGIN BERHASIL DISIMPAN*\n\n' +
                '*Nama Plugin:* ' + pluginName + '.js\n' +
                '*Lokasi:* ' + pluginPath + '\n' +
                '*Ukuran:* ' + formatSize(pluginCode.length) + '*\n\n' +
                '*Status: Plugin baru berhasil dibuat*\n\n' +
                '*Langkah selanjutnya:*\n' +
                '1. Plugin akan otomatis ter-load saat *bot restart*\n' +
                '2. Atau tunggu *auto-reload* (jika aktif)\n' +
                '3. *Tes plugin* dengan command yang sudah ditentukan\n\n' +
                '*Perintah terkait:*\n' +
                '- Lihat plugin: *' + usedPrefix + 'gp ' + pluginName + '*\n' +
                '- Hapus plugin: *' + usedPrefix + 'dp ' + pluginName + '*'
            );
        }
        
    } catch (error) {
        console.error('Error saving plugin:', error);
        
        // Tentukan jenis error
        let errorMessage = '*GAGAL MENYIMPAN PLUGIN*\n\n';
        
        if (error.code === 'EACCES') {
            errorMessage += '*Kesalahan: Permission Denied*\n\n' +
                'Bot tidak memiliki izin untuk menulis file di folder *plugins/*.\n\n' +
                '*Solusi:*\n' +
                '1. Cek *permission* folder plugins\n' +
                '2. Jalankan: *chmod 755 plugins/*\n' +
                '3. Restart bot sebagai user yang memiliki akses';
        } else if (error.code === 'ENOSPC') {
            errorMessage += '*Kesalahan: Disk Full*\n\n' +
                'Ruang penyimpanan server *penuh*.\n\n' +
                '*Solusi:*\n' +
                '1. Hapus file yang tidak diperlukan\n' +
                '2. Bersihkan folder *tmp/*\n' +
                '3. *Upgrade* storage server';
        } else if (error.code === 'ENOENT') {
            errorMessage += '*Kesalahan: Folder Tidak Ditemukan*\n\n' +
                'Folder *plugins/* tidak ditemukan.\n\n' +
                '*Solusi:*\n' +
                '1. Buat folder *plugins* secara manual\n' +
                '2. Restart bot\n' +
                '3. Coba lagi';
        } else {
            errorMessage += '*Kesalahan:* ' + error.message + '\n\n' +
                'Terjadi kesalahan tidak terduga.\n\n' +
                '*Solusi:*\n' +
                '1. Cek *log error* di console\n' +
                '2. Pastikan kode plugin *valid*\n' +
                '3. Hubungi developer bot\n\n' +
                '*Detail Error:* \n' + error.stack;
        }
        
        return m.reply(errorMessage);
    }
}

handler.command = /^(sp|saveplugin)$/i;
handler.help = ['sp <nama_plugin>'];
handler.tags = ['owner'];
handler.owner = true;

export default handler