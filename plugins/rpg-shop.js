/*
 * @Author      : Rafli
 * @Feature     : RPG Guild Shop (Toko Petualang & Lencana Berdurasi)
 * @Description : Toko penukaran koin anime dengan single_select, katalog produk luas, dan alur dua tahap pemilihan durasi lencana (Trial s/d Permanen).
 */

import {
    COPPER_PER_SILVER,
    COPPER_PER_GOLD,
    COPPER_PER_PLATINUM,
    formatCoins,
    checkRankMilestoneRewards
} from '../function/scrapers/currency.js'
import { getLevelProgress } from '../function/core/levelling.js'

// ── KATALOG PRODUK REGULER (LIMIT, PASS, EXP) ────────────────────────────────
export const SHOP_ITEMS = {
    // ── 1. KATEGORI TIKET LIMIT ──────────────────────────────────────────────
    limit_mini: {
        id: 'limit_mini',
        name: '15 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 50,
        desc: '+15 Limit penggunaan bot',
        apply: (user) => {
            user.limit = (user.limit || 0) + 15
            return 'Berhasil menambah 15 Limit Tiket.'
        }
    },
    limit_small: {
        id: 'limit_small',
        name: '50 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 150,
        desc: '+50 Limit penggunaan bot',
        apply: (user) => {
            user.limit = (user.limit || 0) + 50
            return 'Berhasil menambah 50 Limit Tiket.'
        }
    },
    limit_medium: {
        id: 'limit_medium',
        name: '120 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 350,
        desc: '+120 Limit penggunaan bot',
        apply: (user) => {
            user.limit = (user.limit || 0) + 120
            return 'Berhasil menambah 120 Limit Tiket.'
        }
    },
    limit_large: {
        id: 'limit_large',
        name: '350 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 1 * COPPER_PER_SILVER,
        desc: '+350 Limit (Hemat 1 Perak)',
        apply: (user) => {
            user.limit = (user.limit || 0) + 350
            return 'Berhasil menambah 350 Limit Tiket.'
        }
    },
    limit_epic: {
        id: 'limit_epic',
        name: '1.000 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 2500,
        desc: '+1.000 Limit (2 Perak 500 CP)',
        apply: (user) => {
            user.limit = (user.limit || 0) + 1000
            return 'Berhasil menambah 1.000 Limit Tiket.'
        }
    },
    limit_legend: {
        id: 'limit_legend',
        name: '2.500 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 5 * COPPER_PER_SILVER,
        desc: '+2.500 Limit (5 Perak)',
        apply: (user) => {
            user.limit = (user.limit || 0) + 2500
            return 'Berhasil menambah 2.500 Limit Tiket.'
        }
    },
    limit_mythic: {
        id: 'limit_mythic',
        name: '10.000 Limit Tiket',
        category: 'Paket Tiket Limit',
        price: 18 * COPPER_PER_SILVER,
        desc: '+10.000 Limit (Paket Sultan Guild)',
        apply: (user) => {
            user.limit = (user.limit || 0) + 10000
            return 'Berhasil menambah 10.000 Limit Tiket.'
        }
    },

    // ── 2. KATEGORI ADVENTURER PASS (STATUS PREMIUM) ──────────────────────────
    prem_1d: {
        id: 'prem_1d',
        name: 'Trainee Pass (1 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 800,
        desc: 'Status Premium bot selama 24 jam',
        apply: (user) => {
            const durationMs = 1 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 1 hari.'
        }
    },
    prem_3d: {
        id: 'prem_3d',
        name: 'Bronze Guild Pass (3 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 2 * COPPER_PER_SILVER,
        desc: 'Status Premium bot selama 3 hari',
        apply: (user) => {
            const durationMs = 3 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 3 hari.'
        }
    },
    prem_7d: {
        id: 'prem_7d',
        name: 'Silver Guild Pass (7 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 4 * COPPER_PER_SILVER,
        desc: 'Status Premium bot selama 7 hari',
        apply: (user) => {
            const durationMs = 7 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 7 hari.'
        }
    },
    prem_14d: {
        id: 'prem_14d',
        name: 'Gold Guild Pass (14 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 7 * COPPER_PER_SILVER,
        desc: 'Status Premium bot selama 14 hari',
        apply: (user) => {
            const durationMs = 14 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 14 hari.'
        }
    },
    prem_30d: {
        id: 'prem_30d',
        name: 'Platinum Guild Pass (30 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 15 * COPPER_PER_SILVER,
        desc: 'Status Premium bot selama 30 hari penuh',
        apply: (user) => {
            const durationMs = 30 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 30 hari.'
        }
    },
    prem_60d: {
        id: 'prem_60d',
        name: 'Mythic Guild Pass (60 Hari)',
        category: 'Adventurer Pass (Premium)',
        price: 28 * COPPER_PER_SILVER,
        desc: 'Status Premium bot selama 60 hari penuh',
        apply: (user) => {
            const durationMs = 60 * 24 * 60 * 60 * 1000
            const now = Date.now()
            const base = (user.premium && user.premiumDate > now) ? user.premiumDate : now
            user.premium = true
            user.premiumDate = base + durationMs
            return 'Status Premium aktif selama 60 hari.'
        }
    },

    // ── 3. KATEGORI GULUNGAN EXP (BOOSTER LEVEL) ─────────────────────────────
    exp_rookie: {
        id: 'exp_rookie',
        name: 'Gulungan EXP Trainee (+500 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 40,
        desc: '+500 EXP Petualang pemula',
        apply: (user) => {
            user.exp = (user.exp || 0) + 500
            return 'Berhasil menyerap Gulungan EXP (+500 EXP).'
        }
    },
    exp_novice: {
        id: 'exp_novice',
        name: 'Gulungan EXP Pemula (+1.500 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 100,
        desc: '+1.500 EXP Petualang pemula',
        apply: (user) => {
            user.exp = (user.exp || 0) + 1500
            return 'Berhasil menyerap Gulungan EXP (+1.500 EXP).'
        }
    },
    exp_scout: {
        id: 'exp_scout',
        name: 'Gulungan EXP Pengelana (+5.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 350,
        desc: '+5.000 EXP Petualang pengelana',
        apply: (user) => {
            user.exp = (user.exp || 0) + 5000
            return 'Berhasil menyerap Gulungan EXP (+5.000 EXP).'
        }
    },
    exp_veteran: {
        id: 'exp_veteran',
        name: 'Gulungan EXP Veteran (+15.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 1 * COPPER_PER_SILVER,
        desc: '+15.000 EXP Petualang veteran',
        apply: (user) => {
            user.exp = (user.exp || 0) + 15000
            return 'Berhasil menyerap Gulungan EXP (+15.000 EXP).'
        }
    },
    exp_knight: {
        id: 'exp_knight',
        name: 'Gulungan EXP Ksatria (+40.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 2500,
        desc: '+40.000 EXP Petualang ksatria',
        apply: (user) => {
            user.exp = (user.exp || 0) + 40000
            return 'Berhasil menyerap Gulungan EXP (+40.000 EXP).'
        }
    },
    exp_master: {
        id: 'exp_master',
        name: 'Gulungan EXP Master (+100.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 6 * COPPER_PER_SILVER,
        desc: '+100.000 EXP Petualang master',
        apply: (user) => {
            user.exp = (user.exp || 0) + 100000
            return 'Berhasil menyerap Gulungan EXP (+100.000 EXP).'
        }
    },
    exp_hero: {
        id: 'exp_hero',
        name: 'Gulungan EXP Pahlawan (+250.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 15 * COPPER_PER_SILVER,
        desc: '+250.000 EXP Petualang pahlawan',
        apply: (user) => {
            user.exp = (user.exp || 0) + 250000
            return 'Berhasil menyerap Gulungan EXP (+250.000 EXP).'
        }
    },
    exp_ancient: {
        id: 'exp_ancient',
        name: 'Gulungan Sihir Kuno (+1.000.000 EXP)',
        category: 'Gulungan EXP (Booster Level)',
        price: 1 * COPPER_PER_GOLD,
        desc: '+1 Juta EXP (Harga 1 Emas)',
        apply: (user) => {
            user.exp = (user.exp || 0) + 1000000
            return 'Berhasil menyerap Gulungan Sihir Kuno (+1.000.000 EXP).'
        }
    }
}

// ── 4. KATALOG LENCANA KEHORMATAN GUILD & DURASI (18 VARIASI LENGKAP) ────────
export const GUILD_BADGES = {
    // ── Tier 1: Jalur Penjelajah & Pemula ──────────────
    badge_scout: {
        id: 'badge_scout',
        title: 'Lencana Pengelana Alam',
        tag: '🏹 Pengelana Alam',
        desc: 'Simbol petualang tangkas penjelajah rimba',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 150,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 400,                     ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 800,                     ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 2 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 10 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_wanderer: {
        id: 'badge_wanderer',
        title: 'Kompas Pengembara Sunyi',
        tag: '🧭 Pengembara Sunyi',
        desc: 'Panduan musafir tanpa rasa takut melintasi batas dunia',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 180,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 450,                     ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 900,                     ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 2500,                    ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 12 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_pioneer: {
        id: 'badge_pioneer',
        title: 'Lencana Perintis Rimba',
        tag: '⛺ Perintis Rimba',
        desc: 'Penakluk rute tersembunyi yang belum terjamah peta',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 200,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 500,                     ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 1 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 3 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 15 * COPPER_PER_SILVER,  ms: -1 }
        }
    },

    // ── Tier 2: Jalur Tempur & Ksatria ─────────────────
    badge_elite: {
        id: 'badge_elite',
        title: 'Lencana Petualang Elite',
        tag: '🛡️ Petualang Elite',
        desc: 'Tanda kehormatan pejuang tangguh garis depan',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 350,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 900,                     ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 2 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 6 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 35 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_berserk: {
        id: 'badge_berserk',
        title: 'Kapak Berserker Berdarah',
        tag: '🪓 Berserker Berdarah',
        desc: 'Semangat tempur liar tanpa mengenal rasa gentar',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 400,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1 * COPPER_PER_SILVER,   ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 2500,                    ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 7 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 40 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_paladin: {
        id: 'badge_paladin',
        title: 'Pedang Suci Ksatria Cahaya',
        tag: '⚔️ Ksatria Cahaya',
        desc: 'Kekuatan pelindung suci penjaga keadilan guild',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 500,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1200,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 3 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 8 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 45 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_assassin: {
        id: 'badge_assassin',
        title: 'Belati Bayangan Maut',
        tag: '🗡️ Bayangan Maut',
        desc: 'Pemburu senyap pembawa takdir dalam kegelapan',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 450,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1100,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 2800,                    ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 8 * COPPER_PER_SILVER,   ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 45 * COPPER_PER_SILVER,  ms: -1 }
        }
    },

    // ── Tier 3: Jalur Elemen & Sihir ───────────────────
    badge_sorcerer: {
        id: 'badge_sorcerer',
        title: 'Orb Penyihir Bintang',
        tag: '🔮 Penyihir Bintang',
        desc: 'Pemegang rahasia astrologi dan mantera kuno alam semesta',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 600,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1500,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 3500,                    ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 10 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 60 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_pyro: {
        id: 'badge_pyro',
        title: 'Segel Api Neraka',
        tag: '🔥 Api Neraka',
        desc: 'Kekuatan lidah api pemusnah segala rintangan musuh',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 650,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1600,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 4 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 12 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 65 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_frost: {
        id: 'badge_frost',
        title: 'Kristal Es Abadi',
        tag: '❄️ Penguasa Es',
        desc: 'Kekuatan es mutlak yang membekukan waktu dan ruang',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 650,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1600,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 4 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 12 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 65 * COPPER_PER_SILVER,  ms: -1 }
        }
    },
    badge_storm: {
        id: 'badge_storm',
        title: 'Lambang Badai Petir',
        tag: '⚡ Badai Petir',
        desc: 'Kilatan petir surgawi pembawa kehancuran berkecepatan tinggi',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 700,                     ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 1800,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 4500,                    ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 14 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 75 * COPPER_PER_SILVER,  ms: -1 }
        }
    },

    // ── Tier 4: Jalur Bangsawan & Mitologi ─────────────
    badge_merchant: {
        id: 'badge_merchant',
        title: 'Plakat Saudagar Emas Guild',
        tag: '🪙 Saudagar Emas',
        desc: 'Tuan tanah dan taipan perdagangan terkaya dalam guild',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 1 * COPPER_PER_SILVER,   ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 2500,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 6 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 20 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 120 * COPPER_PER_SILVER, ms: -1 }
        }
    },
    badge_vip: {
        id: 'badge_vip',
        title: 'Lambang Bangsawan Guild',
        tag: '⚜️ Bangsawan Guild',
        desc: 'Lambang kemewahan ningrat dan pelindung guild',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 1500,                    ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 3500,                    ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 8 * COPPER_PER_SILVER,   ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 25 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 150 * COPPER_PER_SILVER, ms: -1 }
        }
    },
    badge_slayer: {
        id: 'badge_slayer',
        title: 'Taring Pembantai Naga',
        tag: '🐉 Pembantai Naga',
        desc: 'Bukti kemenangan mutlak menundukkan monster purba naga',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 3 * COPPER_PER_SILVER,   ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 8 * COPPER_PER_SILVER,   ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 18 * COPPER_PER_SILVER,  ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 60 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 500 * COPPER_PER_SILVER, ms: -1 }
        }
    },
    badge_hero: {
        id: 'badge_hero',
        title: 'Medali Pahlawan Penakluk',
        tag: '⚔️ Pahlawan Penakluk',
        desc: 'Gelar pahlawan suci penyelamat benua dari bencana',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 5 * COPPER_PER_SILVER,   ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 12 * COPPER_PER_SILVER,  ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 25 * COPPER_PER_SILVER,  ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 80 * COPPER_PER_SILVER,  ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 1 * COPPER_PER_GOLD,     ms: -1 } // 1 Emas (1 Juta CP)!
        }
    },

    // ── Tier 5: Jalur Penguasa & Dewa Keabadian ────────
    badge_celestial: {
        id: 'badge_celestial',
        title: 'Sayap Utusan Surgawi',
        tag: '🕊️ Utusan Surgawi',
        desc: 'Pemberkatan langsung dari dewa pelindung dunia atas',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 10 * COPPER_PER_SILVER,  ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 25 * COPPER_PER_SILVER,  ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 60 * COPPER_PER_SILVER,  ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 200 * COPPER_PER_SILVER, ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 2 * COPPER_PER_GOLD,     ms: -1 } // 2 Emas
        }
    },
    badge_monarch: {
        id: 'badge_monarch',
        title: 'Mahkota Penguasa Abyss',
        tag: '👑 Penguasa Abyss',
        desc: 'Tahta absolut penguasa tertinggi dunia bawah tanah',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 15 * COPPER_PER_SILVER,  ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 40 * COPPER_PER_SILVER,  ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 90 * COPPER_PER_SILVER,  ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 300 * COPPER_PER_SILVER, ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 3 * COPPER_PER_GOLD,     ms: -1 } // 3 Emas
        }
    },
    badge_overlord: {
        id: 'badge_overlord',
        title: 'Cincin Penguasa Kematian',
        tag: '💀 Overlord Kematian',
        desc: 'Kekuatan mutlak menguasai siklus hidup dan mati di medan perang',
        durations: {
            '1d':   { label: 'Trial 1 Hari',   price: 25 * COPPER_PER_SILVER,  ms: 1 * 86400000 },
            '3d':   { label: 'Trial 3 Hari',   price: 60 * COPPER_PER_SILVER,  ms: 3 * 86400000 },
            '7d':   { label: 'Trial 7 Hari',   price: 150 * COPPER_PER_SILVER, ms: 7 * 86400000 },
            '30d':  { label: 'Trial 30 Hari',  price: 500 * COPPER_PER_SILVER, ms: 30 * 86400000 },
            'perm': { label: 'Permanen',       price: 5 * COPPER_PER_GOLD,     ms: -1 } // 5 Emas (5 Juta CP)!
        }
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const senderLid = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender
    const user = global.db.data.users[senderLid] || global.db.data.users[m.sender]

    if (!user) {
        return m.reply('Data akun kamu tidak ditemukan di database.')
    }

    const userMoney = typeof user.money === 'number' ? user.money : 0
    const rawArgs = (text || '').trim().split(/\s+/)
    const arg0 = (rawArgs[0] || '').toLowerCase()
    const arg1 = (rawArgs[1] || '').toLowerCase()

    // ── TAHAP 2A: TAMPILKAN SINGLE SELECT KATALOG DURASI LENCANA ──────────────
    // Terpicu jika arg0 = 'badge' atau arg0 cocok dengan id lencana di GUILD_BADGES
    const selectedBadgeKey = (arg0 === 'badge' ? arg1 : (GUILD_BADGES[arg0] ? arg0 : null))
    const badgeObj = GUILD_BADGES[selectedBadgeKey]

    if (badgeObj && (!arg1 || arg0 === 'badge' && !rawArgs[2])) {
        const durationRows = Object.entries(badgeObj.durations).map(([durKey, dur]) => ({
            header: formatCoins(dur.price, { short: true }),
            title: `${dur.label} • ${badgeObj.title}`,
            description: `Harga: ${formatCoins(dur.price)} • Tag: ${badgeObj.tag}`,
            id: `${usedPrefix}buy ${badgeObj.id} ${durKey}`
        }))

        const durationSections = [
            {
                title: `Pilihan Durasi: ${badgeObj.title}`,
                rows: durationRows
            }
        ]

        const bodyDurationText =
            `*PILIH DURASI: ${badgeObj.title.toUpperCase()}*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Tag Profil:* ${badgeObj.tag}\n` +
            `• *Deskripsi:* _${badgeObj.desc}_\n` +
            `• *Saldo Koin Kamu:* ${formatCoins(userMoney)}\n\n` +
            `Silakan tentukan durasi masa aktif yang diinginkan melalui tombol di bawah atau ketik:\n` +
            `• \`${usedPrefix}buy ${badgeObj.id} <1d|3d|7d|30d|perm>\``

        const durationButtons = [
            {
                name: 'single_select',
                buttonParamsJson: JSON.stringify({
                    title: 'PILIH MASA AKTIF LENCANA',
                    sections: durationSections
                })
            }
        ]

        try {
            await conn.sendMessage(m.chat, { react: { text: '🏷️', key: m.key } }).catch(() => {})
            return await conn.sendButton(m.chat, {
                body: bodyDurationText,
                footer: `${global.info?.namabot || 'Joy'} • Durasi Lencana`,
                buttons: durationButtons
            }, { quoted: m })
        } catch {
            let fallbackTxt = `${bodyDurationText}\n\n`
            for (const [dKey, dVal] of Object.entries(badgeObj.durations)) {
                fallbackTxt += `• \`${usedPrefix}buy ${badgeObj.id} ${dKey}\` ➔ *${dVal.label}* (${formatCoins(dVal.price)})\n`
            }
            return m.reply(fallbackTxt.trim())
        }
    }

    // ── TAHAP 2B: EKSEKUSI PEMBELIAN LENCANA BERDURASI ────────────────────────
    const durCode = (arg0 === 'badge' ? (rawArgs[2] || '').toLowerCase() : arg1)
    if (badgeObj && durCode && badgeObj.durations[durCode]) {
        const dur = badgeObj.durations[durCode]

        if (userMoney < dur.price) {
            return m.reply(
                `Koin kamu tidak mencukupi untuk membeli *${badgeObj.title} (${dur.label})*.\n\n` +
                `• Harga Item : *${formatCoins(dur.price)}*\n` +
                `• Saldo Kamu : *${formatCoins(userMoney)}*`
            )
        }

        // Potong Koin
        user.money = userMoney - dur.price
        const isPermanent = dur.ms === -1

        if (isPermanent) {
            user.badge = badgeObj.tag
            user.badgeExpire = -1
        } else {
            const now = Date.now()
            const base = (user.badge === badgeObj.tag && user.badgeExpire > now) ? user.badgeExpire : now
            user.badge = badgeObj.tag
            user.badgeExpire = base + dur.ms
        }

        global.saveData('users', senderLid)
        if (senderLid !== m.sender) global.saveData('users', m.sender)

        let receipt = `╭── ✦ *TRANSAKSI LENCANA BERHASIL* ✦\n`
        receipt += `│ • Lencana     : *${badgeObj.title}*\n`
        receipt += `│ • Gelar Tag   : ${badgeObj.tag}\n`
        receipt += `│ • Masa Aktif  : *${dur.label}*\n`
        receipt += `│ • Biaya Koin  : *${formatCoins(dur.price)}*\n`
        receipt += `│ • Sisa Koin   : *${formatCoins(user.money)}*\n`
        receipt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        receipt += `> _Gelar baru telah terpasang dan dapat dicek via \`${usedPrefix}profile\`._`

        await conn.sendMessage(m.chat, { react: { text: '⚜️', key: m.key } }).catch(() => {})
        return m.reply(receipt.trim())
    }

    // ── 1. EKSEKUSI PEMBELIAN ITEM REGULER (LIMIT, PASS, EXP) ────────────────
    const regularItem = SHOP_ITEMS[arg0]
    if (regularItem) {
        if (userMoney < regularItem.price) {
            return m.reply(
                `Koin kamu tidak cukup untuk membeli *${regularItem.name}*.\n\n` +
                `• Harga Item : *${formatCoins(regularItem.price)}*\n` +
                `• Saldo Kamu : *${formatCoins(userMoney)}*`
            )
        }

        const oldExp = user.exp || 0
        const oldProgress = getLevelProgress(oldExp)

        // Potong Koin & Berikan Efek Item
        user.money = userMoney - regularItem.price
        const resultText = regularItem.apply(user)

        // Deteksi kenaikan level dan hadiah milestone guild
        let levelUpNotice = ''
        if (regularItem.category === 'Gulungan EXP (Booster Level)') {
            const newProgress = getLevelProgress(user.exp)
            if (newProgress.level > oldProgress.level) {
                levelUpNotice += `\n*SELAMAT! KAMU NAIK LEVEL!*\n` +
                                 `• Level ${oldProgress.level} ➔ *Level ${newProgress.level}*\n` +
                                 `• Role Baru: *${newProgress.role}*\n`

                const milestones = checkRankMilestoneRewards(oldProgress.level, newProgress.level)
                if (milestones.length > 0) {
                    let bonusCopper = 0
                    let bonusList = []
                    for (const ms of milestones) {
                        bonusCopper += ms.copper
                        bonusList.push(`  › *${ms.rank}*: +${ms.name}`)
                    }
                    user.money += bonusCopper
                    levelUpNotice += `\n*BONUS GUILD MILESTONE!*\n` + bonusList.join('\n') + `\n`
                }
            }
        }

        global.saveData('users', senderLid)
        if (senderLid !== m.sender) global.saveData('users', m.sender)

        let receipt = `╭── ✦ *TRANSAKSI BERHASIL* ✦\n`
        receipt += `│ • Item Dibeli : *${regularItem.name}*\n`
        receipt += `│ • Harga       : *${formatCoins(regularItem.price)}*\n`
        receipt += `│ • Efek        : ${resultText}\n`
        receipt += `│ • Sisa Koin   : *${formatCoins(user.money)}*\n`
        receipt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n`

        if (levelUpNotice) {
            receipt += levelUpNotice
        }

        await conn.sendMessage(m.chat, { react: { text: '🛍️', key: m.key } }).catch(() => {})
        return m.reply(receipt.trim())
    }

    // ── TAHAP 1: SIAPKAN DATA SINGLE SELECT KATALOG TOKO UTAMA ───────────────
    const categories = [
        'Paket Tiket Limit',
        'Adventurer Pass (Premium)',
        'Gulungan EXP (Booster Level)'
    ]

    const sections = categories.map(cat => {
        const catItems = Object.values(SHOP_ITEMS).filter(i => i.category === cat)
        return {
            title: cat,
            rows: catItems.map(item => ({
                header: formatCoins(item.price, { short: true }),
                title: item.name,
                description: `${formatCoins(item.price)} • ${item.desc}`,
                id: `${usedPrefix}buy ${item.id}`
            }))
        }
    })

    // Tambahkan Section Khusus: Lencana Kehormatan Guild (Pilih untuk melihat katalog durasi)
    sections.push({
        title: 'Koleksi Lencana Kehormatan (Trial & Permanen)',
        rows: Object.values(GUILD_BADGES).map(b => ({
            header: 'PILIH DURASI',
            title: `${b.title} (${b.tag})`,
            description: `${b.desc} • Ketuk untuk pilih durasi`,
            id: `${usedPrefix}buy badge ${b.id}`
        }))
    })

    const totalProductCount = Object.keys(SHOP_ITEMS).length + Object.keys(GUILD_BADGES).length

    const currentBadgeDisplay = user.badge
        ? `${user.badge} ${user.badgeExpire > 0 ? `(Trial: ${Math.ceil((user.badgeExpire - Date.now()) / (1000 * 60 * 60 * 24))} Hari)` : '(Permanen)'}`
        : 'Belum ada lencana'

    const bodyText =
        `*TOKO GUILD PETUALANG*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Gunakan koin hasil petualangan untuk membeli Limit, Pass Premium, EXP Booster, dan Lencana Kehormatan.\n\n` +
        `• *Saldo Koin Kamu:* ${formatCoins(userMoney)}\n` +
        `• *Lencana Terpasang:* ${currentBadgeDisplay}\n` +
        `• *Total Produk:* ${totalProductCount} Pilihan Item & Lencana\n\n` +
        `Silakan pilih produk melalui tombol interaktif di bawah atau ketik:\n` +
        `• \`${usedPrefix}buy <id_item>\`\n` +
        `• Khusus lencana: Pilih lencana untuk membuka pilihan durasi.`

    const buttons = [
        {
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
                title: 'BUKA KATALOG TOKO',
                sections: sections
            })
        }
    ]

    try {
        await conn.sendMessage(m.chat, { react: { text: '🏪', key: m.key } }).catch(() => {})
        return await conn.sendButton(m.chat, {
            body: bodyText,
            footer: `${global.info?.namabot || 'Joy'} • Toko Guild`,
            buttons: buttons
        }, { quoted: m })
    } catch {
        // Fallback teks jika perangkat tidak mendukung interactive button
        let textCatalog = `${bodyText}\n\n`
        for (const cat of categories) {
            textCatalog += `╭── ✦ *${cat.toUpperCase()}* ✦\n`
            const catItems = Object.values(SHOP_ITEMS).filter(i => i.category === cat)
            for (const item of catItems) {
                textCatalog += `│ • \`${item.id}\`: ${item.name} ➔ *${formatCoins(item.price)}*\n`
            }
            textCatalog += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        textCatalog += `╭── ✦ *KOLEKSI LENCANA KEHORMATAN* ✦\n`
        for (const b of Object.values(GUILD_BADGES)) {
            textCatalog += `│ • \`${usedPrefix}buy badge ${b.id}\`: ${b.title} (${b.tag})\n`
        }
        textCatalog += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        textCatalog += `> Ketik \`${usedPrefix}buy badge <id_lencana>\` untuk melihat pilihan durasi.`
        return m.reply(textCatalog.trim())
    }
}

handler.help     = ['toko', 'buy <id_item>']
handler.tags     = ['rpg']
handler.command  = /^(toko|shop|buy|beli)$/i
handler.register = true

export default handler
