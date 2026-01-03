let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!m.isGroup) {
        return m.reply('*Fitur ini cuma bisa dipake di grup, jangan coba-coba di chat pribadi.*');
    }

    const metadata = await conn.groupMetadata(m.chat);
    const isAnnounce = metadata.announce;

    const action = args[0] ? args[0].toLowerCase() : '';

    switch (action) {
        case 'buka':
        case 'open':
            if (!isAnnounce) {
                return m.reply('*Grupnya emang udah kebuka, semua orang udah bisa chat kok.*');
            }
            await conn.groupSettingUpdate(m.chat, 'not_announcement');
            await m.reply('*Grup udah dibuka, sekarang semua member bebas mau bacot.*');
            break;

        case 'tutup':
        case 'close':
            if (isAnnounce) {
                return m.reply('*Grup ini emang udah ditutup, cuma admin doang yang bisa chat.*');
            }
            await conn.groupSettingUpdate(m.chat, 'announcement');
            await m.reply('*Grup udah dikunci, sekarang cuma admin yang bisa kirim pesan.*');
            break;

        default:
            let helpText = `*PENGATURAN CHAT GRUP*\n\n`
            helpText += `Pake perintah ini kalau mau buka atau tutup grup biar tertib.\n\n`
            helpText += `*Pilihannya:*\n`
            helpText += `• \`${usedPrefix + command}\` *open*\n(Buat buka grup biar semua orang bisa chat)\n\n`
            helpText += `• \`${usedPrefix + command}\` *close*\n(Buat tutup grup, cuma admin yang bisa chat)`
            
            await m.reply(helpText);
            break;
    }
};

handler.help = ['group *open|close*'];
handler.tags = ['group'];
handler.command = /^(group|grup)$/i;

handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;