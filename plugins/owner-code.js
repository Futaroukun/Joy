/*
 * @Author      : Rafli / Joy Bot
 * @Feature     : Redeem Code Management (Owner Wizard & Subcommands)
 * @Description : Manajemen pembuatan, pengecekan, dan penghapusan kode redeem hadiah bot.
 */

import moment from 'moment-timezone'
import { getAllCodes, getCode, createCode, deleteCode } from '../function/core/redeem.js'

function formatNumber(num) {
    return Number(num || 0).toLocaleString('id-ID')
}

function getSenderNumber(jid = '') {
    return String(jid).split('@')[0].split(':')[0]
}

function buildRewardListText(rewards = {}) {
    const lines = []
    if (rewards.limit > 0)    lines.push(`› +${formatNumber(rewards.limit)} Limit`)
    if (rewards.money > 0)    lines.push(`› +${formatNumber(rewards.money)} Money / Koin`)
    if (rewards.exp > 0)      lines.push(`› +${formatNumber(rewards.exp)} EXP`)
    if (rewards.premDays > 0) lines.push(`› +${rewards.premDays} Hari Premium`)
    return lines.length ? lines.join('\n') : '› Tidak ada hadiah'
}

let handler = async (m, { conn, text, usedPrefix, command, isOwner, isROwner }) => {
    conn.createCodeSession = conn.createCodeSession || new Map()

    const args = (text || '').trim().split(/\s+/)
    const sub = (args[0] || '').toLowerCase()

    // ── SUBCOMMAND: BATAL SESI ────────────────────────────────────────────────
    if (sub === 'batal' || sub === 'cancel') {
        if (conn.createCodeSession.has(m.sender)) {
            const sess = conn.createCodeSession.get(m.sender)
            clearTimeout(sess.timeout)
            conn.createCodeSession.delete(m.sender)
            return m.reply('Pembuatan kode redeem berhasil dibatalkan.')
        }
        return m.reply('Tidak ada sesi pembuatan kode yang sedang berjalan.')
    }

    // ── SUBCOMMAND: LIST KODE AKTIF ───────────────────────────────────────────
    if (sub === 'list') {
        const codes = getAllCodes()
        const entries = Object.values(codes)

        if (!entries.length) {
            return m.reply(
                `╭── ✦ *DAFTAR KODE REDEEM* ✦\n` +
                `Belum ada kode redeem yang dibuat.\n\n` +
                `› Ketik \`${usedPrefix + command} create\` untuk membuat kode baru.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const now = Date.now()
        let textList = `╭── ✦ *DAFTAR KODE REDEEM* ✦\nTotal: ${entries.length} Kode\n\n`

        entries.forEach((c, idx) => {
            const isFull = c.claimed.length >= c.quota
            const isExpired = c.expiresAt > 0 && now > c.expiresAt
            const sisa = Math.max(0, c.quota - c.claimed.length)

            let statusLabel = 'Aktif'
            if (isExpired) statusLabel = 'Kedaluwarsa'
            else if (isFull) statusLabel = 'Habis'

            const rewardBrief = []
            if (c.rewards.limit > 0) rewardBrief.push(`${formatNumber(c.rewards.limit)} Limit`)
            if (c.rewards.money > 0) rewardBrief.push(`${formatNumber(c.rewards.money)} Koin`)
            if (c.rewards.premDays > 0) rewardBrief.push(`${c.rewards.premDays}d Prem`)
            if (c.rewards.exp > 0) rewardBrief.push(`${formatNumber(c.rewards.exp)} EXP`)

            textList +=
                `${idx + 1}. *KODE: ${c.code}*\n` +
                `   • Status: *${statusLabel}*\n` +
                `   • Hadiah: ${rewardBrief.join(', ') || '-'}\n` +
                `   • Kuota: ${c.claimed.length}/${c.quota} (Sisa ${sisa})\n\n`
        })

        textList +=
            `› *Cek detail*: \`${usedPrefix + command} cek <kode>\`\n` +
            `› *Hapus kode*: \`${usedPrefix + command} del <kode>\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`

        return m.reply(textList)
    }

    // ── SUBCOMMAND: CEK DETAIL KODE ───────────────────────────────────────────
    if (sub === 'cek' || sub === 'detail') {
        const targetCode = args[1]?.toUpperCase()
        if (!targetCode) {
            return m.reply(`Gunakan: \`${usedPrefix + command} cek <NAMA_KODE>\``)
        }

        const c = getCode(targetCode)
        if (!c) {
            return m.reply(`Kode redeem *${targetCode}* tidak ditemukan.`)
        }

        const now = Date.now()
        const isFull = c.claimed.length >= c.quota
        const isExpired = c.expiresAt > 0 && now > c.expiresAt
        const sisa = Math.max(0, c.quota - c.claimed.length)
        const expiredStr = c.expiresAt > 0
            ? moment(c.expiresAt).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm')
            : 'Tanpa Batas Waktu'

        let statusLabel = 'Aktif'
        if (isExpired) statusLabel = 'Kedaluwarsa'
        else if (isFull) statusLabel = 'Habis'

        let claimantsText = 'Belum ada yang mengklaim.'
        if (c.claimed.length > 0) {
            claimantsText = c.claimed.map((cl, i) => {
                const timeStr = moment(cl.time).tz('Asia/Jakarta').format('DD/MM HH:mm')
                return `  ${i + 1}. @${getSenderNumber(cl.jid)} (${timeStr})`
            }).join('\n')
        }

        const mentions = c.claimed.map(cl => cl.jid)

        return conn.sendMessage(m.chat, {
            text:
                `╭── ✦ *DETAIL KODE: ${c.code}* ✦\n` +
                `• *Status*: ${statusLabel}\n` +
                `• *Masa Berlaku*: ${expiredStr}\n` +
                `• *Sisa Kuota*: ${sisa} / ${c.quota} Orang\n` +
                `• *Rincian Hadiah*:\n${buildRewardListText(c.rewards)}\n\n` +
                `╭── ✦ *DAFTAR PENGKLAIM (${c.claimed.length})* ✦\n` +
                `${claimantsText}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `› *Hapus kode ini*: \`${usedPrefix + command} del ${c.code}\``,
            mentions
        }, { quoted: m })
    }

    // ── SUBCOMMAND: HAPUS KODE ────────────────────────────────────────────────
    if (sub === 'del' || sub === 'delete' || sub === 'hapus') {
        const targetCode = args[1]?.toUpperCase()
        if (!targetCode) {
            return m.reply(`Gunakan: \`${usedPrefix + command} del <NAMA_KODE>\``)
        }

        const ok = deleteCode(targetCode)
        if (!ok) {
            return m.reply(`Kode redeem *${targetCode}* tidak ditemukan.`)
        }

        return m.reply(
            `╭── ✦ *KODE REDEEM DIHAPUS* ✦\n` +
            `Kode *${targetCode}* berhasil dihapus dan dinonaktifkan.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── SUBCOMMAND: CREATE / BUAT KODE ────────────────────────────────────────
    if (sub === 'create' || sub === 'buat' || sub === 'add') {
        // Cek jika owner pakai format cepat 1 baris:
        // .code create <KODE> <LIMIT> <MONEY> <PREM_HARI> <KUOTA>
        if (args.length >= 6) {
            const rawCode = args[1].toUpperCase()
            const limit = parseInt(args[2]) || 0
            const money = parseInt(args[3]) || 0
            const premDays = parseInt(args[4]) || 0
            const quota = parseInt(args[5]) || 10

            try {
                const created = createCode({
                    code: rawCode,
                    rewards: { limit, money, premDays, exp: 0 },
                    quota,
                    creator: m.sender
                })

                return m.reply(
                    `╭── ✦ *KODE REDEEM DIBUAT* ✦\n` +
                    `Kode hadiah berhasil diaktifkan!\n\n` +
                    `• *Kode*: \`${created.code}\`\n` +
                    `• *Isi Hadiah*:\n${buildRewardListText(created.rewards)}\n` +
                    `• *Total Kuota*: ${created.quota} Orang\n\n` +
                    `› *Cara Klaim Pengguna*:\n` +
                    `  Ketik: \`.redeem ${created.code}\`\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
            } catch (err) {
                return m.reply(`Gagal membuat kode: ${err.message}`)
            }
        }

        // Jalankan Sesi Interaktif Wizard
        if (conn.createCodeSession.has(m.sender)) {
            clearTimeout(conn.createCodeSession.get(m.sender).timeout)
        }

        const timeout = setTimeout(() => {
            if (conn.createCodeSession?.has(m.sender)) {
                conn.createCodeSession.delete(m.sender)
                conn.sendMessage(m.chat, { text: 'Waktu pembuatan kode habis (dibatalkan).' }, { quoted: m })
            }
        }, 120000)

        conn.createCodeSession.set(m.sender, {
            step: 'waiting_code',
            data: {
                code: '',
                selectedTypes: [],
                limit: 0,
                money: 0,
                exp: 0,
                premDays: 0,
                quota: 10
            },
            timeout
        })

        return m.reply(
            `╭── ✦ *BUAT KODE REDEEM* ✦\n` +
            `Silakan balas pesan ini dengan *Nama Kode* yang ingin dibuat.\n\n` +
            `• *Contoh*: \`WEEKEND50\` atau \`JOY-BERKAH\`\n` +
            `• *Batal*: Ketik \`batal\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── DEFAULT: PANDUAN MENU ─────────────────────────────────────────────────
    return m.reply(
        `╭── ✦ *PANDUAN KODE REDEEM* ✦\n` +
        `Kelola hadiah kode redeem untuk pengguna bot.\n\n` +
        `• *Daftar Sub-Command*:\n` +
        `  › \`${usedPrefix + command} create\`\n` +
        `    Mulai pembuatan kode baru (panduan interaktif).\n` +
        `  › \`${usedPrefix + command} list\`\n` +
        `    Lihat semua kode aktif & sisa kuota.\n` +
        `  › \`${usedPrefix + command} cek <kode>\`\n` +
        `    Cek detail & daftar nomor pengklaim.\n` +
        `  › \`${usedPrefix + command} del <kode>\`\n` +
        `    Hapus/nonaktifkan kode redeem.\n\n` +
        `• *Shortcut Cepat (1 Baris)*:\n` +
        `  \`${usedPrefix + command} create <KODE> <LIMIT> <MONEY> <PREM_HARI> <KUOTA>\`\n` +
        `  Contoh: \`${usedPrefix + command} create WEEKEND50 50 10000 0 20\`\n\n` +
        `• *Perintah Pengguna*:\n` +
        `  › \`.redeem <kode>\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    )
}

// ── HANDLER INTERAKTIF (WIZARD STEPS) ──────────────────────────────────────────
handler.before = async function (m, { conn, isOwner, isROwner }) {
    if (!m.text || m.isBaileys) return false
    conn.createCodeSession = conn.createCodeSession || new Map()
    if (!conn.createCodeSession.has(m.sender)) return false

    const isCallerOwner = isOwner || isROwner || m.fromMe
    if (!isCallerOwner) return false

    const raw = m.text.trim()
    if (raw.toLowerCase() === 'batal' || raw.toLowerCase() === 'cancel') {
        const sess = conn.createCodeSession.get(m.sender)
        clearTimeout(sess.timeout)
        conn.createCodeSession.delete(m.sender)
        await m.reply('Pembuatan kode redeem dibatalkan.')
        return true
    }

    const sess = conn.createCodeSession.get(m.sender)

    // Reset timeout 2 menit tiap respon baru
    clearTimeout(sess.timeout)
    sess.timeout = setTimeout(() => {
        if (conn.createCodeSession?.has(m.sender)) {
            conn.createCodeSession.delete(m.sender)
            conn.sendMessage(m.chat, { text: 'Waktu pembuatan kode habis (dibatalkan).' }, { quoted: m })
        }
    }, 120000)

    // ── STEP 1: NAMA KODE ─────────────────────────────────────────────────────
    if (sess.step === 'waiting_code') {
        const cleanCode = raw.toUpperCase().replace(/[^A-Z0-9_\-]/g, '')
        if (!cleanCode || cleanCode.length < 3) {
            await m.reply('Nama kode minimal 3 karakter (huruf/angka). Silakan ulangi:')
            return true
        }
        if (getCode(cleanCode)) {
            await m.reply(`Kode *${cleanCode}* sudah terdaftar. Masukkan nama kode lain:`)
            return true
        }

        sess.data.code = cleanCode
        sess.step = 'waiting_reward_types'

        await m.reply(
            `╭── ✦ *PILIH JENIS HADIAH* ✦\n` +
            `Kode: *${cleanCode}*\n\n` +
            `Pilih nomor hadiah yang ingin diberikan:\n` +
            `• [1] Limit\n` +
            `• [2] Money / Koin\n` +
            `• [3] EXP Level\n` +
            `• [4] Status Premium\n\n` +
            `› *Cara balas*: Ketik nomornya (bisa lebih dari satu).\n` +
            `  Contoh: \`1\` (Hanya Limit) atau \`1, 2, 4\` (Limit + Money + Premium)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
        return true
    }

    // ── STEP 2: PILIH TIPE HADIAH ─────────────────────────────────────────────
    if (sess.step === 'waiting_reward_types') {
        const nums = raw.split(/[,+\s]+/).map(n => n.trim()).filter(n => ['1', '2', '3', '4'].includes(n))
        const unique = [...new Set(nums)]

        if (!unique.length) {
            await m.reply('Pilihan tidak valid. Ketik nomor 1 sampai 4 (contoh: `1` atau `1, 2`):')
            return true
        }

        sess.data.selectedTypes = unique

        // Mulai tanya nilai reward pertama
        if (unique.includes('1')) {
            sess.step = 'waiting_limit'
            await m.reply(`Berapa jumlah *Limit* yang ingin diberikan?\n(Ketik angka, contoh: \`50\`)`)
            return true
        } else if (unique.includes('2')) {
            sess.step = 'waiting_money'
            await m.reply(`Berapa jumlah *Money/Koin* yang ingin diberikan?\n(Ketik angka, contoh: \`25000\`)`)
            return true
        } else if (unique.includes('3')) {
            sess.step = 'waiting_exp'
            await m.reply(`Berapa jumlah *EXP* yang ingin diberikan?\n(Ketik angka, contoh: \`5000\`)`)
            return true
        } else if (unique.includes('4')) {
            sess.step = 'waiting_prem'
            await m.reply(`Berapa *Hari Premium* yang ingin diberikan?\n(Ketik angka hari, contoh: \`3\` atau \`7\`)`)
            return true
        }
    }

    // ── STEP 3: NILAI LIMIT ───────────────────────────────────────────────────
    if (sess.step === 'waiting_limit') {
        const val = parseInt(raw.replace(/\D/g, '')) || 0
        if (val <= 0) {
            await m.reply('Jumlah limit harus berupa angka lebih dari 0. Silakan ulangi:')
            return true
        }
        sess.data.limit = val

        if (sess.data.selectedTypes.includes('2')) {
            sess.step = 'waiting_money'
            await m.reply(`Berapa jumlah *Money/Koin* yang ingin diberikan?\n(Ketik angka, contoh: \`25000\`)`)
            return true
        } else if (sess.data.selectedTypes.includes('3')) {
            sess.step = 'waiting_exp'
            await m.reply(`Berapa jumlah *EXP* yang ingin diberikan?\n(Ketik angka, contoh: \`5000\`)`)
            return true
        } else if (sess.data.selectedTypes.includes('4')) {
            sess.step = 'waiting_prem'
            await m.reply(`Berapa *Hari Premium* yang ingin diberikan?\n(Ketik angka hari, contoh: \`3\` atau \`7\`)`)
            return true
        } else {
            sess.step = 'waiting_quota'
            await m.reply(`Untuk kuota berapa orang?\n(Ketik angka pemenang tercepat, contoh: \`20\`)`)
            return true
        }
    }

    // ── STEP 4: NILAI MONEY ───────────────────────────────────────────────────
    if (sess.step === 'waiting_money') {
        const val = parseInt(raw.replace(/\D/g, '')) || 0
        if (val <= 0) {
            await m.reply('Jumlah uang/koin harus berupa angka lebih dari 0. Silakan ulangi:')
            return true
        }
        sess.data.money = val

        if (sess.data.selectedTypes.includes('3')) {
            sess.step = 'waiting_exp'
            await m.reply(`Berapa jumlah *EXP* yang ingin diberikan?\n(Ketik angka, contoh: \`5000\`)`)
            return true
        } else if (sess.data.selectedTypes.includes('4')) {
            sess.step = 'waiting_prem'
            await m.reply(`Berapa *Hari Premium* yang ingin diberikan?\n(Ketik angka hari, contoh: \`3\` atau \`7\`)`)
            return true
        } else {
            sess.step = 'waiting_quota'
            await m.reply(`Untuk kuota berapa orang?\n(Ketik angka pemenang tercepat, contoh: \`20\`)`)
            return true
        }
    }

    // ── STEP 5: NILAI EXP ─────────────────────────────────────────────────────
    if (sess.step === 'waiting_exp') {
        const val = parseInt(raw.replace(/\D/g, '')) || 0
        if (val <= 0) {
            await m.reply('Jumlah EXP harus berupa angka lebih dari 0. Silakan ulangi:')
            return true
        }
        sess.data.exp = val

        if (sess.data.selectedTypes.includes('4')) {
            sess.step = 'waiting_prem'
            await m.reply(`Berapa *Hari Premium* yang ingin diberikan?\n(Ketik angka hari, contoh: \`3\` atau \`7\`)`)
            return true
        } else {
            sess.step = 'waiting_quota'
            await m.reply(`Untuk kuota berapa orang?\n(Ketik angka pemenang tercepat, contoh: \`20\`)`)
            return true
        }
    }

    // ── STEP 6: NILAI PREMIUM ─────────────────────────────────────────────────
    if (sess.step === 'waiting_prem') {
        const val = parseInt(raw.replace(/\D/g, '')) || 0
        if (val <= 0) {
            await m.reply('Jumlah hari premium harus lebih dari 0. Silakan ulangi:')
            return true
        }
        sess.data.premDays = val
        sess.step = 'waiting_quota'
        await m.reply(`Untuk kuota berapa orang?\n(Ketik angka pemenang tercepat, contoh: \`20\`)`)
        return true
    }

    // ── STEP 7: KUOTA PENUKARAN & FINALISASI ───────────────────────────────────
    if (sess.step === 'waiting_quota') {
        const val = parseInt(raw.replace(/\D/g, '')) || 10
        if (val <= 0) {
            await m.reply('Jumlah kuota orang minimal 1. Silakan ulangi:')
            return true
        }
        sess.data.quota = val

        clearTimeout(sess.timeout)
        conn.createCodeSession.delete(m.sender)

        try {
            const created = createCode({
                code: sess.data.code,
                rewards: {
                    limit: sess.data.limit,
                    money: sess.data.money,
                    exp: sess.data.exp,
                    premDays: sess.data.premDays
                },
                quota: sess.data.quota,
                creator: m.sender
            })

            return m.reply(
                `╭── ✦ *KODE REDEEM DIBUAT* ✦\n` +
                `Kode hadiah berhasil diaktifkan!\n\n` +
                `• *Kode*: \`${created.code}\`\n` +
                `• *Isi Hadiah*:\n${buildRewardListText(created.rewards)}\n` +
                `• *Total Kuota*: ${created.quota} Orang\n` +
                `• *Sisa Kuota*: ${created.quota} Orang\n\n` +
                `› *Cara Klaim Pengguna*:\n` +
                `  Ketik: \`.redeem ${created.code}\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
                `> _Siapa cepat, dia dapat!_`
            )
        } catch (err) {
            return m.reply(`Gagal membuat kode: ${err.message}`)
        }
    }

    return false
}

handler.help    = ['code']
handler.tags    = ['owner']
handler.command = /^(code|kode)$/i
handler.owner   = true

export default handler
