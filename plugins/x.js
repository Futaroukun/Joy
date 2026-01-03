let handler = async (m, { conn, args, usedPrefix, command }) => {
    // Validasi dasar
    if (!m.isGroup) {
        return m.reply('Fitur ini cuma bisa dipake di grup.');
    }

    const action = args[0] ? args[0].toLowerCase() : '';

    switch (action) {
        case 'buka':
        case 'open':
            // Buka grup: semua member bisa chat
            await conn.groupSettingUpdate(m.chat, 'not_announcement');
            await m.reply('✅ *Grup Dibuka*\n\nSekarang semua member bisa mengirim pesan.');
            break;

        case 'tutup':
        case 'close':
            // Tutup grup: hanya admin yang bisa chat
            await conn.groupSettingUpdate(m.chat, 'announcement');
            await m.reply('✅ *Grup Ditutup*\n\nHanya admin yang bisa mengirim pesan sekarang.');
            break;

        default:
            // Tampilkan menu bantuan jika argumen salah atau tidak ada
            let helpText = `*PENGATURAN CHAT GRUP*\n\n`
            helpText += `Gunakan perintah ini untuk membuka atau menutup grup.\n\n`
            helpText += `*Perintah yang tersedia:*\n`
            helpText += `• *${usedPrefix + command} open*\n   (Membuka grup agar semua bisa chat)\n\n`
            helpText += `• *${usedPrefix + command} close*\n   (Menutup grup, hanya admin yang bisa chat)`
            
            await m.reply(helpText);
            break;
    }
};

// Metadata plugin
handler.help = ['group <open|close>'];
handler.tags = ['group', 'admin'];
handler.command = /^(group|grup)$/i;

// Hak akses yang diperlukan
handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;