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
    before: `Hallo %namatag! 👋
Saya adalah Bot Otomatis yang siap membantu Anda 24/7!
 
「  I N F O  B O T  」
 •  Nama : %me
 •  Mode : %mode
 •  Platform : %platform
 •  Versi : %version
 •  Uptime : %uptime
 
「  I N F O  U S E R  」
 •  Nama : %name
 •  Status : %status
 •  Limits : %limit
%readmore
`.trimStart(),
    header: '╭─「 *%category* 」',
    body: '│ • %cmd',
    footer: '╰────\n',
    after: `Powered By Rafli`,
};

// Cache untuk thumbnail agar tidak perlu reload setiap kali
let thumbnailCache = null;

let handler = async (m, { conn, usedPrefix, command, text, isOwner }) => {
    try {
        
        await conn.sendPresenceUpdate('composing', m.chat);
        
        let user = global.db.data.users[m.sender];
        if (!user) return;

        let name = user.name || 'Pengguna Baru';
        let namatag = `@${m.sender.split('@')[0]}`;
        let status = 'Standard User';
        if (user.banned) {
            status = 'Banned';
        } else if (isOwner) {
            status = 'Developer';
        } else if (user.premium) {
            status = 'Premium User';
        }
        
        let botname = global.info?.namabot || conn.user?.name || 'WhatsApp Bot';
        let limit = (user.limit === Infinity) ? 'Unlimited' : (user.limit || 0);

        const d = new Date(new Date().getTime() + 7 * 3600 * 1000);
        const locale = 'id-ID';
        const date = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
        const year = d.toLocaleDateString(locale, { year: 'numeric' });

        let uptime = clockString(process.uptime() * 1000);
        let platform = os.platform();

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
            readmore: readMore,
            status: status,
            namatag: namatag
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
                footer,
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

        // OPTIMIZED: Gunakan cache atau load thumbnail
        let finalThumbnailBuffer = null;

        if (!thumbnailCache) {
            // Load thumbnail hanya sekali saat pertama kali
            const localThumbnailPath = join(process.cwd(), 'src', 'thumbnail.jpg');
            const thumbnailUrl = 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg';
            
            try {
                // Prioritas 1: Gunakan file lokal (CEPAT - ~1-10ms)
                if (fs.existsSync(localThumbnailPath)) {
                    thumbnailCache = fs.readFileSync(localThumbnailPath);
                } else {
                    // Prioritas 2: Download dari URL jika file lokal tidak ada (LAMBAT - ~100-500ms)
                    const response = await fetch(thumbnailUrl);
                    if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        thumbnailCache = Buffer.from(buffer);
                        
                        // Optional: Simpan ke file lokal untuk penggunaan selanjutnya
                        try {
                            const srcDir = join(process.cwd(), 'src');
                            if (!fs.existsSync(srcDir)) {
                                fs.mkdirSync(srcDir, { recursive: true });
                            }
                            fs.writeFileSync(localThumbnailPath, thumbnailCache);
                        } catch (saveError) {
                            console.log('Tidak dapat menyimpan thumbnail:', saveError.message);
                        }
                    }
                }
            } catch (error) {
                console.error('Error loading thumbnail:', error.message);
                // Jika semua gagal, gunakan buffer kosong atau skip thumbnail
                thumbnailCache = null;
            }
        }

        finalThumbnailBuffer = thumbnailCache;
        
        const contextInfo = {
            mentionedJid: [m.sender],
            externalAdReply: {
                title: (global.info?.namabot || 'WhatsApp Bot') + ` © ` + year,
                body: `Server Uptime: ${uptime}`,
                mediaType: 1,
                renderLargerThumbnail: true,
                thumbnail: finalThumbnailBuffer,
                sourceUrl: ``
            }
        };

        await conn.sendMessage(m.chat, {
            text: textToSend,
            contextInfo: contextInfo
        }, { quoted: m });

    } catch (e) {
        console.error('Menu error:', e);
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