/*
 * @Author      : Rafli
 * @Feature     : Database Auto-Backup System
 * @Description : Pencadangan otomatis database SQLite secara berkala dan pengiriman file snapshot langsung ke WhatsApp Owner.
 * @Version     : 1.0 (Safe SQLite Snapshot & Auto-Cleanup)
 */

import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import chalk from 'chalk';
import moment from 'moment-timezone';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');
const MAX_LOCAL_BACKUPS = 7; // Simpan maksimal 7 file backup lokal

function cleanLID(jid) {
    if (!jid) return null;
    const decoded = jidNormalizedUser(jid);
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':');
        return `${parts[0]}@lid`;
    }
    return decoded;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Membersihkan file backup lama agar tidak memakan ruang penyimpanan
 */
function cleanupOldBackups() {
    try {
        if (!fs.existsSync(BACKUP_DIR)) return;
        const files = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
            .map(f => ({
                name: f,
                path: path.join(BACKUP_DIR, f),
                time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime()
            }))
            .sort((a, b) => b.time - a.time);

        if (files.length > MAX_LOCAL_BACKUPS) {
            const toDelete = files.slice(MAX_LOCAL_BACKUPS);
            for (const file of toDelete) {
                try {
                    fs.unlinkSync(file.path);
                    console.log(chalk.gray(`[BACKUP] Menghapus cadangan lama: ${file.name}`));
                } catch (_) {}
            }
        }
    } catch (e) {
        console.error(chalk.red('[BACKUP CLEANUP ERROR]'), e.message);
    }
}

/**
 * Membuat file snapshot backup SQLite
 */
export async function createDatabaseBackup() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const sqlite = global.sqlite;
    if (!sqlite || !sqlite.open) {
        throw new Error('Database SQLite tidak aktif atau belum dimuat.');
    }

    // Flush WAL checkpoint secara pasif
    try {
        sqlite.pragma('wal_checkpoint(PASSIVE)');
    } catch (_) {}

    const timestamp = moment().tz('Asia/Jakarta').format('YYYY-MM-DD_HH-mm-ss');
    const filename = `backup_${timestamp}.db`;
    const targetPath = path.join(BACKUP_DIR, filename);

    // Backup SQLite secara atomic
    await sqlite.backup(targetPath);

    const stats = fs.statSync(targetPath);
    cleanupOldBackups();

    // Hitung statistik isi tabel
    let userCount = 0, chatCount = 0, settingCount = 0;
    try { userCount = sqlite.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0; } catch (_) {}
    try { chatCount = sqlite.prepare('SELECT COUNT(*) as count FROM chats').get()?.count || 0; } catch (_) {}
    try { settingCount = sqlite.prepare('SELECT COUNT(*) as count FROM settings').get()?.count || 0; } catch (_) {}

    return {
        path: targetPath,
        filename,
        size: stats.size,
        sizeFormatted: formatBytes(stats.size),
        timestamp,
        stats: {
            users: userCount,
            chats: chatCount,
            settings: settingCount
        }
    };
}

/**
 * Mengirim file backup ke WhatsApp Owner
 */
export async function sendBackupToOwner(conn, targetJid = null) {
    if (!conn) return;

    const botLid = cleanLID(conn.user?.lid || conn.user?.id);
    const settings = global.db?.data?.settings?.[botLid] || {};

    // Jika targetJid tidak ditentukan (dari scheduler), cek switch autobackup
    if (!targetJid && settings.autobackup === false) {
        return;
    }

    // Tentukan penerima (Owner utama / Developer)
    const primaryOwner = targetJid ||
        (global.developer?.[0] ? `${global.developer[0]}@s.whatsapp.net` : null) ||
        (global.info?.nomorowner ? `${global.info.nomorowner}@s.whatsapp.net` : null) ||
        (global.owner?.[0] ? `${global.owner[0]}@s.whatsapp.net` : null);

    if (!primaryOwner) {
        console.error(chalk.red('[BACKUP ERROR] Nomor tujuan Owner tidak ditemukan.'));
        return;
    }

    try {
        const backup = await createDatabaseBackup();
        const fileBuffer = fs.readFileSync(backup.path);

        const caption =
            `*AUTOBACKUP DATABASE SQLITE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Tanggal:* ${backup.timestamp.replace(/_/g, ' ')} WIB\n` +
            `• *Ukuran File:* ${backup.sizeFormatted}\n` +
            `• *Total Users:* ${backup.stats.users.toLocaleString()}\n` +
            `• *Total Chats:* ${backup.stats.chats.toLocaleString()}\n` +
            `• *Total Settings:* ${backup.stats.settings.toLocaleString()}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_File snapshot database SQLite berhasil dicadangkan dan siap direstore kapan saja._`;

        await conn.sendMessage(primaryOwner, {
            document: fileBuffer,
            fileName: backup.filename,
            mimetype: 'application/x-sqlite3',
            caption: caption
        });

        // Update timestamp backup terakhir di settings
        if (settings) {
            settings.backupDate = Date.now();
            if (global.saveData && botLid) {
                global.saveData('settings', botLid);
            }
        }

        console.log(chalk.green.bold(` [BACKUP SUKSES] File cadangan ${backup.filename} berhasil dikirim ke ${primaryOwner}.`));
        return backup;

    } catch (err) {
        console.error(chalk.red.bold(' [BACKUP GAGAL]'), err.message);
        throw err;
    }
}

/**
 * Inisialisasi scheduler otomatis (Setiap hari pukul 03:00 WIB)
 */
export function initAutoBackupScheduler(getConn) {
    cron.schedule('0 3 * * *', async () => {
        try {
            const conn = typeof getConn === 'function' ? getConn() : getConn;
            if (conn) {
                console.log(chalk.cyan.bold('[SCHEDULER] Menjalankan pencadangan otomatis database...'));
                await sendBackupToOwner(conn);
            }
        } catch (e) {
            console.error(chalk.red('[AUTOBACKUP SCHEDULER ERROR]'), e.message);
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    });
}
