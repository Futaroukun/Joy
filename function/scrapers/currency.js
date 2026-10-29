/*
 * @Author      : Rafli
 * @Feature     : Hardcore Fantasy Anime Currency System
 * @Description : Sistem nilai tukar koin langka (Perunggu, Perak, Emas, Platina) dengan rate 1.000:1 per tingkat.
 */

export const COPPER_PER_SILVER   = 1000
export const SILVER_PER_GOLD     = 1000
export const GOLD_PER_PLATINUM   = 1000

export const COPPER_PER_GOLD     = 1000000        // 1.000 * 1.000 (1 Juta CP)
export const COPPER_PER_PLATINUM = 1000000000     // 1.000.000 * 1.000 (1 Miliar CP)

/**
 * Memecah total nilai perunggu ke pecahan koin (Platina, Emas, Perak, Perunggu)
 */
export function parseCoins(totalCopper = 0) {
    const raw = Math.max(0, typeof totalCopper === 'number' ? Math.floor(totalCopper) : 0)

    const platinum = Math.floor(raw / COPPER_PER_PLATINUM)
    const remPlat  = raw % COPPER_PER_PLATINUM

    const gold     = Math.floor(remPlat / COPPER_PER_GOLD)
    const remGold  = remPlat % COPPER_PER_GOLD

    const silver   = Math.floor(remGold / COPPER_PER_SILVER)
    const copper   = remGold % COPPER_PER_SILVER

    return {
        platinum,
        gold,
        silver,
        copper,
        totalCopper: raw
    }
}

/**
 * Format string koin ringkas (hanya menampilkan pecahan yang bernilai > 0)
 * Contoh: "1 Emas, 24 Perak, 350 Perunggu"
 */
export function formatCoins(totalCopper = 0, { short = false } = {}) {
    const { platinum, gold, silver, copper, totalCopper: raw } = parseCoins(totalCopper)

    if (raw === 0) {
        return short ? '0 CP' : '0 Perunggu'
    }

    const parts = []

    if (platinum > 0) {
        parts.push(short ? `${platinum.toLocaleString('id-ID')} PP` : `${platinum.toLocaleString('id-ID')} Platina`)
    }
    if (gold > 0) {
        parts.push(short ? `${gold.toLocaleString('id-ID')} GP` : `${gold.toLocaleString('id-ID')} Emas`)
    }
    if (silver > 0) {
        parts.push(short ? `${silver.toLocaleString('id-ID')} SP` : `${silver.toLocaleString('id-ID')} Perak`)
    }
    if (copper > 0) {
        parts.push(short ? `${copper.toLocaleString('id-ID')} CP` : `${copper.toLocaleString('id-ID')} Perunggu`)
    }

    return parts.join(', ')
}

/**
 * Format visual dompet/kantung koin petualang
 */
export function formatWalletBox(totalCopper = 0) {
    const { platinum, gold, silver, copper, totalCopper: raw } = parseCoins(totalCopper)

    let out = `╭── ✦ *KANTUNG KOIN* ✦\n`
    out += `│ • Platina  : ${platinum.toLocaleString('id-ID')} PP\n`
    out += `│ • Emas     : ${gold.toLocaleString('id-ID')} GP\n`
    out += `│ • Perak    : ${silver.toLocaleString('id-ID')} SP\n`
    out += `│ • Perunggu : ${copper.toLocaleString('id-ID')} CP\n`
    out += `│ • Total CP : ${raw.toLocaleString('id-ID')} CP\n`
    out += `╰━━━━━━━━━━━━━━━━━━━━━━━`
    return out
}

/**
 * Milestone reward saat naik tier guild tertentu
 */
export const RANK_MILESTONES = [
    { level: 20,  rank: 'D-Rank',  name: '100 Perunggu',  copper: 100 },
    { level: 30,  rank: 'C-Rank',  name: '1 Perak',       copper: 1 * COPPER_PER_SILVER },
    { level: 45,  rank: 'B-Rank',  name: '5 Perak',       copper: 5 * COPPER_PER_SILVER },
    { level: 60,  rank: 'A-Rank',  name: '25 Perak',      copper: 25 * COPPER_PER_SILVER },
    { level: 90,  rank: 'S-Rank',  name: '1 Emas',        copper: 1 * COPPER_PER_GOLD },
    { level: 120, rank: 'SS-Rank', name: '5 Emas',        copper: 5 * COPPER_PER_GOLD },
    { level: 160, rank: 'SSS-Rank',name: '25 Emas',       copper: 25 * COPPER_PER_GOLD },
    { level: 200, rank: 'EX-Rank', name: '1 Platina',     copper: 1 * COPPER_PER_PLATINUM }
]

export function checkRankMilestoneRewards(oldLevel = 0, newLevel = 0) {
    if (newLevel <= oldLevel) return []
    return RANK_MILESTONES.filter(m => oldLevel < m.level && newLevel >= m.level)
}
