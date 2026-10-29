/*
 * @Author      : Rafli
 * @Feature     : Anti-Call System v3.0
 * @Description : Penolakan panggilan otomatis (voice & video call) dengan proteksi presisi tinggi LID-to-PN database lookup untuk Whitelist Owner & Developer.
 * @Version     : 3.0 (Zero False Positive Owner Whitelist)
 */

import { jidNormalizedUser } from '@whiskeysockets/baileys'
import chalk from 'chalk'

const callTracker = new Map()
const messageCooldown = new Map()

const MAX_CALLS = 3            // Batas maksimal spam panggilan sebelum diblokir
const RESET_WINDOW = 60 * 1000 // Window reset counter spam (1 menit)
const NOTIFY_COOLDOWN = 10 * 1000 // Cooldown pengiriman pesan penolakan (10 detik)

function cleanDigits(val) {
    if (!val) return ''
    return val.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
}

function cleanPhone(phone) {
    if (!phone) return null
    let p = phone.toString().replace(/[^0-9]/g, '')
    if (p.length > 11 && p.endsWith('0')) p = p.slice(0, -1)
    if (p.startsWith('0')) p = '62' + p.slice(1)
    else if (!p.startsWith('62') && p.length >= 10) p = '62' + p
    return p
}

function cleanLID(jid) {
    if (!jid) return null
    const decoded = jidNormalizedUser(jid)
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':')
        return `${parts[0]}@lid`
    }
    return decoded
}

/**
 * Resolusi komprehensif JID/LID ke format Phone Number & Phone JID
 */
async function resolveCaller(conn, inputJid) {
    if (!inputJid) return { rawJid: null, phoneJid: null, phone: null }
    const rawJid = jidNormalizedUser(inputJid)

    // Jika sudah berupa nomor WhatsApp biasa (@s.whatsapp.net)
    if (rawJid.endsWith('@s.whatsapp.net')) {
        const phone = cleanPhone(rawJid.split('@')[0].split(':')[0])
        return { rawJid, phoneJid: rawJid, phone }
    }

    // 1. Direct Lookup dari SQLite database storeLid
    if (global.sqlite && global.sqlite.open) {
        try {
            const row = global.sqlite.prepare('SELECT pn FROM storeLid WHERE lid = ?').get(rawJid)
            if (row && typeof row.pn === 'string') {
                const cleanPn = row.pn.replace(/(@s\.whatsapp\.net)+$/g, '')
                const phoneJid = `${cleanPn}@s.whatsapp.net`
                const phone = cleanPhone(cleanPn)
                return { rawJid, phoneJid, phone }
            }
        } catch (_) {}
    }

    // 2. Lookup dari in-memory cache conn.storeLid (Bidirectional)
    if (conn?.storeLid) {
        const mapped = conn.storeLid[rawJid]
        if (mapped && typeof mapped === 'string') {
            const cleanMapped = mapped.replace(/(@s\.whatsapp\.net)+$/g, '')
            const phoneJid = `${cleanMapped}@s.whatsapp.net`
            const phone = cleanPhone(cleanMapped)
            return { rawJid, phoneJid, phone }
        }
    }

    // 3. Layer Baileys API getJid / getLidPN / signalRepository
    if (typeof conn?.getJid === 'function') {
        try {
            const res = conn.getJid(rawJid)
            if (res && res.endsWith('@s.whatsapp.net')) {
                const phone = cleanPhone(res.split('@')[0].split(':')[0])
                return { rawJid, phoneJid: res, phone }
            }
        } catch (_) {}
    }

    try {
        const pnJid = await conn?.signalRepository?.lidMapping?.getPNForLID?.(rawJid)
        if (pnJid && pnJid.endsWith('@s.whatsapp.net')) {
            const phone = cleanPhone(pnJid.split('@')[0].split(':')[0])
            return { rawJid, phoneJid: pnJid, phone }
        }
    } catch (_) {}

    try {
        const pnJid = await conn?.getLidPN?.(rawJid)
        if (pnJid && pnJid.endsWith('@s.whatsapp.net')) {
            const phone = cleanPhone(pnJid.split('@')[0].split(':')[0])
            return { rawJid, phoneJid: pnJid, phone }
        }
    } catch (_) {}

    // Fallback nomor jika rawJid kebetulan berisi digit nomor telepon
    const extractedDigits = cleanDigits(rawJid)
    return {
        rawJid,
        phoneJid: extractedDigits ? `${extractedDigits}@s.whatsapp.net` : rawJid,
        phone: extractedDigits
    }
}

/**
 * Cek apakah penelepon adalah Owner atau Developer (mendukung pengecekan nomor telepon & LID)
 */
function isOwnerOrDev(phone, rawJid, phoneJid) {
    // 1. Kumpulkan daftar nomor telepon owner dalam berbagai format (628..., 08..., raw digits)
    const rawOwnerList = [
        ...(global.developer || []),
        ...(global.owner || []),
        ...(global.info?.nomorowner ? [global.info.nomorowner] : []),
        ...Object.keys(global.db?.data?.owners || {})
    ]

    const ownerNumbers = new Set()
    for (const raw of rawOwnerList) {
        if (!raw) continue
        const digits = cleanDigits(raw)
        const stdPhone = cleanPhone(raw)
        if (digits) ownerNumbers.add(digits)
        if (stdPhone) ownerNumbers.add(stdPhone)
        if (digits.startsWith('62')) ownerNumbers.add('0' + digits.slice(2))
        if (digits.startsWith('0')) ownerNumbers.add('62' + digits.slice(1))
    }

    // 2. Kumpulkan daftar LID milik owner dari database storeLid
    const ownerLids = new Set()
    if (global.sqlite && global.sqlite.open) {
        try {
            for (const num of ownerNumbers) {
                const rows = global.sqlite.prepare('SELECT lid FROM storeLid WHERE pn LIKE ? OR lid LIKE ?').all(`%${num}%`, `%${num}%`)
                for (const r of rows) {
                    if (r.lid) {
                        ownerLids.add(r.lid)
                        ownerLids.add(cleanDigits(r.lid))
                        ownerLids.add(jidNormalizedUser(r.lid))
                    }
                }
            }
        } catch (_) {}
    }

    // 3. Parameter penelepon yang diperiksa
    const callerCandidates = [
        cleanDigits(phone),
        cleanPhone(phone),
        cleanDigits(rawJid),
        cleanDigits(phoneJid),
        cleanPhone(phoneJid),
        rawJid ? jidNormalizedUser(rawJid) : null,
        phoneJid ? jidNormalizedUser(phoneJid) : null
    ].filter(Boolean)

    for (const candidate of callerCandidates) {
        if (ownerNumbers.has(candidate) || ownerLids.has(candidate)) {
            return true
        }
    }

    // Suffix / Substring check
    for (const ownerNum of ownerNumbers) {
        for (const candidate of callerCandidates) {
            if (candidate === ownerNum || candidate.endsWith(ownerNum) || ownerNum.endsWith(candidate)) {
                return true
            }
        }
    }

    return false
}

/**
 * Handler utama penanganan event panggilan masuk
 * @param {Array<object>|object} json Event panggilan dari Baileys
 */
export async function handleCall(json) {
    const calls = Array.isArray(json) ? json : [json]
    if (!calls || calls.length === 0) return

    const botLid = cleanLID(this.user?.lid || this.user?.id)
    const settings = global.db?.data?.settings?.[botLid] || {}

    // Jika fitur anticall dinonaktifkan oleh owner, lewati
    if (settings.antiCall === false) return

    for (const call of calls) {
        if (!call || call.status !== 'offer') continue

        const rawCaller = call.from
        const { rawJid, phoneJid, phone } = await resolveCaller(this, rawCaller)

        // Whitelist Owner & Developer (tidak ditolak / tidak diberi peringatan / tidak diblokir)
        if (isOwnerOrDev(phone, rawJid, phoneJid)) {
            console.log(chalk.yellow.bold(`[ANTI-CALL] Panggilan dari Owner/Developer (${phone || rawCaller}) diizinkan.`))
            continue
        }

        // 1. Tolak panggilan
        try {
            await this.rejectCall(call.id, rawCaller)
            console.log(chalk.red.bold(`[ANTI-CALL] Panggilan dari ${phone || rawCaller} berhasil ditolak.`))
        } catch (err) {
            console.error(chalk.red(`[ANTI-CALL] Gagal menolak panggilan dari ${rawCaller}:`), err.message)
        }

        const trackerKey = phone || rawCaller
        const now = Date.now()

        // 2. Kelola counter spam call
        let record = callTracker.get(trackerKey)
        if (record && (now - record.lastCall > RESET_WINDOW)) {
            record = { count: 0, lastCall: 0, timer: null }
        }
        if (!record) {
            record = { count: 0, lastCall: 0, timer: null }
        }

        if (record.timer) clearTimeout(record.timer)

        record.count++
        record.lastCall = now
        record.timer = setTimeout(() => {
            callTracker.delete(trackerKey)
            messageCooldown.delete(trackerKey)
        }, RESET_WINDOW)

        callTracker.set(trackerKey, record)

        const botName = global.info?.namabot || 'Joy'
        const ownerNum = global.info?.nomorowner || global.owner?.[0] || '6283854551575'
        const targetChat = phoneJid || rawCaller

        // 3. Eksekusi blokir jika mencapai batas spam
        if (record.count >= MAX_CALLS) {
            try {
                // Kirim pesan blokir
                await this.sendMessage(targetChat, {
                    text:
                        `*AKUN ANDA DIBLOKIR OTOMATIS*\n\n` +
                        `Kamu telah melakukan panggilan sebanyak *${record.count} kali* ke *${botName}*.\n` +
                        `Nomor kamu telah diblokir otomatis oleh sistem.\n\n` +
                        `Hubungi Owner untuk unblock:\nhttps://wa.me/${ownerNum}`
                }).catch(() => {})

                // Update status blokir WhatsApp
                if (phoneJid && phoneJid.endsWith('@s.whatsapp.net')) {
                    await this.updateBlockStatus(phoneJid, 'block')
                }
                if (rawCaller && rawCaller !== phoneJid) {
                    await this.updateBlockStatus(rawCaller, 'block').catch(() => {})
                }

                console.log(chalk.bgRed.white.bold(` [ANTI-CALL BLOKIR] `) + ` Berhasil memblokir ${trackerKey} (${record.count}/${MAX_CALLS} spam calls).`)
            } catch (err) {
                console.error(chalk.red(`[ANTI-CALL] Gagal memblokir ${trackerKey}:`), err.message)
            }

            clearTimeout(record.timer)
            callTracker.delete(trackerKey)
            messageCooldown.delete(trackerKey)
            continue
        }

        // 4. Kirim pesan peringatan (dengan cooldown agar tidak spam chat)
        const lastNotified = messageCooldown.get(trackerKey) || 0
        if (now - lastNotified > NOTIFY_COOLDOWN) {
            messageCooldown.set(trackerKey, now)
            try {
                await this.sendMessage(targetChat, {
                    text:
                        `*PANGGILAN DITOLAK OTOMATIS*\n\n` +
                        `Maaf, *${botName}* adalah bot WhatsApp dan tidak dapat menerima panggilan suara maupun video.\n\n` +
                        `• *Peringatan:* ${record.count}/${MAX_CALLS}\n` +
                        `_Jangan menelepon lagi atau nomor kamu akan otomatis diblokir oleh sistem._\n\n` +
                        `Untuk keperluan penting, silakan chat Owner:\nhttps://wa.me/${ownerNum}`
                })
            } catch (e) {
                console.error(chalk.red(`[ANTI-CALL] Gagal mengirim pesan peringatan ke ${targetChat}:`), e.message)
            }
        }
    }
}