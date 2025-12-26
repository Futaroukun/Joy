/**
 * Sistem Leveling Bot
 * Konfigurasi dan fungsi utama leveling
 */

// ========== KONFIGURASI EXP ==========
export const EXP_CONFIG = {
    BASE_EXP_PER_MESSAGE: 3, // EXP dasar per interaksi
    PREMIUM_MULTIPLIER: 2, // Pengali untuk user premium
    LEVEL_MULTIPLIER: 1.5, // Pengali untuk kebutuhan EXP per level
    BASE_EXP_REQUIREMENT: 100 // EXP dasar untuk level 1 ke 2
}

// ========== HADIAH LEVELING ==========
export const LEVEL_REWARDS = {
    3: {
        limit: 5,
        message: "🎁 Selamat! Kamu mendapat +5 limit!"
    },
    5: {
        limit: 10,
        message: "🎁 Mantap! Kamu mendapat +10 limit!"
    },
    10: {
        limit: 20,
        message: "🎉 Luar biasa! Kamu mendapat +20 limit!"
    },
    15: {
        limit: 30,
        message: "🎉 Hebat sekali! Kamu mendapat +30 limit!"
    },
    20: {
        limit: 50,
        message: "🏆 AMAZING! Kamu mendapat +50 limit!"
    },
    25: {
        limit: 75,
        message: "🏆 LEGENDARY! Kamu mendapat +75 limit!"
    },
    30: {
        limit: 100,
        message: "👑 GODLIKE! Kamu mendapat +100 limit!"
    },
    40: {
        limit: 150,
        message: "👑 MYTHICAL! Kamu mendapat +150 limit!"
    },
    50: {
        limit: 250,
        message: "💎 DIVINE! Kamu mendapat +250 limit!"
    },
    75: {
        limit: 500,
        message: "💎 CELESTIAL! Kamu mendapat +500 limit!"
    },
    100: {
        limit: 1000,
        message: "⭐ IMMORTAL! Kamu mendapat +1000 limit!"
    }
}

// ========== RANK TITLE ==========
export const RANK_TITLES = {
    1: "Newbie",
    5: "Beginner",
    10: "Novice",
    15: "Apprentice",
    20: "Skilled",
    25: "Expert",
    30: "Master",
    40: "Grandmaster",
    50: "Legend",
    75: "Mythical",
    100: "Immortal"
}

// ========== FUNGSI UTAMA ==========

/**
 * Hitung EXP yang dibutuhkan untuk level tertentu
 * @param {number} level - Level target
 * @returns {number} - Total EXP yang dibutuhkan
 */
export function getExpRequirement(level) {
    if (level <= 1) return 0
    
    // Rumus: BASE * (MULTIPLIER ^ (level - 1))
    return Math.floor(
        EXP_CONFIG.BASE_EXP_REQUIREMENT *
        Math.pow(EXP_CONFIG.LEVEL_MULTIPLIER, level - 1)
    )
}

/**
 * Hitung level berdasarkan total EXP
 * @param {number} exp - Total EXP user
 * @returns {number} - Level user
 */
export function calculateLevel(exp) {
    let level = 1
    let requiredExp = getExpRequirement(level + 1)
    
    while (exp >= requiredExp) {
        level++
        requiredExp = getExpRequirement(level + 1)
    }
    
    return level
}

/**
 * Hitung EXP yang didapat per interaksi
 * @param {boolean} isPremium - Status premium user
 * @returns {number} - EXP yang didapat
 */
export function calculateExpGain(isPremium = false) {
    const baseExp = EXP_CONFIG.BASE_EXP_PER_MESSAGE
    return isPremium ? baseExp * EXP_CONFIG.PREMIUM_MULTIPLIER : baseExp
}

/**
 * Hitung progress EXP ke level berikutnya
 * @param {number} currentExp - EXP saat ini
 * @param {number} currentLevel - Level saat ini
 * @returns {object} - Info progress
 */
export function getExpProgress(currentExp, currentLevel) {
    const currentLevelExp = getExpRequirement(currentLevel)
    const nextLevelExp = getExpRequirement(currentLevel + 1)
    const expNeeded = nextLevelExp - currentLevelExp
    const expProgress = currentExp - currentLevelExp
    const percentage = Math.floor((expProgress / expNeeded) * 100)
    
    return {
        current: expProgress,
        needed: expNeeded,
        total: nextLevelExp,
        percentage: Math.max(0, Math.min(100, percentage))
    }
}

/**
 * Dapatkan rank title berdasarkan level
 * @param {number} level - Level user
 * @returns {string} - Rank title
 */
export function getRankTitle(level) {
    const ranks = Object.keys(RANK_TITLES)
        .map(Number)
        .sort((a, b) => b - a)
    
    for (const rankLevel of ranks) {
        if (level >= rankLevel) {
            return RANK_TITLES[rankLevel]
        }
    }
    
    return RANK_TITLES[1]
}

/**
 * Proses leveling dan berikan hadiah
 * @param {object} user - Data user dari database
 * @param {number} oldLevel - Level sebelumnya
 * @param {number} newLevel - Level baru
 * @returns {object} - Info leveling dan hadiah
 */
export function processLevelUp(user, oldLevel, newLevel) {
    const rewards = []
    let totalLimitGained = 0
    
    // Cek setiap level yang dilewati
    for (let level = oldLevel + 1; level <= newLevel; level++) {
        if (LEVEL_REWARDS[level]) {
            const reward = LEVEL_REWARDS[level]
            user.limit += reward.limit
            totalLimitGained += reward.limit
            rewards.push({
                level: level,
                limit: reward.limit,
                message: reward.message
            })
        }
    }
    
    return {
        levelsGained: newLevel - oldLevel,
        totalLimitGained,
        rewards,
        newRank: getRankTitle(newLevel)
    }
}

/**
 * Format angka dengan separator
 * @param {number} num - Angka yang akan diformat
 * @returns {string} - Angka terformat
 */
export function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")
}

/**
 * Generate progress bar visual
 * @param {number} percentage - Persentase progress (0-100)
 * @param {number} length - Panjang bar
 * @returns {string} - Progress bar
 */
export function generateProgressBar(percentage, length = 10) {
    const filled = Math.floor((percentage / 100) * length)
    const empty = length - filled
    return '█'.repeat(filled) + '░'.repeat(empty)
}

/**
 * Validasi dan perbaiki data user
 * @param {object} user - Data user
 */
export function validateUserData(user) {
    if (!user) return
    
    // Pastikan exp tidak negatif
    if (user.exp < 0) user.exp = 0
    
    // Recalculate level berdasarkan exp
    const calculatedLevel = calculateLevel(user.exp)
    if (user.level !== calculatedLevel) {
        user.level = calculatedLevel
    }
    
    // Pastikan limit tidak negatif
    if (user.limit < 0) user.limit = 0
}

export async function handleExpGain(conn, m, user) {
    try {
        if (user.banned) return;
        
        const expGain = calculateExpGain(user.premium);
        const oldLevel = user.level;
        
        user.exp += expGain;
        
        const newLevel = calculateLevel(user.exp);
        
        if (newLevel > oldLevel) {
            user.level = newLevel;
            const levelUpInfo = processLevelUp(user, oldLevel, newLevel);
            await sendLevelUpNotification(conn, m, user, levelUpInfo);
        }
    } catch (error) {
        console.error('Error handling exp gain:', error);
    }
}

async function sendLevelUpNotification(conn, m, user, info) {
    try {
        let message = `*LEVEL UP! 🎉*\n\n`
        message += `*Nama:* ${user.name}\n`
        message += `*Level:* ${user.level - info.levelsGained} ➜ ${user.level}\n`
        message += `*Rank:* ${info.newRank}\n\n`
        
        if (info.totalLimitGained > 0) {
            message += `*HADIAH DITERIMA:*\n`
            for (const reward of info.rewards) {
                message += `• Level ${reward.level}: +${reward.limit} Limit\n`
            }
            message += `\n*Total Limit Diterima:* +${info.totalLimitGained}\n`
            message += `*Limit Sekarang:* ${user.limit}\n\n`
        }
        
        message += `*Status Premium:* ${user.premium ? 'Aktif (2x EXP)' : 'Tidak Aktif'}\n`
        message += `\nTerus aktif untuk naik level! 🚀`
        
        await conn.reply(m.chat, message, m)
        
    } catch (error) {
        console.error('Error sending level up notification:', error)
    }
}

export default {
    EXP_CONFIG,
    LEVEL_REWARDS,
    RANK_TITLES,
    getExpRequirement,
    calculateLevel,
    calculateExpGain,
    getExpProgress,
    getRankTitle,
    handleExpGain,
    processLevelUp,
    sendLevelUpNotification,
    formatNumber,
    generateProgressBar,
    validateUserData
}