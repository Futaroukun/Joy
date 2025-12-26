/**
 * Sistem Leveling Bot - Hardcore Version
 * EXP sangat banyak dan berlipat setiap tier
 * Dengan sistem rewards dinamis
 */

// ========== KONFIGURASI EXP ==========
export const EXP_CONFIG = {
    BASE_EXP_PER_MESSAGE: 3,
    PREMIUM_MULTIPLIER: 2,
    LEVEL_MULTIPLIER: 1.8,
    BASE_EXP_REQUIREMENT: 100
}

// ========== RANK TITLES ==========
export const RANK_TITLES = {
    1: "Newbie",
    10: "Beginner",
    20: "Warrior",
    30: "Knight",
    40: "Champion",
    50: "Master",
    60: "Legend",
    70: "Mythic",
    80: "Divine",
    90: "Celestial",
    100: "Immortal",
    110: "Titan",
    120: "God"
}

// ========== TIER SYSTEM ==========
export const TIERS = {
    1: { name: "Tier 1", multiplier: 1 },
    2: { name: "Tier 2", multiplier: 2 },
    3: { name: "Tier 3", multiplier: 4 },
    4: { name: "Tier 4", multiplier: 8 },
    5: { name: "Tier 5", multiplier: 16 },
    6: { name: "Tier 6", multiplier: 32 },
    7: { name: "Tier 7", multiplier: 64 },
    8: { name: "Tier 8", multiplier: 128 },
    9: { name: "Tier 9", multiplier: 256 },
    10: { name: "Tier 10", multiplier: 512 },
    11: { name: "Tier 11", multiplier: 1024 },
    12: { name: "Tier 12", multiplier: 2048 }
}

// ========== FUNGSI UTAMA ==========

/**
 * Hitung EXP yang dibutuhkan untuk level tertentu
 */
export function getExpRequirement(level) {
    if (level <= 1) return 0
    
    // Hitung tier (setiap 10 level)
    const tier = Math.ceil(level / 10)
    
    // Base EXP untuk tier 1
    const baseExp = EXP_CONFIG.BASE_EXP_REQUIREMENT
    
    // Multiplier per tier: 2^(tier-1)
    const tierMultiplier = Math.pow(2, tier - 1)
    
    // Multiplier per level dalam tier
    const levelInTier = level % 10 || 10
    const levelMultiplier = Math.pow(EXP_CONFIG.LEVEL_MULTIPLIER, levelInTier - 1)
    
    // Formula: base * tierMultiplier * levelMultiplier
    return Math.floor(baseExp * tierMultiplier * levelMultiplier)
}

/**
 * Hitung level berdasarkan total EXP
 */
export function calculateLevel(exp) {
    if (exp <= 0) return 1
    
    let level = 1
    let totalExpNeeded = 0
    
    // Hitung total EXP yang dibutuhkan sampai level tertentu
    while (true) {
        const expForNextLevel = getExpRequirement(level + 1)
        totalExpNeeded += expForNextLevel
        
        if (exp < totalExpNeeded || level >= 120) {
            break
        }
        
        level++
        
        // Safety break
        if (level > 200) break
    }
    
    return Math.min(level, 120)
}

/**
 * Hitung EXP yang didapat per interaksi
 */
export function calculateExpGain(isPremium = false) {
    const baseExp = EXP_CONFIG.BASE_EXP_PER_MESSAGE
    return isPremium ? baseExp * EXP_CONFIG.PREMIUM_MULTIPLIER : baseExp
}

/**
 * Hitung progress EXP ke level berikutnya
 */
export function getExpProgress(currentExp, currentLevel) {
    if (currentLevel >= 120) {
        return {
            current: 0,
            needed: 0,
            total: currentExp,
            percentage: 100,
            isMaxLevel: true
        }
    }
    
    // Hitung EXP yang sudah terkumpul untuk level saat ini
    let expForCurrentLevel = 0
    for (let lvl = 1; lvl <= currentLevel; lvl++) {
        expForCurrentLevel += getExpRequirement(lvl)
    }
    
    const currentProgress = currentExp - expForCurrentLevel
    const expNeeded = getExpRequirement(currentLevel + 1)
    const percentage = expNeeded > 0 ? Math.floor((currentProgress / expNeeded) * 100) : 0
    
    return {
        current: Math.max(0, currentProgress),
        needed: expNeeded,
        total: expForCurrentLevel + expNeeded,
        percentage: Math.max(0, Math.min(100, percentage)),
        isMaxLevel: false
    }
}

/**
 * Dapatkan rank title berdasarkan level
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
 * Dapatkan info tier
 */
export function getTierInfo(level) {
    const tier = Math.ceil(level / 10)
    const tierStart = ((tier - 1) * 10) + 1
    const tierEnd = tier * 10
    const tierData = TIERS[tier] || TIERS[1]
    
    return {
        tier,
        tierStart,
        tierEnd,
        tierName: tierData.name,
        tierMultiplier: tierData.multiplier,
        isMaxTier: tier === 12
    }
}

/**
 * Dapatkan EXP requirement untuk tier berikutnya
 */
export function getNextTierExp(currentExp, currentLevel) {
    const tierInfo = getTierInfo(currentLevel)
    
    if (tierInfo.isMaxTier) {
        return { needed: 0, toNextTier: 0 }
    }
    
    // Hitung EXP yang dibutuhkan sampai tier berikutnya
    let totalExpNeeded = 0
    for (let lvl = currentLevel + 1; lvl <= tierInfo.tierEnd; lvl++) {
        totalExpNeeded += getExpRequirement(lvl)
    }
    
    return {
        needed: totalExpNeeded,
        toNextTier: Math.max(0, totalExpNeeded - currentExp)
    }
}

/**
 * Hitung hadiah berdasarkan level yang dicapai
 * SISTEM DINAMIS - tidak perlu hardcoded rewards
 */
export function calculateLevelReward(level) {
    let reward = { limit: 0 }
    
    // BASE REWARD: Setiap level mendapatkan minimal reward
    const baseReward = Math.floor(5 * Math.pow(1.1, Math.floor(level / 5)))
    reward.limit += baseReward
    
    // BONUS REWARD: Setiap kelipatan 5 level mendapatkan bonus
    if (level % 5 === 0) {
        const bonus = Math.floor(25 * Math.pow(1.2, level / 5))
        reward.limit += bonus
    }
    
    // SUPER BONUS: Setiap kelipatan 10 level mendapatkan super bonus
    if (level % 10 === 0) {
        const superBonus = Math.floor(100 * Math.pow(1.5, level / 10))
        reward.limit += superBonus
    }
    
    // TIER BONUS: Setiap tier selesai mendapatkan mega bonus
    if (level % 10 === 0) {
        const tier = Math.floor(level / 10)
        const tierBonus = Math.floor(500 * Math.pow(2, tier))
        reward.limit += tierBonus
    }
    
    // LEVEL UP BONUS: Hadiah tambahan berdasarkan level itu sendiri
    const levelBonus = Math.floor(level * 1.5)
    reward.limit += levelBonus
    
    // Pastikan minimal reward
    if (reward.limit < 10) reward.limit = 10
    
    return reward.limit > 0 ? reward : null
}

/**
 * Proses leveling dan berikan hadiah secara dinamis
 */
export function processLevelUp(user, oldLevel, newLevel) {
    const rewards = []
    let totalLimitGained = 0
    
    // Cek setiap level yang dilewati
    for (let level = oldLevel + 1; level <= newLevel; level++) {
        // Hitung hadiah secara dinamis
        const reward = calculateLevelReward(level)
        
        if (reward) {
            const limitGain = reward.limit
            user.limit += limitGain
            totalLimitGained += limitGain
            
            rewards.push({
                level: level,
                limit: limitGain,
                // Tambahkan info bonus jika ada
                bonus: level % 10 === 0 ? 'Tier Bonus' : 
                       level % 5 === 0 ? 'Level Bonus' : 'Regular'
            })
        }
    }
    
    return {
        levelsGained: newLevel - oldLevel,
        totalLimitGained,
        rewards,
        newRank: getRankTitle(newLevel),
        isMaxLevel: newLevel >= 120
    }
}

/**
 * Format angka dengan separator
 */
export function formatNumber(num) {
    if (typeof num !== 'number') num = Number(num) || 0
    
    if (num >= 1000000000000) {
        return (num / 1000000000000).toFixed(2) + 'T'
    }
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(2) + 'B'
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + 'M'
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(2) + 'K'
    }
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

/**
 * Generate progress bar visual
 */
export function generateProgressBar(percentage, length = 10) {
    const filled = Math.floor((percentage / 100) * length)
    const empty = length - filled
    return '█'.repeat(filled) + '░'.repeat(empty)
}

/**
 * Validasi dan perbaiki data user
 */
export function validateUserData(user) {
    if (!user) return
    
    // Pastikan exp tidak negatif
    if (user.exp < 0) user.exp = 0
    
    // Recalculate level berdasarkan exp
    const calculatedLevel = calculateLevel(user.exp)
    if (user.level !== calculatedLevel) {
        console.log(`[LEVEL FIX] ${user.name}: Level ${user.level} → ${calculatedLevel}`)
        user.level = calculatedLevel
    }
    
    // Pastikan limit tidak negatif
    if (user.limit < 0) user.limit = 0
    
    // Pastikan tidak melebihi max level
    if (user.level > 120) user.level = 120
    
    // Auto-save jika ada perubahan
    if (global.db && user.level !== calculatedLevel) {
        setTimeout(() => {
            if (global.db && typeof global.db.write === 'function') {
                global.db.write()
            }
        }, 1000)
    }
}

/**
 * Handle EXP gain
 */
export async function handleExpGain(conn, m, user) {
    try {
        if (!user || user.banned) return
        
        const expGain = calculateExpGain(user.premium)
        const oldLevel = user.level
        const oldExp = user.exp
        
        user.exp += expGain
        
        const newLevel = calculateLevel(user.exp)
        
        if (newLevel > oldLevel) {
            user.level = newLevel
            const levelUpInfo = processLevelUp(user, oldLevel, newLevel)
            await sendLevelUpNotification(conn, m, user, levelUpInfo)
        }
        
        // Auto save database
        if (global.db && typeof global.db.write === 'function') {
            await global.db.write()
            console.log(`[AUTO-SAVE] User ${user.name || 'Unknown'}: +${expGain} EXP`)
        }
        
    } catch (error) {
        console.error('Error handling exp gain:', error)
    }
}

/**
 * Send level up notification
 */
async function sendLevelUpNotification(conn, m, user, info) {
    try {
        let message = ''
        
        if (info.isMaxLevel) {
            message = `*🎉 MAX LEVEL REACHED! 🎉*\n\n`
            message += `*${user.name}* has achieved the ultimate Level 120!\n\n`
            message += `*🏆 FINAL REWARDS:*\n`
            
            for (const reward of info.rewards) {
                message += `• Level ${reward.level}: +${formatNumber(reward.limit)} Limit`
                if (reward.bonus) message += ` (${reward.bonus})`
                message += `\n`
            }
            
            message += `\n*💰 Total Limit Gained:* +${formatNumber(info.totalLimitGained)}\n`
            message += `*💎 Current Limit:* ${formatNumber(user.limit)}\n\n`
            message += `Congratulations, ${info.newRank}! 🏆`
        } else {
            message = `*LEVEL UP! 🎉*\n\n`
            message += `*👤 Name:* ${user.name}\n`
            message += `*⭐ Level:* ${user.level - info.levelsGained} ➜ ${user.level}\n`
            message += `*🏆 Rank:* ${info.newRank}\n\n`
            
            if (info.levelsGained > 1) {
                message += `*🚀 Multi-Level Up!* (+${info.levelsGained} Levels)\n\n`
            }
            
            if (info.totalLimitGained > 0) {
                message += `*🎁 REWARDS RECEIVED:*\n`
                for (const reward of info.rewards) {
                    message += `• Level ${reward.level}: +${formatNumber(reward.limit)} Limit`
                    if (reward.bonus) message += ` (${reward.bonus})`
                    message += `\n`
                }
                message += `\n*💰 Total Limit Gained:* +${formatNumber(info.totalLimitGained)}\n`
                message += `*💎 Current Limit:* ${formatNumber(user.limit)}\n\n`
            }
            
            // Progress info
            const progress = getExpProgress(user.exp, user.level)
            const tierInfo = getTierInfo(user.level)
            
            message += `*📊 PROGRESS:*\n`
            message += `${generateProgressBar(progress.percentage, 15)}\n`
            message += `${progress.percentage}% (${formatNumber(progress.current)}/${formatNumber(progress.needed)} EXP)\n\n`
            
            message += `*🎯 ${tierInfo.tierName} (${tierInfo.tierStart}-${tierInfo.tierEnd})*\n`
            message += `Tier Multiplier: ${tierInfo.tierMultiplier}x EXP Required\n\n`
            
            if (user.premium) {
                message += `*⚡ Premium Bonus:* 2x EXP Active\n`
            }
            
            message += `\nContinue your journey to Level 120! 🔥`
        }
        
        await conn.reply(m.chat, message, m)
        
    } catch (error) {
        console.error('Error sending level up notification:', error)
    }
}

/**
 * Dapatkan informasi leveling yang lengkap
 */
export function getLevelingInfo(user) {
    const level = user.level
    const exp = user.exp
    const progress = getExpProgress(exp, level)
    const tierInfo = getTierInfo(level)
    const nextTierExp = getNextTierExp(exp, level)
    const rank = getRankTitle(level)
    
    // Hitung EXP per jam (estimasi)
    const expPerHour = calculateExpGain(user.premium) * 60 * 60
    const hoursToNextLevel = progress.needed / expPerHour
    
    return {
        level,
        exp,
        rank,
        tierInfo,
        progress,
        nextTierExp,
        expPerHour: formatNumber(expPerHour),
        hoursToNextLevel: hoursToNextLevel.toFixed(1),
        isMaxLevel: progress.isMaxLevel
    }
}

// ========== EXPORT SEMUA FUNGSI ==========
export default {
    EXP_CONFIG,
    RANK_TITLES,
    TIERS,
    getExpRequirement,
    calculateLevel,
    calculateExpGain,
    getExpProgress,
    getRankTitle,
    getTierInfo,
    getNextTierExp,
    calculateLevelReward,
    processLevelUp,
    handleExpGain,
    sendLevelUpNotification,
    formatNumber,
    generateProgressBar,
    validateUserData,
    getLevelingInfo
}