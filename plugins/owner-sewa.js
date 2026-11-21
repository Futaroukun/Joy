import { areJidsSameUser } from '@whiskeysockets/baileys';
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
        } else if (chatData.sewaPending) {
            const pending = chatData.sewaPending;
            const durLabel = pending.duration?.isPermanent
                ? 'Permanen (Tanpa Batas Waktu)'
                : labelDuration(pending.duration?.amount, pending.duration?.unit);
            return m.reply(
                `╭── ✦ *STATUS SEWA: MENUNGGU ACC* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *Status*: Menunggu Persetujuan Admin (Join Request)\n` +
                `• *Durasi Disiapkan*: +${durLabel}\n\n` +
                `› Bot telah mengirim permintaan gabung ke grup.\n` +
                `› Durasi sewa otomatis aktif dan mulai terhitung saat admin grup meng-acc bot.\n` +
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
        const pendingList = [];

        const participating = await conn.groupFetchAllParticipating().catch(() => ({}));

        for (const [jid, data] of Object.entries(chats)) {
            if (!jid.endsWith('@g.us')) continue;
            if (data.sewa) {
                if (data.sewaPermanent || data.sewaDate > now) {
                    activeList.push({ jid, data });
                }
            } else if (data.sewaPending) {
                pendingList.push({ jid, data });
            } else if (data.sewaExpired) {
                graceList.push({ jid, data });
            }
        }

        const totalGrup = activeList.length + graceList.length + pendingList.length;
        if (totalGrup === 0) {
            return m.reply('Belum ada grup yang terdaftar dalam sewa aktif, pending, maupun masa tenggang.');
        }

        const combined = [
            ...activeList.map(item => ({ ...item, type: 'active' })),
            ...pendingList.map(item => ({ ...item, type: 'pending' })),
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
        if (pendingList.length > 0) {
            out += `• *Menunggu ACC*: ${pendingList.length} grup\n`;
        }
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
            } else if (item.type === 'pending') {
                const pDur = item.data.sewaPending.duration;
                const durLabel = pDur?.isPermanent ? 'Permanen' : labelDuration(pDur?.amount, pDur?.unit);
                out += `${num}. *${gName}* [MENUNGGU ACC]\n`;
                out += `   › ID: \`${item.jid}\`\n`;
                out += `   › Durasi Disiapkan: +${durLabel}\n\n`;
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
        if (!chat || (!chat.sewa && !chat.sewaExpired && !chat.sewaPending)) {
            return m.reply('Grup tersebut tidak memiliki status sewa aktif, masa tenggang, maupun pending.');
        }

        delete chat.sewaPending;
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

        let isPendingApproval = false;
        let inviteInfo = null;

        if (inviteCode) {
            try {
                inviteInfo = await conn.groupGetInviteInfo(inviteCode);
            } catch (_) {}

            if (inviteInfo?.id) {
                targetJid = inviteInfo.id.includes('@') ? inviteInfo.id : `${inviteInfo.id}@g.us`;
            }

            let isBotInGroup = false;
            if (targetJid) {
                try {
                    const groupMeta = conn.chats?.[targetJid]?.metadata || await conn.groupMetadata(targetJid).catch(() => null);
                    if (groupMeta) {
                        if (Array.isArray(groupMeta.participants)) {
                            const botJid = (conn.user?.jid || conn.user?.id || '').decodeJid();
                            const botLid = (conn.user?.lid || '').decodeJid();
                            isBotInGroup = groupMeta.participants.some(p => {
                                const pJid = (p.id || '').decodeJid();
                                return (botJid && areJidsSameUser(pJid, botJid)) || (botLid && areJidsSameUser(pJid, botLid));
                            });
                        } else {
                            isBotInGroup = true;
                        }
                    }
                } catch (_) {}
            }

            if (!isBotInGroup) {
                try {
                    const joinRes = await conn.groupAcceptInvite(inviteCode);
                    if (joinRes) {
                        targetJid = joinRes.includes('@') ? joinRes : `${joinRes}@g.us`;
                        joinedViaLink = true;
                    } else {
                        isPendingApproval = true;
                    }
                } catch (e) {
                    const errMsg = (e?.message || '').toLowerCase();
                    const isAlreadyIn = errMsg.includes('409') || errMsg.includes('conflict') || errMsg.includes('already');
                    if (isAlreadyIn) {
                        isPendingApproval = false;
                    } else if (inviteInfo?.joinApprovalMode) {
                        isPendingApproval = true;
                    } else if (errMsg.includes('approval') || errMsg.includes('request') || errMsg.includes('admin')) {
                        isPendingApproval = true;
                    } else if (!targetJid) {
                        return m.reply(`*Gagal Bergabung ke Grup!*\nLink invite tidak valid atau bot gagal bergabung: ${e.message}`);
                    }
                }
            }
        }

        if (!targetJid || !targetJid.endsWith('@g.us')) {
            return m.reply('*Gagal Mendapatkan ID Grup!*\nPastikan link invite valid atau bot dapat mengakses informasi grup.');
        }

        if (!global.db.data.chats[targetJid]) {
            global.db.data.chats[targetJid] = {};
        }
        const chat = global.db.data.chats[targetJid];
        const groupName = inviteInfo?.subject || getGroupName(conn, targetJid);

        if (isPendingApproval) {
            chat.sewaPending = {
                duration,
                requestedAt: Date.now(),
                requestedBy: m.chat.endsWith('@s.whatsapp.net') ? m.chat : m.sender
            };

            if (typeof global.saveData === 'function') {
                global.saveData('chats', targetJid);
            }

            const addedLabel = duration.isPermanent
                ? 'Permanen (Tanpa Batas Waktu)'
                : labelDuration(duration.amount, duration.unit);

            const replyMsg =
                `╭── ✦ *MENUNGGU PERSETUJUAN ADMIN* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *ID*: \`${targetJid}\`\n` +
                `• *Status*: Permintaan Bergabung Terkirim\n` +
                `• *Durasi Disiapkan*: +${addedLabel}\n` +
                `• *Masa Aktif*: Dihitung otomatis saat di-acc\n\n` +
                `› Grup target mewajibkan persetujuan admin (join request).\n` +
                `› Sewa otomatis aktif dan durasi mulai terhitung begitu admin grup menyetujui bot bergabung.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;

            return m.reply(replyMsg);
        }

        delete chat.sewaPending;
        const now = Date.now();

        const extResult = applySewaExtension(chat, duration, now);
        if (extResult.error === 'max_exceeded') {
            return m.reply('*Batas Maksimum Tercapai!*\nTotal masa sewa grup tidak boleh melebihi 5 tahun dari sekarang.');
        }

        if (typeof global.saveData === 'function') {
            global.saveData('chats', targetJid);
        }
        let replyMsg = '';
        let groupNotice = '';

        if (extResult.isPermanent) {
            replyMsg =
                `╭── ✦ *SEWA PERMANEN AKTIF* ✦\n` +
                `• *Grup*: ${groupName}\n` +
                `• *ID*: \`${targetJid}\`\n` +
                `• *Paket*: Permanen (Tanpa Batas Waktu)\n` +
                `• *Status*: Aktif Selamanya\n`;

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

            if (extResult.isExtend) {
                replyMsg =
                    `╭── ✦ *DURASI SEWA DITAMBAHKAN* ✦\n` +
                    `• *Grup*: ${groupName}\n` +
                    `• *ID*: \`${targetJid}\`\n` +
                    `• *Durasi Ditambah*: +${addedLabel}\n` +
                    `• *Berlaku Sampai*: ${expStr}\n` +
                    `• *Total Sisa Waktu*: ${sisaLabel}\n` +
                    `• *Tipe*: Perpanjangan Masa Aktif\n`;

                groupNotice =
                    `╭── ✦ *DURASI SEWA DITAMBAHKAN* ✦\n` +
                    `Halo seluruh member grup *${groupName}*.\n\n` +
                    `Masa sewa ${global.info?.namabot || 'Joy Bot'} di grup ini telah berhasil diperpanjang / ditambah!\n` +
                    `• *Durasi Ditambah*: +${addedLabel}\n` +
                    `• *Berlaku Sampai*: ${expStr}\n` +
                    `• *Total Sisa Waktu*: ${sisaLabel}\n\n` +
                    `Gunakan \`${usedPrefix}menu\` untuk melihat seluruh fitur yang tersedia.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;
            } else {
                replyMsg =
                    `╭── ✦ *SEWA BERHASIL DIAKTIFKAN* ✦\n` +
                    `• *Grup*: ${groupName}\n` +
                    `• *ID*: \`${targetJid}\`\n` +
                    `• *Durasi*: ${addedLabel}\n` +
                    `• *Berlaku Sampai*: ${expStr}\n` +
                    `• *Total Sisa Waktu*: ${sisaLabel}\n` +
                    `• *Tipe*: Sewa Baru\n`;

                groupNotice =
                    `╭── ✦ *SEWA BOT DIAKTIFKAN* ✦\n` +
                    `Halo seluruh member grup *${groupName}*.\n\n` +
                    `Masa sewa ${global.info?.namabot || 'Joy Bot'} telah resmi aktif di grup ini.\n` +
                    `• *Durasi*: ${addedLabel}\n` +
                    `• *Berlaku Sampai*: ${expStr}\n` +
                    `• *Total Sisa Waktu*: ${sisaLabel}\n\n` +
                    `Gunakan \`${usedPrefix}menu\` untuk melihat seluruh fitur yang tersedia.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;
            }
        }

        let noticeSent = false;
        if (targetJid && targetJid.endsWith('@g.us')) {
            if (targetJid !== m.chat) {
                try {
                    await conn.sendMessage(targetJid, { text: groupNotice });
                    noticeSent = true;
                } catch (err) {
                    console.error(`[SEWA] Gagal kirim notif ke grup ${targetJid}:`, err?.message || err);
                }
            } else {
                noticeSent = true;
            }
        }

        if (targetJid !== m.chat) {
            replyMsg += `• *Notif Grup*: ${noticeSent ? 'Terkirim ke Grup ✅' : 'Gagal terkirim ke grup ❌'}\n`;
        }
        replyMsg += `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        await m.reply(replyMsg);
    }
};

handler.help    = ['sewa *add/del/list/cek*'];
handler.tags    = ['owner'];
handler.command = /^(sewa|addsewa|tambahsewa|delsewa|remsewa|hapussewa|listsewa|sewalist|ceksewa|sewacek)$/i;

export default handler;
