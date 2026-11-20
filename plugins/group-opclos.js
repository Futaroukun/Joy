let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!m.isGroup) {
        return m.reply('Fitur ini khusus untuk grup.');
    }

    try {
        const metadata = await conn.groupMetadata(m.chat);
        const isAnnounce = metadata.announce;
        const action = args[0]?.toLowerCase();
        const chat = global.db.data?.chats?.[m.chat] || {};

        if (!action) {
            const statusGroup = isAnnounce ? '*TERTUTUP (Hanya Admin)*' : '🔓 *TERBUKA (Semua Member)*';
            const statusAuto  = chat.autoOpenClose ? '✅ *AKTIF*' : '❌ *NONAKTIF*';
            const openTime    = chat.openTime || '06:00';
            const closeTime   = chat.closeTime || '21:00';

            let text = `╭── ✦ *STATUS BUKA & TUTUP GRUP* ✦\n`;
            text += `• Status Grup: ${statusGroup}\n`;
            text += `• Jadwal Otomatis: ${statusAuto}\n`;
            text += `• Jam Buka: *${openTime} WIB*\n`;
            text += `• Jam Tutup: *${closeTime} WIB*\n\n`;
            text += `› *Aksi Manual:*\n`;
            text += `• \`${usedPrefix + command} open\` › Buka grup langsung sekarang\n`;
            text += `• \`${usedPrefix + command} close\` › Tutup grup langsung sekarang\n\n`;
            text += `› *Jadwal Otomatis:*\n`;
            text += `• Ketik \`${usedPrefix}autogrup\` untuk mengatur jadwal harian.\n`;
            text += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
            return m.reply(text);
        }

        if (action === 'open' || action === 'buka') {
            if (args[1]) {
                return m.reply(`Untuk mengatur jadwal buka otomatis, gunakan perintah:\n*${usedPrefix}autogrup buka ${args[1]}*`);
            }
            if (!isAnnounce) {
                return m.reply('Grup sudah dalam mode terbuka.');
            }
            await conn.groupSettingUpdate(m.chat, 'not_announcement');
            return m.reply('🔓 *Grup telah dibuka*\n\nSemua member sekarang bisa mengirim pesan.');
        }

        if (action === 'close' || action === 'tutup') {
            if (args[1]) {
                return m.reply(`Untuk mengatur jadwal tutup otomatis, gunakan perintah:\n*${usedPrefix}autogrup tutup ${args[1]}*`);
            }
            if (isAnnounce) {
                return m.reply('Grup sudah dalam mode tertutup.');
            }
            await conn.groupSettingUpdate(m.chat, 'announcement');
            return m.reply('🔒 *Grup telah ditutup*\n\nHanya admin yang bisa mengirim pesan.');
        }

        if (/^(on|enable|aktif|1|true|off|disable|nonaktif|0|false)$/i.test(action)) {
            return m.reply(`Untuk mengaktifkan/mematikan jadwal buka tutup otomatis, gunakan perintah:\n*${usedPrefix}autogrup ${action}*`);
        }

        return m.reply(
            `Perintah tidak valid.\n\n` +
            `Gunakan:\n` +
            `• \`${usedPrefix + command} open\` (buka grup sekarang)\n` +
            `• \`${usedPrefix + command} close\` (tutup grup sekarang)\n` +
            `• \`${usedPrefix}autogrup\` (atur jadwal buka/tutup otomatis)`
        );

    } catch (error) {
        console.error('Group setting error:', error);
        await m.reply('Terjadi kesalahan saat mengubah pengaturan grup.');
    }
};

handler.help = ['group *<open|close>*'];
handler.tags = ['group'];
handler.command = /^(gc|group|grup)$/i;

handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;
