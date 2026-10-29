/*
- @Author: Rafli
- @Feature: Menu / Help
- @Description: Tampilkan daftar fitur bot berdasarkan kategori dengan thumbnail, info user, total fitur, dan perbaikan urutan kategori.
*/

import { jidNormalizedUser } from '@whiskeysockets/baileys'
import fs   from 'fs'
import { join } from 'path'
import os   from 'os'

const packagePath = join(process.cwd(), 'package.json')
let _package = {}
try {
    if (fs.existsSync(packagePath)) _package = JSON.parse(fs.readFileSync(packagePath, 'utf-8'))
} catch {}

const tags = {
    ai        : 'AI Assistant',
    downloader: 'Downloader Menu',
    game      : 'Game & Fun',
    group     : 'Group Management',
    info      : 'Information Menu',
    internet  : 'Internet & Search',
    keuangan  : 'Finance Tracker',
    rpg       : 'RPG Game',
    sticker   : 'Sticker Maker',
    store     : 'Store & Shop',
    tools     : 'Tools & Utility',
    owner     : 'Owner Only',
}

const defaultMenu = {
    before: `Halo %namatag!\n` +
            `Ada yang bisa Joy bantu hari ini?\n\n` +
            `╭── ✦ *BOT INFO* ✦\n` +
            `│ • Nama: %me\n` +
            `│ • Mode: %mode\n` +
            `│ • Platform: %platform\n` +
            `│ • Versi: v%version\n` +
            `│ • Total Fitur: %totalfitur Perintah\n` +
            `│ • Uptime: %uptime\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `╭── ✦ *USER INFO* ✦\n` +
            `│ • User: %name\n` +
            `│ • Status: %status\n` +
            `│ • Limit: %limit\n` +
            `│ • Umur: %age\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n%readmore`,
    header: '╭── ✦ *%category* ✦',
    body  : '│ › %cmd',
    footer: '╰━━━━━━━━━━━━━━━━━━━━━━━\n',
    after : `> _Ketik \`.menu <kategori>\` untuk menu spesifik._\n> _© 2026 Joy Multi-Device Assistant_`
}

const THUMBNAIL_PATH = join(process.cwd(), 'src', 'thumbnail.jpg')

function getThumbnail() {
    if (global._menuThumbnailCache) return global._menuThumbnailCache
    if (global.thum) {
        global._menuThumbnailCache = global.thum
        return global._menuThumbnailCache
    }
    try {
        if (fs.existsSync(THUMBNAIL_PATH)) {
            global._menuThumbnailCache = fs.readFileSync(THUMBNAIL_PATH)
            return global._menuThumbnailCache
        }
    } catch (e) {
        console.warn('[MENU] Thumbnail gagal di-load:', e.message)
        global._menuThumbnailCache = null
    }
    return global._menuThumbnailCache || null
}

getThumbnail()

let _pluginCacheKey  = null
let _pluginCacheData = null

function getPluginHelp(isOwner) {
    const cacheKey = `${Object.values(global.plugins || {}).map(p => p && p.help ? (Array.isArray(p.help) ? p.help.join('|') : p.help) : '').join(',')}:${isOwner}`
    if (_pluginCacheKey === cacheKey && _pluginCacheData) return _pluginCacheData

    const result = Object.values(global.plugins || {})
        .filter(p => {
            if (!p || !p.help || p.disable || p.disabled) return false
            const isOwnerPlugin = p.owner || p.rowner || (Array.isArray(p.tags) ? p.tags.includes('owner') : p.tags === 'owner')
            return isOwner ? true : !isOwnerPlugin
        })
        .map(p => ({
            help   : Array.isArray(p.help) ? p.help : [p.help],
            tags   : Array.isArray(p.tags) ? p.tags : [p.tags],
            prefix : 'customPrefix' in p,
            limit  : p.limit,
            premium: p.premium
        }))

    _pluginCacheKey  = cacheKey
    _pluginCacheData = result
    return result
}

function clockString(ms) {
    const d = Math.floor(ms / 86400000)
    const h = Math.floor(ms / 3600000) % 24
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    const parts = []
    if (d > 0) parts.push(`${d}d`)
    parts.push([h, m, s].map(v => v.toString().padStart(2, '0')).join(':'))
    return parts.join(' ')
}

function formatRemaining(ms) {
    if (ms <= 0) return 'Habis'
    const d = Math.floor(ms / 86400000)
    const h = Math.floor((ms % 86400000) / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    if (d > 0) return `${d} Hari`
    if (h > 0) return `${h} Jam`
    return `${m} Menit`
}

function normalizeHelpCmd(cmdStr) {
    if (!cmdStr || typeof cmdStr !== 'string') return cmdStr;
    const idx = cmdStr.indexOf(' ');
    if (idx === -1) return cmdStr;
    const cmd = cmdStr.slice(0, idx);
    let arg = cmdStr.slice(idx + 1).trim();

    while (arg.startsWith('*')) arg = arg.slice(1).trim();
    while (arg.endsWith('*')) arg = arg.slice(0, -1).trim();

    arg = arg.replace(/[<>[\]()]/g, '').trim();
    return `${cmd} *${arg}*`;
}

let handler = async (m, { conn, usedPrefix, command, text, isOwner }) => {
    try {
        conn.sendPresenceUpdate('composing', m.chat).catch(() => {})

        const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
        const user = global.db.data.users[senderLID] || global.db.data.users[m.sender] || {}

        const name    = user.name || m.name || m.pushName || 'Pengguna'
        let phone     = conn.storeNumber?.[m.sender] || (conn.getNumber ? conn.getNumber(m.sender) : '')
        if (!phone && conn.storeLid?.[m.sender]) {
            const mapped = conn.storeLid[m.sender]
            if (typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
                phone = mapped.split('@')[0].split(':')[0]
            }
        }
        if (!phone && m.sender.endsWith('@s.whatsapp.net')) {
            phone = m.sender.split('@')[0].split(':')[0]
        }
        const namatag = phone ? `@${phone}` : `@${name}`
        const age     = user.age === -1 || !user.register ? 'Belum Daftar' : `${user.age} Tahun`
        const limit   = user.limit === Infinity ? 'Unlimited' : (user.limit || 0)

        let status = 'Standard User'
        if (user.banned) {
            status = 'Banned'
        } else if (isOwner) {
            status = 'Developer'
        } else if (user.premium) {
            const sisa = user.premiumDate > Date.now() ? ` (Sisa ${formatRemaining(user.premiumDate - Date.now())})` : ''
            status = `Premium User${sisa}`
        }

        const botname  = global.info?.namabot || conn.user?.name || 'WhatsApp Bot'
        const d        = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }))
        const locale   = 'id-ID'
        const date     = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
        const year     = d.toLocaleDateString(locale, { year: 'numeric' })
        const uptime   = clockString(process.uptime() * 1000)
        const platform = os.platform()

        const botLid   = conn.user?.lid ? jidNormalizedUser(conn.user.lid) : null
        const settings = global.db.data.settings[botLid] || {}
        const chatMode = settings.chatMode || ''

        const modeMap  = {
            owneronly: 'Owner Only (Self)',
            self: 'Owner Only (Self)',
            pconly: 'Private Only',
            gconly: 'Group Only',
            sewaonly: 'Sewa Only'
        }
        const mode     = modeMap[chatMode] || 'Publik'

        const help       = getPluginHelp(isOwner)
        const activeTags = new Set()
        let totalFeatures = 0

        for (const plugin of help) {
            totalFeatures += (plugin.help || []).length
            for (const tag of (plugin.tags || [])) {
                if (!tag) continue
                activeTags.add(tag)
                if (!(tag in tags)) tags[tag] = `${tag.charAt(0).toUpperCase() + tag.slice(1)} Menu`
            }
        }

        const readMore = String.fromCharCode(8206).repeat(4001)
        const replace  = {
            '%': '%', p: usedPrefix, name, limit, age,
            date, year, uptime, platform, mode,
            me: botname, version: _package.version || '1.0.0',
            totalfitur: totalFeatures,
            readmore: readMore, status, namatag
        }

        const menuType = text?.toLowerCase().trim() || ''
        const { before, header, body, footer, after } = defaultMenu
        let menuText = []

        if (!menuType) {
            const sortedTags = Object.keys(tags)
                .filter(tag => activeTags.has(tag))
                .sort((a, b) => {
                    if (a === 'owner') return 1
                    if (b === 'owner') return -1
                    return a.localeCompare(b)
                })

            const tagList = sortedTags
                .map(tag => `│ › \`${usedPrefix + command} ${tag}\``)
                .join('\n')

            menuText = [
                before,
                `╭── ✦ *DAFTAR MENU* ✦`,
                `│ › \`${usedPrefix + command} all\``,
                tagList,
                footer,
                `_Ketik \`${usedPrefix + command} <kategori>\` untuk melihat fitur._\n*Contoh:* \`${usedPrefix + command} sticker\``,
                `\n` + after
            ]

        } else if (menuType === 'all' || (tags[menuType] && activeTags.has(menuType))) {
            const categories = menuType === 'all'
                ? Object.keys(tags).filter(t => activeTags.has(t)).sort((a, b) => {
                    if (a === 'owner') return 1
                    if (b === 'owner') return -1
                    return a.localeCompare(b)
                })
                : [menuType]

            menuText.push(before)

            for (const tag of categories) {
                if (!tags[tag]) continue
                const filtered = help.filter(p => p.tags?.includes(tag) && p.help)
                if (!filtered.length) continue

                menuText.push(header.replace(/%category/g, tags[tag]))
                
                const commandEntries = [];
                for (const p of filtered) {
                    const helpList = p.help;
                    let cmdsToPrint = [];

                    if (helpList.length > 1) {
                        const first = helpList[0];
                        const baseWord = first.split(/\s+/)[0];
                        const allStartWithBase = helpList.slice(1).every(cmd => cmd.startsWith(baseWord));

                        if (allStartWithBase) {
                            const subOptions = [];
                            for (let i = 1; i < helpList.length; i++) {
                                const sub = helpList[i].slice(baseWord.length).trim();
                                if (sub) subOptions.push(sub);
                            }
                            if (subOptions.length > 0) {
                                cmdsToPrint = [`${first} (${subOptions.join('/')})`];
                            } else {
                                cmdsToPrint = [first];
                            }
                        } else {
                            cmdsToPrint = helpList;
                        }
                    } else {
                        cmdsToPrint = helpList;
                    }

                    for (let cmd of cmdsToPrint) {
                        cmd = normalizeHelpCmd(cmd);
                        const rawFirst = cmd.split(/\s+/)[0].toLowerCase();
                        const cleanName = rawFirst.replace(/^[./!#*`_]+/, '');
                        const formatted = body.replace(/%cmd/g,
                            `${p.prefix ? '' : usedPrefix}${cmd}${p.premium ? ' (P)' : ''}${p.limit ? ' (L)' : ''}`
                        );
                        commandEntries.push({ cleanName, formatted });
                    }
                }

                commandEntries.sort((a, b) => a.cleanName.localeCompare(b.cleanName));
                const categoryCmds = commandEntries.map(c => c.formatted).join('\n');

                menuText.push(categoryCmds)
                menuText.push(footer)
            }
            menuText.push(after)

        } else {
            return m.reply(
                `Menu \`${text}\` tidak ditemukan atau tidak memiliki fitur aktif.\n\n` +
                `Ketik \`${usedPrefix + command}\` untuk melihat daftar menu.`
            )
        }

        const textToSend = menuText.join('\n').replace(
            /%([a-zA-Z0-9]+)/g,
            (match, key) => replace[key] ?? match
        )

        await conn.sendMessage(m.chat, {
            text: textToSend,
            secureMetaServiceLabel: true,
            contextInfo: {
                mentionedJid: [m.sender, conn.storeLid?.[m.sender]].filter(Boolean),
                externalAdReply: {
                    title               : `${global.info?.namabot || 'WhatsApp Bot'} © ${year}`,
                    body                : `Server Uptime: ${uptime}`,
                    mediaType           : 1,
                    renderLargerThumbnail: true,
                    thumbnail           : getThumbnail() || undefined,
                    sourceUrl           : ''
                }
            }
        }, { quoted: m })

    } catch (e) {
        console.error('[MENU]', e)
        m.reply('Terjadi kesalahan saat menampilkan menu.')
    }
}

handler.command = /^(menu|help)$/i

export default handler