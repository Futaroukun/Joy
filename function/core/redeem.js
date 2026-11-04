/*
 * @Author      : Rafli / Joy Bot
 * @Feature     : Redeem Code Engine
 * @Description : Manajemen penyimpanan, pembuatan, validasi, dan penukaran kode redeem.
 */

import fs from 'fs'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'redeem.json')

function loadData() {
    if (!fs.existsSync(dbPath)) {
        const initial = { codes: {} }
        try {
            fs.mkdirSync(path.dirname(dbPath), { recursive: true })
            fs.writeFileSync(dbPath, JSON.stringify(initial, null, 2))
        } catch (_) {}
        return initial
    }
    try {
        const raw = fs.readFileSync(dbPath, 'utf8')
        const parsed = JSON.parse(raw)
        if (!parsed.codes || typeof parsed.codes !== 'object') parsed.codes = {}
        return parsed
    } catch (e) {
        console.error('[REDEEM LOAD ERROR]', e.message)
        return { codes: {} }
    }
}

function saveData(data) {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true })
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
        return true
    } catch (e) {
        console.error('[REDEEM SAVE ERROR]', e.message)
        return false
    }
}

export function getAllCodes() {
    const data = loadData()
    return data.codes || {}
}

export function getCode(code) {
    if (!code) return null
    const cleanCode = String(code).trim().toUpperCase()
    const codes = getAllCodes()
    return codes[cleanCode] || null
}

export function createCode({ code, rewards = {}, quota = 10, durationMs = 0, creator = '' }) {
    if (!code) throw new Error('Nama kode tidak boleh kosong.')
    const cleanCode = String(code).trim().toUpperCase().replace(/[^A-Z0-9_\-]/g, '')
    if (!cleanCode) throw new Error('Karakter kode hanya boleh huruf, angka, minus, atau underscore.')

    const data = loadData()
    if (data.codes[cleanCode]) {
        throw new Error(`Kode *${cleanCode}* sudah terdaftar. Hapus kode lama atau gunakan nama lain.`)
    }

    const now = Date.now()
    const expiresAt = durationMs > 0 ? now + durationMs : 0

    const newCode = {
        code: cleanCode,
        rewards: {
            limit: Math.max(0, parseInt(rewards.limit) || 0),
            money: Math.max(0, parseInt(rewards.money) || 0),
            exp: Math.max(0, parseInt(rewards.exp) || 0),
            premDays: Math.max(0, parseInt(rewards.premDays) || 0)
        },
        quota: Math.max(1, parseInt(quota) || 1),
        claimed: [], // Array of { jid, time }
        createdAt: now,
        expiresAt,
        creator
    }

    data.codes[cleanCode] = newCode
    saveData(data)
    return newCode
}

export function deleteCode(code) {
    if (!code) return false
    const cleanCode = String(code).trim().toUpperCase()
    const data = loadData()
    if (!data.codes[cleanCode]) return false
    delete data.codes[cleanCode]
    saveData(data)
    return true
}

export function claimCode(code, userJid) {
    if (!code || !userJid) {
        return { success: false, status: 'INVALID_PARAM', message: 'Parameter tidak lengkap.' }
    }
    const cleanCode = String(code).trim().toUpperCase()
    const data = loadData()
    const item = data.codes[cleanCode]

    if (!item) {
        return {
            success: false,
            status: 'NOT_FOUND',
            message: `Kode redeem *${cleanCode}* tidak ditemukan atau sudah tidak aktif.`
        }
    }

    const now = Date.now()
    if (item.expiresAt > 0 && now > item.expiresAt) {
        return {
            success: false,
            status: 'EXPIRED',
            message: `Masa berlaku kode *${cleanCode}* sudah kedaluwarsa.`
        }
    }

    const hasClaimed = item.claimed.some(c => c.jid === userJid)
    if (hasClaimed) {
        return {
            success: false,
            status: 'ALREADY_CLAIMED',
            message: `Anda sudah pernah menukarkan kode *${cleanCode}*.`
        }
    }

    if (item.claimed.length >= item.quota) {
        return {
            success: false,
            status: 'QUOTA_EXCEEDED',
            message: `Kuota penukaran untuk kode *${cleanCode}* sudah habis (${item.quota}/${item.quota}).`
        }
    }

    // Catat klaim
    item.claimed.push({
        jid: userJid,
        time: now
    })
    saveData(data)

    const remainingQuota = Math.max(0, item.quota - item.claimed.length)

    return {
        success: true,
        status: 'SUCCESS',
        code: cleanCode,
        rewards: item.rewards,
        remainingQuota,
        totalQuota: item.quota
    }
}
