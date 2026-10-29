/*
 * @Author      : Rafli
 * @Feature     : Ping & System Performance Monitor
 * @Description : Menampilkan kecepatan respons gateway WhatsApp, latensi pesan masuk, benchmark query database SQLite, serta status memori dan sistem.
 * @Version     : 3.0 (Fast Ping Split & Non-Blocking CPU Sampling)
 */

import { performance } from 'perf_hooks'
import { cpus as _cpus, totalmem, freemem, arch, platform } from 'os'
import { sizeFormatter } from 'human-readable'

const format = sizeFormatter({
    std               : 'JEDEC',
    decimalPlaces     : 2,
    keepTrailingZeroes: false,
    render            : (literal, symbol) => `${literal} ${symbol}B`
})

let lastCpuSnapshot = {
    time: Date.now(),
    cpus: _cpus()
}

function getCpuUsage() {
    const now = Date.now()
    const currentCpus = _cpus()
    const delta = now - lastCpuSnapshot.time

    if (delta > 200) {
        let totalDelta = 0
        let idleDelta = 0
        currentCpus.forEach((cpu, i) => {
            const prev = lastCpuSnapshot.cpus[i]?.times || cpu.times
            const curr = cpu.times
            const tD = Object.values(curr).reduce((s, v) => s + v, 0) - Object.values(prev).reduce((s, v) => s + v, 0)
            const iD = curr.idle - prev.idle
            totalDelta += tD
            idleDelta += iD
        })
        lastCpuSnapshot = { time: now, cpus: currentCpus }
        if (totalDelta > 0) {
            return Math.min(100, Math.max(0, ((1 - idleDelta / totalDelta) * 100))).toFixed(1)
        }
    }

    let totalAll = 0
    let idleAll = 0
    currentCpus.forEach(cpu => {
        const t = cpu.times
        totalAll += Object.values(t).reduce((s, v) => s + v, 0)
        idleAll += t.idle
    })
    return totalAll > 0 ? Math.min(100, Math.max(0, ((1 - idleAll / totalAll) * 100))).toFixed(1) : '0.0'
}

function clockString(ms) {
    if (isNaN(ms) || ms <= 0) return '0 Detik'
    const d = Math.floor(ms / 86400000)
    const h = Math.floor(ms / 3600000) % 24
    const m = Math.floor(ms / 60000) % 60
    const s = Math.floor(ms / 1000) % 60
    return [
        d > 0 ? `${d} Hari` : '',
        h > 0 ? `${h} Jam` : '',
        m > 0 ? `${m} Menit` : '',
        `${s} Detik`
    ].filter(Boolean).join(' ')
}

function getPingStatus(ping) {
    if (ping < 100) return 'Sangat Cepat'
    if (ping < 250) return 'Optimal'
    if (ping < 500) return 'Normal'
    return 'Tinggi'
}

function getSystemStatus(ping, cpu, ramPct) {
    if (ping < 250 && cpu < 75 && ramPct < 80) return 'Optimal'
    if (ping < 500 && cpu < 90 && ramPct < 90) return 'Stabil'
    return 'Beban Penuh'
}

let handler = async (m, { conn, command }) => {
    const rawTs = m.messageTimestamp
    const msgTimestamp = rawTs ? (typeof rawTs === 'number' ? rawTs : rawTs.low || 0) * 1000 : 0
    const msgDelay = msgTimestamp > 0 ? Math.max(0, Date.now() - msgTimestamp) : null

    const wsStart = performance.now()
    await conn.sendPresenceUpdate('available', m.chat)
    const wsPing = Math.round(performance.now() - wsStart)

    let dbPing = 0
    if (global.sqlite && global.sqlite.open) {
        const dbStart = performance.now()
        try {
            global.sqlite.prepare('SELECT 1').get()
            dbPing = parseFloat((performance.now() - dbStart).toFixed(2))
        } catch (_) {}
    }

    const isQuickPing = /^(ping|p)$/i.test(command)

    if (isQuickPing) {
        const quickText =
            `╭── ✦ *PONG* ✦\n` +
            (msgDelay !== null ? `│ • *Latensi Pesan:* ${msgDelay} ms\n` : '') +
            `│ • *Gateway WA:* ${wsPing} ms (${getPingStatus(wsPing)})\n` +
            `│ • *Database:* ${dbPing} ms (SQLite)\n` +
            `│ • *Uptime:* ${clockString(process.uptime() * 1000)}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `_Ketik *.status* untuk melihat spesifikasi & resource lengkap._`

        return m.reply(quickText)
    }

    const totalMem = totalmem()
    const freeMem = freemem()
    const usedMem = totalMem - freeMem
    const memPct = ((usedMem / totalMem) * 100).toFixed(1)
    const memDetails = process.memoryUsage()
    const botHeap = memDetails.heapUsed
    const botRss = memDetails.rss

    const cpuUsage = getCpuUsage()
    const coreCount = _cpus().length

    const allUsers = Object.values(global.db?.data?.users || {})
    const totalUsers = allUsers.length
    const registeredUsers = allUsers.filter(u => u && u.register === true).length
    const totalPlugins = Object.values(global.plugins || {}).filter(p => p && p.help && !p.disable && !p.disabled).length

    const text =
        `╭── ✦ *STATUS & PERFORMA SISTEM* ✦\n` +
        `• *Respon Pesan:* *${msgDelay !== null ? `${msgDelay} ms` : 'N/A'}*\n` +
        `• *Gateway WA:* *${wsPing} ms* (${getPingStatus(wsPing)})\n` +
        `• *Database:* *${dbPing} ms* (SQLite Native WAL)\n` +
        `• *Status Kondisi:* *${getSystemStatus(wsPing, parseFloat(cpuUsage), parseFloat(memPct))}*\n\n` +
        `*PENGGUNAAN MEMORI (RAM):*\n` +
        `• *RAM Bot (Heap):* ${format(botHeap)} (RSS: ${format(botRss)})\n` +
        `• *RAM Server:* ${format(usedMem)} / ${format(totalMem)} (*${memPct}%*)\n` +
        `• *Penggunaan CPU:* *${cpuUsage}%* (${coreCount} Core)\n\n` +
        `*INFORMASI SISTEM:*\n` +
        `• *Nama Bot:* ${global.info?.namabot || 'Joy'}\n` +
        `• *Uptime:* ${clockString(process.uptime() * 1000)}\n` +
        `• *Total Pengguna:* ${totalUsers.toLocaleString('id-ID')} akun (${registeredUsers.toLocaleString('id-ID')} Terdaftar)\n` +
        `• *Total Modul:* ${totalPlugins} fitur aktif\n` +
        `• *Platform:* ${platform()} (${arch()}) • Node.js ${process.version}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`

    const thumbObj = Buffer.isBuffer(global.thum)
        ? { thumbnail: global.thum }
        : (global.thum ? { thumbnailUrl: global.thum } : {})

    await conn.sendMessage(m.chat, {
        text,
        contextInfo: {
            externalAdReply: {
                title: `${global.info?.namabot || 'Joy'} • Performance Monitor`,
                body: `Ping: ${wsPing}ms | SQLite: ${dbPing}ms | RAM: ${format(botHeap)}`,
                ...thumbObj,
                sourceUrl: global.lgh || 'https://github.com/Futaroukun/Joy',
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: m })
}

handler.help    = ['ping', 'status']
handler.tags    = ['info']
handler.command = /^(ping|status|stats|p)$/i

export default handler