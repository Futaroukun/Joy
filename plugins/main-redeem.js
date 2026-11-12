import { claimCode } from '../function/core/redeem.js'

function formatNumber(num) {
    return Number(num || 0).toLocaleString('id-ID')
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const rawCode = (text || '').trim().toUpperCase()

    if (!rawCode) {
        return m.reply(
            `╭── ✦ *CARA KLAIM KODE* ✦\n` +
            `Masukkan kode redeem yang ingin ditukarkan.\n\n` +
            `• *Format*: \`${usedPrefix + command} <nama_kode>\`\n` +
            `• *Contoh*: \`${usedPrefix + command} WEEKEND50\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const sender = m.sender
    const targetKey = conn.getLid ? (conn.getLid(sender) || sender) : sender

    if (!global.db.data?.users) {
        global.db.data = { ...(global.db.data || {}), users: {} }
    }
    if (!global.db.data.users[targetKey]) {
        global.db.data.users[targetKey] = {
            limit: 25,
            money: 0,
            exp: 0,
            level: 0,
            premium: false,
            premiumDate: -1
        }
    }

    const user = global.db.data.users[targetKey]

    const result = claimCode(rawCode, sender)

    if (!result.success) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})

        if (result.status === 'NOT_FOUND') {
            return m.reply(
                `╭── ✦ *KODE TIDAK DITEMUKAN* ✦\n` +
                `Kode redeem *${rawCode}* salah, tidak terdaftar, atau sudah dinonaktifkan.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (result.status === 'EXPIRED') {
            return m.reply(
                `╭── ✦ *KODE KEDALUWARSA* ✦\n` +
                `Masa berlaku untuk kode *${rawCode}* sudah habis.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (result.status === 'ALREADY_CLAIMED') {
            return m.reply(
                `╭── ✦ *SUDAH DIKLAIM* ✦\n` +
                `Anda sudah pernah menukarkan kode *${rawCode}* sebelumnya.\n` +
                `Setiap akun hanya diperbolehkan menukar 1 kali.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (result.status === 'QUOTA_EXCEEDED') {
            return m.reply(
                `╭── ✦ *KUOTA HABIS* ✦\n` +
                `Maaf, kuota kode redeem *${rawCode}* sudah habis ditukarkan oleh pengguna lain.\n` +
                `Nantikan event kode hadiah berikutnya!\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        return m.reply(`Gagal klaim kode: ${result.message}`)
    }

    const { rewards } = result
    const receivedLines = []

    if (rewards.limit > 0) {
        user.limit = (user.limit || 0) + rewards.limit
        receivedLines.push(`› +${formatNumber(rewards.limit)} Limit (Total: ${formatNumber(user.limit)})`)
    }

    if (rewards.money > 0) {
        user.money = (user.money || 0) + rewards.money
        receivedLines.push(`› +${formatNumber(rewards.money)} Money (Total: ${formatNumber(user.money)})`)
    }

    if (rewards.exp > 0) {
        user.exp = (user.exp || 0) + rewards.exp
        receivedLines.push(`› +${formatNumber(rewards.exp)} EXP (Total: ${formatNumber(user.exp)})`)
    }

    if (rewards.premDays > 0) {
        const now = Date.now()
        const addMs = rewards.premDays * 24 * 60 * 60 * 1000
        const isExtend = user.premium && user.premiumDate > now
        const baseTime = isExtend ? user.premiumDate : now

        user.premium = true
        user.premiumDate = baseTime + addMs
        receivedLines.push(`› +${rewards.premDays} Hari Status Premium Aktif`)
    }

    global.saveData('users', targetKey)
    if (targetKey !== sender) {
        global.saveData('users', sender)
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    const replyMsg =
        `╭── ✦ *REDEEM BERHASIL* ✦\n` +
        `Selamat @${sender.split('@')[0].split(':')[0]}, hadiah berhasil ditambahkan ke akun Anda!\n\n` +
        `• *Kode*: \`${result.code}\`\n` +
        `• *Hadiah yang Diterima*:\n${receivedLines.join('\n')}\n\n` +
        `• *Sisa Kuota Kode*: ${result.remainingQuota} / ${result.totalQuota} Orang\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `> _Gunakan hadiah Anda dengan bijak!_`

    return conn.sendMessage(m.chat, {
        text: replyMsg,
        mentions: [sender]
    }, { quoted: m })
}

handler.help    = ['redeem *kode*']
handler.tags    = ['main']
handler.command = /^(redeem|klaim)$/i
handler.limit   = false

export default handler

