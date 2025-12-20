import { jidNormalizedUser } from 'baileys';
import fs from 'fs'; // Menggunakan fs standar untuk readFileSync
import { join } from 'path';
import os from 'os';

// === BAGIAN LOAD FILE (OPTIMASI KECEPATAN) ===
// File dibaca sekali saat bot start, bukan setiap ada command.
const thumbnailPath = join(process.cwd(), 'src', 'thumbnail.jpg');
const packagePath = join(process.cwd(), 'package.json');

let thumbBuffer = null;
let _package = {};

try {
    // Baca Thumbnail
    if (fs.existsSync(thumbnailPath)) {
        thumbBuffer = fs.readFileSync(thumbnailPath);
    } else {
        console.error('Thumbnail tidak ditemukan di:', thumbnailPath);
    }

    // Baca Package.json
    if (fs.existsSync(packagePath)) {
        _package = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    }
} catch (e) {
    console.error('Gagal memuat file eksternal:', e);
}

// Kategori Menu Manual (Bisa ditambah jika ingin nama custom)
let tags = {
    'adminry': 'Admin Menu',
    'group': 'Groups Menu',
    'sticker': 'Sticker Menu',
    'info': 'Info Menu',
    'owner': 'Owner Menu',
};

// Template Tampilan Menu
const defaultMenu = {
    before: `Hallo %name! 👋
Saya adalah Bot Otomatis yang siap membantu Anda 24/7!
 
「  I N F O  B O T  」
 •  Mode : %mode
 •  Nama : %me
 •  Versi : %version
 •  Limits : %limit
 •  Uptime : %uptime
 
「  I N F O  S E R V E R  」
 •  Platform : %platform
 •  OS : %serverOS
 •  Arch : %serverArch
 •  CPU : %cpuModel
 •  RAM : %freeMem / %totalMem
%readmore
`.trimStart(),
    header: '╭─「 *%category* 」',
    body: '│ • %cmd',
    footer: '╰────\n',
    after: `Powered By Rafli`,
};

let handler = async (m, { conn, usedPrefix, command, __dirname, text }) => {
    try {
        let user = global.db.data.users[m.sender];
        if (!user) return;

        let name = `@${m.sender.split('@')[0]}`;
        let botname = global.info.namabot || conn.user?.name || 'Default Bot Name';
        let level = user.level || 0;
        let role = user.role || 'Beginner';
        let exp = user.exp || 0;
        let limit = (user.limit === Infinity) ? 'Unlimited' : (user.limit || 0);
        let prems = user.premiumTime > 0 ? '✅' : '❌';

        // Info Waktu
        const d = new Date(new Date().getTime() + 7 * 3600 * 1000);
        const locale = 'id-ID';
        const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
        const year = d.toLocaleDateString(locale, { year: 'numeric' });

        // Info System
        let uptime = clockString(process.uptime() * 1000);
        let platform = os.platform();
        let rtotalreg = Object.values(global.db.data.users).filter(u => u.registered).length;

        const cpus = os.cpus();
        const cpuModel = cpus ? cpus[0].model.trim() : 'N/A';
        const totalMem = formatBytes(os.totalmem());
        const freeMem = formatBytes(os.freemem());
        const serverArch = os.arch();
        const serverOS = os.release();

        const botLid = jidNormalizedUser(conn.user.lid);
        const settings = global.db.data.settings[botLid] || {};
        const chatMode = settings.chatMode || '';

        let mode;
        switch (chatMode) {
            case 'pconly':
                mode = 'PC Only'
                break;
            case 'gconly':
                mode = 'GC Only'
                break;
            default:
                mode = 'Publik'
        }

        // --- PEMBUATAN MENU & LOGIKA TAG OTOMATIS ---
        let help = Object.values(global.plugins)
            .filter(plugin => plugin.help && !plugin.disable)
            .map(plugin => ({
                help: Array.isArray(plugin.help) ? plugin.help : [plugin.help],
                tags: Array.isArray(plugin.tags) ? plugin.tags : [plugin.tags],
                prefix: 'customPrefix' in plugin,
                limit: plugin.limit,
                premium: plugin.premium,
            }));

        for (let plugin of help) {
            if (plugin && plugin.tags) {
                for (let tag of plugin.tags) {
                    if (!(tag in tags)) {
                        // LOGIKA BARU: Kapitalisasi otomatis + Kata 'Menu'
                        // cth: 'ai' -> 'Ai Menu'
                        let capitalize = tag.charAt(0).toUpperCase() + tag.slice(1);
                        tags[tag] = `${capitalize} Menu`;
                    }
                }
            }
        }

        const readMore = String.fromCharCode(8206).repeat(4001);
        let replace = {
            '%': '%', p: usedPrefix, name, level, role, limit, prems,
            totalexp: exp, date, year, uptime, platform, mode, rtotalreg,
            me: botname, version: _package.version || '1.0.0',
            cpuModel, totalMem, freeMem, serverArch, serverOS,
            readmore: readMore,
        };

        let menuType = text.toLowerCase().trim();
        let menuText = [];
        let { before, header, body, footer, after } = defaultMenu;

        if (!menuType) {
            let tagList = Object.keys(tags).sort().map(tag => `│ • \`${usedPrefix + command} ${tag}\``).join('\n');
            menuText = [
                before,
                `Berikut daftar menu yang tersedia:`,
                `╭─「 *DAFTAR MENU* 」`,
                `│ • \`${usedPrefix + command} all\``,
                tagList,
                `╰────\n`,
                `Ketik \`${usedPrefix + command} <nama_menu>\` untuk melihat fiturnya.`,
                `*Contoh:* \`${usedPrefix + command} sticker\``,
                `\n\n` + after
            ];
        } else if (menuType === 'all' || tags[menuType]) {
            let categories = menuType === 'all' ? Object.keys(tags).sort() : [menuType];
            menuText.push(before);

            for (let tag of categories) {
                if (!tags[tag]) continue;
                let filteredHelp = help.filter(menu => menu.tags && menu.tags.includes(tag) && menu.help);
                if (filteredHelp.length === 0) continue;

                menuText.push(header.replace(/%category/g, tags[tag]));
                menuText.push(
                    filteredHelp.map(menu => {
                        return menu.help.map(cmd => {
                            let premiumMark = menu.premium ? ' (P)' : '';
                            let limitMark = menu.limit ? ' (L)' : '';
                            return body.replace(/%cmd/g, `${menu.prefix ? '' : usedPrefix}${cmd}${premiumMark}${limitMark}`);
                        }).join('\n');
                    }).join('\n')
                );
                menuText.push(footer);
            }
            menuText.push(after);
        } else {
            menuText = [
                `Menu \`${text}\` tidak ditemukan.`,
                `Silakan ketik \`${usedPrefix + command}\` untuk melihat daftar menu yang tersedia.`
            ];
        }

        let textToSend = menuText.join('\n').replace(/%([a-zA-Z0-9]+)/g, (match, key) => replace[key] || match);

        // === KIRIM PESAN ===
        // Tidak perlu await readFile lagi karena thumbBuffer sudah diload di atas
        conn.sendMessage(m.chat, {
            text: textToSend,
            contextInfo: {
                mentionedJid: [m.sender],
                externalAdReply: {
                    title: global.info.namabot + ` © ` + year,
                    body: `Server Uptime: ${uptime}`,
                    thumbnail: thumbBuffer, // Langsung pakai buffer global
                    sourceUrl: global.lgc,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (e) {
        console.error(e);
        m.reply('Terjadi kesalahan saat menampilkan menu.');
    }
};

handler.command = /^(menu|help|perintah)$/i;

export default handler;

function clockString(ms) {
    let h = Math.floor(ms / 3600000);
    let m = Math.floor(ms / 60000) % 60;
    let s = Math.floor(ms / 1000) % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}