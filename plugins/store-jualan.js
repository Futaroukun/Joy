/*
- @Author: Rafli
- @Feature: Jualan Mode & Group Store
- @Description: Mode jualan per-grup. Support alias produk.
*/

async function sendProductItem(conn, m, item, keyName) {
    if (!item) return m.reply(`Produk *${keyName}* tidak ditemukan.`)

    try {
        const hasMedia = item.mediaMessage &&
            item.mtype !== 'conversation' &&
            item.mtype !== 'extendedTextMessage'

        if (!hasMedia) {
            const text = item.text || ''
            if (text) await conn.sendMessage(m.chat, { text }, { quoted: m })
            return
        }

        let msgContent = JSON.parse(JSON.stringify(item.mediaMessage))
        const type = Object.keys(msgContent)[0]
        const validTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']

        if (!validTypes.includes(type)) {
            if (item.text) await conn.sendMessage(m.chat, { text: item.text }, { quoted: m })
            return
        }

        if (['imageMessage', 'videoMessage', 'documentMessage'].includes(type)) {
            msgContent[type].caption = item.text || ''
        }

        msgContent[type].contextInfo = {
            ...(msgContent[type].contextInfo || {}),
            quotedMessage: { conversation: keyName },
            participant: '0@s.whatsapp.net',
            stanzaId: 'FAKE_' + Date.now(),
            remoteJid: 'status@broadcast'
        }

        await conn.relayMessage(m.chat, msgContent, {
            messageId: (Math.random() + 1).toString(36).substring(7)
        })
    } catch (e) {
        console.error('[JUALAN SEND]', e.message)
        if (item.text) await conn.sendMessage(m.chat, { text: item.text }, { quoted: m })
    }
}

let handler = async (m, { conn, text, usedPrefix, command, isAdmin, isOwner, args }) => {
    if (!m.isGroup) return m.reply('Fitur ini hanya bisa digunakan di dalam grup.')

    let chat = global.db.data.chats[m.chat]
    if (!chat) return m.reply('Data grup tidak ditemukan.')
    if (!chat.jualanItems) chat.jualanItems = {}

    const items = chat.jualanItems
    const keys = Object.keys(items)

    let cmd = (command || '').toLowerCase()
    let sub = (args[0] || '').toLowerCase()
    let subText = args.slice(1).join(' ')

    // Normalisasi Sub-command .jualan
    if (cmd === 'jualan') {
        if (sub === 'add' || sub === 'tambah') {
            cmd = 'addproduk'
            text = subText
        } else if (sub === 'del' || sub === 'hapus' || sub === 'remove') {
            cmd = 'delproduk'
            text = subText
        } else if (sub === 'edit' || sub === 'ubah') {
            cmd = 'editproduk'
            text = subText
        } else if (sub === 'list' || sub === 'daftar') {
            cmd = 'listproduk'
            text = subText
        } else if (sub === 'alias') {
            const aliasAction = (args[1] || '').toLowerCase()
            if (aliasAction === 'del' || aliasAction === 'hapus') {
                cmd = 'delalias'
                text = args.slice(2).join(' ')
            } else {
                cmd = 'addalias'
                text = (aliasAction === 'add' ? args.slice(2).join(' ') : args.slice(1).join(' '))
            }
        } else if (sub === 'lihat' || sub === 'get') {
            cmd = 'lihat'
            text = subText
        }
    }

    // ── TOGGLE JUALAN MODE ──────────────────────────────────────────────────
    if (/^jualan$/i.test(cmd)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa mengatur mode jualan.*')

        if (!text || text.toLowerCase() === 'status' || text.toLowerCase() === 'info' || text.toLowerCase() === 'help') {
            return m.reply(
                `*PANDUAN MODE JUALAN GRUP 🛒*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `• *Status Mode:* *${chat.jualan ? 'ON ' : 'OFF '}*\n` +
                `• *Total Produk:* *${keys.length} item*\n\n` +
                `*Perintah Pengaturan:*\n` +
                `• \`${usedPrefix}jualan on\` — Aktifkan mode jualan\n` +
                `• \`${usedPrefix}jualan off\` — Nonaktifkan mode jualan\n\n` +
                `*Kelola Produk (Admin):*\n` +
                `• \`${usedPrefix}jualan add <nama>\` — Tambah produk (reply pesan)\n` +
                `• \`${usedPrefix}jualan del <nama/nomor>\` — Hapus produk\n` +
                `• \`${usedPrefix}jualan edit <nama/nomor>\` — Edit isi produk\n` +
                `• \`${usedPrefix}jualan alias <nama/no> | <alias>\` — Tambah alias\n` +
                `• \`${usedPrefix}jualan list\` — Daftar produk grup\n\n` +
                `*Akses Member:*\n` +
                `• ${chat.jualan ? 'Ketik nama/alias produk langsung' : `\`${usedPrefix}jualan lihat <nama>\``}\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const action = text.trim().toLowerCase()

        if (action === 'on') {
            if (chat.jualan) return m.reply('Mode jualan sudah aktif.')
            chat.jualan = true
            global.saveData('chats', m.chat)
            return m.reply(
                `*MODE JUALAN AKTIF *\n\n` +
                `Perintah admin bisa dipakai tanpa prefix.\n` +
                `Member cukup ketik nama/alias produk langsung.\n\n` +
                `*Total produk tersedia:* ${keys.length}`
            )
        }

        if (action === 'off') {
            if (!chat.jualan) return m.reply('Mode jualan sudah nonaktif.')
            chat.jualan = false
            global.saveData('chats', m.chat)
            return m.reply(
                `*MODE JUALAN NONAKTIF *\n\n` +
                `Semua command bot aktif kembali.\n` +
                `Gunakan \`${usedPrefix}lihat <nama>\` untuk melihat produk.`
            )
        }

        return m.reply(`Pilihan tidak valid. Gunakan: \`jualan on\` atau \`jualan off\``)
    }

    // ── ADD PRODUK ──────────────────────────────────────────────────────────
    if (/^addproduk$/i.test(command)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa menambah produk.*')

        if (!m.quoted) {
            return m.reply(
                `*TAMBAH PRODUK*\n\n` +
                `Reply pesan yang mau dijadikan isi produk, lalu ketik:\n` +
                `\`addproduk <nama produk>\`\n\n` +
                `_Nama produk dipakai member sebagai kata kunci._`
            )
        }

        if (!text) return m.reply(`Kasih nama produknya.\n\nFormat: \`addproduk <nama>\``)

        const keyName = text.trim().toLowerCase()

        if (items[keyName]) {
            return m.reply(
                `*Nama produk sudah ada.*\n\n` +
                `Gunakan: \`editproduk ${keyName}\` untuk mengubah isinya.`
            )
        }

        const q = m.quoted
        let dataToSave = {}

        if (q.mediaMessage || q.isMedia) {
            dataToSave = {
                mtype: q.mtype,
                mediaMessage: q.mediaMessage || q.msg,
                text: q.text || q.caption || '',
                aliases: [],
                key: { remoteJid: m.chat, fromMe: false, id: q.id || q.key?.id, participant: q.sender }
            }
        } else {
            dataToSave = {
                mtype: q.mtype || 'conversation',
                text: q.text || q.body || '',
                mediaMessage: null,
                aliases: []
            }
        }

        items[keyName] = dataToSave
        global.saveData('chats', m.chat)

        return m.reply(
            `*PRODUK DITAMBAH *\n\n` +
            `*Nama:* ${keyName}\n` +
            `*Tipe:* ${dataToSave.mtype || 'teks'}\n\n` +
            `Tambah alias: \`addalias ${keyName} | nama lain\``
        )
    }

    // ── ADD ALIAS ───────────────────────────────────────────────────────────
    if (/^addalias$/i.test(command)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa menambah alias.*')

        if (!text || !text.includes('|')) {
            return m.reply(
                `*TAMBAH ALIAS PRODUK*\n\n` +
                `Format: \`addalias <nama/nomor> | <alias>\`\n\n` +
                `*Contoh:*\n` +
                `\`addalias ff | free fire\`\n` +
                `\`addalias 1 | free fire\`\n\n` +
                `_Alias memungkinkan produk diakses dengan nama berbeda._`
            )
        }

        const [target, ...aliasParts] = text.split('|')
        const targetTrimmed = target.trim()
        const aliasName = aliasParts.join('|').trim().toLowerCase()

        if (!aliasName) return m.reply('Nama alias tidak boleh kosong.')

        // resolve nomor atau nama
        let keyName = targetTrimmed.toLowerCase()
        if (!isNaN(targetTrimmed)) {
            const idx = parseInt(targetTrimmed) - 1
            if (idx < 0 || idx >= keys.length) return m.reply(`Nomor tidak valid. Gunakan 1-${keys.length}`)
            keyName = keys[idx]
        }

        if (!items[keyName]) return m.reply(`Produk *${keyName}* tidak ditemukan.`)

        if (!items[keyName].aliases) items[keyName].aliases = []

        if (items[keyName].aliases.includes(aliasName)) {
            return m.reply(`Alias *${aliasName}* sudah ada di produk *${keyName}*.`)
        }

        // pastikan alias tidak bentrok dengan nama produk lain atau alias lain
        const conflict = keys.find(k => {
            if (k === aliasName) return true
            return (items[k]?.aliases || []).includes(aliasName)
        })

        if (conflict) {
            return m.reply(
                `*Alias bentrok.*\n\n` +
                `*${aliasName}* sudah dipakai oleh produk *${conflict}*.`
            )
        }

        items[keyName].aliases.push(aliasName)
        global.saveData('chats', m.chat)

        return m.reply(
            `*ALIAS DITAMBAH *\n\n` +
            `*Produk:* ${keyName}\n` +
            `*Alias baru:* ${aliasName}\n\n` +
            `*Semua alias:* ${items[keyName].aliases.join(', ')}\n\n` +
            `Member bisa akses pakai: *${keyName}* atau *${aliasName}*`
        )
    }

    // ── REMOVE ALIAS ────────────────────────────────────────────────────────
    if (/^delalias$/i.test(command)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa menghapus alias.*')

        if (!text || !text.includes('|')) {
            return m.reply(
                `*HAPUS ALIAS PRODUK*\n\n` +
                `Format: \`delalias <nama/nomor> | <alias>\`\n\n` +
                `*Contoh:*\n` +
                `\`delalias ff | free fire\`\n` +
                `\`delalias 1 | free fire\``
            )
        }

        const [target, ...aliasParts] = text.split('|')
        const targetTrimmed = target.trim()
        const aliasName = aliasParts.join('|').trim().toLowerCase()

        let keyName = targetTrimmed.toLowerCase()
        if (!isNaN(targetTrimmed)) {
            const idx = parseInt(targetTrimmed) - 1
            if (idx < 0 || idx >= keys.length) return m.reply(`Nomor tidak valid. Gunakan 1-${keys.length}`)
            keyName = keys[idx]
        }

        if (!items[keyName]) return m.reply(`Produk *${keyName}* tidak ditemukan.`)

        const aliases = items[keyName].aliases || []
        if (!aliases.includes(aliasName)) return m.reply(`Alias *${aliasName}* tidak ada di produk *${keyName}*.`)

        items[keyName].aliases = aliases.filter(a => a !== aliasName)
        global.saveData('chats', m.chat)

        return m.reply(
            `*ALIAS DIHAPUS *\n\n` +
            `*Produk:* ${keyName}\n` +
            `*Alias dihapus:* ${aliasName}\n\n` +
            `*Alias tersisa:* ${items[keyName].aliases.length > 0 ? items[keyName].aliases.join(', ') : '_(tidak ada)_'}`
        )
    }

    // ── DELETE PRODUK ───────────────────────────────────────────────────────
    if (/^delproduk$/i.test(command)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa menghapus produk.*')
        if (keys.length === 0) return m.reply('Belum ada produk yang tersimpan.')

        if (!text) {
            const list = keys.map((k, i) => `${i + 1}. ${k}${(items[k]?.aliases?.length) ? ` _(${items[k].aliases.join(', ')})_` : ''}`).join('\n')
            return m.reply(`*HAPUS PRODUK*\n\n${list}\n\nFormat: \`delproduk <nomor atau nama>\``)
        }

        let targetKey = text.trim().toLowerCase()

        if (!isNaN(text.trim())) {
            const idx = parseInt(text.trim()) - 1
            if (idx < 0 || idx >= keys.length) return m.reply(`Nomor tidak valid. Gunakan 1-${keys.length}`)
            targetKey = keys[idx]
        }

        if (!items[targetKey]) return m.reply(`Produk *${targetKey}* tidak ditemukan.`)

        delete items[targetKey]
        global.saveData('chats', m.chat)

        return m.reply(`*PRODUK DIHAPUS *\n\nProduk *${targetKey}* berhasil dihapus.`)
    }

    // ── EDIT PRODUK ──────────────────────────────────────────────────────────
    if (/^editproduk$/i.test(command)) {
        if (!isAdmin && !isOwner) return m.reply('*Hanya admin yang bisa mengedit produk.*')
        if (keys.length === 0) return m.reply('Belum ada produk yang tersimpan.')

        if (!text) {
            const list = keys.map((k, i) => `${i + 1}. ${k}`).join('\n')
            return m.reply(
                `*EDIT PRODUK*\n\n${list}\n\n` +
                `Reply pesan baru lalu ketik:\n\`editproduk <nomor atau nama>\``
            )
        }

        if (!m.quoted) {
            return m.reply(`*Reply pesan baru* yang akan menggantikan isi produk ini.`)
        }

        let targetKey = text.trim().toLowerCase()

        if (!isNaN(text.trim())) {
            const idx = parseInt(text.trim()) - 1
            if (idx < 0 || idx >= keys.length) return m.reply(`Nomor tidak valid. Gunakan 1-${keys.length}`)
            targetKey = keys[idx]
        }

        if (!items[targetKey]) return m.reply(`Produk *${targetKey}* tidak ditemukan.`)

        const q = m.quoted
        const existingAliases = items[targetKey].aliases || []
        let newData = {}

        if (q.mediaMessage || q.isMedia) {
            newData = {
                mtype: q.mtype,
                mediaMessage: q.mediaMessage || q.msg,
                text: q.text || q.caption || '',
                aliases: existingAliases,
                key: { remoteJid: m.chat, fromMe: false, id: q.id || q.key?.id, participant: q.sender }
            }
        } else {
            newData = {
                mtype: q.mtype || 'conversation',
                text: q.text || q.body || '',
                mediaMessage: null,
                aliases: existingAliases
            }
        }

        items[targetKey] = newData
        global.saveData('chats', m.chat)

        return m.reply(
            `*PRODUK DIPERBARUI *\n\n` +
            `*Nama:* ${targetKey}\n` +
            `*Tipe:* ${newData.mtype || 'teks'}\n` +
            `*Alias:* ${existingAliases.length > 0 ? existingAliases.join(', ') : '_(tidak ada)_'}`
        )
    }

    // ── LIST PRODUK ──────────────────────────────────────────────────────────
    if (/^listproduk$/i.test(command)) {
        if (keys.length === 0) {
            return m.reply(
                `*DAFTAR PRODUK GRUP*\n\n` +
                `Belum ada produk di grup ini.\n\n` +
                `Tambah: \`addproduk <nama>\``
            )
        }

        const list = keys.map((k, i) => {
            const aliases = items[k]?.aliases || []
            const aliasText = aliases.length > 0 ? `\n   _Alias: ${aliases.join(', ')}_` : ''
            return `${i + 1}. *${k}*${aliasText}`
        }).join('\n')

        return m.reply(
            `*DAFTAR PRODUK GRUP*\n` +
            `Status: ${chat.jualan ? '*Jualan ON* ' : '*Jualan OFF* '}\n` +
            `Total: *${keys.length} produk*\n\n` +
            `${list}\n\n` +
            `${chat.jualan
                ? '_Ketik nama atau alias produk langsung._'
                : `_\`lihat <nama/nomor>\` untuk melihat detail._`
            }`
        )
    }

    // ── LIHAT PRODUK (mode normal) ────────────────────────────────────────────
    if (/^lihat$/i.test(command)) {
        if (keys.length === 0) {
            return m.reply(`Belum ada produk di grup ini.\n\nAdmin tambah dengan \`addproduk\``)
        }

        if (!text) {
            const list = keys.map((k, i) => {
                const aliases = items[k]?.aliases || []
                return `${i + 1}. ${k}${aliases.length ? ` (${aliases.join(', ')})` : ''}`
            }).join('\n')
            return m.reply(
                `*DAFTAR PRODUK*\n\n${list}\n\n` +
                `\`lihat <nama, alias, atau nomor>\` untuk melihat detail.`
            )
        }

        const textInput = text.trim().toLowerCase()
        let targetKey = null

        // cek nomor
        if (!isNaN(text.trim())) {
            const idx = parseInt(text.trim()) - 1
            if (idx < 0 || idx >= keys.length) return m.reply(`Nomor tidak valid. Gunakan 1-${keys.length}`)
            targetKey = keys[idx]
        }

        // cek nama langsung
        if (!targetKey) targetKey = keys.find(k => k.toLowerCase() === textInput) || null

        // cek alias
        if (!targetKey) {
            targetKey = keys.find(k => (items[k]?.aliases || []).some(a => a.toLowerCase() === textInput)) || null
        }

        // fuzzy
        if (!targetKey) {
            targetKey = keys.find(k =>
                k.includes(textInput) || textInput.includes(k) ||
                (items[k]?.aliases || []).some(a => a.includes(textInput) || textInput.includes(a))
            ) || null
        }

        if (!targetKey) {
            return m.reply(
                `Produk *${text}* tidak ditemukan.\n\n` +
                `Ketik \`listproduk\` untuk lihat semua produk.`
            )
        }

        await sendProductItem(conn, m, items[targetKey], targetKey)
    }
}

handler.help = ['jualan *on/off*']
handler.tags    = ['store']
handler.command = /^(jualan|listproduk|addproduk|delproduk|editproduk)$/i
handler.group   = true

export default handler