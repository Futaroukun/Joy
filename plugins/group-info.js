/*
- @Author: Rafli
- @Feature: Group Info & Metadata Inspector
- @Description: Fitur untuk melihat informasi lengkap, konfigurasi, status saklar bot, dan metadata grup.
- @Version: 2.0 (High Efficiency & Zero-Fluff)
*/

import moment from 'moment-timezone';
import { areJidsSameUser } from '@whiskeysockets/baileys';
import sharp from 'sharp';

let handler = async (m, { conn }) => {
    await m.react?.('⏳').catch(() => {});

    try {
        const [metaResult, ppResult] = await Promise.allSettled([
            conn.groupMetadata(m.chat),
            conn.profilePictureUrl(m.chat, 'image').catch(() => null)
        ]);

        if (metaResult.status === 'rejected' || !metaResult.value) {
            throw new Error('Gagal mengambil metadata grup.');
        }

        const groupMeta = metaResult.value;
        const groupPP = ppResult.status === 'fulfilled' && ppResult.value ? ppResult.value : (global.thum || null);

        const formatTime = (unixTimestamp) => {
            if (!unixTimestamp) return '-';
            return moment(unixTimestamp * 1000)
                .tz('Asia/Jakarta')
                .format('DD/MM/YYYY HH:mm:ss [WIB]');
        };

        const getGroupAge = (creationTime) => {
            if (!creationTime) return '-';
            const created = moment(creationTime * 1000);
            const diff = moment.duration(moment().diff(created));

            const years = diff.years();
            const months = diff.months();
            const days = diff.days();

            const parts = [];
            if (years > 0) parts.push(`${years} Tahun`);
            if (months > 0) parts.push(`${months} Bulan`);
            if (days > 0) parts.push(`${days} Hari`);

            return parts.length > 0 ? parts.join(' ') : 'Kurang dari 1 hari';
        };

        const getJid = (pn, id) => {
            let res = '';
            if (pn && typeof pn === 'string') res = pn;
            else if (id && typeof id === 'string') res = id;
            if (res && !res.includes('@')) res += '@s.whatsapp.net';
            return res;
        };

        const ownerJid = getJid(groupMeta.ownerPn, groupMeta.owner);
        const nameSetterJid = getJid(groupMeta.subjectOwnerPn, groupMeta.subjectOwner);
        const descSetterJid = getJid(groupMeta.descOwnerPn, groupMeta.descOwner);

        const participants = groupMeta.participants || [];
        const superAdmin = participants.find(p => p.admin === 'superadmin');
        const admins = participants.filter(p => p.admin === 'admin');
        const totalAdmins = admins.length + (superAdmin ? 1 : 0);
        const regularMembers = participants.length - totalAdmins;

        const myJid = (conn.user?.jid || conn.user?.id || '').decodeJid();
        const isBotAdmin = participants.some(p => areJidsSameUser(p.id, myJid) && p.admin);

        const resolvedUsers = {};

        const resolveJidPair = async (jid) => {
            if (!jid) return { pn: null, lid: null };
            const cleanJid = conn.decodeJid(jid);

            let pn = null;
            let lid = null;

            if (cleanJid.endsWith('@lid')) {
                lid = cleanJid;
                if (conn.storeLid) {
                    pn = conn.storeLid[lid] || Object.keys(conn.storeLid).find(k => conn.storeLid[k] === lid);
                }
                if (!pn) {
                    try {
                        const res = await conn.getLidPN(lid);
                        if (res && res.endsWith('@s.whatsapp.net')) pn = res;
                    } catch (e) {}
                }
                if (!pn) pn = lid;
            } else {
                pn = cleanJid;
                lid = conn.getLid(pn);
                if (!lid || lid === pn) {
                    try {
                        const res = await conn.getLidPN(pn);
                        if (res && res.endsWith('@lid')) lid = res;
                    } catch (e) {}
                }
                if (!lid) lid = pn;
            }

            return { pn, lid };
        };

        const resolveUser = async (jid) => {
            if (!jid) return { name: '-', phone: '', tag: '-' };
            const cleanJid = conn.decodeJid(jid);
            if (resolvedUsers[cleanJid]) return resolvedUsers[cleanJid];

            const { pn, lid } = await resolveJidPair(cleanJid);
            const phone = pn ? pn.split('@')[0].split(':')[0] : cleanJid.split('@')[0].split(':')[0];

            let name = null;
            if (lid) name = global.db?.data?.users?.[lid]?.name;
            if (!name && pn) name = global.db?.data?.users?.[pn]?.name;

            if (!name || /(?:@s\.whatsapp\.net|@lid)$/.test(name)) {
                if (lid) name = conn.getName(lid);
            }
            if (!name || /(?:@s\.whatsapp\.net|@lid)$/.test(name)) {
                if (pn) name = conn.getName(pn);
            }

            if (!name || /(?:@s\.whatsapp\.net|@lid)$/.test(name)) {
                name = phone;
            }

            const isOnlyNumber = /^\+?[0-9\s-]+$/.test(name) || name === phone;
            const tag = isOnlyNumber ? `@${phone}` : `${name} (@${phone})`;

            const res = { name, phone, pn, lid, tag };
            resolvedUsers[cleanJid] = res;
            if (pn) resolvedUsers[pn] = res;
            if (lid) resolvedUsers[lid] = res;

            return res;
        };

        const jidsToResolve = [...new Set([
            ownerJid,
            nameSetterJid,
            descSetterJid,
            superAdmin?.id,
            ...admins.map(a => a.id),
            ...admins.map(a => getJid(a.phoneNumber, a.id))
        ].filter(Boolean))];

        await Promise.all(jidsToResolve.map(jid => resolveUser(jid)));

        const formatUser = (jid) => {
            if (!jid) return '-';
            const cleanJid = conn.decodeJid(jid);
            const info = resolvedUsers[cleanJid];
            if (info) return info.tag;
            const number = cleanJid.split('@')[0].split(':')[0];
            const name = conn.getName(cleanJid);
            const isOnlyNumber = /^\+?[0-9\s-]+$/.test(name) || name === number;
            return isOnlyNumber ? `@${number}` : `${name} (@${number})`;
        };

        // WhatsApp Settings
        const isRestrict = groupMeta.restrict ? 'Hanya Admin' : 'Semua Peserta';
        const isAnnounce = groupMeta.announce ? 'Ditutup (Hanya Admin)' : 'Terbuka (Semua Peserta)';
        const isApproval = groupMeta.joinApprovalMode ? 'Butuh Persetujuan' : 'Langsung Masuk';
        const memberAddMode = groupMeta.memberAddMode ? 'Hanya Admin' : 'Semua Peserta';
        const isCommunity = groupMeta.isCommunity ? 'Ya (Komunitas)' : 'Bukan';

        const ephemeralMap = {
            0: 'Nonaktif',
            86400: '24 Jam',
            604800: '7 Hari',
            7776000: '90 Hari'
        };

        const ephe = ephemeralMap[groupMeta.ephemeralDuration] ||
            (groupMeta.ephemeralDuration > 0
                ? `${Math.floor(groupMeta.ephemeralDuration / 86400)} Hari`
                : 'Nonaktif');

        // Bot Settings from Database
        const chatData = global.db?.data?.chats?.[m.chat] || {};
        const botSwitches = [
            `• Welcome: ${chatData.sambutan ? 'ON' : 'OFF'}`,
            `• AntiLink: ${chatData.antilink ? 'ON' : 'OFF'}`,
            `• AntiDelete: ${chatData.antidelete ? 'ON' : 'OFF'}`,
            `• AntiVirtex: ${chatData.antivirtex ? 'ON' : 'OFF'}`,
            `• Detect: ${chatData.detect ? 'ON' : 'OFF'}`,
            `• Mute Bot: ${chatData.mute ? 'ON' : 'OFF'}`,
            `• AutoGempa: ${chatData.autogempa ? 'ON' : 'OFF'}`,
            `• Store: ${chatData.jualan ? 'ON' : 'OFF'}`
        ].join('\n│ ');

        // Susun Pesan
        let txt = `*GROUP INFORMATION*\n`;
        txt += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *INFO UTAMA* ✦\n`;
        txt += `│ • Nama: ${groupMeta.subject}\n`;
        txt += `│ • ID Grup: ${groupMeta.id}\n`;
        txt += `│ • Total Member: ${participants.length} (${totalAdmins} Admin, ${regularMembers} Anggota)\n`;
        txt += `│ • Status Bot: ${isBotAdmin ? 'Admin Grup' : 'Member Biasa'}\n`;
        txt += `│ • Dibuat: ${formatTime(groupMeta.creation)}\n`;
        txt += `│ • Umur Grup: ${getGroupAge(groupMeta.creation)}\n`;
        txt += `│ • Pemilik: ${formatUser(ownerJid)}\n`;
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *PENGATURAN GRUP* ✦\n`;
        txt += `│ • Edit Info Grup: ${isRestrict}\n`;
        txt += `│ • Kirim Pesan: ${isAnnounce}\n`;
        txt += `│ • Persetujuan Masuk: ${isApproval}\n`;
        txt += `│ • Tambah Anggota: ${memberAddMode}\n`;
        txt += `│ • Pesan Sementara: ${ephe}\n`;
        txt += `│ • Komunitas: ${isCommunity}\n`;
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *SAKLAR FITUR BOT* ✦\n`;
        txt += `│ ${botSwitches}\n`;
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *RIWAYAT PERUBAHAN* ✦\n`;
        txt += `│ • Terakhir Ganti Nama:\n`;
        txt += `│   └ Oleh: ${formatUser(nameSetterJid)}\n`;
        txt += `│   └ Waktu: ${formatTime(groupMeta.subjectTime)}\n`;
        txt += `│ • Terakhir Ganti Deskripsi:\n`;
        txt += `│   └ Oleh: ${descSetterJid ? formatUser(descSetterJid) : '-'}\n`;
        txt += `│   └ Waktu: ${formatTime(groupMeta.descTime)}\n`;
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *STRUKTUR ADMIN (${totalAdmins})* ✦\n`;
        if (superAdmin) {
            txt += `│ • Super Admin: ${formatUser(superAdmin.id)}\n`;
        }
        const maxAdminsShow = 15;
        const displayAdmins = admins.slice(0, maxAdminsShow);
        displayAdmins.forEach(a => {
            txt += `│ • Admin: ${formatUser(a.id)}\n`;
        });
        if (admins.length > maxAdminsShow) {
            txt += `│ • ...dan ${admins.length - maxAdminsShow} admin lainnya\n`;
        }
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        txt += `╭── ✦ *DESKRIPSI GRUP* ✦\n`;
        txt += `│ ${groupMeta.desc ? groupMeta.desc.replace(/\n/g, '\n│ ') : 'Tidak ada deskripsi.'}\n`;
        txt += `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        const mentions = [
            ownerJid,
            nameSetterJid,
            descSetterJid,
            superAdmin && getJid(superAdmin.phoneNumber, superAdmin.id),
            ...admins.map(a => getJid(a.phoneNumber, a.id))
        ].filter(Boolean).map(jid => {
            const cleanJid = conn.decodeJid(jid);
            const info = resolvedUsers[cleanJid];
            return info?.pn || cleanJid;
        });

        const adReplyConfig = {
            title: groupMeta.subject,
            body: `Member: ${participants.length} | Dibuat: ${formatTime(groupMeta.creation)}`,
            sourceUrl: null,
            mediaType: 1,
            renderLargerThumbnail: true
        };

        if (groupPP) {
            try {
                let rawBuffer = null;
                if (Buffer.isBuffer(groupPP)) {
                    rawBuffer = groupPP;
                } else if (typeof groupPP === 'string' && /^https?:\/\//i.test(groupPP)) {
                    const res = await conn.getFile(groupPP).catch(() => null);
                    if (res?.data) rawBuffer = res.data;
                }

                if (rawBuffer) {
                    adReplyConfig.thumbnail = await sharp(rawBuffer)
                        .rotate()
                        .resize(800, 450, { fit: 'cover', position: 'center' })
                        .jpeg({ quality: 80 })
                        .toBuffer();
                } else if (typeof groupPP === 'string') {
                    adReplyConfig.thumbnailUrl = groupPP;
                }
            } catch (err) {
                if (typeof groupPP === 'string' && /^https?:\/\//i.test(groupPP)) {
                    adReplyConfig.thumbnailUrl = groupPP;
                } else if (Buffer.isBuffer(groupPP)) {
                    adReplyConfig.thumbnail = groupPP;
                }
            }
        }

        await conn.sendMessage(m.chat, {
            text: txt,
            contextInfo: {
                mentionedJid: [...new Set(mentions)],
                externalAdReply: adReplyConfig
            }
        }, { quoted: m });

        await m.react?.('✅').catch(() => {});
    } catch (e) {
        console.error('[infogc Error]:', e);
        await m.react?.('❌').catch(() => {});
        m.reply('Gagal mengambil informasi metadata grup. Pastikan bot berada di dalam grup.');
    }
};

handler.help    = ['infogc']
handler.tags    = ['group']
handler.command = /^(infogc|gcinfo)$/i
handler.group   = true

export default handler
