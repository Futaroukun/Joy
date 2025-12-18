import { readdirSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Membersihkan file sessions kecuali 'creds.json' dan file '.backup'.
 * Fungsi ini menjadi satu-satunya sumber untuk pembersihan session.
 * @param {string} sessionsPath - Path ke folder sessions, default './sessions'.
 */
export function clearSessionFiles(sessionsPath = './sessions') {
    if (!existsSync(sessionsPath)) {
        console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.yellow("Folder sessions tidak ditemukan, skip pembersihan.")}`);
        return;
    }

    try {
        const files = readdirSync(sessionsPath);
        let deletedCount = 0;
        
        for (const file of files) {
            // DIUBAH: Kondisi diperbarui untuk skip 'creds.json' DAN semua file '.backup'
            if (file === 'creds.json' || file.endsWith('.backup')) {
                continue;
            }
            
            const filePath = join(sessionsPath, file);
            
            try {
                unlinkSync(filePath);
                deletedCount++;
                // LOG dinonaktifkan per file agar tidak spam, hanya hasil akhir.
                // console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.green(`Menghapus: ${file}`)}`);
            } catch (error) {
                console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.red.bold(`Gagal menghapus ${file}: ${error.message}`)}`);
            }
        }
        
        if (deletedCount > 0) {
            console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.green.bold(`✅ Berhasil membersihkan ${deletedCount} file sessions usang.`)}`);
        } else {
            console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.blue.bold("Tidak ada file session usang untuk dibersihkan.")}`);
        }
    } catch (error) {
        console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.red.bold(`Error saat membersihkan sessions: ${error.message}`)}`);
    }
}

/**
 * Memulai auto clear sessions setiap interval tertentu.
 * @param {number} intervalHours - Interval dalam jam (default: 3 jam).
 */
export function startAutoClearSessions(intervalHours = 3) {
    const intervalMs = intervalHours * 60 * 60 * 1000;
    
    console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.blue.bold(`🔄 Auto-clear sessions diaktifkan (setiap ${intervalHours} jam).`)}`);
    
    // Clear pertama kali saat startup
    clearSessionFiles();
    
    // Set interval untuk clear otomatis
    setInterval(() => {
        console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.yellow.bold("⏰ Memulai pembersihan sessions terjadwal...")}`);
        clearSessionFiles();
    }, intervalMs);
}