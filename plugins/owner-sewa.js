import moment from 'moment-timezone';

const DURATIONS = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
};

function parseDuration(text) {
    if (!text) return null;
    const match = text.trim().match(/^(\d+)(m|h|d|w|M|y)$/);
    if (!match) return null;
    const amount = parseInt(match[1]);
    const unit   = match[2];
    if (!DURATIONS[unit] || amount <= 0) return null;
    return { ms: amount * DURATIONS[unit], amount, unit };
}

function labelDuration(amount, unit) {
    const map = { m: 'Menit', h: 'Jam', d: 'Hari', w: 'Minggu', M: 'Bulan', y: 'Tahun' };
    return `${amount} ${map[unit] || unit}`;
}

function remainingLabel(ms) {
    if (ms <= 0) return 'Habis';
    const d = Math.floor(ms / (24 * 60 * 60 * 1000));
    const h = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    const m = Math.floor((ms % (60 * 60 * 1000)) / 60000);
    const parts = [];
    if (d > 0) parts.push(`${d} Hari`);
    if (h > 0) parts.push(`${h} Jam`);
    if (m > 0) parts.push(`${m} Menit`);
    return parts.join(' ') || 'Kurang dari semenit';
}

function extractInviteCode(text) {
    if (!text) return null;
    const match = text.match(/(?:https:\/\/)?(?:chat\.whatsapp\.com\/)?([0-9A-Za-z]{20,24})/i);
    return match ? match[1] : null;
}

let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    let cmd = command.toLowerCase();
    const isCallerOwner = isOwner || isROwner;
    const args = (text || '').trim().split(/\s+/).filter(Boolean);

    // Routing command
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
                    `• \`${usedPrefix}delsewa [jid]\` : Hapus sewa grup\n` +
                    `• \`${usedPrefix}listsewa\` : Daftar seluruh sewa aktif\n` +
                    `• \`${usedPrefix}ceksewa\` : Cek status sewa grup ini\n\n` +
                    `› *Contoh durasi*: \`7d\` (7 hari), \`30d\` (30 hari), \`1M\` (1 bulan)\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            } else if (m.isGroup) {
                cmd = 'ceksewa';
            } else {
                return m.reply(
                    `╭── ✦ *SEWA JOY BOT* ✦\n` +
                    `Ingin menyewa bot untuk grup WhatsApp kamu?\n` +
                    `Ketik \`${usedPrefix}sewabot\` untuk info harga dan fasilitas!\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            }
        }
    }

    // ── CEK SEWA (Dapat diakses siapapun di grup atau oleh owner) ──
    if (cmd === 'ceksewa' || cmd === 'sewacek') {
        const targetJid = (args[0] && args[0].endsWith('@g.us')) ? args[0] : m.chat;
        if (!targetJid.endsWith('@g.us')) {
            return m.reply('Perintah ini hanya dapat digunakan di dalam grup.');
        }

        const chatData = global.db?.data?.chats?.[targetJid] || {};
        let groupMeta = null;
        try {
            groupMeta = await conn.groupMetadata(targetJid);
        } catch (_) {
            groupMeta = conn.chats?.[targetJid]?.metadata || null;
        }
        const groupName = groupMeta?.subject || 'Grup Ini';
        const now = Date.now();

        if (chatData.sewa && chatData.sewaDate > now) {
            const sisa = remainingLabel(chatData.sewaDate - now);
            const expDate = moment(chatData.sewaDate).tz('Asia/Jakarta').format('DD MMMM YYYY [pukul] HH:mm [WIB]');
            return m.reply(
                `╭── ✦ *STATUS SEWA AKTIF* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Aktif ✅\n` +
                `• *Berakhir*: ${expDate}\n` +
                `• *Sisa Masa Aktif*: ${sisa}\n\n` +
                `› Bot beroperasi penuh untuk seluruh anggota grup.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } else if (chatData.sewaExpired) {
            const graceSisa = chatData.sewaGraceUntil > now ? remainingLabel(chatData.sewaGraceUntil - now) : 'Segera berakhir';
            const graceExpDate = moment(chatData.sewaGraceUntil).tz('Asia/Jakarta').format('DD MMMM YYYY [pukul] HH:mm [WIB]');
            const nomorOwner = (global.info?.nomorowner || global.owner?.[0] || '').toString().replace(/\D/g, '');
            return m.reply(
                `╭── ✦ *STATUS SEWA: MASA TENGGANG* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Non-aktif (Expired) ⚠️\n` +
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

    // ── FITUR OWNER ONLY ──
    if (!isCallerOwner) {
        if (typeof global.dFail === 'function') return global.dFail('owner', m, conn);
        return m.reply('*AKSES DITOLAK*\nFitur ini khusus untuk Owner bot.');
    }

    // ── LIST SEWA ──
    if (cmd === 'listsewa' || cmd === 'sewalist') {
        const chats = global.db?.data?.chats || {};
        const now = Date.now();
        const activeList = [];
        const graceList = [];

        for (const [jid, data] of Object.entries(chats)) {
            if (!jid.endsWith('@g.us')) continue;
            if (data.sewa && data.sewaDate > now) {
                activeList.push({ jid, data });
            } else if (data.sewaExpired) {
                graceList.push({ jid, data });
            }
        }

        if (activeList.length === 0 && graceList.length === 0) {
            return m.reply('Belum ada grup yang terdaftar dalam sewa aktif maupun masa tenggang.');
        }

        let out = `╭── ✦ *DAFTAR SEWA GRUP* ✦\n`;
        out += `• *Total Aktif*: ${activeList.length} grup\n`;
        out += `• *Total Masa Tenggang*: ${graceList.length} grup\n\n`;

        if (activeList.length > 0) {
            out += `*GRUP AKTIF:*\n`;
            for (let i = 0; i < activeList.length; i++) {
                const item = activeList[i];
                let gName = 'Unknown';
                try {
                    gName = (await conn.groupMetadata(item.jid))?.subject || item.jid.split('@')[0];
                } catch (_) {
                    gName = item.jid.split('@')[0];
                }
                const sisa = remainingLabel(item.data.sewaDate - now);
                const expDate = moment(item.data.sewaDate).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm');
                out += `${i + 1}. *${gName}*\n`;
                out += `   › ID: \`${item.jid}\`\n`;
                out += `   › Sisa: ${sisa} (s.d ${expDate})\n\n`;
            }
        }

        if (graceList.length > 0) {
            out += `*MASA TENGGANG (3 HARI):*\n`;
            for (let j = 0; j < graceList.length; j++) {
                const item = graceList[j];
                let gName = 'Unknown';
                try {
                    gName = (await conn.groupMetadata(item.jid))?.subject || item.jid.split('@')[0];
                } catch (_) {
                    gName = item.jid.split('@')[0];
                }
                const sisaGrace = item.data.sewaGraceUntil > now ? remainingLabel(item.data.sewaGraceUntil - now) : 'Habis';
                out += `${j + 1}. *${gName}* [NON-AKTIF]\n`;
                out += `   › ID: \`${item.jid}\`\n`;
                out += `   › Keluar dalam: ${sisaGrace}\n\n`;
            }
        }

        out += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
        return m.reply(out);
    }

    // ── HAPUS SEWA ──
    if (cmd === 'delsewa' || cmd === 'remsewa' || cmd === 'hapussewa') {
        const targetJid = (args[0] && args[0].endsWith('@g.us')) ? args[0] : (m.isGroup ? m.chat : null);
        if (!targetJid) {
            return m.reply(`*Format Salah!*\nGunakan \`${usedPrefix + command} <jid_grup>\` atau jalankan langsung di dalam grup target.`);
        }

        const chat = global.db?.data?.chats?.[targetJid];
        if (!chat || (!chat.sewa && !chat.sewaExpired)) {
            return m.reply('Grup tersebut tidak memiliki status sewa aktif ataupun masa tenggang.');
        }

        chat.sewa = false;
        chat.sewaExpired = false;
        chat.sewaGraceUntil = -1;
        chat.sewaDate = -1;

        if (typeof global.saveData === 'function') {
            global.saveData('chats', targetJid);
        }

        return m.reply(`*STATUS SEWA DICABUT*\nSewa untuk grup \`${targetJid}\` telah dinonaktifkan.`);
    }

    // ── TAMBAH / PERPANJANG SEWA ──
    if (cmd === 'addsewa' || cmd === 'tambahsewa') {
        let targetJid = null;
        let durationStr = null;
        let joinedViaLink = false;

        const firstArg = args[0] || '';
        const secondArg = args[1] || '';

        // Kasus 1: Input berupa link invite grup
        const inviteCode = extractInviteCode(firstArg);
        if (inviteCode) {
            durationStr = secondArg;
            try {
                const joinRes = await conn.groupAcceptInvite(inviteCode);
                targetJid = joinRes || null;
                joinedViaLink = true;
            } catch (e) {
                // Jika sudah bergabung atau butuh info
                try {
                    const info = await conn.groupGetInviteInfo(inviteCode);
                    if (info?.id) targetJid = `${info.id}@g.us`;
                } catch (_) {}
                if (!targetJid) {
                    return m.reply(`*Gagal Bergabung ke Grup!*\nLink invite tidak valid atau bot gagal bergabung: ${e.message}`);
                }
            }
        } else if (firstArg.endsWith('@g.us')) {
            // Kasus 2: Input berupa JID grup
            targetJid = firstArg;
            durationStr = secondArg;
        } else {
            // Kasus 3: Input di dalam grup saat ini
            if (m.isGroup) {
                targetJid = m.chat;
                durationStr = firstArg;
            } else {
                return m.reply(
                    `*Format Perintah Salah!*\n\n` +
                    `• Di dalam grup: \`${usedPrefix + command} 30d\`\n` +
                    `• Dari chat lain: \`${usedPrefix + command} <link_grup> 30d\`\n` +
                    `• Via JID grup: \`${usedPrefix + command} <id@g.us> 30d\``
                );
            }
        }

        const duration = parseDuration(durationStr);
        if (!duration) {
            return m.reply(
                `*Durasi Tidak Valid!*\n\n` +
                `Format durasi yang didukung:\n` +
                `• \`30m\` : 30 Menit\n` +
                `• \`12h\` : 12 Jam\n` +
                `• \`1d\` / \`7d\` / \`30d\` : Hari\n` +
                `• \`1w\` : 1 Minggu\n` +
                `• \`1M\` : 1 Bulan (30 Hari)\n` +
                `• \`1y\` : 1 Tahun (365 Hari)`
            );
        }

        if (!global.db.data.chats[targetJid]) {
            global.db.data.chats[targetJid] = {};
        }
        const chat = global.db.data.chats[targetJid];
        const now = Date.now();

        // Support perpanjangan akumulatif jika sewa masih aktif
        const isExtend = chat.sewa && chat.sewaDate > now;
        const baseTime = isExtend ? chat.sewaDate : now;
        const newExpiry = baseTime + duration.ms;

        chat.sewa = true;
        chat.sewaDate = newExpiry;
        chat.sewaExpired = false;
        chat.sewaGraceUntil = -1;

        if (typeof global.saveData === 'function') {
            global.saveData('chats', targetJid);
        }

        let groupMeta = null;
        try {
            groupMeta = await conn.groupMetadata(targetJid);
        } catch (_) {
            groupMeta = conn.chats?.[targetJid]?.metadata || null;
        }
        const groupName = groupMeta?.subject || 'Grup';
        const expStr = moment(newExpiry).tz('Asia/Jakarta').format('DD MMMM YYYY [pukul] HH:mm [WIB]');
        const addedLabel = labelDuration(duration.amount, duration.unit);
        const sisaLabel = remainingLabel(newExpiry - now);

        const replyMsg =
            `╭── ✦ *SEWA BERHASIL DIAKTIFKAN* ✦\n` +
            `• *Grup*: ${groupName}\n` +
            `• *Durasi Ditambah*: +${addedLabel}\n` +
            `• *Berlaku Sampai*: ${expStr}\n` +
            `• *Total Sisa Waktu*: ${sisaLabel}\n` +
            `• *Tipe*: ${isExtend ? 'Perpanjangan Masa Aktif' : 'Sewa Baru'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        await m.reply(replyMsg);

        // Jika perintah dijalankan dari luar grup target, kirim pemberitahuan ke grup tersebut
        if (targetJid !== m.chat || joinedViaLink) {
            try {
                const groupNotice =
                    `╭── ✦ *SEWA BOT DIAKTIFKAN* ✦\n` +
                    `Halo seluruh member grup *${groupName}*!\n\n` +
                    `Masa sewa ${global.info?.namabot || 'Joy Bot'} telah aktif di grup ini.\n` +
                    `• *Durasi*: ${addedLabel}\n` +
                    `• *Berlaku s.d*: ${expStr}\n\n` +
                    `Gunakan \`${usedPrefix}menu\` untuk melihat seluruh fitur yang tersedia.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;
                await conn.sendMessage(targetJid, { text: groupNotice });
            } catch (_) {}
        }
    }
};

handler.help    = ['sewa', 'addsewa', 'delsewa', 'listsewa', 'ceksewa'];
handler.tags    = ['owner', 'group'];
handler.command = /^(sewa|addsewa|tambahsewa|delsewa|remsewa|hapussewa|listsewa|sewalist|ceksewa|sewacek)$/i;

export default handler;
