/*
 * @Author      : Rafli
 * @Feature     : RPG Levelling & Role Progression System
 * @Description : Formula progresif EXP, kalkulasi level, progress bar, dan sistem role berjenjang.
 */

/**
 * Menghitung batas minimum EXP untuk mencapai level tertentu
 * Formula: 500 * L * (L + 1)
 */
export function totalExpForLevel(level) {
    if (level <= 0) return 0
    return 500 * level * (level + 1)
}

/**
 * Menghitung level saat ini berdasarkan total EXP
 * Formula kuadratik invers: L = floor((sqrt(250000 + 2000 * exp) - 500) / 1000)
 */
export function findLevel(exp) {
    if (!exp || exp <= 0) return 0
    return Math.floor((Math.sqrt(250000 + 2000 * exp) - 500) / 1000)
}

/**
 * Mendapatkan detail lengkap progres level saat ini
 */
export function getLevelProgress(exp = 0) {
    const currentExp = Math.max(0, typeof exp === 'number' ? exp : 0)
    const level = findLevel(currentExp)

    const minExpThisLevel = totalExpForLevel(level)
    const minExpNextLevel = totalExpForLevel(level + 1)

    const expEarnedThisLevel = currentExp - minExpThisLevel
    const expNeededForNextLevel = minExpNextLevel - minExpThisLevel
    const remainingExp = minExpNextLevel - currentExp

    const percent = Math.min(100, Math.max(0, Math.floor((expEarnedThisLevel / expNeededForNextLevel) * 100)))

    // Render bar 10 karakter
    const filledLength = Math.round((10 * percent) / 100)
    const emptyLength = 10 - filledLength
    const bar = '█'.repeat(filledLength) + '░'.repeat(emptyLength)

    return {
        level,
        role: getRoleByLevel(level),
        totalExp: currentExp,
        minExpThisLevel,
        minExpNextLevel,
        expEarnedThisLevel,
        expNeededForNextLevel,
        remainingExp,
        percent,
        bar
    }
}

/**
 * Sistem Role Berjenjang Adventurer Guild (22 Tingkatan Progresif)
 */
export function getRoleByLevel(level = 0) {
    const l = Math.max(0, level)

    // F-Rank (Novice)
    if (l < 5)   return 'F-Rank • Civilian'      // Lv 0 - 4
    if (l < 10)  return 'F-Rank • Trainee'       // Lv 5 - 9

    // E-Rank (Apprentice)
    if (l < 15)  return 'E-Rank • Scout'         // Lv 10 - 14
    if (l < 20)  return 'E-Rank • Hunter'        // Lv 15 - 19

    // D-Rank (Rookie)
    if (l < 25)  return 'D-Rank • Adventurer'    // Lv 20 - 24
    if (l < 30)  return 'D-Rank • Pathfinder'    // Lv 25 - 29

    // C-Rank (Experienced)
    if (l < 35)  return 'C-Rank • Mercenary'     // Lv 30 - 34
    if (l < 40)  return 'C-Rank • Veteran'       // Lv 35 - 39
    if (l < 45)  return 'C-Rank • Slayer'        // Lv 40 - 44

    // B-Rank (Elite)
    if (l < 50)  return 'B-Rank • Vanguard'      // Lv 45 - 49
    if (l < 55)  return 'B-Rank • Knight'        // Lv 50 - 54
    if (l < 60)  return 'B-Rank • Guardian'      // Lv 55 - 59

    // A-Rank (Master)
    if (l < 70)  return 'A-Rank • Warlord'       // Lv 60 - 69
    if (l < 80)  return 'A-Rank • Champion'      // Lv 70 - 79
    if (l < 90)  return 'A-Rank • Conqueror'     // Lv 80 - 89

    // S-Rank (Heroic)
    if (l < 100) return 'S-Rank • Hero'          // Lv 90 - 99
    if (l < 120) return 'S-Rank • Overlord'      // Lv 100 - 119

    // SS-Rank (Mythical)
    if (l < 140) return 'SS-Rank • Legend'       // Lv 120 - 139
    if (l < 160) return 'SS-Rank • Demigod'      // Lv 140 - 159

    // SSS-Rank & EX (Godly)
    if (l < 180) return 'SSS-Rank • Monarch'     // Lv 160 - 179
    if (l < 200) return 'SSS-Rank • Sovereign'   // Lv 180 - 199
    return 'EX-Rank • Eternal'                   // Lv 200+
}
