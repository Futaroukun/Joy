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
    console.error('Error loading package.json:', e.message);
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

let thumbnailCache = null;

let handler = async (m, { conn, usedPrefix, command, text, isOwner }) => {
    try {
        console.log('[MENU] Command triggered by:', m.sender);
        
        await conn.sendPresenceUpdate('composing', m.chat);
        
        // ✅ FIX 1: Validasi global.db
        if (!global.db?.data?.users) {
            console.error('[MENU] Database not initialized!');
            return m.reply('❌ Database belum siap. Silakan coba lagi dalam beberapa detik.');
        }
        
        let user = global.db.data.users[m.sender];
        if (!user) {
            console.log('[MENU] User not found in database, creating new user');
            global.db.data.users[m.sender] = {
                name: m.pushName || 'User',
                limit: 25,
                premium: false,
                banned: false
            };
            user = global.db.data.users[m.sender];
        }

        let name = user.name || m.pushName || 'Pengguna Baru';
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

        // ✅ FIX 2: Safe settings access
        let mode = 'Publik';
        try {
            const botLid = jidNormalizedUser(conn.user?.lid || conn.user?.id);
            if (global.db?.data?.settings && botLid) {
                const settings = global.db.data.settings[botLid] || {};
                const chatMode = settings.chatMode || '';
                
                switch (chatMode) {
                    case 'pconly': mode = 'Private Only'; break;
                    case 'gconly': mode = 'Group Only'; break;
                    default: mode = 'Publik';
                }
            }
        } catch (err) {
            console.error('[MENU] Error getting settings:', err.message);
        }

        // ✅ FIX 3: Safe global.plugins access
        let help = [];
        try {
            if (global.plugins && typeof global.plugins === 'object') {
                help = Object.values(global.plugins)
                    .filter(plugin => {
                        return plugin && 
                               plugin.help && 
                               !plugin.disable &&
                               (Array.isArray(plugin.help) ? plugin.help.length > 0 : plugin.help);
                    })
                    .map(plugin => ({
                        help: Array.isArray(plugin.help) ? plugin.help : [plugin.help],
                        tags: Array.isArray(plugin.tags) ? plugin.tags : [plugin.tags],
                        prefix: 'customPrefix' in plugin,
                        limit: plugin.limit,
                        premium: plugin.premium,
                    }));
                
                console.log(`[MENU] Found ${help.length} active plugins`);
            } else {
                console.warn('[MENU] global.plugins is not available or not an object');
            }
        } catch (err) {
            console.error('[MENU] Error processing plugins:', err.message);
        }

        // Jika tidak ada plugin yang ditemukan
        if (help.length === 0) {
            console.warn('[MENU] No plugins found!');
            return m.reply('⚠️ Tidak ada menu yang tersedia saat ini. Plugin mungkin belum dimuat.');
        }

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

        console.log(`[MENU] Active tags:`, Array.from(activeTags));

        const readMore = String.fromCharCode(8206).repeat(4001);
        let replace = {
            '%': '%', 
            p: usedPrefix, 
            name, 
            limit,
            date, 
            year, 
            uptime, 
            platform, 
            mode,
            me: botname, 
            version: _package.version || '1.0.0',
            readmore: readMore,
            status: status,
            namatag: namatag
        };

        let menuType = text ? text.toLowerCase().trim() : '';
        let menuText = [];
        let { before, header, body, footer, after } = defaultMenu;

        if (!menuType) {
            // Daftar menu
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
            // Detail menu
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

        console.log('[MENU] Text length:', textToSend.length);

        // ✅ FIX 4: Thumbnail loading dengan error handling yang lebih baik
        let finalThumbnailBuffer = null;

        if (!thumbnailCache) {
            const localThumbnailPath = join(process.cwd(), 'src', 'thumbnail.jpg');
            const thumbnailUrl = 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg';
            
            try {
                if (fs.existsSync(localThumbnailPath)) {
                    thumbnailCache = fs.readFileSync(localThumbnailPath);
                    console.log('[MENU] Thumbnail loaded from local file');
                } else {
                    console.log('[MENU] Downloading thumbnail...');
                    const response = await fetch(thumbnailUrl, { timeout: 5000 });
                    if (response.ok) {
                        const buffer = await response.arrayBuffer();
                        thumbnailCache = Buffer.from(buffer);
                        console.log('[MENU] Thumbnail downloaded successfully');
                        
                        try {
                            const srcDir = join(process.cwd(), 'src');
                            if (!fs.existsSync(srcDir)) {
                                fs.mkdirSync(srcDir, { recursive: true });
                            }
                            fs.writeFileSync(localThumbnailPath, thumbnailCache);
                            console.log('[MENU] Thumbnail saved to file');
                        } catch (saveError) {
                            console.log('[MENU] Could not save thumbnail:', saveError.message);
                        }
                    } else {
                        console.warn('[MENU] Thumbnail download failed:', response.status);
                    }
                }
            } catch (error) {
                console.error('[MENU] Thumbnail error:', error.message);
                thumbnailCache = null;
            }
        }

        finalThumbnailBuffer = thumbnailCache;
        
        // ✅ FIX 5: Kirim pesan dengan error handling
        try {
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
            
            console.log('[MENU] Message sent successfully');
            
        } catch (sendError) {
            console.error('[MENU] Error sending message:', sendError.message);
            
            // Fallback: kirim tanpa thumbnail
            try {
                await conn.sendMessage(m.chat, {
                    text: textToSend
                }, { quoted: m });
                console.log('[MENU] Message sent without thumbnail');
            } catch (fallbackError) {
                console.error('[MENU] Fallback send failed:', fallbackError.message);
                throw fallbackError;
            }
        }

    } catch (e) {
        console.error('[MENU] Critical error:', e);
        console.error(e.stack);
        
        try {
            await m.reply('❌ Terjadi kesalahan saat menampilkan menu.\n\nError: ' + e.message);
        } catch (replyError) {
            console.error('[MENU] Could not send error message:', replyError.message);
        }
    }
};

handler.command = /^(menu|help|perintah)$/i;
handler.tags = ['info'];
handler.help = ['menu', 'help'];

export default handler;

function clockString(ms) {
    let h = Math.floor(ms / 3600000);
    let m = Math.floor(ms / 60000) % 60;
    let s = Math.floor(ms / 1000) % 60;
    return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':');
}