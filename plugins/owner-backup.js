/*
 * @Author      : Rafli
 * @Feature     : Owner Database Backup Command
 * @Description : Perintah manual bagi Owner untuk membuat snapshot backup database SQLite dan mengirimkannya langsung ke chat.
 */

import { sendBackupToOwner, createDatabaseBackup } from '../function/core/backup.js';

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply('Perintah ini hanya dapat diakses oleh Owner bot.');

    const statusMsg = await m.reply('_Sedang membuat snapshot cadangan database SQLite..._');

    try {
        const backup = await sendBackupToOwner(conn, m.chat);
        if (statusMsg?.key) {
            await conn.sendMessage(m.chat, { delete: statusMsg.key }).catch(() => {});
        }
    } catch (err) {
        console.error('[OWNER BACKUP ERROR]', err);
        m.reply(`*Gagal membuat backup database:*\n\n_${err.message}_`);
    }
};

handler.help    = ['backup'];
handler.tags    = ['owner'];
handler.command = /^(backup|backupdb|bkdb|dumpdb)$/i;
handler.owner   = true;

export default handler;
