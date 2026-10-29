/*
- @Author: Rafli
- @Feature: Ads Manager
- @Description: Plugin manajemen iklan untuk owner. Mendukung per-ads interval, scope (all/group/private), cooldown, bypass premium, dan live test preview.
*/

import { loadAds, saveAds, resetAdsState, sendAdMessage } from '../function/events/ads.js';

const handler = async (m, { conn, text, isOwner, usedPrefix, command }) => {
    if (!isOwner) return m.reply('Fitur ini khusus untuk owner.');

    const config = loadAds();
    const args   = (text || '').trim().split(/\s+/);
    const sub    = (args[0] || '').toLowerCase();

    switch (sub) {

        case 'on':
        case 'off': {
            config.enabled = sub === 'on';
            saveAds(config);
            return m.reply(`Sistem Ads berhasil *${config.enabled ? 'Diaktifkan' : 'Dinonaktifkan'}*.`);
        }

        case 'add': {
            const jam = parseFloat(args[1]);
            if (isNaN(jam) || jam <= 0) {
                return m.reply(
                    `*CARA MENAMBAH ADS*\n\n` +
                    `Format:\n\`${usedPrefix + command} add <interval_jam> [target: all|group|private] <teks>\`\n\n` +
                    `Contoh:\n` +
                    `• \`${usedPrefix + command} add 6 Join channel kami untuk info terbaru!\`\n` +
                    `• \`${usedPrefix + command} add 12 group Jangan lupa patuhi rules grup!\``
                );
            }

            let target = 'all';
            let textStartIndex = 2;
            const maybeTarget = (args[2] || '').toLowerCase();
            if (['all', 'group', 'private', 'pc', 'gc'].includes(maybeTarget)) {
                target = (maybeTarget === 'gc' ? 'group' : (maybeTarget === 'pc' ? 'private' : maybeTarget));
                textStartIndex = 3;
            }

            const teks = args.slice(textStartIndex).join(' ').trim();
            if (!teks) return m.reply('Teks ads tidak boleh kosong.');

            const newAd = {
                id: `ad_${Date.now()}`,
                text: teks,
                intervalHours: jam,
                target
            };

            config.messages.push(newAd);
            saveAds(config);
            return m.reply(
                `*ADS BERHASIL DITAMBAHKAN*\n\n` +
                `• *Nomor:* ${config.messages.length}\n` +
                `• *ID:* \`${newAd.id}\`\n` +
                `• *Target:* *${target.toUpperCase()}*\n` +
                `• *Interval:* setiap *${jam} jam*\n` +
                `• *Konten:*\n_"${teks}"_`
            );
        }

        case 'del':
        case 'delete':
        case 'rm': {
            const query = (args[1] || '').trim();
            if (!query) return m.reply(`Format: \`${usedPrefix + command} del <nomor/ID>\``);

            let idx = parseInt(query) - 1;
            if (isNaN(idx) || idx < 0 || idx >= config.messages.length) {
                idx = config.messages.findIndex(a => a.id === query);
            }

            if (idx === -1 || idx >= config.messages.length) {
                return m.reply(`Ads tidak ditemukan. Tersedia: 1–${config.messages.length}`);
            }

            const removed = config.messages.splice(idx, 1)[0];
            saveAds(config);
            return m.reply(`*ADS BERHASIL DIHAPUS*\n\n• *ID:* \`${removed.id}\`\n• *Teks:* _"${removed.text}"_`);
        }

        case 'edit': {
            const query = (args[1] || '').trim();
            const jam = parseFloat(args[2]);

            let idx = parseInt(query) - 1;
            if (isNaN(idx) || idx < 0 || idx >= config.messages.length) {
                idx = config.messages.findIndex(a => a.id === query);
            }

            if (idx === -1 || idx >= config.messages.length) {
                return m.reply(`Ads tidak ditemukan. Format: \`${usedPrefix + command} edit <nomor/ID> <jam>\``);
            }
            if (isNaN(jam) || jam <= 0) return m.reply('Masukkan interval jam yang valid.');

            config.messages[idx].intervalHours = jam;
            saveAds(config);
            return m.reply(
                `Interval ads *#${idx + 1}* (\`${config.messages[idx].id}\`) diubah menjadi *${jam} jam*.`
            );
        }

        case 'edittext':
        case 'text': {
            const query = (args[1] || '').trim();
            let idx = parseInt(query) - 1;
            if (isNaN(idx) || idx < 0 || idx >= config.messages.length) {
                idx = config.messages.findIndex(a => a.id === query);
            }

            if (idx === -1 || idx >= config.messages.length) {
                return m.reply(`Ads tidak ditemukan. Format: \`${usedPrefix + command} edittext <nomor/ID> <teks baru>\``);
            }

            const newText = args.slice(2).join(' ').trim();
            if (!newText) return m.reply('Teks baru tidak boleh kosong.');

            config.messages[idx].text = newText;
            saveAds(config);
            return m.reply(
                `Konten teks ads *#${idx + 1}* berhasil diperbarui:\n\n_"${newText}"_`
            );
        }

        case 'target': {
            const query = (args[1] || '').trim();
            let target = (args[2] || '').toLowerCase();
            if (target === 'gc') target = 'group';
            if (target === 'pc') target = 'private';

            if (!['all', 'group', 'private'].includes(target)) {
                return m.reply(`Pilihan target yang valid: *all*, *group*, atau *private*.\nContoh: \`${usedPrefix + command} target 1 group\``);
            }

            let idx = parseInt(query) - 1;
            if (isNaN(idx) || idx < 0 || idx >= config.messages.length) {
                idx = config.messages.findIndex(a => a.id === query);
            }

            if (idx === -1 || idx >= config.messages.length) {
                return m.reply(`Ads tidak ditemukan.`);
            }

            config.messages[idx].target = target;
            saveAds(config);
            return m.reply(`Target ads *#${idx + 1}* diubah menjadi *${target.toUpperCase()}*.`);
        }

        case 'cooldown':
        case 'cd': {
            const mins = parseInt(args[1]);
            if (isNaN(mins) || mins < 0) {
                return m.reply(`Masukkan jeda anti-spam per chat dalam menit.\nContoh: \`${usedPrefix + command} cooldown 30\``);
            }
            config.minCooldownMinutes = mins;
            saveAds(config);
            return m.reply(`Jeda minimal antar-iklan per chat diubah menjadi *${mins} menit*.`);
        }

        case 'skipprem':
        case 'skip': {
            const opt = (args[1] || '').toLowerCase();
            if (opt === 'on' || opt === 'enable') {
                config.skipPremium = true;
            } else if (opt === 'off' || opt === 'disable') {
                config.skipPremium = false;
            } else {
                config.skipPremium = !config.skipPremium;
            }
            saveAds(config);
            return m.reply(`Bypass iklan untuk user Premium: *${config.skipPremium ? 'AKTIF (User premium tidak menerima ads)' : 'NONAKTIF (Semua user menerima ads)'}*.`);
        }

        case 'test':
        case 'preview': {
            const query = (args[1] || '1').trim();
            let idx = parseInt(query) - 1;
            if (isNaN(idx) || idx < 0 || idx >= config.messages.length) {
                idx = config.messages.findIndex(a => a.id === query);
            }

            if (idx === -1 || !config.messages[idx]) {
                return m.reply(`Ads tidak ditemukan. Tersedia: 1–${config.messages.length}`);
            }

            const targetAd = config.messages[idx];
            await m.reply(`_Mengirim preview Ads #${idx + 1} (${targetAd.id})..._`);
            return await sendAdMessage(conn, m.chat, targetAd, m);
        }

        case 'reset': {
            resetAdsState();
            return m.reply('Semua timer & status riwayat pengiriman iklan telah di-reset.');
        }

        default: {
            const list = config.messages.length
                ? config.messages.map((ads, i) => {
                    const tag = `[${(ads.target || 'ALL').toUpperCase()}]`;
                    const snippet = ads.text.length > 55 ? ads.text.slice(0, 55) + '...' : ads.text;
                    return `*${i + 1}.* ${tag} *(${ads.intervalHours}j)* \`${ads.id || 'N/A'}\`\n   _${snippet}_`;
                  }).join('\n\n')
                : '_Belum ada ads yang terdaftar._';

            return m.reply(
                `*📢 ADS MANAGER DASHBOARD*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `• *Status Sistem:* ${config.enabled ? '🟢 AKTIF' : '🔴 NONAKTIF'}\n` +
                `• *Jeda Anti-Spam:* ${config.minCooldownMinutes ?? 30} menit/chat\n` +
                `• *Bypass Premium:* ${config.skipPremium ? 'Ya ' : 'Tidak '}\n` +
                `• *Total Ads:* ${config.messages.length} pesan\n\n` +
                `*Daftar Iklan:*\n${list}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*PANDUAN PERINTAH:*\n` +
                `› \`${usedPrefix}ads on / off\` — Toggle status ads\n` +
                `› \`${usedPrefix}ads add <jam> [target] <teks>\` — Tambah iklan\n` +
                `› \`${usedPrefix}ads del <nomor/ID>\` — Hapus iklan\n` +
                `› \`${usedPrefix}ads edit <nomor/ID> <jam>\` — Ubah interval jam\n` +
                `› \`${usedPrefix}ads edittext <nomor/ID> <teks>\` — Ubah teks iklan\n` +
                `› \`${usedPrefix}ads target <nomor/ID> <all|group|private>\` — Ubah target\n` +
                `› \`${usedPrefix}ads cooldown <menit>\` — Ubah jeda per chat\n` +
                `› \`${usedPrefix}ads skipprem on/off\` — Toggle bypass premium\n` +
                `› \`${usedPrefix}ads test <nomor/ID>\` — Preview iklan sekarang\n` +
                `› \`${usedPrefix}ads reset\` — Reset semua timer cooldown`
            );
        }
    }
};

handler.help    = ['ads'];
handler.tags    = ['owner'];
handler.command = /^ads$/i;
handler.owner   = true;

export default handler;