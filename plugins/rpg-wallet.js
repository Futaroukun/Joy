/*
 * @Author      : Rafli
 * @Feature     : Fantasy Wallet & Coin Inspector
 * @Description : Menampilkan rincian kantung koin petualang (Perunggu, Perak, Emas, Platina) dan kurs konversi mata uang anime.
 */

import { parseCoins, formatWalletBox } from '../function/scrapers/currency.js'
import { getLevelProgress } from '../function/core/levelling.js'

let handler = async (m, { conn, text, usedPrefix }) => {
    let who = m.sender
    if (m.quoted && m.quoted.sender) {
        who = m.quoted.sender
    } else if (m.mentionedJid && m.mentionedJid.length > 0) {
        who = m.mentionedJid[0]
    } else if (text && text.trim()) {
        const clean = text.trim().replace(/^@/, '')
        if (clean.endsWith('@lid') || clean.endsWith('@s.whatsapp.net')) {
            who = clean
        } else {
            let num = clean.replace(/[^0-9]/g, '')
            if (num.startsWith('0')) num = '62' + num.slice(1)
            if (num.length >= 7) who = num + '@s.whatsapp.net'
        }
    }

    const cleanJid = conn.decodeJid ? conn.decodeJid(who) : who
    const targetLid = conn.getLid ? (conn.getLid(cleanJid) || cleanJid) : cleanJid
    const user = global.db.data.users[targetLid] || global.db.data.users[cleanJid]

    if (!user) {
        return m.reply('Data pengguna tidak ditemukan di database.')
    }

    const rawNumber = cleanJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
    const name = user.name || (conn.getName ? conn.getName(cleanJid) : (rawNumber ? `+${rawNumber}` : 'Petualang'))
    const exp = typeof user.exp === 'number' ? user.exp : 0
    const progress = getLevelProgress(exp)
    const money = typeof user.money === 'number' ? user.money : 0
    const coins = parseCoins(money)

    let caption = `╭── ✦ *KANTUNG KOIN PETUALANG* ✦\n`
    caption += `│ • Pemilik   : *${name}*\n`
    caption += `│ • Pangkat   : ${progress.role} (Lv ${progress.level})\n`
    caption += `│\n`
    caption += `│ • Platina  : *${coins.platinum.toLocaleString('id-ID')}* PP\n`
    caption += `│ • Emas     : *${coins.gold.toLocaleString('id-ID')}* GP\n`
    caption += `│ • Perak    : *${coins.silver.toLocaleString('id-ID')}* SP\n`
    caption += `│ • Perunggu : *${coins.copper.toLocaleString('id-ID')}* CP\n`
    caption += `│\n`
    caption += `│ • Total CP : *${coins.totalCopper.toLocaleString('id-ID')}* Perunggu\n`
    caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

    caption += `╭── ✦ *KURS NILAI MATA UANG* ✦\n`
    caption += `│ • 1 Perak (SP)   = 1.000 Perunggu (CP)\n`
    caption += `│ • 1 Emas (GP)    = 1.000 Perak (1 Juta CP)\n`
    caption += `│ • 1 Platina (PP) = 1.000 Emas (1 Miliar CP)\n`
    caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
    caption += `> _Gunakan \`${usedPrefix}pay @user <jumlah>\` untuk mengirim koin._`

    await conn.sendMessage(m.chat, { react: { text: '💰', key: m.key } }).catch(() => {})
    await m.reply(caption.trim(), null, { mentions: [cleanJid] })
}

handler.help     = ['dompet *@user/reply*']
handler.tags     = ['rpg']
handler.command  = /^(dompet|wallet|koin|coins)$/i
handler.register = true

export default handler
