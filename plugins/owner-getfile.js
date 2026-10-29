/*
 * @Author      : Rafli
 * @Feature     : Get File & Search
 * @Description : Mengambil dan mengirimkan file dari server ke chat (via path langsung, alias, atau pencarian rekursif).
 * @Version     : 2.1 (No Decorational Emoji & Robust File Transfer)
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync } from 'fs'
import { join, extname, basename, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dir   = join(fileURLToPath(import.meta.url), '..', '..', 'data')
const DB_PATH = join(__dir, 'getfile.json')

const SKIP_DIRS = new Set([
    'node_modules', '.git', '.cache', '.npm', '.cargo',
    'proc', 'sys', 'dev', 'run', 'tmp'
])

function loadDB() {
    try {
        if (existsSync(DB_PATH)) return JSON.parse(readFileSync(DB_PATH, 'utf8'))
    } catch {}
    return { aliases: {}, searchDirs: [process.cwd()] }
}

function saveDB(data) {
    try { writeFileSync(DB_PATH, JSON.stringify(data, null, 2)) } catch (e) {
        console.error('[GETFILE] Gagal simpan DB:', e.message)
    }
}

function findFile(filename, dirs, maxDepth = 8) {
    const results = []

    function walk(dir, depth) {
        if (depth > maxDepth) return
        try {
            const entries = readdirSync(dir, { withFileTypes: true })
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
                    walk(join(dir, entry.name), depth + 1)
                } else if (entry.isFile()) {
                    if (entry.name.toLowerCase() === filename.toLowerCase()) {
                        results.push(join(dir, entry.name))
                    }
                }
            }
        } catch {}
    }

    for (const dir of dirs) {
        if (existsSync(dir)) walk(dir, 0)
        if (results.length >= 10) break
    }

    return results
}

function isUrl(str) {
    return /^https?:\/\//i.test(str.trim())
}

function getMimeType(src) {
    const ext = extname(src.split('?')[0]).toLowerCase()
    const map = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif',  '.webp': 'image/webp',
        '.mp4': 'video/mp4',  '.mkv': 'video/x-matroska', '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',  '.aac': 'audio/aac',
        '.pdf': 'application/pdf', '.zip': 'application/zip',
        '.apk': 'application/vnd.android.package-archive',
        '.txt': 'text/plain', '.js': 'text/javascript', '.json': 'application/json',
        '.html': 'text/html', '.css': 'text/css', '.md': 'text/markdown',
    }
    return map[ext] || 'application/octet-stream'
}

function getMediaType(mime) {
    if (mime.startsWith('image/')) return 'image'
    if (mime.startsWith('video/')) return 'video'
    if (mime.startsWith('audio/')) return 'audio'
    return 'document'
}

function fmtSize(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1e6)  return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1e6).toFixed(1)} MB`
}

async function sendFileToChat(conn, m, src, caption = '') {
    const mime      = getMimeType(src)
    const mediaType = getMediaType(mime)
    const fileName  = basename(src.split('?')[0])
    const source    = isUrl(src) ? { url: src } : readFileSync(src)

    if (mediaType === 'image') {
        await conn.sendMessage(m.chat, { image: source, caption, mimetype: mime }, { quoted: m })
    } else if (mediaType === 'video') {
        await conn.sendMessage(m.chat, { video: source, caption, mimetype: mime }, { quoted: m })
    } else if (mediaType === 'audio') {
        await conn.sendMessage(m.chat, { audio: source, mimetype: mime, ptt: false }, { quoted: m })
    } else {
        await conn.sendMessage(m.chat, { document: source, mimetype: mime, fileName, caption }, { quoted: m })
    }
}

const lastSearchResults = new Map()
const CACHE_TTL = 10 * 60 * 1000

function setCacheResults(chatId, found) {
    if (lastSearchResults.size >= 50) {
        const oldestKey = lastSearchResults.keys().next().value
        lastSearchResults.delete(oldestKey)
    }
    lastSearchResults.set(chatId, { found, timestamp: Date.now() })
}

function getCacheResults(chatId) {
    const cached = lastSearchResults.get(chatId)
    if (!cached) return null
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        lastSearchResults.delete(chatId)
        return null
    }
    return cached.found
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const db = loadDB()
    if (!db.aliases) db.aliases = {}
    if (!db.searchDirs) db.searchDirs = [process.cwd()]

    const args = text?.trim().split(/\s+/) || []
    const sub  = args[0]?.toLowerCase()

    if (!text || !sub) {
        const total = Object.keys(db.aliases).length
        return m.reply(
            `*GET FILE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• \`${usedPrefix + command} <namafile/path>\` - Cari & kirim file\n` +
            `• \`${usedPrefix + command} <nomor>\` - Pilih dari hasil pencarian\n` +
            `• \`${usedPrefix + command} list\` - Lihat daftar alias (${total})\n` +
            `• \`${usedPrefix + command} add <alias> <path>\` - Daftarkan alias\n` +
            `• \`${usedPrefix + command} del <alias>\` - Hapus alias\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (sub === 'list') {
        const names = Object.keys(db.aliases)
        if (!names.length) {
            return m.reply(`Belum ada alias terdaftar.\n\nKetik: \`${usedPrefix + command} <namafile>\` untuk cari otomatis.`)
        }
        const list = names.map((n, i) => {
            const f = db.aliases[n]
            return `${i + 1}. *${n}*\n   ${isUrl(f.src) ? 'URL' : 'Lokal'}: \`${f.src.slice(0, 55)}${f.src.length > 55 ? '...' : ''}\``
        }).join('\n\n')
        return m.reply(`*DAFTAR ALIAS FILE (${names.length})*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${list}`)
    }

    if (sub === 'dirs') {
        return m.reply(
            `*FOLDER PENCARIAN AKTIF*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            db.searchDirs.map((d, i) => `${i + 1}. \`${d}\``).join('\n') +
            `\n\n_Tambah folder: \`${usedPrefix + command} setdir /path/folder\`_`
        )
    }

    if (sub === 'setdir') {
        const dir = args.slice(1).join(' ').trim()
        if (!dir) return m.reply(`Masukkan path folder.\nContoh: \`${usedPrefix + command} setdir /sdcard\``)
        if (!existsSync(dir)) return m.reply(`Folder tidak ditemukan:\n\`${dir}\``)

        if (!db.searchDirs.includes(dir)) {
            db.searchDirs.push(dir)
            saveDB(db)
            return m.reply(`Folder ditambahkan ke daftar pencarian:\n\`${dir}\``)
        }
        return m.reply(`Folder \`${dir}\` sudah ada di daftar pencarian.`)
    }

    if (sub === 'deldir' || sub === 'remdir') {
        const input = args.slice(1).join(' ').trim()
        if (!input) return m.reply(`Masukkan nomor index atau path folder yang ingin dihapus.`)

        let targetDir = ''
        const index = parseInt(input) - 1
        if (!isNaN(index) && index >= 0 && index < db.searchDirs.length) {
            targetDir = db.searchDirs[index]
        } else {
            targetDir = db.searchDirs.find(d => d.toLowerCase() === input.toLowerCase()) || ''
        }

        if (!targetDir) return m.reply(`Folder \`${input}\` tidak ditemukan di daftar pencarian.`)

        db.searchDirs = db.searchDirs.filter(d => d !== targetDir)
        if (db.searchDirs.length === 0) db.searchDirs = [process.cwd()]
        saveDB(db)
        return m.reply(`Folder berhasil dihapus dari daftar pencarian:\n\`${targetDir}\``)
    }

    if (sub === 'add') {
        const alias   = args[1]?.toLowerCase()
        const src     = args[2]
        const caption = args.slice(3).join(' ') || ''

        if (!alias || !src) {
            return m.reply(`Format salah.\nGunakan: \`${usedPrefix + command} add <alias> <path/url> [caption]\``)
        }
        if (db.aliases[alias]) return m.reply(`Alias *${alias}* sudah ada. Hapus dulu: \`${usedPrefix + command} del ${alias}\``)
        if (!isUrl(src) && !existsSync(src)) return m.reply(`File lokal tidak ditemukan:\n\`${src}\``)

        db.aliases[alias] = { src, caption, addedAt: Date.now() }
        saveDB(db)
        return m.reply(`Alias *${alias}* berhasil disimpan.`)
    }

    if (sub === 'del' || sub === 'delete' || sub === 'hapus') {
        const alias = args[1]?.toLowerCase()
        if (!alias) return m.reply(`Masukkan alias yang ingin dihapus: \`${usedPrefix + command} del <alias>\``)
        if (!db.aliases[alias]) return m.reply(`Alias *${alias}* tidak ditemukan.`)
        delete db.aliases[alias]
        saveDB(db)
        return m.reply(`Alias *${alias}* berhasil dihapus.`)
    }

    const chosenNum = parseInt(sub, 10)
    const cached = getCacheResults(m.chat)
    if (!isNaN(chosenNum) && args.length === 1 && cached && cached[chosenNum - 1]) {
        const filePath = cached[chosenNum - 1]
        try {
            const size = fmtSize(statSync(filePath).size)
            await sendFileToChat(conn, m, filePath, `${filePath}\nUkuran: ${size}`)
            return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply(`Gagal mengirim file:\n\`${filePath}\`\n_${e.message}_`)
        }
    }

    const aliasEntry = db.aliases[sub]
    if (aliasEntry) {
        try {
            await sendFileToChat(conn, m, aliasEntry.src, aliasEntry.caption)
            return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply(`Gagal mengirim file alias *${sub}*:\n_${e.message}_`)
        }
    }

    const inputPath = text.trim()
    const resolvedPath = isUrl(inputPath) ? null : resolve(process.cwd(), inputPath)
    if (resolvedPath && existsSync(resolvedPath) && statSync(resolvedPath).isFile()) {
        try {
            const size = fmtSize(statSync(resolvedPath).size)
            await sendFileToChat(conn, m, resolvedPath, `${resolvedPath}\nUkuran: ${size}`)
            return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply(`Gagal mengirim file:\n\`${resolvedPath}\`\n_${e.message}_`)
        }
    }

    let query = text.trim()
    let selectIndex = null
    const numberMatch = query.match(/\s+(\d+)$/)
    if (numberMatch) {
        selectIndex = parseInt(numberMatch[1], 10) - 1
        query = query.replace(/\s+\d+$/, '').trim()
    }

    const found = findFile(query, db.searchDirs)

    if (!found.length) {
        return m.reply(
            `File *"${query}"* tidak ditemukan di direktori:\n` +
            db.searchDirs.map(d => `• \`${d}\``).join('\n')
        )
    }

    if (selectIndex !== null && selectIndex >= 0 && selectIndex < found.length) {
        const filePath = found[selectIndex]
        try {
            const size = fmtSize(statSync(filePath).size)
            await sendFileToChat(conn, m, filePath, `${filePath}\nUkuran: ${size}`)
            return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
            return m.reply(`Gagal mengirim *${filePath}*:\n_${e.message}_`)
        }
    }

    if (found.length > 1) {
        setCacheResults(m.chat, found)
        const list = found.map((f, i) => `${i + 1}. \`${f}\``).join('\n')
        return m.reply(
            `Ditemukan *${found.length}* file (*${query}*):\n\n${list}\n\n` +
            `_Ketik \`${usedPrefix + command} 1\` atau \`${usedPrefix + command} 2\` untuk mengambil file._`
        )
    }

    const filePath = found[0]
    try {
        const size = fmtSize(statSync(filePath).size)
        await sendFileToChat(conn, m, filePath, `${filePath}\nUkuran: ${size}`)
        return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (e) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(`Gagal mengirim file:\n_${e.message}_`)
    }
}

handler.help = ['gf *namafile/alias*']
handler.tags    = ['owner']
handler.command = /^(getfile|gf|sendfile)$/i
handler.owner   = true

export default handler