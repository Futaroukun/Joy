/*
 * @Author     : Rafli & Antigravity
 * @Feature    : Group Open/Close & Auto Schedule Setting
 * @Description: Buka/tutup grup manual serta pengaturan jadwal buka/tutup otomatis (.gc open 06.00 / .gc close 15.00).
 */

function parseTime(input) {
    if (!input || typeof input !== 'string') return null;
    const cleaned = input.trim().replace('.', ':');
    const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return null;

    const hours = parseInt(match[1], 10);
    const minutes = match[2] !== undefined ? parseInt(match[2], 10) : 0;

    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    if (!m.isGroup) {
        return m.reply('Fitur ini khusus untuk grup.');
    }

    try {
        const metadata = await conn.groupMetadata(m.chat);
        const isAnnounce = metadata.announce;
        const action = args[0]?.toLowerCase();
        let chat = global.db.data?.chats?.[m.chat];
        if (!chat) {
            chat = global.db.data.chats[m.chat] = {};
        }

        const openTime = chat.openTime || '06:00';
        const closeTime = chat.closeTime || '21:00';
        const isAutoActive = Boolean(chat.autoOpenClose);

        if (!action) {
            const statusGroup = isAnnounce ? '*TERTUTUP (Hanya Admin)*' : '🔓 *TERBUKA (Semua Member)*';
            const statusAuto  = isAutoActive ? '✅ *AKTIF*' : '❌ *NONAKTIF*';

            let text = `╭── ✦ *PENGATURAN BUKA & TUTUP GRUP* ✦\n`;
            text += `• Status Grup Saat Ini: ${statusGroup}\n`;
            text += `• Jadwal Otomatis: ${statusAuto}\n`;
            text += `• Jadwal Buka: *${openTime} WIB*\n`;
            text += `• Jadwal Tutup: *${closeTime} WIB*\n\n`;
            text += `› *Aksi Manual:*\n`;
            text += `• \`${usedPrefix + command} open\` › Buka grup langsung\n`;
            text += `• \`${usedPrefix + command} close\` › Tutup grup langsung\n\n`;
            text += `› *Atur Jam Otomatis:*\n`;
            text += `• \`${usedPrefix + command} open <jam>\` › Contoh: \`${usedPrefix + command} open 06.00\` / \`06:00\`\n`;
            text += `• \`${usedPrefix + command} close <jam>\` › Contoh: \`${usedPrefix + command} close 15.00\` / \`15:00\`\n\n`;
            text += `› *Sakelar On / Off Setting:*\n`;
            text += `• \`${usedPrefix}on autogroup\` › Mengaktifkan jadwal otomatis\n`;
            text += `• \`${usedPrefix}off autogroup\` › Mematikan jadwal otomatis\n`;
            text += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
            return m.reply(text);
        }

        // ── Buka Grup (Manual atau Set Jam Buka Otomatis) ─────────────
        if (action === 'open' || action === 'buka') {
            const timeParam = args[1];

            // Jika ada parameter jam -> Atur jam buka otomatis
            if (timeParam) {
                const parsed = parseTime(timeParam);
                if (!parsed) {
                    return m.reply(
                        `╭── ✦ *FORMAT WAKTU TIDAK VALID* ✦\n` +
                        `• Gunakan pemisah titik (.) atau titik dua (:)\n` +
                        `• Contoh: \`${usedPrefix + command} open 06.00\` atau \`${usedPrefix + command} open 06:00\`\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━━━`
                    );
                }

                chat.openTime = parsed;
                global.saveData?.('chats', m.chat);

                let replyText = `╭── ✦ *JADWAL BUKA GRUP DIATUR* ✦\n`;
                replyText += `• Jam Buka Baru: *${parsed} WIB*\n`;
                replyText += `• Jam Tutup: *${chat.closeTime || '21:00'} WIB*\n`;
                replyText += `• Status Setting: ${chat.autoOpenClose ? '✅ *AKTIF*' : '❌ *NONAKTIF*'}\n`;
                if (!chat.autoOpenClose) {
                    replyText += `\n_Catatan: Jadwal otomatis saat ini masih NONAKTIF. Aktifkan dengan perintah *${usedPrefix}on autogroup*._\n`;
                }
                replyText += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
                return m.reply(replyText);
            }

            // Tanpa parameter jam -> Buka grup manual langsung
            if (!isAnnounce) {
                return m.reply('Grup sudah dalam mode terbuka.');
            }
            await conn.groupSettingUpdate(m.chat, 'not_announcement');
            return m.reply('🔓 *Grup telah dibuka*\n\nSemua member sekarang bisa mengirim pesan.');
        }

        // ── Tutup Grup (Manual atau Set Jam Tutup Otomatis) ────────────
        if (action === 'close' || action === 'tutup') {
            const timeParam = args[1];

            // Jika ada parameter jam -> Atur jam tutup otomatis
            if (timeParam) {
                const parsed = parseTime(timeParam);
                if (!parsed) {
                    return m.reply(
                        `╭── ✦ *FORMAT WAKTU TIDAK VALID* ✦\n` +
                        `• Gunakan pemisah titik (.) atau titik dua (:)\n` +
                        `• Contoh: \`${usedPrefix + command} close 15.00\` atau \`${usedPrefix + command} close 15:00\`\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━━━`
                    );
                }

                chat.closeTime = parsed;
                global.saveData?.('chats', m.chat);

                let replyText = `╭── ✦ *JADWAL TUTUP GRUP DIATUR* ✦\n`;
                replyText += `• Jam Tutup Baru: *${parsed} WIB*\n`;
                replyText += `• Jam Buka: *${chat.openTime || '06:00'} WIB*\n`;
                replyText += `• Status Setting: ${chat.autoOpenClose ? '✅ *AKTIF*' : '❌ *NONAKTIF*'}\n`;
                if (!chat.autoOpenClose) {
                    replyText += `\n_Catatan: Jadwal otomatis saat ini masih NONAKTIF. Aktifkan dengan perintah *${usedPrefix}on autogroup*._\n`;
                }
                replyText += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
                return m.reply(replyText);
            }

            // Tanpa parameter jam -> Tutup grup manual langsung
            if (isAnnounce) {
                return m.reply('Grup sudah dalam mode tertutup.');
            }
            await conn.groupSettingUpdate(m.chat, 'announcement');
            return m.reply('🔒 *Grup telah ditutup*\n\nHanya admin yang bisa mengirim pesan.');
        }

        // ── Sakelar Cepat On / Off ────────────────────────────────────
        if (/^(on|enable|aktif|1|true)$/i.test(action)) {
            chat.autoOpenClose = true;
            global.saveData?.('chats', m.chat);
            return m.reply(
                `╭── ✦ *JADWAL GRUP DIAKTIFKAN* ✦\n` +
                `• Status: ✅ *AKTIF*\n` +
                `• Jam Buka: *${chat.openTime || '06:00'} WIB*\n` +
                `• Jam Tutup: *${chat.closeTime || '21:00'} WIB*\n` +
                `• Mode: Berjalan otomatis setiap hari\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        if (/^(off|disable|nonaktif|0|false)$/i.test(action)) {
            chat.autoOpenClose = false;
            global.saveData?.('chats', m.chat);
            return m.reply(
                `╭── ✦ *JADWAL GRUP DINONAKTIFKAN* ✦\n` +
                `• Status: ❌ *NONAKTIF*\n` +
                `• Info: Jadwal buka/tutup grup otomatis telah dimatikan.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        return m.reply(
            `Perintah tidak valid.\n\n` +
            `Gunakan:\n` +
            `• \`${usedPrefix + command} open\` (buka grup sekarang)\n` +
            `• \`${usedPrefix + command} close\` (tutup grup sekarang)\n` +
            `• \`${usedPrefix + command} open 06.00\` (atur jam buka otomatis)\n` +
            `• \`${usedPrefix + command} close 15.00\` (atur jam tutup otomatis)\n` +
            `• \`${usedPrefix}on autogroup\` / \`${usedPrefix}off autogroup\` (setting on/off)`
        );

    } catch (error) {
        console.error('Group setting error:', error);
        await m.reply('Terjadi kesalahan saat mengubah pengaturan grup.');
    }
};

handler.help = [
    'gc *open|close*',
    'gc *open <jam>*',
    'gc *close <jam>*',
    'group *open|close*'
];
handler.tags = ['group'];
handler.command = /^(gc|group|grup)$/i;

handler.group = true;
handler.admin = true;
handler.botAdmin = true;

export default handler;
