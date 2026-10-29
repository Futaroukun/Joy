let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!m.isGroup) {
        return m.reply('Fitur ini khusus untuk grup.');
    }

    try {
        const metadata = await conn.groupMetadata(m.chat);
        const isAnnounce = metadata.announce;
        const action = args[0]?.toLowerCase();

        if (!action) {
            const status = isAnnounce ? '*TERTUTUP*' : '🔓 *TERBUKA*';
            let text = `*PENGATURAN GRUP*\n\n`;
            text += `Status saat ini: ${status}\n`;
            text += `${isAnnounce ? 'Hanya admin yang bisa kirim pesan.' : 'Semua member bisa kirim pesan.'}\n\n`;
            text += `*Perintah:*\n`;
            text += `• \`${usedPrefix + command} open\` - Buka grup manual\n`;
            text += `• \`${usedPrefix + command} close\` - Tutup grup manual\n`;
            text += `• \`${usedPrefix}autogrup\` - Atur jadwal buka/tutup otomatis`;
            return m.reply(text);
        }

        switch (action) {
            case 'auto':
            case 'jadwal':
                return conn.plugins['group-autogroup.js']?.default
                    ? conn.plugins['group-autogroup.js'].default(m, { conn, args: args.slice(1), usedPrefix, command: `${command} ${action}` })
                    : m.reply(`Gunakan perintah *${usedPrefix}autogrup* untuk konfigurasi jadwal otomatis.`);
            case 'buka':
            case 'open':
                if (!isAnnounce) {
                    return m.reply('Grup sudah dalam mode terbuka.');
                }
                await conn.groupSettingUpdate(m.chat, 'not_announcement');
                await m.reply('🔓 *Grup telah dibuka*\n\nSemua member sekarang bisa mengirim pesan.');
                break;

            case 'tutup':
            case 'close':
                if (isAnnounce) {
                    return m.reply('Grup sudah dalam mode tertutup.');
                }
                await conn.groupSettingUpdate(m.chat, 'announcement');
                await m.reply('*Grup telah ditutup*\n\nHanya admin yang bisa mengirim pesan.');
                break;

            default:
                return m.reply(`Perintah tidak valid.\n\nGunakan: *${usedPrefix + command} open* atau *${usedPrefix + command} close*`);
        }

    } catch (error) {
        console.error('Group setting error:', error);
        await m.reply('Terjadi kesalahan saat mengubah pengaturan grup.');
    }
};

handler.help = ['group *open|close*'];
handler.tags = ['group'];
handler.command = /^(group|grup)$/i;

handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;