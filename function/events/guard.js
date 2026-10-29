import fs from 'fs';
import path from 'path';

/**
 * Memeriksa apakah file/konfigurasi yang dibutuhkan tersedia.
 * Jika ada yang hilang, otomatis mengirim notifikasi ke user dan mengembalikan false.
 * 
 * @param {object} m - Objek pesan (smsg)
 * @param {string|string[]} files - File atau daftar path file relatif dari root bot
 * @param {object} [options] - Opsi konfigurasi
 * @param {string} [options.customMsg] - Pesan peringatan kustom
 * @param {boolean} [options.checkNotEmpty=false] - Validasi agar file tidak boleh 0 byte
 * @returns {boolean} true jika semua file ada, false jika ada yang hilang
 */
export function checkFiles(m, files, options = {}) {
    const fileList = Array.isArray(files) ? files : [files];
    const missing = [];

    for (const relPath of fileList) {
        const fullPath = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath);
        if (!fs.existsSync(fullPath)) {
            missing.push(relPath);
            continue;
        }

        if (options.checkNotEmpty) {
            try {
                const stat = fs.statSync(fullPath);
                if (stat.size === 0) {
                    missing.push(`${relPath} (file kosong)`);
                }
            } catch {
                missing.push(relPath);
            }
        }
    }

    if (missing.length > 0) {
        const warning = options.customMsg || (
            `⚠️ *PERINGATAN SISTEM: FILE / DEPENDENSI TIDAK DITEMUKAN*\n\n` +
            `Fitur tidak dapat diproses karena file/konfigurasi berikut belum ada:\n` +
            missing.map(f => `• \`${f}\``).join('\n') + '\n\n' +
            `_Proses langsung dihentikan agar tidak terjadi antrean pesan tertunda._`
        );
        if (m && typeof m.reply === 'function') {
            m.reply(warning);
        }
        return false;
    }

    return true;
}

/**
 * Validasi apakah file/modul ada tanpa mengirim pesan.
 * 
 * @param {string|string[]} files - Path file
 * @returns {boolean}
 */
export function hasFiles(files) {
    const fileList = Array.isArray(files) ? files : [files];
    return fileList.every(relPath => {
        const fullPath = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath);
        return fs.existsSync(fullPath);
    });
}

export default {
    checkFiles,
    hasFiles
};
