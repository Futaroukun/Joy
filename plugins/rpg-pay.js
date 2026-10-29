/*
 * @Author      : Rafli
 * @Feature     : Coin Transfer & Fantasy Guild Economy
 * @Description : Mengirim koin perunggu, perak, emas, atau platina ke sesama petualang dengan validasi ketat dan aman.
 */

import {
    COPPER_PER_SILVER,
    COPPER_PER_GOLD,
    COPPER_PER_PLATINUM,
    formatCoins
} from '../function/scrapers/currency.js'

function parseAmountToCopper(numStr, unitStr = '') {
    const amount = parseInt(numStr.replace(/[^0-9]/g, ''), 10)
    if (isNaN(amount) || amount <= 0) return 0

    const unit = (unitStr || '').toLowerCase().trim()

    if (/^(platina|platinum|pp)$/.test(unit)) {
        return amount * COPPER_PER_PLATINUM
    }
    if (/^(emas|gold|gp)$/.test(unit)) {
        return amount * COPPER_PER_GOLD
    }
    if (/^(perak|silver|sp)$/.test(unit)) {
        return amount * COPPER_PER_SILVER
    }

    // Default: Perunggu (CP)
    return amount
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const senderLid = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
    const senderUser = global.db.data.users[senderLid] || global.db.data.users[m.sender]

    if (!senderUser) {
        return m.reply('Data akun kamu tidak ditemukan di database.')
    }

    let target = ''
    let amountStr = ''
    let unitStr = ''

    if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender
        const args = (text || '').trim().split(/\s+/)
        amountStr = args[0] || ''
        unitStr = args[1] || ''
    } else {
        const args = (text || '').trim().split(/\s+/)
        if (m.mentionedJid && m.mentionedJid.length > 0) {
            target = m.mentionedJid[0]
            amountStr = args[1] || ''
            unitStr = args[2] || ''
        } else if (args[0] && /^@?[0-9]+/.test(args[0])) {
            let clean = args[0].replace(/^@/, '')
            if (clean.endsWith('@lid') || clean.endsWith('@s.whatsapp.net')) {
                target = clean
            } else {
                let num = clean.replace(/[^0-9]/g, '')
                if (num.startsWith('0')) num = '62' + num.slice(1)
                if (num.length >= 7) target = num + '@s.whatsapp.net'
            }
            amountStr = args[1] || ''
            unitStr = args[2] || ''
        }
    }

    if (!target) {
        return m.reply(
            `╭── ✦ *FORMAT TRANSFER KOIN* ✦\n` +
            `• Format: \`${usedPrefix + command} @user <jumlah> [satuan]\`\n` +
            `• Atau balas pesan target dengan: \`${usedPrefix + command} <jumlah> [satuan]\`\n\n` +
            `• *Contoh:*\n` +
            `  › \`${usedPrefix + command} @user 50\` (50 Perunggu)\n` +
            `  › \`${usedPrefix + command} @user 2 perak\`\n` +
            `  › \`${usedPrefix + command} @user 1 emas\`\n\n` +
            `• *Pilihan Satuan:* perunggu, perak, emas, platina\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const cleanTargetJid = conn.decodeJid ? conn.decodeJid(target) : target
    const isTargetBot = (cleanTargetJid === (conn.user?.jid || '') || cleanTargetJid === (conn.user?.id || ''))
    const isSelf = (cleanTargetJid === m.sender || cleanTargetJid === senderLid)

    if (isSelf) return m.reply('Kamu tidak bisa mentransfer koin ke diri sendiri.')
    if (isTargetBot) return m.reply('Bot tidak membutuhkan koin.')

    const targetLid = conn.getLid ? (conn.getLid(cleanTargetJid) || cleanTargetJid) : cleanTargetJid
    const targetUser = global.db.data.users[targetLid] || global.db.data.users[cleanTargetJid]

    if (!targetUser) {
        return m.reply('Target penerima belum terdaftar dalam sistem bot.')
    }

    const totalCopperToTransfer = parseAmountToCopper(amountStr, unitStr)

    if (totalCopperToTransfer <= 0) {
        return m.reply('Jumlah koin yang dimasukkan tidak valid. Minimal transfer adalah 1 Perunggu.')
    }

    const senderMoney = typeof senderUser.money === 'number' ? senderUser.money : 0

    if (senderMoney < totalCopperToTransfer) {
        return m.reply(
            `Koin kamu tidak mencukupi untuk melakukan transfer.\n\n` +
            `• Dibutuhkan : *${formatCoins(totalCopperToTransfer)}*\n` +
            `• Saldo Kamu : *${formatCoins(senderMoney)}*`
        )
    }

    // Eksekusi transfer koin
    senderUser.money = senderMoney - totalCopperToTransfer
    targetUser.money = (typeof targetUser.money === 'number' ? targetUser.money : 0) + totalCopperToTransfer

    global.saveData('users', senderLid)
    if (senderLid !== m.sender) global.saveData('users', m.sender)
    global.saveData('users', targetLid)
    if (targetLid !== cleanTargetJid) global.saveData('users', cleanTargetJid)

    const senderName = senderUser.name || (conn.getName ? conn.getName(m.sender) : 'Pengirim')
    const targetName = targetUser.name || (conn.getName ? conn.getName(cleanTargetJid) : 'Penerima')

    let caption = `╭── ✦ *TRANSFER KOIN BERHASIL* ✦\n`
    caption += `│ • Pengirim : *${senderName}*\n`
    caption += `│ • Penerima : *${targetName}*\n`
    caption += `│ • Nominal  : *${formatCoins(totalCopperToTransfer)}*\n`
    caption += `│ • Sisa Koin: *${formatCoins(senderUser.money)}*\n`
    caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    caption += `> _Kantung koin penerima telah berhasil ditambahkan._`

    await conn.sendMessage(m.chat, { react: { text: '🤝', key: m.key } }).catch(() => {})
    await m.reply(caption.trim(), null, { mentions: [cleanTargetJid, m.sender] })
}

handler.help     = ['pay *@user <jumlah> [satuan]*', 'transfer *@user <jumlah> [satuan]*']
handler.tags     = ['rpg']
handler.command  = /^(pay|transfer|kirimkoin)$/i
handler.register = true

export default handler
