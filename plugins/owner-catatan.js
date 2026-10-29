/*
- @Author     : Rafli
- @Feature    : Catatan Owner (Dedicated Private Notes)
- @Description: Fitur manajemen catatan pribadi khusus Owner bot (.catatan <add|del|edit|get|list|search|rename|update|info|stats|backup>) terpisah penuh dari sistem store.
*/

import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'catatan.json')
const storeDbPath = path.join(process.cwd(), 'data', 'store.json')

// ── Database Helper ──────────────────────────────────────────────────────────
function loadCatatan() {
    if (!fs.existsSync(dbPath)) {
        let initialData = {}
        // Migrasi dari store.json jika ada
        try {
            if (fs.existsSync(storeDbPath)) {
                const storeRaw = JSON.parse(fs.readFileSync(storeDbPath, 'utf8'))
                if (storeRaw.catatan && Object.keys(storeRaw.catatan).length > 0) {
                    initialData = storeRaw.catatan
                    delete storeRaw.catatan
                    fs.writeFileSync(storeDbPath, JSON.stringify(storeRaw, null, 2))
                }
            }
        } catch {}

        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2))
        return initialData
    }

    try {
        const raw = fs.readFileSync(dbPath, 'utf8')
        const parsed = JSON.parse(raw)
        return typeof parsed === 'object' && parsed !== null ? parsed : {}
    } catch (e) {
        console.error('[CATATAN LOAD ERROR]', e)
        return {}
    }
}

function saveCatatan(data) {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
    } catch (e) {
        console.error('[CATATAN SAVE ERROR]', e)
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

function getFlattenedCatatan(data) {
    const list = []
    let index = 0
    for (const [key, val] of Object.entries(data)) {
        list.push({ index: index++, key, data: val })
    }
    return list
}

// ── Sender Helper ────────────────────────────────────────────────────────────
async function sendCatatanItem(m, conn, item, keyName) {
    if (!item) return m.reply('*Catatan tidak ditemukan di database.*')

    if (typeof item === 'string') {
        return conn.fakeReply(m.chat, item, '0@s.whatsapp.net', `Catatan Owner: ${keyName}`, 'status@broadcast')
    }

    const isText = !item.mediaMessage ||
                   item.mtype === 'conversation' ||
                   item.mtype === 'extendedTextMessage'

    if (isText) {
        const textContent = item.text ||
            item.mediaMessage?.extendedTextMessage?.text ||
            item.mediaMessage?.conversation ||
            item.message?.conversation || ''
        return conn.fakeReply(m.chat, textContent, '0@s.whatsapp.net', `Catatan Owner: ${keyName}`, 'status@broadcast')
    }

    let msgContent = item.mediaMessage || item.message
    if (!msgContent) {
        if (item.text) return m.reply(item.text)
        return m.reply('*Data media catatan tidak tersedia.*')
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
            msgContent[type].caption = `*CATATAN OWNER*\nJudul: *${keyName}*\nTanggal: ${new Date().toLocaleDateString('id-ID')}`
        }
    }

    msgContent[type].contextInfo = {
        ...(msgContent[type].contextInfo || {}),
        quotedMessage: { conversation: `Catatan Owner • ${keyName}` },
        participant  : '0@s.whatsapp.net',
        stanzaId     : 'FAKE_' + Date.now(),
        remoteJid    : 'status@broadcast'
    }

    try {
        await conn.relayMessage(m.chat, msgContent, {
            messageId: (Math.random() + 1).toString(36).substring(7)
        })
    } catch (e) {
        console.error('[CATATAN SEND RELAY ERROR]', e)
        if (item.text) await m.reply(item.text)
        else await m.reply(`*Gagal mengirim media:* ${e.message}`)
    }
}

// ── Main Handler ─────────────────────────────────────────────────────────────
let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    const isCallerOwner = checkIsOwner(m, isOwner, isROwner)
    if (!isCallerOwner) {
        return m.reply('*AKSES DITOLAK*\nFitur Catatan bersifat rahasia dan hanya dapat diakses oleh Owner bot.')
    }

    const data = loadCatatan()
    const allItems = getFlattenedCatatan(data)

    const parts = (text || '').trim().split(/\s+/)
    const first = parts[0]?.toLowerCase() || ''
    let sub = ''
    let subArgs = ''

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
    } else if (['get', 'lihat', 'ambil', 'buka', 'cek'].includes(first)) {
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

    // ── SUBCOMMAND: ADD ──────────────────────────────────────────────────────
    if (sub === 'add') {
        if (!subArgs && !m.quoted) {
            return m.reply(
                `*CARA MENAMBAH CATATAN OWNER*\n\n` +
                `1. *Via Reply Pesan / Media (Gambar/Video/Audio/Stiker/Dokumen):*\n` +
                `   Reply pesan lalu ketik:\n` +
                `   \`${usedPrefix + command} add <nama_catatan>\`\n` +
                `   _(Opsi caption kustom: \`${usedPrefix + command} add <nama> | <caption kustom>\`)_\n\n` +
                `2. *Via Teks Langsung:*\n` +
                `   \`${usedPrefix + command} add <nama_catatan> | <isi teks>\``
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

        if (!keyName) return m.reply(`*NAMA CATATAN KOSONG*\nContoh: \`${usedPrefix + command} add Akun Server\``)

        if (data[keyName]) {
            return m.reply(
                `*NAMA SUDAH DIGUNAKAN*\n\n` +
                `Catatan dengan nama *${keyName}* sudah ada.\n` +
                `Gunakan \`${usedPrefix + command} edit ${keyName}\` untuk mengubah atau hapus dengan \`${usedPrefix + command} del ${keyName}\`.`
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
                    `Format: \`${usedPrefix + command} add ${keyName} | isi teks catatan\``
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

        data[keyName] = dataToSave
        saveCatatan(data)

        const typeLabel = getMediaTypeLabel(dataToSave)
        return conn.sendMessage(m.chat, {
            text:
                `*CATATAN BERHASIL DISIMPAN *\n\n` +
                `• *Judul:* ${keyName}\n` +
                `• *Tipe:* ${typeLabel}\n` +
                `• *Panjang/Media:* ${dataToSave.text ? `${dataToSave.text.length} karakter` : 'File Media'}\n\n` +
                `Buka catatan dengan \`${usedPrefix + command} get ${keyName}\` atau \`${usedPrefix + command} list\`.`,
            contextInfo: {
                externalAdReply: {
                    title: `CATATAN DISIMPAN`,
                    body: `${keyName} (${typeLabel})`,
                    thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })
    }

    // ── SUBCOMMAND: GET ──────────────────────────────────────────────────────
    if (sub === 'get') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix + command} get <nomor/nama>\``)

        const query = subArgs.trim()

        if (!isNaN(query)) {
            const num = parseInt(query) - 1
            if (num < 0 || num >= allItems.length) {
                return m.reply(`Nomor tidak valid. Gunakan nomor 1 sampai ${allItems.length}.`)
            }
            const target = allItems[num]
            return sendCatatanItem(m, conn, target.data, target.key)
        }

        const cleanQuery = query.toLowerCase()
        let matched = allItems.find(i => i.key.toLowerCase() === cleanQuery)
        if (!matched) matched = allItems.find(i => i.key.toLowerCase().includes(cleanQuery))

        if (!matched) {
            return m.reply(
                `*Catatan "${query}" tidak ditemukan.*\n\n` +
                `Ketik \`${usedPrefix + command} list\` untuk melihat daftar catatan.`
            )
        }

        return sendCatatanItem(m, conn, matched.data, matched.key)
    }

    // ── SUBCOMMAND: DELETE ───────────────────────────────────────────────────
    if (sub === 'del') {
        if (!subArgs) {
            if (allItems.length === 0) return m.reply('*Belum ada catatan untuk dihapus.*')
            const listStr = allItems.map((it, i) => `${i + 1}. ${it.key} _[${getMediaTypeLabel(it.data)}]_`).join('\n')
            return m.reply(
                `*HAPUS CATATAN OWNER*\n\n` +
                `Pilihan:\n` +
                `• \`${usedPrefix + command} del <nomor/nama>\`\n` +
                `• \`${usedPrefix + command} del all\` _(Hapus semua)_\n\n` +
                `*Daftar Catatan:*\n${listStr}`
            )
        }

        if (subArgs.toLowerCase() === 'all') {
            conn.catatanDelConfirmation = conn.catatanDelConfirmation || {}
            conn.catatanDelConfirmation[m.chat] = {
                sender: m.sender,
                timeout: setTimeout(() => {
                    if (conn.catatanDelConfirmation?.[m.chat]) {
                        delete conn.catatanDelConfirmation[m.chat]
                        conn.sendMessage(m.chat, { text: '*Waktu konfirmasi hapus habis. Dibatalkan.*' })
                    }
                }, 60000)
            }
            return m.reply(
                `*PERINGATAN HAPUS SEMUA CATATAN*\n\n` +
                `Kamu akan menghapus *SEMUA (${allItems.length})* catatan owner.\n` +
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

        if (!target) return m.reply(`*Catatan "${subArgs}" tidak ditemukan.*`)

        delete data[target.key]
        saveCatatan(data)

        return conn.sendMessage(m.chat, {
            text: `*BERHASIL DIHAPUS *\n\nCatatan *${target.key}* berhasil dihapus dari database.`,
            contextInfo: {
                externalAdReply: {
                    title: `CATATAN DIHAPUS`,
                    body: `Judul: ${target.key}`,
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
        if (!subArgs || !subArgs.includes('|')) {
            return m.reply(
                `*GANTI JUDUL CATATAN*\n\n` +
                `Format: \`${usedPrefix + command} rename <nama/nomor lama> | <nama baru>\`\n\n` +
                `*Contoh:*\n` +
                `\`${usedPrefix + command} rename Catatan Lama | Catatan Baru\``
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

        if (!target) return m.reply(`*Catatan "${targetClean}" tidak ditemukan.*`)

        if (data[newNameClean] && newNameClean.toLowerCase() !== target.key.toLowerCase()) {
            return m.reply(`*Nama "${newNameClean}" sudah dipakai.*`)
        }

        const oldData = data[target.key]
        oldData.updatedAt = Date.now()

        delete data[target.key]
        data[newNameClean] = oldData
        saveCatatan(data)

        return m.reply(
            `*JUDUL BERHASIL DIUBAH *\n\n` +
            `• *Judul Lama:* ${target.key}\n` +
            `• *Judul Baru:* ${newNameClean}`
        )
    }

    // ── SUBCOMMAND: UPDATE ───────────────────────────────────────────────────
    if (sub === 'update') {
        if (!m.quoted) {
            return m.reply(`*Reply pesan/media baru* lalu ketik:\n\`${usedPrefix + command} update <nama/nomor>\``)
        }

        if (!subArgs) return m.reply(`Sebutkan nama atau nomor catatannya: \`${usedPrefix + command} update <nama/nomor>\``)

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === subArgs.trim().toLowerCase())
        }

        if (!target) return m.reply(`*Catatan "${subArgs}" tidak ditemukan.*`)

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

        data[target.key] = newData
        saveCatatan(data)

        return m.reply(
            `*KONTEN CATATAN DIUPDATE *\n\n` +
            `• *Judul:* ${target.key}\n` +
            `• *Tipe Baru:* ${getMediaTypeLabel(newData)}\n` +
            `• *Waktu Update:* ${new Date().toLocaleTimeString('id-ID')}`
        )
    }

    // ── SUBCOMMAND: EDIT ─────────────────────────────────────────────────────
    if (sub === 'edit') {
        if (allItems.length === 0) return m.reply('*Belum ada catatan yang tersimpan.*')

        if (!subArgs) {
            const rows = allItems.map((item) => ({
                header     : `No. ${item.index + 1} [${getMediaTypeLabel(item.data)}]`,
                title      : item.key,
                description: `Pilih untuk mengedit catatan ini`,
                id         : `catatanedit_select_${item.index}`
            }))

            return conn.sendButton(m.chat, {
                header : 'EDIT CATATAN OWNER',
                body   :
                    `Pilih catatan yang ingin diedit dari daftar di bawah.\n\n` +
                    `_Atau ketik langsung: \`${usedPrefix + command} edit <nomor/nama>\`_`,
                footer : `Total: ${allItems.length} catatan`,
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'PILIH CATATAN',
                        sections: [{ title: `Daftar Catatan (${allItems.length})`, rows }]
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

        if (!target) return m.reply(`*Catatan "${subArgs}" tidak ditemukan.*`)

        return askCatatanEditOptions(m, conn, target, usedPrefix, command)
    }

    // ── SUBCOMMAND: SEARCH ───────────────────────────────────────────────────
    if (sub === 'search') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix + command} search <kata kunci>\``)

        const query = subArgs.trim().toLowerCase()
        const results = allItems.filter(item => {
            const keyMatch = item.key.toLowerCase().includes(query)
            const textMatch = typeof item.data === 'string'
                ? item.data.toLowerCase().includes(query)
                : (item.data?.text || '').toLowerCase().includes(query)
            return keyMatch || textMatch
        })

        if (results.length === 0) {
            return m.reply(`*Tidak ditemukan catatan dengan kata kunci:* "${subArgs}"`)
        }

        const list = results.map((item) => `*${item.index + 1}.* ${item.key} _[${getMediaTypeLabel(item.data)}]_`).join('\n')
        return m.reply(
            `*HASIL PENCARIAN CATATAN*\n` +
            `Kata kunci: *"${subArgs}"*\n` +
            `Ditemukan: *${results.length} catatan*\n\n` +
            `${list}\n\n` +
            `_Ketik \`${usedPrefix + command} <nomor>\` untuk membuka catatan._`
        )
    }

    // ── SUBCOMMAND: INFO ─────────────────────────────────────────────────────
    if (sub === 'info') {
        if (!subArgs) return m.reply(`Format: \`${usedPrefix + command} info <nomor/nama>\``)

        let target = null
        if (!isNaN(subArgs.trim())) {
            const num = parseInt(subArgs.trim()) - 1
            if (num >= 0 && num < allItems.length) target = allItems[num]
        } else {
            target = allItems.find(i => i.key.toLowerCase() === subArgs.trim().toLowerCase())
        }

        if (!target) return m.reply(`*Catatan "${subArgs}" tidak ditemukan.*`)

        const it = target.data
        const createdDate = it?.createdAt ? new Date(it.createdAt).toLocaleString('id-ID') : '-'
        const updatedDate = it?.updatedAt ? new Date(it.updatedAt).toLocaleString('id-ID') : '-'
        const typeLabel = getMediaTypeLabel(it)
        const charCount = typeof it === 'string' ? it.length : (it?.text?.length || 0)

        return m.reply(
            `📊 *DETAIL CATATAN OWNER*\n\n` +
            `• *Judul:* ${target.key}\n` +
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
        let sizeKB = 0
        try {
            if (fs.existsSync(dbPath)) sizeKB = (fs.statSync(dbPath).size / 1024).toFixed(2)
        } catch {}

        let mediaCounts = { Teks: 0, Gambar: 0, Video: 0, Audio: 0, Stiker: 0, Dokumen: 0 }
        for (const item of Object.values(data)) {
            const lbl = getMediaTypeLabel(item)
            if (mediaCounts[lbl] !== undefined) mediaCounts[lbl]++
        }

        return m.reply(
            `📈 *STATISTIK CATATAN OWNER*\n━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*Total Catatan:* ${allItems.length}\n` +
            `🗄️ *Ukuran File:* ${sizeKB} KB\n\n` +
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
        if (!fs.existsSync(dbPath)) return m.reply('*Database catatan kosong.*')
        const buffer = fs.readFileSync(dbPath)
        return conn.sendMessage(m.chat, {
            document: buffer,
            mimetype: 'application/json',
            fileName: `catatan-owner-backup-${Date.now()}.json`,
            caption : `*BACKUP CATATAN OWNER*\n\nTanggal: ${new Date().toLocaleString('id-ID')}`
        }, { quoted: m })
    }

    // ── SUBCOMMAND: LIST (Default Catalog Menu) ──────────────────────────────
    if (sub === 'list') {
        if (allItems.length === 0) {
            return m.reply(
                `*CATATAN OWNER KOSONG*\n\n` +
                `Belum ada catatan yang tersimpan.\n\n` +
                `*Tambah Catatan:* Reply pesan/media lalu ketik \`${usedPrefix + command} add <nama>\`\n` +
                `Atau teks langsung: \`${usedPrefix + command} add <nama> | <isi teks>\``
            )
        }

        const sections = [{
            title: `Catatan Owner (${allItems.length})`,
            rows: allItems.map(it => ({
                header     : `No. ${it.index + 1} [${getMediaTypeLabel(it.data)}]`,
                title      : it.key,
                description: `Pilih untuk melihat isi catatan`,
                id         : `catatanselect_${it.index}`
            }))
        }]

        let textList = allItems.map(it => `  *${it.index + 1}.* ${it.key} _[${getMediaTypeLabel(it.data)}]_`).join('\n')

        const helpGuide =
            `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Akses Cepat:* Ketik \`${usedPrefix + command} <nomor>\`\n` +
            `*Cari Catatan:* \`${usedPrefix + command} search <kata>\`\n` +
            `*Tambah:* \`${usedPrefix + command} add <nama>\`\n` +
            `*Hapus:* \`${usedPrefix + command} del <nomor>\`\n` +
            `*Edit:* \`${usedPrefix + command} edit <nomor>\``

        try {
            await conn.sendButton(m.chat, {
                header : 'DAFTAR CATATAN OWNER',
                body   :
                    `Tersedia *${allItems.length} catatan* tersimpan khusus Owner.\n\n` +
                    `${textList}` +
                    `${helpGuide}`,
                footer : `Total: ${allItems.length} catatan`,
                buttons: [{
                    name            : 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title   : 'PILIH CATATAN',
                        sections: sections
                    })
                }]
            }, { quoted: m })
        } catch {
            return m.reply(
                `*DAFTAR CATATAN OWNER*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `${textList}` +
                `${helpGuide}`
            )
        }
    }
}

// ── Interactive Edit Prompts ─────────────────────────────────────────────────
async function askCatatanEditOptions(m, conn, target, usedPrefix, command) {
    try {
        await conn.sendButton(m.chat, {
            header : 'EDIT CATATAN OWNER',
            body   :
                `Catatan yang dipilih:\n*${target.key}* _[${getMediaTypeLabel(target.data)}]_\n\n` +
                `Pilih tindakan edit:\n` +
                `1. *Ganti Judul Catatan*\n` +
                `2. *Ganti Konten / Media Catatan*\n\n` +
                `_Atau ketik langsung: \`${usedPrefix + command} rename ${target.index + 1} | <nama baru>\`_`,
            footer : 'Catatan Editor',
            buttons: [{
                name            : 'single_select',
                buttonParamsJson: JSON.stringify({
                    title   : 'OPSI EDIT CATATAN',
                    sections: [{
                        title: 'Pilih Tindakan',
                        rows : [
                            {
                                header     : 'Ubah Judul',
                                title      : 'Ganti Judul Catatan',
                                description: `Ubah nama "${target.key}"`,
                                id         : `catatanedit_title_${target.index}`
                            },
                            {
                                header     : 'Ubah Isi',
                                title      : 'Ganti Konten / Media',
                                description: 'Ganti teks atau media catatan',
                                id         : `catatanedit_content_${target.index}`
                            }
                        ]
                    }]
                })
            }]
        }, { quoted: m })
    } catch {
        return m.reply(
            `*EDIT CATATAN OWNER*\n\n` +
            `Catatan: *${target.key}*\n\n` +
            `• Ganti judul: \`${usedPrefix + command} rename ${target.index + 1} | <nama baru>\`\n` +
            `• Ganti konten: Reply media/teks baru lalu ketik \`${usedPrefix + command} update ${target.index + 1}\``
        )
    }
}

// ── Before Handler (Button Click & Sesi Input) ───────────────────────────────
handler.before = async (m, { conn, usedPrefix, command }) => {
    conn.catatanEditSession = conn.catatanEditSession || new Map()
    conn.catatanDelConfirmation = conn.catatanDelConfirmation || {}

    // 1. Handle Selection from list button: catatanselect_<index>
    if (m.text?.startsWith('catatanselect_')) {
        const isCallerOwner = checkIsOwner(m, false, false)
        if (!isCallerOwner) return false

        const data = loadCatatan()
        const allItems = getFlattenedCatatan(data)
        const index = parseInt(m.text.replace('catatanselect_', ''))

        if (isNaN(index) || index < 0 || index >= allItems.length) return false
        const item = allItems[index]
        if (!item) return false

        try {
            await sendCatatanItem(m, conn, item.data, item.key)
        } catch (e) {
            console.error('[CATATAN SELECT ERROR]', e)
            await m.reply(`Gagal menampilkan catatan: ${e.message}`)
        }
        return true
    }

    // 2. Handle Edit selection from button: catatanedit_select_<index>
    if (m.text?.startsWith('catatanedit_select_')) {
        const isCallerOwner = checkIsOwner(m, false, false)
        if (!isCallerOwner) return false

        const data = loadCatatan()
        const allItems = getFlattenedCatatan(data)
        const index = parseInt(m.text.replace('catatanedit_select_', ''))

        if (isNaN(index) || index < 0 || index >= allItems.length) return false
        const target = allItems[index]
        if (!target) return false

        await askCatatanEditOptions(m, conn, target, usedPrefix || '.', command || 'catatan')
        return true
    }

    // 3. Handle Edit action button: catatanedit_title_<index> / catatanedit_content_<index>
    if (m.text?.startsWith('catatanedit_title_') || m.text?.startsWith('catatanedit_content_')) {
        const isCallerOwner = checkIsOwner(m, false, false)
        if (!isCallerOwner) return false

        const isTitle = m.text.startsWith('catatanedit_title_')
        const indexStr = m.text.replace(isTitle ? 'catatanedit_title_' : 'catatanedit_content_', '')
        const index = parseInt(indexStr)

        const data = loadCatatan()
        const allItems = getFlattenedCatatan(data)
        const target = allItems[index]

        if (!target) return false

        if (isTitle) {
            conn.catatanEditSession.set(m.sender, {
                type    : 'title',
                oldKey  : target.key,
                timeout : setTimeout(() => conn.catatanEditSession.delete(m.sender), 60000)
            })

            await conn.sendMessage(m.chat, {
                text:
                    `*EDIT JUDUL CATATAN*\n\n` +
                    `Catatan: *${target.key}*\n\n` +
                    `Silakan ketik judul baru untuk catatan ini.\n\n` +
                    `_Sesi aktif selama 60 detik. Balas langsung pesan ini._`
            }, { quoted: m })
            return true
        } else {
            conn.catatanEditSession.set(m.sender, {
                type    : 'content',
                oldKey  : target.key,
                timeout : setTimeout(() => conn.catatanEditSession.delete(m.sender), 60000)
            })

            await conn.sendMessage(m.chat, {
                text:
                    `*EDIT KONTEN CATATAN*\n\n` +
                    `Catatan: *${target.key}*\n\n` +
                    `Silakan reply pesan ini dengan konten baru.\n` +
                    `Bisa berupa teks, gambar, video, audio, atau stiker.\n\n` +
                    `_Sesi aktif selama 60 detik._`
            }, { quoted: m })
            return true
        }
    }

    // 4. Handle Delete All Confirmation (Y/N)
    if (conn.catatanDelConfirmation?.[m.chat]) {
        const session = conn.catatanDelConfirmation[m.chat]
        if (m.sender === session.sender) {
            const replyText = (m.text || '').trim().toLowerCase()
            if (replyText === 'y' || replyText === 'ya' || replyText === 'yes') {
                clearTimeout(session.timeout)
                delete conn.catatanDelConfirmation[m.chat]

                saveCatatan({})
                await m.reply('*SEMUA CATATAN BERHASIL DIHAPUS*\n\nDatabase catatan owner kini sudah bersih.')
                return true
            } else if (replyText === 'n' || replyText === 'no' || replyText === 'batal' || replyText === 'tidak') {
                clearTimeout(session.timeout)
                delete conn.catatanDelConfirmation[m.chat]

                await m.reply('*Penghapusan seluruh catatan dibatalkan.*')
                return true
            }
        }
    }

    // 5. Handle Active Edit Session
    const editSession = conn.catatanEditSession.get(m.sender)
    if (editSession) {
        clearTimeout(editSession.timeout)
        conn.catatanEditSession.delete(m.sender)

        const data = loadCatatan()
        const { type, oldKey } = editSession

        if (!data[oldKey]) {
            await m.reply(`*Catatan "${oldKey}" sudah tidak ada di database.*`)
            return true
        }

        if (type === 'title') {
            const newTitle = (m.text || '').trim()
            if (!newTitle) {
                await m.reply('*Judul baru tidak boleh kosong. Edit dibatalkan.*')
                return true
            }

            if (data[newTitle] && newTitle.toLowerCase() !== oldKey.toLowerCase()) {
                await m.reply(`*Judul "${newTitle}" sudah digunakan. Edit dibatalkan.*`)
                return true
            }

            const itemData = data[oldKey]
            itemData.updatedAt = Date.now()

            delete data[oldKey]
            data[newTitle] = itemData
            saveCatatan(data)

            await m.reply(
                `*JUDUL BERHASIL DIUBAH *\n\n` +
                `• *Judul Lama:* ${oldKey}\n` +
                `• *Judul Baru:* ${newTitle}`
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
                    createdAt   : data[oldKey].createdAt || now,
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
                    createdAt   : data[oldKey].createdAt || now,
                    updatedAt   : now,
                    addedBy     : m.sender.replace(/[^0-9]/g, '')
                }
            }

            data[oldKey] = newData
            saveCatatan(data)

            await m.reply(
                `*KONTEN CATATAN DIUPDATE *\n\n` +
                `• *Judul:* ${oldKey}\n` +
                `• *Tipe:* ${getMediaTypeLabel(newData)}\n` +
                `• *Waktu Update:* ${new Date().toLocaleTimeString('id-ID')}`
            )
            return true
        }
    }

    return false
}

handler.help = ['catatan *add/del/list*']
handler.tags    = ['owner']
handler.command = /^(catatan|note|notes|catat)$/i
handler.owner   = true

export default handler
