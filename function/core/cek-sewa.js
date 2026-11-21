import chalk from 'chalk';
import moment from 'moment-timezone';

export const GRACE_MS = 3 * 24 * 60 * 60 * 1000;
export const MAX_DURATION_MS = 5 * 365 * 24 * 60 * 60 * 1000;

export const DURATIONS = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
    M: 30 * 24 * 60 * 60 * 1000,
    y: 365 * 24 * 60 * 60 * 1000
};

export function getNomorOwner() {
    return (global.info?.nomorowner || global.owner?.[0] || '').toString().replace(/\D/g, '');
}

export function formatDateTime(timestamp, formatStr = 'DD MMMM YYYY [pukul] HH:mm [WIB]') {
    if (!timestamp || timestamp <= 0) return '-';
    return moment(timestamp).tz('Asia/Jakarta').format(formatStr);
}

export function getGroupName(conn, jid, participatingMap = null) {
    if (!jid) return 'Grup';
    const cleanJid = jid.replace(/(@g\.us)+$/i, '@g.us');
    return (
        participatingMap?.[cleanJid]?.subject ||
        conn?.chats?.[cleanJid]?.metadata?.subject ||
        conn?.chats?.[cleanJid]?.subject ||
        conn?.chats?.[cleanJid]?.name ||
        cleanJid.split('@')[0]
    );
}

export function parseDuration(text) {
    if (!text) return null;
    const raw = text.trim();
    if (/^(perm|permanen|permanent|inf|infinity|p)$/i.test(raw)) {
        return { isPermanent: true };
    }

    const match = raw.match(/^(\d+)\s*([a-zA-Z]+)$/);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unitStr = match[2];
    if (isNaN(amount) || amount <= 0) return null;

    let unit = null;
    if (/^(bln|bulan|mo)$/i.test(unitStr) || unitStr === 'M') {
        unit = 'M';
    } else if (/^(mnt|min|menit)$/i.test(unitStr) || unitStr === 'm') {
        unit = 'm';
    } else if (/^(h|jam)$/i.test(unitStr)) {
        unit = 'h';
    } else if (/^(d|hari|hr)$/i.test(unitStr)) {
        unit = 'd';
    } else if (/^(w|mg|minggu)$/i.test(unitStr)) {
        unit = 'w';
    } else if (/^(y|thn|th|tahun)$/i.test(unitStr)) {
        unit = 'y';
    } else {
        return null;
    }

    return { ms: amount * DURATIONS[unit], amount, unit, isPermanent: false };
}

export function labelDuration(amount, unit) {
    const map = { m: 'Menit', h: 'Jam', d: 'Hari', w: 'Minggu', M: 'Bulan', y: 'Tahun' };
    return `${amount} ${map[unit] || unit}`;
}

export function remainingLabel(ms) {
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

export function applySewaExtension(chat, duration, now = Date.now()) {
    if (duration.isPermanent) {
        chat.sewa = true;
        chat.sewaPermanent = true;
        chat.sewaDate = -1;
        chat.sewaExpired = false;
        chat.sewaGraceUntil = -1;
        chat.sewaRemindedH3 = false;
        chat.sewaRemindedH1 = false;
        return { isPermanent: true, newExpiry: -1, isExtend: false };
    }

    const isExtend = chat.sewa && !chat.sewaPermanent && chat.sewaDate > now;
    const baseTime = isExtend ? chat.sewaDate : now;
    const newExpiry = baseTime + duration.ms;

    if (newExpiry - now > MAX_DURATION_MS) {
        return { error: 'max_exceeded' };
    }

    chat.sewa = true;
    chat.sewaPermanent = false;
    chat.sewaDate = newExpiry;
    chat.sewaExpired = false;
    chat.sewaGraceUntil = -1;
    chat.sewaRemindedH3 = false;
    chat.sewaRemindedH1 = false;

    return { isPermanent: false, newExpiry, isExtend };
}

export function transitionExpiredSewa(chat, now = Date.now()) {
    chat.sewa = false;
    chat.sewaExpired = true;
    chat.sewaGraceUntil = now + GRACE_MS;
}

export function resetSewaChat(chat) {
    chat.sewa = false;
    chat.sewaPermanent = false;
    chat.sewaExpired = false;
    chat.sewaGraceUntil = -1;
    chat.sewaDate = -1;
    chat.sewaRemindedH3 = false;
    chat.sewaRemindedH1 = false;
    delete chat.sewaPending;
}

let schedulerTime = null;
let isChecking = false;

export function startSewaScheduler(conn) {
    if (schedulerTime) clearInterval(schedulerTime);
    checkExpiredSewa(conn).catch(() => {});
    schedulerTime = setInterval(() => checkExpiredSewa(conn), 60 * 1000);
}

export function stopSewaScheduler() {
    if (schedulerTime) {
        clearInterval(schedulerTime);
        schedulerTime = null;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function checkExpiredSewa(conn) {
    if (isChecking) return;
    if (!global.db?.data?.chats) return;

    isChecking = true;
    try {
        const now = Date.now();
        const nomorOwner = getNomorOwner();
        const chats = global.db.data.chats;

        for (const [rawJid, chat] of Object.entries(chats)) {
            if (!rawJid.includes('@g.us') || !chat) continue;
            let jid = rawJid;
            if (rawJid.includes('@g.us@g.us')) {
                jid = rawJid.replace(/(@g\.us)+$/i, '@g.us');
                chats[jid] = { ...(chats[jid] || {}), ...chat };
                delete chats[rawJid];
                if (typeof global.saveData === 'function') {
                    global.saveData('chats', jid);
                    global.saveData('chats', rawJid);
                }
            }

            if (chat.sewa && !chat.sewaPermanent && chat.sewaDate > now) {
                const sisaMs = chat.sewaDate - now;

                if (sisaMs <= 3 * 24 * 60 * 60 * 1000 && sisaMs > 24 * 60 * 60 * 1000 && !chat.sewaRemindedH3) {
                    chat.sewaRemindedH3 = true;
                    if (typeof global.saveData === 'function') global.saveData('chats', jid);

                    const groupName = getGroupName(conn, jid);
                    const expStr = formatDateTime(chat.sewaDate);
                    const sisaLabel = remainingLabel(sisaMs);

                    const h3Msg =
                        `╭── ✦ *PENGINGAT SEWA BOT (H-3)* ✦\n` +
                        `Masa sewa ${global.info?.namabot || 'Joy Bot'} di grup *${groupName}* tersisa kurang dari 3 hari lagi.\n\n` +
                        `• *Berakhir*: ${expStr}\n` +
                        `• *Sisa Waktu*: ${sisaLabel}\n\n` +
                        `› Segera hubungi owner untuk memperpanjang sewa agar bot tetap aktif tanpa jeda.\n` +
                        `*Kontak Owner*: wa.me/${nomorOwner}\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                    try {
                        await conn.sendMessage(jid, { text: h3Msg });
                    } catch (_) {}
                    await sleep(1000);
                }

                if (sisaMs <= 24 * 60 * 60 * 1000 && !chat.sewaRemindedH1) {
                    chat.sewaRemindedH1 = true;
                    if (typeof global.saveData === 'function') global.saveData('chats', jid);

                    const groupName = getGroupName(conn, jid);
                    const expStr = formatDateTime(chat.sewaDate);
                    const sisaLabel = remainingLabel(sisaMs);

                    const h1Msg =
                        `╭── ✦ *PERINGATAN SEWA BOT (H-1)* ✦\n` +
                        `Masa sewa ${global.info?.namabot || 'Joy Bot'} di grup *${groupName}* akan berakhir dalam waktu kurang dari 24 jam!\n\n` +
                        `• *Berakhir*: ${expStr}\n` +
                        `• *Sisa Waktu*: ${sisaLabel}\n\n` +
                        `› Setelah masa sewa habis, bot akan memasuki masa non-aktif.\n` +
                        `*Kontak Owner*: wa.me/${nomorOwner}\n` +
                        `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                    try {
                        await conn.sendMessage(jid, { text: h1Msg });
                    } catch (_) {}
                    await sleep(1000);
                }
            }

            if (chat.sewa && !chat.sewaPermanent && chat.sewaDate > 0 && chat.sewaDate <= now) {
                transitionExpiredSewa(chat, now);
                if (typeof global.saveData === 'function') global.saveData('chats', jid);

                const groupName = getGroupName(conn, jid);
                const graceStr = formatDateTime(chat.sewaGraceUntil);

                const groupText =
                    `╭── ✦ *MASA SEWA BERAKHIR* ✦\n` +
                    `• *Grup*: ${groupName}\n` +
                    `• *Status*: Sewa telah habis\n` +
                    `• *Masa Tenggang*: 3 Hari (s.d ${graceStr})\n\n` +
                    `› Bot saat ini berada dalam mode non-aktif di grup ini.\n` +
                    `› Bot tidak akan merespons perintah sampai masa sewa diperpanjang.\n` +
                    `› *Peringatan*: Bot otomatis keluar dari grup setelah masa tenggang 3 hari berakhir.\n\n` +
                    `*Kontak Owner*: wa.me/${nomorOwner}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                try {
                    await conn.sendMessage(jid, { text: groupText });
                    console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.yellow(`Notifikasi sewa habis dikirim ke grup ${jid}`)}`);
                } catch (e) {
                    console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.red(`Gagal kirim notif grup ${jid}: ${e.message}`)}`);
                }
                await sleep(1000);
            }

            if (chat.sewaExpired && chat.sewaGraceUntil > 0 && chat.sewaGraceUntil <= now) {
                const farewellMsg =
                    `╭── ✦ *SEWA HABIS - BOT KELUAR* ✦\n` +
                    `Masa tenggang sewa 3 hari telah berakhir dan belum ada perpanjangan masa sewa.\n\n` +
                    `Bot akan meninggalkan grup ini sekarang. Terima kasih telah menggunakan ${global.info?.namabot || 'Joy Bot'}!\n\n` +
                    `*Kontak Owner*: wa.me/${nomorOwner}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                try {
                    await conn.sendMessage(jid, { text: farewellMsg });
                } catch (_) {}

                await sleep(2000);

                try {
                    await conn.groupLeave(jid);
                    console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.yellow(`Bot keluar dari grup ${jid} (Masa tenggang habis)`)}`);
                } catch (e) {
                    console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.red(`Gagal keluar grup ${jid}: ${e.message}`)}`);
                }

                resetSewaChat(chat);
                if (typeof global.saveData === 'function') global.saveData('chats', jid);
                await sleep(1000);
            }
        }
    } catch (err) {
        console.error('[SEWA SCHEDULER ERROR]:', err.message);
    } finally {
        isChecking = false;
    }
}
