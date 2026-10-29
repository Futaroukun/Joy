/*
- @Author     : Rafli
- @Feature    : Joy Store (Dedicated Store Catalog)
- @Description: Sistem database store interaktif lengkap dengan media support, button menu, search, direct shortcut, backup, dan manajemen lengkap (.store <add|del|edit|get|list|search|rename|update|info|stats|backup>).
*/

import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'store.json')

// ── Database Helper ──────────────────────────────────────────────────────────
function loadStore() {
    if (!fs.existsSync(dbPath)) {
        const defaultData = { store: {} }
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.writeFileSync(dbPath, JSON.stringify(defaultData, null, 2))
        return defaultData
    }
    try {
        const raw = fs.readFileSync(dbPath, 'utf8')
        const parsed = JSON.parse(raw)
        if (!parsed.store || typeof parsed.store !== 'object') parsed.store = {}
        // Hapus catatan jika masih ada
        if (parsed.catatan) delete parsed.catatan

        // Migrasi jika ada item nyasar di root object
        for (const [key, val] of Object.entries(parsed)) {
            if (key !== 'store' && key !== 'catatan') {
                parsed.store[key] = val
                delete parsed[key]
            }
        }
        return parsed
    } catch (e) {
        console.error('[STORE LOAD ERROR]', e)
        return { store: {} }
    }
}

function saveStore(data) {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
    } catch (e) {
        console.error('[STORE SAVE ERROR]', e)
    }
}

function checkIsOwner(m, isOwner, isROwner) {
    if (isOwner || isROwner) return true
    const senders = [m.sender, m.userJid].filter(Boolean)
    const ownerList = [
        ...(global.developer || []),
        ...(global.owner || []),
        global.info?.nomorowner
    ].filter(Boolean).map(v => v.replace(/[^0-9]/g, ''))

    for (const s of senders) {
        const cleanS = s.replace(/[^0-9]/g, '')
        if (ownerList.includes(cleanS)) return true
        if (ownerList.some(o => s.startsWith(o))) return true
    }
    return false
}

function getMediaTypeLabel(item) {
    if (!item) return 'Teks'
    if (typeof item === 'string') return 'Teks'
    const mtype = item.mtype || ''
    if (/image/i.test(mtype)) return 'Gambar'
    if (/video/i.test(mtype)) return 'Video'
    if (/audio/i.test(mtype)) return 'Audio'
    if (/sticker/i.test(mtype)) return 'Stiker'
    if (/document/i.test(mtype)) return 'Dokumen'
    return 'Teks'
}

function getFlattenedItems(data) {
    const allItems = []
    let index = 0
    for (const [key, val] of Object.entries(data.store || {})) {
        allItems.push({ index: index++, key, data: val })
    }
    return allItems
}

// ── Sender Helper ────────────────────────────────────────────────────────────
async function sendStoreItem(m, conn, item, keyName) {
    if (!item) return m.reply('*Item tidak ditemukan di database store.*')

    if (typeof item === 'string') {
        return conn.fakeReply(m.chat, item, '0@s.whatsapp.net', `Joy Store: ${keyName}`, 'status@broadcast')
    }

    const isText = !item.mediaMessage ||
                   item.mtype === 'conversation' ||
                   item.mtype === 'extendedTextMessage'

    if (isText) {
        const textContent = item.text ||
            item.mediaMessage?.extendedTextMessage?.text ||
            item.mediaMessage?.conversation ||
            item.message?.conversation || ''
        return conn.fakeReply(m.chat, textContent, '0@s.whatsapp.net', `Joy Store: ${keyName}`, 'status@broadcast')
    }

    let msgContent = item.mediaMessage || item.message
    if (!msgContent) {
        if (item.text) return m.reply(item.text)
        return m.reply('*Data media item tidak tersedia.*')
    }

    msgContent = JSON.parse(JSON.stringify(msgContent))
    let type = Object.keys(msgContent)[0]
    const validTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']

    if (!validTypes.includes(type) && validTypes.includes(item.mtype)) {
        msgContent = { [item.mtype]: msgContent }
        type = item.mtype
    }

    if (!validTypes.includes(type)) {
        if (item.text) return m.reply(item.text)
        return m.reply(`*Tipe media tidak didukung:* ${type}`)
    }

    if (['imageMessage', 'videoMessage', 'documentMessage'].includes(type)) {
        if (item.text && item.text.trim()) {
            msgContent[type].caption = item.text
        } else if (!msgContent[type].caption) {
            msgContent[type].caption = `*JOY STORE ITEM*\nNama: *${keyName}*\nTanggal: ${new Date().toLocaleDateString('id-ID')}`
        }
    }

    msgContent[type].contextInfo = {
        ...(msgContent[type].contextInfo || {}),
        quotedMessage: { conversation: `Joy Store • ${keyName}` },
        participant  : '0@s.whatsapp.net',
        stanzaId     : 'FAKE_' + Date.now(),
        remoteJid    : 'status@broadcast'
    }

    try {
        await conn.relayMessage(m.chat, msgContent, {
            messageId: (Math.random() + 1).toString(36).substring(7)
        })
    } catch (e) {
        console.error('[STORE SEND RELAY ERROR]', e)
        if (item.text) await m.reply(item.text)
        else await m.reply(`*Gagal mengirim media:* ${e.message}`)
    }
}

// ── Main Handler ─────────────────────────────────────────────────────────────
let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    const isCallerOwner = checkIsOwner(m, isOwner, isROwner)
    const data = loadStore()
    const allItems = getFlattenedItems(data)

    // Normalize command / sub-command
    let sub = ''
    let subArgs = ''

    const cmdLower = command.toLowerCase()

    if (cmdLower === 'addlist') {
        sub = 'add'
        subArgs = text || ''
    } else if (cmdLower === 'dellist' || cmdLower === 'hapuslist') {
        sub = 'del'
        subArgs = text || ''
    } else if (cmdLower === 'editlist' || cmdLower === 'ubahlist') {
        sub = 'edit'
        subArgs = text || ''
    } else if (cmdLower === 'list' || cmdLower === 'liststore') {
        if (text && !isNaN(text.trim())) {
            sub = 'get'
            subArgs = text.trim()
        } else if (text) {
            sub = 'search'
            subArgs = text.trim()
        } else {
            sub = 'list'
            subArgs = ''
        }
    } else {
        // Command is .store
        const parts = (text || '').trim().split(/\s+/)
        const first = parts[0]?.toLowerCase() || ''

        if (['add', 'tambah', 'save', 'simpan'].includes(first)) {
            sub = 'add'
            subArgs = parts.slice(1).join(' ')
        } else if (['del', 'delete', 'hapus', 'rm'].includes(first)) {
            sub = 'del'
            subArgs = parts.slice(1).join(' ')
        } else if (['edit', 'ubah'].includes(first)) {
            sub = 'edit'
            subArgs = parts.slice(1).join(' ')
        } else if (['rename', 'gantinama'].includes(first)) {
            sub = 'rename'
            subArgs = parts.slice(1).join(' ')
        } else if (['update', 'updateisi'].includes(first)) {
            sub = 'update'
            subArgs = parts.slice(1).join(' ')
        } else if (['get', 'lihat', 'ambil', 'cek'].includes(first)) {
            sub = 'get'
            subArgs = parts.slice(1).join(' ')
        } else if (['search', 'cari', 'find'].includes(first)) {
            sub = 'search'
            subArgs = parts.slice(1).join(' ')
        } else if (['info', 'detail'].includes(first)) {
            sub = 'info'
            subArgs = parts.slice(1).join(' ')
        } else if (['stats', 'stat', 'total'].includes(first)) {
            sub = 'stats'
            subArgs = ''
        } else if (['backup', 'export'].includes(first)) {
            sub = 'backup'
            subArgs = ''
        } else if (first === 'list' || first === 'menu' || first === 'all') {
            sub = 'list'
            subArgs = parts.slice(1).join(' ')
        } else if (first && !isNaN(first)) {
            sub = 'get'
            subArgs = first
        } else if (text && text.trim()) {
            const matchItem = allItems.find(i => i.key.toLowerCase() === text.trim().toLowerCase())
            if (matchItem) {
                sub = 'get'
                subArgs = text.trim()
            } else {
                sub = 'search'
                subArgs = text.trim()
            }
        } else {
            sub = 'list'
            subArgs = ''
        }
    }

    // ── SUBCOMMAND: ADD / TAMBAH ─────────────────────────────────────────────
    if (sub === 'add') {
        if (!isCallerOwner) {
            return m.reply('*AKSES DITOLAK*\nHanya Owner yang dapat menambah item store.')
        }

        if (!subArgs && !m.quoted) {
            return m.reply(
                `*CARA MENAMBAH ITEM STORE*\n\n` +
                `1. *Via Reply Pesan / Media (Gambar/Video/Audio/Stiker/Dokumen):*\n` +
                `   Reply pesan lalu ketik:\n` +
                `   \`${usedPrefix}store add <nama_item>\`\n` +
                `   _(Bisa tambah caption opsional: \`${usedPrefix}store add <nama> | <caption kustom>\`)_\n\n` +
                `2. *Via Teks Langsung:*\n` +
                `   \`${usedPrefix}store add <nama_item> | <isi teksnya>\``
            )
        }

        let keyName = ''
        let customContent = ''

        if (subArgs.includes('|')) {
            const split = subArgs.split('|')
            keyName = split[0].trim()
            customContent = split.slice(1).join('|').trim()
        } else {
            keyName = subArgs.trim()
        }

        if (!keyName) {
            return m.reply(`*NAMA ITEM KOSONG*\n\nBerikan nama untuk item ini.\nContoh: \`${usedPrefix}store add Daftar Harga\``)
        }

        if (data.store[keyName]) {
            return m.reply(
                `*NAMA SUDAH DIGUNAKAN*\n\n` +
                `Item dengan nama *${keyName}* sudah ada di store.\n` +
                `Gunakan \`${usedPrefix}store edit ${keyName}\` untuk mengubah atau hapus dulu dengan \`${usedPrefix}store del ${keyName}\`.`
            )
        }

        let dataToSave = {}
        const now = Date.now()
        const addedBy = m.sender.replace(/[^0-9]/g, '')

        if (m.quoted) {
            const q = m.quoted
            const isMedia = q.mediaMessage || q.isMedia || ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(q.mtype)

            if (isMedia) {
                dataToSave = {
                    mtype       : q.mtype,
                    mediaMessage: q.mediaMessage || q.msg || q.message,
                    text        : customContent || q.text || q.caption || '',
                    createdAt   : now,
                    updatedAt   : now,
                    addedBy     : addedBy,
                    key         : {
                        remoteJid  : m.chat,
                        fromMe     : false,
                        id         : q.id || q.key?.id,
                        participant: q.sender
                    }
                }
            } else {
                const textVal = customContent || q.text || q.body || ''
                dataToSave = {
                    mtype       : 'conversation',
                    text        : textVal,
                    mediaMessage: { conversation: textVal },
                    createdAt   : now,
                    updatedAt   : now,
                    addedBy     : addedBy
                }
            }
        } else {
            if (!customContent) {
                return m.reply(
                    `*REPLY PESAN ATAU SERTAKAN ISI TEKS*\n\n` +
                    `Reply pesan/media yang ingin disimpan, atau ketik:\n` +
                    `\`${usedPrefix}store add ${keyName} | isi teks di sini\``
                )
            }
            dataToSave = {
                mtype       : 'conversation',
                text        : customContent,
                mediaMessage: { conversation: customContent },
                createdAt   : now,
                updatedAt   : now,
                addedBy     : addedBy
            }
        }

        data.store[keyName] = dataToSave
        saveStore(data)

        const typeLabel = getMediaTypeLabel(dataToSave)

        return conn.sendMessage(m.chat, {
            text:
                `*BERHASIL DITAMBAHKAN *\n\n` +
                `• *Nama:* ${keyName}\n` +
                `• *Tipe:* ${typeLabel}\n` +
                `• *Karakter/Media:* ${dataToSave.text ? `${dataToSave.text.length} karakter` : 'Media file'}\n\n` +
                `Cek item dengan \`${usedPrefix}store get ${keyName}\` atau \`${usedPrefix}store list\`.`,
            contextInfo: {
                externalAdReply: {
                    title: `STORE ITEM DISIMPAN`,
                    body: `${keyName} (${typeLabel})`,
                    thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })
    }

    // ── SUBCOMMAND: GET / LIHAT ──────────────────────────────────────────────
    if (sub === 'get') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix}store get <nomor/nama>\``)

        const query = subArgs.trim()

        if (!isNaN(query)) {
            const num = parseInt(query) - 1
            if (num < 0 || num >= allItems.length) {
                return m.reply(`Nomor tidak valid. Gunakan nomor 1 sampai ${allItems.length}.`)
            }
            const target = allItems[num]
            return sendStoreItem(m, conn, target.data, target.key)
        }

        const cleanQuery = query.toLowerCase()
        let matched = allItems.find(i => i.key.toLowerCase() === cleanQuery)
        if (!matched) matched = allItems.find(i => i.key.toLowerCase().includes(cleanQuery))

        if (!matched) {
            return m.reply(
                `*Item "${query}" tidak ditemukan.*\n\n` +
                `Ketik \`${usedPrefix}store list\` untuk melihat daftar item yang ada.`
            )
        }

        return sendStoreItem(m, conn, matched.data, matched.key)
    }

    // ── SUBCOMMAND: DELETE / HAPUS ───────────────────────────────────────────
    if (sub === 'del') {
        if (!isCallerOwner) {
            return m.reply('*AKSES DITOLAK*\nHanya Owner yang dapat menghapus item store.')
        }

        if (!subArgs) {
            if (allItems.length === 0) return m.reply('*Store masih kosong, tidak ada item untuk dihapus.*')
            const listStr = allItems.map((it, i) => `${i + 1}. ${it.key} _[${getMediaTypeLabel(it.data)}]_`).join('\n')
            return m.reply(
                `*HAPUS ITEM STORE*\n\n` +
                `Pilihan:\n` +
                `• \`${usedPrefix}store del <nomor/nama>\`\n` +
                `• \`${usedPrefix}store del all\` _(Hapus semua)_\n\n` +
                `*Daftar Item:*\n${listStr}`
            )
        }

        if (subArgs.toLowerCase() === 'all') {
            conn.storeDelConfirmation = conn.storeDelConfirmation || {}
            conn.storeDelConfirmation[m.chat] = {
                sender: m.sender,
                timeout: setTimeout(() => {
                    if (conn.storeDelConfirmation?.[m.chat]) {
                        delete conn.storeDelConfirmation[m.chat]
                        conn.sendMessage(m.chat, { text: '*Waktu konfirmasi hapus habis. Dibatalkan.*' })
                    }
                }, 60000)
            }
            return m.reply(
                `*PERINGATAN KONFIRMASI HAPUS SEMUA*\n\n` +
                `Kamu akan menghapus *SEMUA (${allItems.length})* item store.\n` +
                `Tindakan ini tidak bisa dibatalkan!\n\n` +
                `Balas pesan ini dengan:\n` +
                `*Y* — Lanjut hapus semua\n` +
                `*N* — Batalkan`
            )
        }

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            const q = subArgs.trim().toLowerCase()
            target = allItems.find(i => i.key.toLowerCase() === q)
        }

        if (!target) return m.reply(`*Item "${subArgs}" tidak ditemukan di database.*`)

        delete data.store[target.key]
        saveStore(data)

        return conn.sendMessage(m.chat, {
            text: `*BERHASIL DIHAPUS *\n\nItem *${target.key}* berhasil dihapus dari database store.`,
            contextInfo: {
                externalAdReply: {
                    title: `ITEM BERHASIL DIHAPUS`,
                    body: `Nama Item: ${target.key}`,
                    thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })
    }

    // ── SUBCOMMAND: RENAME ───────────────────────────────────────────────────
    if (sub === 'rename') {
        if (!isCallerOwner) return m.reply('*AKSES DITOLAK*\nHanya Owner yang dapat mengubah item store.')

        if (!subArgs || !subArgs.includes('|')) {
            return m.reply(
                `*GANTI NAMA ITEM STORE*\n\n` +
                `Format: \`${usedPrefix}store rename <nama/nomor lama> | <nama baru>\`\n\n` +
                `*Contoh:*\n` +
                `\`${usedPrefix}store rename Selesai Nonton | List Anime Tamat\``
            )
        }

        const [targetInput, ...newParts] = subArgs.split('|')
        const targetClean = targetInput.trim()
        const newNameClean = newParts.join('|').trim()

        if (!newNameClean) return m.reply('*Nama baru tidak boleh kosong.*')

        let target = null
        if (!isNaN(targetClean)) {
            const num = parseInt(targetClean) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === targetClean.toLowerCase())
        }

        if (!target) return m.reply(`*Item "${targetClean}" tidak ditemukan.*`)

        if (data.store[newNameClean] && newNameClean.toLowerCase() !== target.key.toLowerCase()) {
            return m.reply(`*Nama "${newNameClean}" sudah dipakai di store.*`)
        }

        const oldData = data.store[target.key]
        oldData.updatedAt = Date.now()

        delete data.store[target.key]
        data.store[newNameClean] = oldData
        saveStore(data)

        return m.reply(
            `*NAMA BERHASIL DIUBAH *\n\n` +
            `• *Nama Lama:* ${target.key}\n` +
            `• *Nama Baru:* ${newNameClean}`
        )
    }

    // ── SUBCOMMAND: UPDATE (Direct Content Update) ───────────────────────────
    if (sub === 'update') {
        if (!isCallerOwner) return m.reply('*AKSES DITOLAK*\nHanya Owner yang dapat mengubah item store.')

        if (!m.quoted) {
            return m.reply(`*Reply pesan/media baru* lalu ketik:\n\`${usedPrefix}store update <nama/nomor>\``)
        }

        if (!subArgs) return m.reply(`Sebutkan nama atau nomor itemnya: \`${usedPrefix}store update <nama/nomor>\``)

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === subArgs.trim().toLowerCase())
        }

        if (!target) return m.reply(`*Item "${subArgs}" tidak ditemukan.*`)

        const q = m.quoted
        const isMedia = q.mediaMessage || q.isMedia || ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(q.mtype)
        let newData = {}
        const now = Date.now()

        if (isMedia) {
            newData = {
                mtype       : q.mtype,
                mediaMessage: q.mediaMessage || q.msg || q.message,
                text        : q.text || q.caption || '',
                createdAt   : target.data?.createdAt || now,
                updatedAt   : now,
                addedBy     : m.sender.replace(/[^0-9]/g, ''),
                key         : {
                    remoteJid  : m.chat,
                    fromMe     : false,
                    id         : q.id || q.key?.id,
                    participant: q.sender
                }
            }
        } else {
            const textVal = q.text || q.body || ''
            newData = {
                mtype       : 'conversation',
                text        : textVal,
                mediaMessage: { conversation: textVal },
                createdAt   : target.data?.createdAt || now,
                updatedAt   : now,
                addedBy     : m.sender.replace(/[^0-9]/g, '')
            }
        }

        data.store[target.key] = newData
        saveStore(data)

        return m.reply(
            `*KONTEN BERHASIL DIUPDATE *\n\n` +
            `• *Item:* ${target.key}\n` +
            `• *Tipe Baru:* ${getMediaTypeLabel(newData)}\n` +
            `• *Waktu Update:* ${new Date().toLocaleTimeString('id-ID')}`
        )
    }

    // ── SUBCOMMAND: EDIT (Interactive) ───────────────────────────────────────
    if (sub === 'edit') {
        if (!isCallerOwner) return m.reply('*AKSES DITOLAK*\nHanya Owner yang dapat mengedit item store.')

        if (allItems.length === 0) return m.reply('*Belum ada item store yang tersimpan.*')

        if (!subArgs) {
            const rows = allItems.map((item) => ({
                header     : `No. ${item.index + 1} [${getMediaTypeLabel(item.data)}]`,
                title      : item.key,
                description: `Pilih untuk mengedit item ini`,
                id         : `storeedit_select_${item.index}`
            }))

            return conn.sendButton(m.chat, {
                header : 'EDIT ITEM STORE',
                body   :
                    `Pilih item yang ingin diedit dari daftar di bawah.\n\n` +
                    `_Atau ketik langsung: \`${usedPrefix}store edit <nomor/nama>\`_`,
                footer : `Total: ${allItems.length} item`,
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'PILIH ITEM',
                        sections: [{ title: `Daftar Item (${allItems.length})`, rows }]
                    })
                }]
            }, { quoted: m })
        }

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === subArgs.trim().toLowerCase())
        }

        if (!target) return m.reply(`*Item "${subArgs}" tidak ditemukan.*`)

        return askEditOptions(m, conn, target, usedPrefix)
    }

    // ── SUBCOMMAND: SEARCH / CARI ────────────────────────────────────────────
    if (sub === 'search') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix}store search <kata kunci>\``)

        const query = subArgs.trim().toLowerCase()
        const results = allItems.filter(item => {
            const keyMatch = item.key.toLowerCase().includes(query)
            const textMatch = typeof item.data === 'string'
                ? item.data.toLowerCase().includes(query)
                : (item.data?.text || '').toLowerCase().includes(query)
            return keyMatch || textMatch
        })

        if (results.length === 0) {
            return m.reply(`*Tidak ditemukan item dengan kata kunci:* "${subArgs}"`)
        }

        const list = results.map((item) => `*${item.index + 1}.* ${item.key} _[${getMediaTypeLabel(item.data)}]_`).join('\n')

        return m.reply(
            `*HASIL PENCARIAN STORE*\n` +
            `Kata kunci: *"${subArgs}"*\n` +
            `Ditemukan: *${results.length} item*\n\n` +
            `${list}\n\n` +
            `_Ketik \`${usedPrefix}store <nomor>\` untuk membuka item._`
        )
    }

    // ── SUBCOMMAND: INFO / DETAIL ────────────────────────────────────────────
    if (sub === 'info') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix}store info <nomor/nama>\``)

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === subArgs.trim().toLowerCase())
        }

        if (!target) return m.reply(`*Item "${subArgs}" tidak ditemukan.*`)

        const it = target.data
        const createdDate = it?.createdAt ? new Date(it.createdAt).toLocaleString('id-ID') : '-'
        const updatedDate = it?.updatedAt ? new Date(it.updatedAt).toLocaleString('id-ID') : '-'
        const typeLabel = getMediaTypeLabel(it)
        const charCount = typeof it === 'string' ? it.length : (it?.text?.length || 0)

        return m.reply(
            `📊 *DETAIL ITEM STORE*\n\n` +
            `• *Nama:* ${target.key}\n` +
            `• *Nomor Index:* #${target.index + 1}\n` +
            `• *Tipe Konten:* ${typeLabel} (${it?.mtype || 'text'})\n` +
            `• *Panjang Teks:* ${charCount} karakter\n` +
            `• *Dibuat Oleh:* +${it?.addedBy || 'Owner'}\n` +
            `• *Tanggal Dibuat:* ${createdDate}\n` +
            `• *Terakhir Diupdate:* ${updatedDate}`
        )
    }

    // ── SUBCOMMAND: STATS ────────────────────────────────────────────────────
    if (sub === 'stats') {
        const storeCount = Object.keys(data.store).length
        let sizeKB = 0
        try {
            if (fs.existsSync(dbPath)) {
                sizeKB = (fs.statSync(dbPath).size / 1024).toFixed(2)
            }
        } catch {}

        let mediaCounts = { Teks: 0, Gambar: 0, Video: 0, Audio: 0, Stiker: 0, Dokumen: 0 }
        for (const item of Object.values(data.store)) {
            const lbl = getMediaTypeLabel(item)
            if (mediaCounts[lbl] !== undefined) mediaCounts[lbl]++
        }

        return m.reply(
            `📈 *STATISTIK JOY STORE*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `📦 *Total Item Store:* ${storeCount}\n` +
            `🗄️ *Ukuran Database:* ${sizeKB} KB\n\n` +
            `*Rincian Media:*\n` +
            `• Teks: ${mediaCounts.Teks}\n` +
            `• Gambar: ${mediaCounts.Gambar}\n` +
            `• 🎬 Video: ${mediaCounts.Video}\n` +
            `• 🎵 Audio: ${mediaCounts.Audio}\n` +
            `• 🏷️ Stiker: ${mediaCounts.Stiker}\n` +
            `• 📄 Dokumen: ${mediaCounts.Dokumen}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── SUBCOMMAND: BACKUP ───────────────────────────────────────────────────
    if (sub === 'backup') {
        if (!isCallerOwner) return m.reply('*Hanya Owner yang dapat mengunduh backup database.*')
        if (!fs.existsSync(dbPath)) return m.reply('*Database store kosong.*')

        const buffer = fs.readFileSync(dbPath)
        return conn.sendMessage(m.chat, {
            document: buffer,
            mimetype: 'application/json',
            fileName: `store-backup-${Date.now()}.json`,
            caption : `📦 *BACKUP DATABASE STORE*\n\nTanggal: ${new Date().toLocaleString('id-ID')}`
        }, { quoted: m })
    }

    // ── SUBCOMMAND: LIST (Default Catalog Menu) ──────────────────────────────
    if (sub === 'list') {
        if (allItems.length === 0) {
            return m.reply(
                `*📦 JOY STORE KOSONG*\n\n` +
                `Belum ada item yang disimpan di database.\n\n` +
                `${isCallerOwner ? `*Tambah item:* Reply pesan lalu ketik \`${usedPrefix}store add <nama>\`` : '_Silakan hubungi owner untuk menambahkan item store._'}`
            )
        }

        const sections = [{
            title: `📦 Store Items (${allItems.length})`,
            rows: allItems.map(it => ({
                header     : `No. ${it.index + 1} [${getMediaTypeLabel(it.data)}]`,
                title      : it.key,
                description: `Pilih untuk melihat isi item`,
                id         : `storeselect_${it.index}`
            }))
        }]

        let textList = `*📦 DAFTAR STORE ITEM:*\n` +
            allItems.map(it => `  *${it.index + 1}.* ${it.key} _[${getMediaTypeLabel(it.data)}]_`).join('\n')

        const helpGuide =
            `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Akses Cepat:* Ketik \`${usedPrefix}store <nomor>\`\n` +
            `*Cari Item:* \`${usedPrefix}store search <kata>\`\n` +
            (isCallerOwner ? `*Tambah:* \`${usedPrefix}store add <nama>\`\n*Hapus:* \`${usedPrefix}store del <nomor>\`\n*Edit:* \`${usedPrefix}store edit <nomor>\`` : '')

        try {
            await conn.sendButton(m.chat, {
                header : '📦 JOY STORE CATALOG',
                body   :
                    `Tersedia *${allItems.length} item* tersimpan di Joy Store.\n\n` +
                    `${textList}` +
                    `${helpGuide}`,
                footer : `Total: ${allItems.length} item`,
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'PILIH ITEM STORE',
                        sections: sections
                    })
                }]
            }, { quoted: m })
        } catch (e) {
            return m.reply(
                `📦 *JOY STORE CATALOG*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `${textList}` +
                `${helpGuide}`
            )
        }
    }
}

// ── Interactive Edit Prompts ─────────────────────────────────────────────────
async function askEditOptions(m, conn, target, usedPrefix) {
    try {
        await conn.sendButton(m.chat, {
            header : 'EDIT ITEM STORE',
            body   :
                `Item yang dipilih:\n*${target.key}* _[${getMediaTypeLabel(target.data)}]_\n\n` +
                `Pilih opsi yang ingin diubah:\n` +
                `1. *Ganti Judul / Nama* — ubah label item\n` +
                `2. *Ganti Konten / Media* — ubah teks atau media via reply\n\n` +
                `_Atau gunakan: \`${usedPrefix}store rename ${target.index + 1} | <nama baru>\`_`,
            footer : 'Joy Store Editor',
            buttons: [{
                name            : 'single_select',
                buttonParamsJson: JSON.stringify({
                    title   : 'PILIH TINDAKAN EDIT',
                    sections: [{
                        title: 'Opsi Edit',
                        rows : [
                            {
                                header     : 'Ubah Nama',
                                title      : 'Ganti Judul / Nama Item',
                                description: `Ubah nama "${target.key}"`,
                                id         : `storeedit_title_${target.index}`
                            },
                            {
                                header     : 'Ubah Isi',
                                title      : 'Ganti Konten / Media Item',
                                description: 'Ganti teks atau media item',
                                id         : `storeedit_content_${target.index}`
                            }
                        ]
                    }]
                })
            }]
        }, { quoted: m })
    } catch {
        return m.reply(
            `*EDIT ITEM STORE*\n\n` +
            `Item: *${target.key}*\n\n` +
            `Pilihan edit cepat:\n` +
            `• Ganti nama: \`${usedPrefix}store rename ${target.index + 1} | <nama baru>\`\n` +
            `• Ganti konten: Reply media/teks baru lalu ketik \`${usedPrefix}store update ${target.index + 1}\``
        )
    }
}

// ── Before Handler (Button Click & Sesi Input) ───────────────────────────────
handler.before = async (m, { conn, usedPrefix }) => {
    conn.storeEditSession = conn.storeEditSession || new Map()
    conn.storeDelConfirmation = conn.storeDelConfirmation || {}

    // 1. Handle Selection from list button: storeselect_<index>
    if (m.text?.startsWith('storeselect_')) {
        const data = loadStore()
        const allItems = getFlattenedItems(data)
        const index = parseInt(m.text.replace('storeselect_', ''))

        if (isNaN(index) || index < 0 || index >= allItems.length) return false
        const item = allItems[index]
        if (!item) return false

        try {
            await sendStoreItem(m, conn, item.data, item.key)
        } catch (e) {
            console.error('[STORE SELECT ERROR]', e)
            await m.reply(`Gagal menampilkan item: ${e.message}`)
        }
        return true
    }

    // 2. Handle Edit selection from button: storeedit_select_<index>
    if (m.text?.startsWith('storeedit_select_')) {
        const isCallerOwner = checkIsOwner(m, false, false)
        if (!isCallerOwner) return false
        const data = loadStore()
        const allItems = getFlattenedItems(data)
        const index = parseInt(m.text.replace('storeedit_select_', ''))

        if (isNaN(index) || index < 0 || index >= allItems.length) return false
        const target = allItems[index]
        if (!target) return false

        await askEditOptions(m, conn, target, usedPrefix || '.')
        return true
    }

    // 3. Handle Edit action button: storeedit_title_<index> / storeedit_content_<index>
    if (m.text?.startsWith('storeedit_title_') || m.text?.startsWith('storeedit_content_')) {
        const isCallerOwner = checkIsOwner(m, false, false)
        if (!isCallerOwner) return false

        const isTitle = m.text.startsWith('storeedit_title_')
        const indexStr = m.text.replace(isTitle ? 'storeedit_title_' : 'storeedit_content_', '')
        const index = parseInt(indexStr)

        const data = loadStore()
        const allItems = getFlattenedItems(data)
        const target = allItems[index]

        if (!target) return false

        if (isTitle) {
            conn.storeEditSession.set(m.sender, {
                type    : 'title',
                oldKey  : target.key,
                timeout : setTimeout(() => conn.storeEditSession.delete(m.sender), 60000)
            })

            await conn.sendMessage(m.chat, {
                text:
                    `*EDIT JUDUL ITEM*\n\n` +
                    `Item: *${target.key}*\n\n` +
                    `Silakan ketik nama/judul baru untuk item ini.\n\n` +
                    `_Sesi aktif selama 60 detik. Balas langsung pesan ini._`
            }, { quoted: m })
            return true
        } else {
            conn.storeEditSession.set(m.sender, {
                type    : 'content',
                oldKey  : target.key,
                timeout : setTimeout(() => conn.storeEditSession.delete(m.sender), 60000)
            })

            await conn.sendMessage(m.chat, {
                text:
                    `*EDIT KONTEN / MEDIA*\n\n` +
                    `Item: *${target.key}*\n\n` +
                    `Silakan reply pesan ini dengan konten baru.\n` +
                    `Bisa berupa teks, gambar, video, audio, atau stiker.\n\n` +
                    `_Sesi aktif selama 60 detik._`
            }, { quoted: m })
            return true
        }
    }

    // 4. Handle Delete All Confirmation (Y/N)
    if (conn.storeDelConfirmation?.[m.chat]) {
        const session = conn.storeDelConfirmation[m.chat]
        if (m.sender === session.sender) {
            const replyText = (m.text || '').trim().toLowerCase()
            if (replyText === 'y' || replyText === 'ya' || replyText === 'yes') {
                clearTimeout(session.timeout)
                delete conn.storeDelConfirmation[m.chat]

                const emptyData = { store: {} }
                saveStore(emptyData)

                await m.reply('*SEMUA ITEM STORE BERHASIL DIHAPUS*\n\nDatabase store kini sudah bersih.')
                return true
            } else if (replyText === 'n' || replyText === 'no' || replyText === 'batal' || replyText === 'tidak') {
                clearTimeout(session.timeout)
                delete conn.storeDelConfirmation[m.chat]

                await m.reply('*Penghapusan seluruh item store dibatalkan.*')
                return true
            }
        }
    }

    // 5. Handle Active Edit Session
    const editSession = conn.storeEditSession.get(m.sender)
    if (editSession) {
        clearTimeout(editSession.timeout)
        conn.storeEditSession.delete(m.sender)

        const data = loadStore()
        const { type, oldKey } = editSession

        if (!data.store?.[oldKey]) {
            await m.reply(`*Item "${oldKey}" sudah tidak ada di database.*`)
            return true
        }

        if (type === 'title') {
            const newTitle = (m.text || '').trim()
            if (!newTitle) {
                await m.reply('*Nama baru tidak boleh kosong. Edit dibatalkan.*')
                return true
            }

            if (data.store?.[newTitle] && newTitle.toLowerCase() !== oldKey.toLowerCase()) {
                await m.reply(`*Nama "${newTitle}" sudah ada di store. Edit dibatalkan.*`)
                return true
            }

            const itemData = data.store[oldKey]
            itemData.updatedAt = Date.now()

            delete data.store[oldKey]
            data.store[newTitle] = itemData
            saveStore(data)

            await m.reply(
                `*JUDUL BERHASIL DIUBAH *\n\n` +
                `• *Nama Lama:* ${oldKey}\n` +
                `• *Nama Baru:* ${newTitle}`
            )
            return true
        }

        if (type === 'content') {
            const q = m.quoted ? m.quoted : m
            const isMedia = q.mediaMessage || q.isMedia || ['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(q.mtype)
            let newData = {}
            const now = Date.now()

            if (isMedia) {
                newData = {
                    mtype       : q.mtype,
                    mediaMessage: q.mediaMessage || q.msg || q.message,
                    text        : q.text || q.caption || '',
                    createdAt   : data.store[oldKey].createdAt || now,
                    updatedAt   : now,
                    addedBy     : m.sender.replace(/[^0-9]/g, ''),
                    key         : {
                        remoteJid  : m.chat,
                        fromMe     : false,
                        id         : q.id || q.key?.id,
                        participant: q.sender
                    }
                }
            } else {
                const textVal = q.text || q.body || m.text || ''
                if (!textVal) {
                    await m.reply('*Konten tidak boleh kosong. Edit dibatalkan.*')
                    return true
                }
                newData = {
                    mtype       : 'conversation',
                    text        : textVal,
                    mediaMessage: { conversation: textVal },
                    createdAt   : data.store[oldKey].createdAt || now,
                    updatedAt   : now,
                    addedBy     : m.sender.replace(/[^0-9]/g, '')
                }
            }

            data.store[oldKey] = newData
            saveStore(data)

            await m.reply(
                `*KONTEN BERHASIL DIUPDATE *\n\n` +
                `• *Item:* ${oldKey}\n` +
                `• *Tipe:* ${getMediaTypeLabel(newData)}\n` +
                `• *Waktu Update:* ${new Date().toLocaleTimeString('id-ID')}`
            )
            return true
        }
    }

    return false
}

handler.help = ['store *add/del/list*']
handler.tags    = ['store']
handler.command = /^(store|list|liststore|addlist|dellist|editlist)$/i

export default handler
