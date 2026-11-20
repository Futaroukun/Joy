import {
    GRACE_MS,
    MAX_DURATION_MS,
    parseDuration,
    labelDuration,
    remainingLabel,
    getNomorOwner,
    formatDateTime,
    getGroupName,
    applySewaExtension,
    resetSewaChat
} from '../function/core/cek-sewa.js';

function extractInviteCode(text) {
    if (!text) return null;
    const match = text.match(/(?:https:\/\/)?(?:chat\.whatsapp\.com\/)?([0-9A-Za-z]{20,24})/i);
    return match ? match[1] : null;
}

let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    let cmd = command.toLowerCase();
    const isCallerOwner = isOwner || isROwner;
    const args = (text || '').trim().split(/\s+/).filter(Boolean);

    if (cmd === 'sewa') {
        const sub = (args[0] || '').toLowerCase();
        if (sub === 'add' || sub === 'tambah') {
            cmd = 'addsewa';
            args.shift();
        } else if (sub === 'del' || sub === 'rem' || sub === 'hapus') {
            cmd = 'delsewa';
            args.shift();
        } else if (sub === 'list') {
            cmd = 'listsewa';
            args.shift();
        } else if (sub === 'cek') {
            cmd = 'ceksewa';
            args.shift();
        } else {
            if (isCallerOwner) {
                return m.reply(
                    `╭── ✦ *MANAJEMEN SEWA BOT* ✦\n` +
                    `• \`${usedPrefix}addsewa <durasi>\` : Tambah sewa di grup ini\n` +
                    `• \`${usedPrefix}addsewa <link_grup|jid> <durasi>\` : Sewa & join grup\n` +
                    `• \`${usedPrefix}delsewa [jid] [keep]\` : Hapus sewa (default: bot keluar)\n` +
                    `• \`${usedPrefix}listsewa [halaman]\` : Daftar seluruh sewa aktif\n` +
                    `• \`${usedPrefix}ceksewa\` : Cek status sewa grup ini\n\n` +
                    `*PILIHAN SATUAN DURASI:*\n` +
                    `› \`mnt\` / \`m\`   : Menit (contoh: 30mnt, 10m)\n` +
                    `› \`jam\` / \`h\`   : Jam (contoh: 12jam, 2h)\n` +
                    `› \`hari\` / \`d\`  : Hari (contoh: 7hari, 30d)\n` +
                    `› \`mg\` / \`w\`    : Minggu (contoh: 2mg, 1w)\n` +
                    `› \`bln\` / \`M\`   : Bulan / 30 Hari (contoh: 1bln, 2M)\n` +
                    `› \`thn\` / \`y\`   : Tahun / 365 Hari (contoh: 1thn, 1y)\n` +
                    `› \`perm\`         : Paket Permanen (tanpa batas waktu)\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            } else if (m.isGroup) {
                cmd = 'ceksewa';
            } else {
                return m.reply(
                    `╭── ✦ *SEWA JOY BOT* ✦\n` +
                    `Ingin menyewa bot untuk grup WhatsApp kamu?\n` +
                    `Ketik \`${usedPrefix}sewabot\` untuk info harga dan fasilitas.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            }
        }
    }

    if (cmd === 'ceksewa' || cmd === 'sewacek') {
        let targetJid = m.chat;
        if (args[0] && args[0].endsWith('@g.us')) {
            if (!isCallerOwner) {
                return m.reply('*AKSES DITOLAK*\nMember biasa hanya dapat mengecek status sewa di grup ini sendiri.');
            }
            targetJid = args[0];
        }
        if (!targetJid.endsWith('@g.us')) {
            return m.reply('Perintah ini hanya dapat digunakan di dalam grup.');
        }

        const chatData = global.db?.data?.chats?.[targetJid] || {};
        const groupName = getGroupName(conn, targetJid);
        const now = Date.now();

        if (chatData.sewa && chatData.sewaPermanent) {
            return m.reply(
                `╭── ✦ *STATUS SEWA AKTIF* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Aktif (Permanen)\n` +
                `• *Masa Aktif*: Selamanya (Tanpa Batas Waktu)\n\n` +
                `› Bot beroperasi penuh untuk seluruh anggota grup.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } else if (chatData.sewa && chatData.sewaDate > now) {
            const sisa = remainingLabel(chatData.sewaDate - now);
            const expDate = formatDateTime(chatData.sewaDate);
            return m.reply(
                `╭── ✦ *STATUS SEWA AKTIF* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Aktif\n` +
                `• *Berakhir*: ${expDate}\n` +
                `• *Sisa Masa Aktif*: ${sisa}\n\n` +
                `› Bot beroperasi penuh untuk seluruh anggota grup.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } else if (chatData.sewaExpired) {
            const graceSisa = chatData.sewaGraceUntil > now ? remainingLabel(chatData.sewaGraceUntil - now) : 'Segera berakhir';
            const graceExpDate = formatDateTime(chatData.sewaGraceUntil);
            const nomorOwner = getNomorOwner();
            return m.reply(
                `╭── ✦ *STATUS SEWA: MASA TENGGANG* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Non-aktif (Expired)\n` +
                `• *Masa Tenggang s.d*: ${graceExpDate}\n` +
                `• *Sisa Waktu*: ${graceSisa}\n\n` +
                `› Bot tidak akan merespons hingga masa sewa diperpanjang.\n` +
                `› Bot otomatis keluar saat masa tenggang berakhir.\n` +
                `› Perpanjang sekarang: wa.me/${nomorOwner}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } else {
            return m.reply(
                `╭── ✦ *STATUS SEWA GRUP* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Bukan Grup Sewa / Tidak Aktif\n\n` +
                `› Tertarik menyewa bot? Ketik \`${usedPrefix}sewabot\` untuk info selengkapnya.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
    }

    if (!isCallerOwner) {
        if (typeof global.dFail === 'function') return global.dFail('owner', m, conn);
        return m.reply('*AKSES DITOLAK*\nFitur ini khusus untuk Owner bot.');
    }

    if (cmd === 'listsewa' || cmd === 'sewalist') {
        const chats = global.db?.data?.chats || {};
        const now = Date.now();
        const activeList = [];
        const graceList = [];

        const participating = await conn.groupFetchAllParticipating().catch(() => ({}));

        for (const [jid, data] of Object.entries(chats)) {
            if (!jid.endsWith('@g.us')) continue;
            if (data.sewa) {
                if (data.sewaPermanent || data.sewaDate > now) {
                    activeList.push({ jid, data });
                }
            } else if (data.sewaExpired) {
                graceList.push({ jid, data });
            }
        }

        const totalGrup = activeList.length + graceList.length;
        if (totalGrup === 0) {
            return m.reply('Belum ada grup yang terdaftar dalam sewa aktif maupun masa tenggang.');
        }

        const combined = [
            ...activeList.map(item => ({ ...item, type: 'active' })),
            ...graceList.map(item => ({ ...item, type: 'grace' }))
        ];

        const pageSize = 10;
        const totalPages = Math.ceil(combined.length / pageSize) || 1;
        const requestedPage = parseInt(args[0]) || 1;
        const page = Math.max(1, Math.min(requestedPage, totalPages));
        const startIndex = (page - 1) * pageSize;
        const items = combined.slice(startIndex, startIndex + pageSize);

        let out = `╭── ✦ *DAFTAR SEWA GRUP* ✦\n`;
        out += `• *Total Aktif*: ${activeList.length} grup\n`;
        out += `• *Total Masa Tenggang*: ${graceList.length} grup\n`;
        out += `• *Halaman*: ${page} dari ${totalPages}\n\n`;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const num = startIndex + i + 1;
            const gName = getGroupName(conn, item.jid, participating);

            if (item.type === 'active') {
                if (item.data.sewaPermanent) {
                    out += `${num}. *${gName}* [PERMANEN]\n`;
                    out += `   › ID: \`${item.jid}\`\n`;
                    out += `   › Masa Aktif: Selamanya\n\n`;
                } else {
                    const sisa = remainingLabel(item.data.sewaDate - now);
                    const expDate = formatDateTime(item.data.sewaDate, 'DD/MM/YYYY HH:mm');
                    out += `${num}. *${gName}*\n`;
                    out += `   › ID: \`${item.jid}\`\n`;
                    out += `   › Sisa: ${sisa} (s.d ${expDate})\n\n`;
                }
            } else {
                const sisaGrace = item.data.sewaGraceUntil > now ? remainingLabel(item.data.sewaGraceUntil - now) : 'Habis';
                out += `${num}. *${gName}* [NON-AKTIF]\n`;
                out += `   › ID: \`${item.jid}\`\n`;
                out += `   › Keluar dalam: ${sisaGrace}\n\n`;
            }
        }

        if (page < totalPages) {
            out += `› *Ketik* \`${usedPrefix + command} ${page + 1}\` untuk melihat halaman berikutnya.\n`;
        }
        out += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
        return m.reply(out);
    }

    if (cmd === 'delsewa' || cmd === 'remsewa' || cmd === 'hapussewa') {
        const isKeep = args.some(a => a.toLowerCase() === 'keep' || a.toLowerCase() === '--keep');
        const targetJid = args.find(a => a.endsWith('@g.us')) || (m.isGroup ? m.chat : null);

        if (!targetJid) {
            return m.reply(
                `*Format Salah!*\n\n` +
                `• Hapus sewa & bot keluar: \`${usedPrefix + command} <jid_grup>\`\n` +
                `• Hapus sewa tapi bot tetap di grup: \`${usedPrefix + command} <jid_grup> keep\`\n` +
                `• Jika dijalankan di dalam grup target: \`${usedPrefix + command} keep\``
            );
        }

        const chat = global.db?.data?.chats?.[targetJid];
        if (!chat || (!chat.sewa && !chat.sewaExpired)) {
            return m.reply('Grup tersebut tidak memiliki status sewa aktif ataupun masa tenggang.');
        }

        resetSewaChat(chat);
        if (typeof global.saveData === 'function') {
            global.saveData('chats', targetJid);
        }

        if (isKeep) {
            return m.reply(`*STATUS SEWA DICABUT (KEEP)*\nSewa untuk grup \`${targetJid}\` telah dinonaktifkan. Bot tetap berada di grup.`);
        } else {
            try {
                await conn.sendMessage(targetJid, {
                    text: `╭── ✦ *SEWA DICABUT* ✦\nStatus sewa bot di grup ini telah dicabut oleh owner. Bot berpamitan keluar dari grup. Terima kasih!\n╰━━━━━━━━━━━━━━━━━━━━━━━`
                });
            } catch (_) {}

            setTimeout(async () => {
                try {
                    await conn.groupLeave(targetJid);
                } catch (_) {}
            }, 1500);

            return m.reply(`*STATUS SEWA DICABUT*\nSewa untuk grup \`${targetJid}\` telah dinonaktifkan dan bot keluar dari grup.`);
        }
    }

    if (cmd === 'addsewa' || cmd === 'tambahsewa') {
        let targetJid = null;
        let durationStr = null;
        let joinedViaLink = false;

        const firstArg = args[0] || '';
        const secondArg = args[1] || '';
        const inviteCode = extractInviteCode(firstArg);

        if (inviteCode) {
            durationStr = secondArg;
        } else if (firstArg.endsWith('@g.us')) {
            targetJid = firstArg;
            durationStr = secondArg;
        } else if (m.isGroup) {
            targetJid = m.chat;
            durationStr = firstArg;
        } else {
            return m.reply(
                `*Format Perintah Salah!*\n\n` +
                `• Di dalam grup: \`${usedPrefix + command} 30d\` atau \`perm\`\n` +
                `• Dari chat lain: \`${usedPrefix + command} <link_grup> 30d\`\n` +
                `• Via JID grup: \`${usedPrefix + command} <id@g.us> 30d\``
            );
        }

        const duration = parseDuration(durationStr);
        if (!duration) {
            return m.reply(
                `*Durasi Tidak Valid!*\n\n` +
                `Pilihan format durasi yang didukung:\n` +
                `• \`mnt\` / \`m\`   : Menit (contoh: 30mnt, 10m)\n` +
                `• \`jam\` / \`h\`   : Jam (contoh: 12jam, 2h)\n` +
                `• \`hari\` / \`d\`  : Hari (contoh: 7hari, 30d)\n` +
                `• \`mg\` / \`w\`    : Minggu (contoh: 2mg, 1w)\n` +
                `• \`bln\` / \`M\`   : Bulan / 30 Hari (contoh: 1bln, 2M)\n` +
                `• \`thn\` / \`y\`   : Tahun / 365 Hari (contoh: 1thn, 1y)\n` +
                `• \`perm\`         : Paket Permanen`
            );
        }

        if (!duration.isPermanent && duration.ms > MAX_DURATION_MS) {
            return m.reply('*Durasi Terlalu Panjang!*\nMaksimal durasi sewa sekaligus adalah 5 tahun.');
        }

        if (inviteCode) {
            try {
                const joinRes = await conn.groupAcceptInvite(inviteCode);
                targetJid = joinRes || null;
                joinedViaLink = true;
            } catch (e) {
                try {
                    const info = await conn.groupGetInviteInfo(inviteCode);
                    if (info?.id) targetJid = `${info.id}@g.us`;
                } catch (_) {}
                if (!targetJid) {
                    return m.reply(`*Gagal Bergabung ke Grup!*\nLink invite tidak valid atau bot gagal bergabung: ${e.message}`);
                }
            }
        }

        if (!global.db.data.chats[targetJid]) {
            global.db.data.chats[targetJid] = {};
        }
        const chat = global.db.data.chats[targetJid];
        const now = Date.now();

        const extResult = applySewaExtension(chat, duration, now);
        if (extResult.error === 'max_exceeded') {
            return m.reply('*Batas Maksimum Tercapai!*\nTotal masa sewa grup tidak boleh melebihi 5 tahun dari sekarang.');
        }

        if (typeof global.saveData === 'function') {
            global.saveData('chats', targetJid);
        }

        const groupName = getGroupName(conn, targetJid);
        let replyMsg = '';
        let groupNotice = '';

        if (extResult.isPermanent) {
            replyMsg =
                `╭── ✦ *SEWA PERMANEN AKTIF* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Paket*: Permanen (Tanpa Batas Waktu)\n` +
                `• *Status*: Aktif Selamanya\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;

            groupNotice =
                `╭── ✦ *SEWA BOT PERMANEN AKTIF* ✦\n` +
                `Halo seluruh member grup *${groupName}*.\n\n` +
                `Masa sewa ${global.info?.namabot || 'Joy Bot'} telah diaktifkan secara *Permanen* di grup ini.\n` +
                `Gunakan \`${usedPrefix}menu\` untuk melihat seluruh fitur yang tersedia.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;
        } else {
            const expStr = formatDateTime(extResult.newExpiry);
            const addedLabel = labelDuration(duration.amount, duration.unit);
            const sisaLabel = remainingLabel(extResult.newExpiry - now);

            replyMsg =
                `╭── ✦ *SEWA BERHASIL DIAKTIFKAN* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Durasi Ditambah*: +${addedLabel}\n` +
                `• *Berlaku Sampai*: ${expStr}\n` +
                `• *Total Sisa Waktu*: ${sisaLabel}\n` +
                `• *Tipe*: ${extResult.isExtend ? 'Perpanjangan Masa Aktif' : 'Sewa Baru'}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;

            groupNotice =
                `╭── ✦ *SEWA BOT DIAKTIFKAN* ✦\n` +
                `Halo seluruh member grup *${groupName}*.\n\n` +
                `Masa sewa ${global.info?.namabot || 'Joy Bot'} telah aktif di grup ini.\n` +
                `• *Durasi*: ${addedLabel}\n` +
                `• *Berlaku s.d*: ${expStr}\n\n` +
                `Gunakan \`${usedPrefix}menu\` untuk melihat seluruh fitur yang tersedia.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;
        }

        await m.reply(replyMsg);

        if (targetJid !== m.chat || joinedViaLink) {
            try {
                await conn.sendMessage(targetJid, { text: groupNotice });
            } catch (_) {}
        }
    }
};

handler.help    = ['sewa', 'addsewa', 'delsewa', 'listsewa', 'ceksewa'];
handler.tags    = ['owner', 'group'];
handler.command = /^(sewa|addsewa|tambahsewa|delsewa|remsewa|hapussewa|listsewa|sewalist|ceksewa|sewacek)$/i;

export default handler;
