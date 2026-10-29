/*
 * @Author      : Rafli
 * @Feature     : Daily Claim & RPG Rewards
 * @Description : Klaim hadiah harian (EXP & Limit) setiap 24 jam sekali dengan deteksi otomatis kenaikan level RPG.
 */

import { getLevelProgress } from '../function/core/levelling.js'
import { formatCoins, checkRankMilestoneRewards } from '../function/scrapers/currency.js'

function formatCooldown(ms) {
    const totalSecs = Math.floor(ms / 1000)
    const hours = Math.floor(totalSecs / 3600)
    const minutes = Math.floor((totalSecs % 3600) / 60)
    const seconds = totalSecs % 60
    return `${hours} Jam ${minutes} Menit ${seconds} Detik`
}

let handler = async (m, { conn, usedPrefix, command }) => {
    const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
    const user = global.db.data.users[senderLID] || global.db.data.users[m.sender]

    if (!user) return m.reply('Data pengguna tidak ditemukan di database.')

    const cooldownTime = 86400000 // 24 jam
    const now = Date.now()
    const lastClaim = user.lastdaily || 0
    const timeRemaining = (lastClaim + cooldownTime) - now

    if (timeRemaining > 0) {
        return m.reply(
            `*KLAIM HADIAH HARIAN*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Kamu sudah mengambil hadiah harian hari ini.\n\n` +
            `• Sisa Waktu: *${formatCooldown(timeRemaining)}*\n` +
            `• Silakan kembali lagi nanti untuk klaim berikutnya.`
        )
    }

    const isPremium = user.premium === true
    const expReward = isPremium ? 3000 : 1500
    const limitReward = isPremium ? 50 : 25
    const coinReward = isPremium ? (Math.floor(Math.random() * 21) + 30) : (Math.floor(Math.random() * 16) + 10)

    const oldExp = user.exp || 0
    const oldProgress = getLevelProgress(oldExp)

    // Update data pengguna
    user.exp = oldExp + expReward
    user.limit = (user.limit || 0) + limitReward
    user.money = (user.money || 0) + coinReward
    user.lastdaily = now

    const newProgress = getLevelProgress(user.exp)
    const isLevelUp = newProgress.level > oldProgress.level
    const milestones = checkRankMilestoneRewards(oldProgress.level, newProgress.level)

    let milestoneBonusCopper = 0
    let milestoneMessages = []
    if (milestones.length > 0) {
        for (const m of milestones) {
            milestoneBonusCopper += m.copper
            milestoneMessages.push(`  › *${m.rank}*: +${m.name}`)
        }
        user.money += milestoneBonusCopper
    }

    let message =
        `*KLAIM HARIAN BERHASIL*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `Selamat! Kamu mendapatkan hadiah harian:\n` +
        `• *+${expReward.toLocaleString('id-ID')} EXP* (${isPremium ? 'Bonus Premium 2x' : 'Standar'})\n` +
        `• *+${limitReward} Limit / Tiket*\n` +
        `• *+${coinReward} Perunggu* (${isPremium ? 'Bonus Premium' : 'Standar'})\n\n` +
        `╭── ✦ *STATISTIK RPG* ✦\n` +
        `│ • Level: ${newProgress.level}\n` +
        `│ • Role: ${newProgress.role}\n` +
        `│ • Total EXP: ${user.exp.toLocaleString('id-ID')} EXP\n` +
        `│ • Progres: [${newProgress.bar}] ${newProgress.percent}%\n` +
        `│ • Target Level ${newProgress.level + 1}: ${newProgress.remainingExp.toLocaleString('id-ID')} EXP lagi\n` +
        `│ • Dompet: ${formatCoins(user.money)}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━\n`

    if (isLevelUp) {
        message += `\n*SELAMAT! KAMU NAIK LEVEL!*\n` +
                   `• Level ${oldProgress.level} ➔ *Level ${newProgress.level}*\n` +
                   `• Role Baru: *${newProgress.role}*\n`
    }

    if (milestoneMessages.length > 0) {
        message += `\n*HADIAH PENCAPAIAN GUILD!*\n` +
                   milestoneMessages.join('\n') + `\n`
    }

    message += `\n> _Klaim berikutnya tersedia dalam 24 jam._`

    await conn.sendMessage(m.chat, { react: { text: '🎁', key: m.key } }).catch(() => {})
    await m.reply(message.trim())
}

handler.help     = ['daily']
handler.tags     = ['rpg']
handler.command  = /^(daily|claim|hadiah)$/i
handler.register = true

export default handler
