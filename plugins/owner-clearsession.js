/*
 * @Author      : Rafli
 * @Feature     : Owner Session & Pre-Keys Pruner
 * @Description : Memangkas file pre-key usang pada folder sessions untuk menghemat storage dan inode di Termux tanpa merusak sesi WhatsApp yang aktif.
 */

import { cleanOldPreKeys } from '../function/core/session-cleaner.js';

let handler = async (m, { conn, args, usedPrefix, command, isOwner }) => {
    if (!isOwner) return m.reply('Perintah ini hanya dapat diakses oleh Owner.');

    const isCheck = args[0] && /^(check|cek|--check|-c)$/i.test(args[0]);

    try {
        const result = cleanOldPreKeys({
            keepCount: 100,
            dryRun: isCheck
        });

        if (!result.success) {
            return m.reply(`*Gagal membersihkan sesi:*\n${result.message}`);
        }

        const title = isCheck ? 'STATUS SESI & PRE-KEY' : 'PEMBERSIH SESI SUKSES';
        let msg =
            `╭── ✦ *${title}* ✦\n` +
            `│ • *Mode:* ${isCheck ? 'Pengecekan (Dry Run)' : 'Eksekusi Pembersihan'}\n` +
            `│ • *Total Pre-Key:* ${result.totalPreKeys.toLocaleString()} file\n` +
            `│ • *Pre-Key Dihapus:* ${result.deletedCount.toLocaleString()} file\n` +
            `│ • *Pre-Key Disimpan:* ${result.keptCount.toLocaleString()} file (Terbaru)\n` +
            `│ • *Ruang Dibebaskan:* ${result.freedFormatted}\n` +
            `│ • *Total File Sesi Sekarang:* ${result.totalSessionFiles.toLocaleString()} file\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        if (isCheck && result.deletedCount > 0) {
            msg += `\n\n> _Ketik \`${usedPrefix + command}\` tanpa argumen untuk langsung menghapus ${result.deletedCount} pre-key usang._`;
        }

        await m.reply(msg);

    } catch (e) {
        console.error('[CLEAR SESSION ERROR]', e);
        m.reply(`*Gagal memproses pembersihan sesi:*\n${e.message}`);
    }
};

handler.help    = ['clearsession'];
handler.tags    = ['owner'];
handler.command = /^(clearsession|clearsesi|csesi|cleanprekeys)$/i;
handler.owner   = true;

export default handler;
