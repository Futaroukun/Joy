import { jidNormalizedUser } from '@whiskeysockets/baileys';
import fs from 'fs';
import { join } from 'path';
import os from 'os';
import fetch from 'node-fetch';

const packagePath = join(process.cwd(), 'package.json');
let _package = {};

try {
    if (fs.existsSync(packagePath)) {
        _package = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    }
} catch (e) {
    console.error(e);
}

let tags = {
    'adminry': 'Admin Menu',
    'group': 'Groups Menu',
    'sticker': 'Sticker Menu',
    'info': 'Info Menu',
    'owner': 'Owner Menu',
    'internet': 'Internet Menu',
};

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
        let botname = global.info?.namabot || conn.user?.name || 'WhatsApp Bot';
        let limit = (user.limit === Infinity) ? 'Unlimited' : (user.limit || 0);

        const d = new Date(new Date().getTime() + 7 * 3600 * 1000);
        const locale = 'id-ID';
        const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
        const year = d.toLocaleDateString(locale, { year: 'numeric' });

        let uptime = clockString(process.uptime() * 1000);
        let platform = os.platform();

        const cpus = os.cpus();
        const cpuModel = cpus && cpus.length > 0 ? cpus[0].model.trim() : 'N/A';
        const totalMem = formatBytes(os.totalmem());
        const freeMem = formatBytes(os.freemem());
        const serverArch = os.arch();
        const serverOS = os.release();

        const botLid = jidNormalizedUser(conn.user.lid);
        const settings = global.db.data.settings[botLid] || {};
        const chatMode = settings.chatMode || '';

        let mode;
        switch (chatMode) {
            case 'pconly': mode = 'Private Only'; break;
            case 'gconly': mode = 'Group Only'; break;
            default: mode = 'Publik';
        }

        let help = Object.values(global.plugins)
            .filter(plugin => plugin && plugin.help && !plugin.disable)
            .map(plugin => ({
                help: Array.isArray(plugin.help) ? plugin.help : [plugin.help],
                tags: Array.isArray(plugin.tags) ? plugin.tags : [plugin.tags],
                prefix: 'customPrefix' in plugin,
                limit: plugin.limit,
                premium: plugin.premium,
            }));

        let activeTags = new Set();

        for (let plugin of help) {
            if (plugin && plugin.tags) {
                for (let tag of plugin.tags) {
                    if (tag) {
                        activeTags.add(tag);
                        
                        if (!(tag in tags)) {
                            let capitalize = tag.charAt(0).toUpperCase() + tag.slice(1);
                            tags[tag] = `${capitalize} Menu`;
                        }
                    }
                }
            }
        }

        const readMore = String.fromCharCode(8206).repeat(4001);
        let replace = {
            '%': '%', p: usedPrefix, name, limit,
            date, year, uptime, platform, mode,
            me: botname, version: _package.version || '1.0.0',
            cpuModel, totalMem, freeMem, serverArch, serverOS,
            readmore: readMore,
        };

        let menuType = text ? text.toLowerCase().trim() : '';
        let menuText = [];
        let { before, header, body, footer, after } = defaultMenu;

        if (!menuType) {
            let tagList = Object.keys(tags)
                .filter(tag => activeTags.has(tag))
                .sort()
                .map(tag => `│ • \`${usedPrefix + command} ${tag}\``)
                .join('\n');

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
        } else if (menuType === 'all' || (tags[menuType] && activeTags.has(menuType))) {
            let categories = menuType === 'all' 
                ? Object.keys(tags).filter(tag => activeTags.has(tag)).sort()
                : [menuType];

            menuText.push(before);

            for (let tag of categories) {
                if (!tags[tag]) continue;
                
                let filteredHelp = help.filter(menu => 
                    menu.tags && menu.tags.includes(tag) && menu.help
                );
                
                if (filteredHelp.length === 0) continue;

                menuText.push(header.replace(/%category/g, tags[tag]));
                menuText.push(
                    filteredHelp.map(menu => {
                        return menu.help.map(cmd => {
                            let premiumMark = menu.premium ? ' (P)' : '';
                            let limitMark = menu.limit ? ' (L)' : '';
                            return body.replace(
                                /%cmd/g, 
                                `${menu.prefix ? '' : usedPrefix}${cmd}${premiumMark}${limitMark}`
                            );
                        }).join('\n');
                    }).join('\n')
                );
                menuText.push(footer);
            }
            menuText.push(after);
        } else {
            menuText = [
                `Menu \`${text}\` tidak ditemukan atau tidak memiliki fitur aktif.`,
                `Silakan ketik \`${usedPrefix + command}\` untuk melihat daftar menu yang tersedia.`
            ];
        }

        let textToSend = menuText.join('\n').replace(
            /%([a-zA-Z0-9]+)/g, 
            (match, key) => replace[key] || match
        );

        const thumbnailUrl = 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg';
        let finalThumbnailBuffer = null;

        try {
            const response = await fetch(thumbnailUrl);
            const buffer = await response.arrayBuffer();
            finalThumbnailBuffer = Buffer.from(buffer);
        } catch (error) {
            try {
                const fallbackThumbnailPath = join(process.cwd(), 'src', 'thumbnail.jpg');
                if (fs.existsSync(fallbackThumbnailPath)) {
                    finalThumbnailBuffer = fs.readFileSync(fallbackThumbnailPath);
                }
            } catch (ignored) {}
        }
        
        const contextInfo = {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: (global.info?.namabot || 'WhatsApp Bot') + ` © ` + year,
                body: `Server Uptime: ${uptime}`,
                mediaType: 1,
                renderLargerThumbnail: true,
                thumbnail: finalThumbnailBuffer,
                sourceUrl: global.lgc || thumbnailUrl
            }
        };

        await conn.sendMessage(m.chat, {
            text: textToSend,
            contextInfo: contextInfo
        }, { quoted: m });

    } catch (e) {
        m.reply('❌ Terjadi kesalahan saat menampilkan menu.');
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