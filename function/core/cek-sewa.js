import chalk from 'chalk';
import moment from 'moment-timezone';
import { jidNormalizedUser } from '@whiskeysockets/baileys';

let schedulerTime = null;
let isChecking = false;

export function startSewaScheduler(conn) {
    if (schedulerTime) clearInterval(schedulerTime);
    schedulerTime = setInterval(() => checkExpiredSewa(conn), 60 * 1000);
}

export function stopSewaScheduler() {
    if (schedulerTime) {
        clearInterval(schedulerTime);
        schedulerTime = null;
    }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function checkExpiredSewa(conn) {
    if (isChecking) return;
    if (!global.sqlite?.open) return;

    isChecking = true;
    try {
        const now = Date.now();
        const nomorOwner = (global.info?.nomorowner || global.owner?.[0] || '').toString().replace(/\D/g, '');

        // 1. Cek masa sewa aktif yang habis -> Masuk masa tenggang (Grace Period 3 Hari)
        const expiredRows = global.sqlite.prepare(`
            SELECT jid, data FROM chats
            WHERE json_extract(data, '$.sewa') = 1
            AND json_extract(data, '$.sewaDate') > 0
            AND json_extract(data, '$.sewaDate') <= ?
        `).all(now);

        for (const row of expiredRows) {
            let chat;
            try {
                chat = JSON.parse(row.data);
            } catch {
                continue;
            }

            const graceUntil = now + (3 * 24 * 60 * 60 * 1000); // 3 hari
            chat.sewa = false;
            chat.sewaExpired = true;
            chat.sewaGraceUntil = graceUntil;

            global.sqlite.prepare(`
                INSERT OR REPLACE INTO chats (jid, data) VALUES (?, ?)
            `).run(row.jid, JSON.stringify(chat));

            if (global.db?.data?.chats?.[row.jid]) {
                global.db.data.chats[row.jid].sewa = false;
                global.db.data.chats[row.jid].sewaExpired = true;
                global.db.data.chats[row.jid].sewaGraceUntil = graceUntil;
            }

            // Ambil info metadata grup
            let groupMeta = null;
            try {
                groupMeta = await conn.groupMetadata(row.jid);
            } catch (_) {
                groupMeta = conn.chats?.[row.jid]?.metadata || null;
            }

            const groupName = groupMeta?.subject || 'Grup';
            const graceStr = moment(graceUntil).tz('Asia/Jakarta').format('DD MMMM YYYY [pukul] HH:mm [WIB]');

            // Kirim notifikasi ke grup
            try {
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

                await conn.sendMessage(row.jid, { text: groupText });
                console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.yellow(`Notifikasi sewa habis dikirim ke grup ${row.jid}`)}`);
            } catch (e) {
                console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.red(`Gagal kirim notif grup ${row.jid}: ${e.message}`)}`);
            }

            await sleep(2000);

            // Kirim notifikasi ke admin grup dengan delay aman
            if (groupMeta?.participants && Array.isArray(groupMeta.participants)) {
                const botLid = jidNormalizedUser(conn.user?.lid || '');
                const botJid = jidNormalizedUser(conn.user?.id || '');

                const admins = groupMeta.participants.filter(p => {
                    if (!p.admin) return false;
                    const pid = jidNormalizedUser(p.id || '');
                    const ppn = p.phoneNumber ? jidNormalizedUser(p.phoneNumber) : '';
                    return pid !== botLid && pid !== botJid && ppn !== botJid;
                });

                const adminText =
                    `╭── ✦ *PEMBERITAHUAN SEWA BOT* ✦\n` +
                    `Halo Admin grup *${groupName}*,\n\n` +
                    `Masa sewa ${global.info?.namabot || 'Joy Bot'} di grup Anda telah berakhir hari ini.\n\n` +
                    `• *Masa Tenggang*: 3 Hari (s.d ${graceStr})\n` +
                    `• *Status Bot*: Non-aktif (tidak merespons pesan grup)\n` +
                    `• *Peringatan*: Bot otomatis keluar jika tidak diperpanjang sebelum masa tenggang berakhir.\n\n` +
                    `Silakan hubungi owner untuk perpanjangan masa sewa:\n` +
                    `wa.me/${nomorOwner}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                for (const admin of admins) {
                    try {
                        const targetAdmin = admin.id.includes('@') ? admin.id : `${admin.id}@s.whatsapp.net`;
                        await conn.sendMessage(targetAdmin, { text: adminText });
                    } catch (_) {}
                    await sleep(2000);
                }
            }

            await sleep(1000);
        }

        // 2. Cek masa tenggang 3 hari yang habis -> Bot pamit dan keluar dari grup
        const graceExpiredRows = global.sqlite.prepare(`
            SELECT jid, data FROM chats
            WHERE json_extract(data, '$.sewaExpired') = 1
            AND json_extract(data, '$.sewaGraceUntil') > 0
            AND json_extract(data, '$.sewaGraceUntil') <= ?
        `).all(now);

        for (const row of graceExpiredRows) {
            let chat;
            try {
                chat = JSON.parse(row.data);
            } catch {
                continue;
            }

            // Pesan pamit ke grup
            try {
                const farewellMsg =
                    `╭── ✦ *SEWA HABIS - BOT KELUAR* ✦\n` +
                    `Masa tenggang sewa 3 hari telah berakhir dan belum ada perpanjangan masa sewa.\n\n` +
                    `Bot akan meninggalkan grup ini sekarang. Terima kasih telah menggunakan ${global.info?.namabot || 'Joy Bot'}!\n\n` +
                    `*Kontak Owner*: wa.me/${nomorOwner}\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                await conn.sendMessage(row.jid, { text: farewellMsg });
            } catch (_) {}

            await sleep(3000);

            // Bot keluar dari grup
            try {
                await conn.groupLeave(row.jid);
                console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.yellow(`Bot keluar dari grup ${row.jid} (Masa tenggang habis)`)}`);
            } catch (e) {
                console.log(`${chalk.white.bold(' [SEWA]')} ${chalk.red(`Gagal keluar dari grup ${row.jid}: ${e.message}`)}`);
            }

            // Reset seluruh status sewa chat
            chat.sewa = false;
            chat.sewaExpired = false;
            chat.sewaGraceUntil = -1;
            chat.sewaDate = -1;

            global.sqlite.prepare(`
                INSERT OR REPLACE INTO chats (jid, data) VALUES (?, ?)
            `).run(row.jid, JSON.stringify(chat));

            if (global.db?.data?.chats?.[row.jid]) {
                global.db.data.chats[row.jid].sewa = false;
                global.db.data.chats[row.jid].sewaExpired = false;
                global.db.data.chats[row.jid].sewaGraceUntil = -1;
                global.db.data.chats[row.jid].sewaDate = -1;
            }

            await sleep(1000);
        }
    } catch (err) {
        console.error('[SEWA SCHEDULER ERROR]:', err.message);
    } finally {
        isChecking = false;
    }
}
