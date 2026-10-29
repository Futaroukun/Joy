/*
 * @Author      : Rafli
 * @Feature     : Session & Pre-Keys Pruner
 * @Description : Membersihkan file pre-key usang pada folder sessions Baileys secara aman untuk menghemat storage dan inode di Termux.
 * @Version     : 1.0 (Zero Overhead & Safe Threshold)
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import cron from 'node-cron';

function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Membersihkan file pre-key lama yang sudah kadaluarsa/dikonsumsi
 * Menjamin file creds.json, session-*, sender-key-*, dan metadata esensial tetap aman.
 */
export function cleanOldPreKeys(options = {}) {
    const {
        sessionDir = path.join(process.cwd(), 'sessions'),
        keepCount = 100,
        dryRun = false
    } = options;

    if (!fs.existsSync(sessionDir)) {
        return { success: false, message: 'Direktori sessions tidak ditemukan.' };
    }

    const credsPath = path.join(sessionDir, 'creds.json');
    if (!fs.existsSync(credsPath)) {
        return { success: false, message: 'File creds.json tidak ditemukan. Pembersihan dibatalkan demi keamanan.' };
    }

    let creds = {};
    try {
        creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    } catch (_) {}

    const nextPreKeyId = Number(creds.nextPreKeyId) || 0;
    const allFiles = fs.readdirSync(sessionDir);

    const prekeyFiles = allFiles
        .filter(f => /^pre-key-\d+\.json$/.test(f))
        .map(f => {
            const id = parseInt(f.replace('pre-key-', '').replace('.json', ''), 10);
            const fullPath = path.join(sessionDir, f);
            let size = 0;
            try { size = fs.statSync(fullPath).size; } catch (_) {}
            return { file: f, id, fullPath, size };
        })
        .sort((a, b) => a.id - b.id);

    if (prekeyFiles.length <= keepCount) {
        return {
            success: true,
            totalPreKeys: prekeyFiles.length,
            deletedCount: 0,
            keptCount: prekeyFiles.length,
            freedBytes: 0,
            freedFormatted: '0 B',
            totalSessionFiles: allFiles.length,
            thresholdId: 0
        };
    }

    const maxId = prekeyFiles[prekeyFiles.length - 1].id;
    // Batas aman: jangan hapus prekey aktif mendekati nextPreKeyId atau keepCount terakhir
    const safeNextThreshold = nextPreKeyId > 50 ? (nextPreKeyId - 50) : maxId;
    const thresholdId = Math.max(0, Math.min(safeNextThreshold, maxId - keepCount));

    const toDelete = prekeyFiles.filter(item => item.id < thresholdId);
    let freedBytes = 0;
    let deletedCount = 0;

    for (const item of toDelete) {
        freedBytes += item.size;
        if (!dryRun) {
            try {
                fs.unlinkSync(item.fullPath);
                deletedCount++;
            } catch (_) {}
        } else {
            deletedCount++;
        }
    }

    const remainingFiles = dryRun ? allFiles.length : fs.readdirSync(sessionDir).length;

    return {
        success: true,
        dryRun,
        totalPreKeys: prekeyFiles.length,
        deletedCount,
        keptCount: prekeyFiles.length - deletedCount,
        freedBytes,
        freedFormatted: formatSize(freedBytes),
        totalSessionFiles: remainingFiles,
        thresholdId
    };
}

/**
 * Inisialisasi scheduler otomatis pembersihan pre-key usang
 * Dijalankan tiap 12 jam sekali
 */
export function initAutoSessionCleaner(cronPattern = '0 */12 * * *') {
    cron.schedule(cronPattern, () => {
        try {
            const res = cleanOldPreKeys({ keepCount: 100, dryRun: false });
            if (res.success && res.deletedCount > 0) {
                console.log(chalk.cyan.bold('[SESSION CLEANER] ') +
                    chalk.green(`Memangkas ${res.deletedCount} pre-key usang (Hemat ${res.freedFormatted}). Sisa file sesi: ${res.totalSessionFiles}`));
            }
        } catch (e) {
            console.error(chalk.red('[SESSION CLEANER ERROR]'), e.message);
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    });
}
