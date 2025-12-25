import { performance } from 'perf_hooks'
import { cpus as _cpus, totalmem, freemem, arch, platform, release, hostname, networkInterfaces } from 'os'
import { sizeFormatter } from 'human-readable'

let format = sizeFormatter({
    std: 'JEDEC',
    decimalPlaces: 2,
    keepTrailingZeroes: false,
    render: (literal, symbol) => `${literal} ${symbol}B`,
})

const handler = async (m, { conn }) => {
    const old = performance.now()
    await conn.sendPresenceUpdate('available', m.chat)
    const neww = performance.now()
    const ping = Math.round(neww - old)
    
    const totalMemory = totalmem()
    const freeMemory = freemem()
    const usedMemory = totalMemory - freeMemory
    const memoryUsage = ((usedMemory / totalMemory) * 100).toFixed(1)
    
    const cpus = _cpus()
    const coreUsages = cpus.map(cpu => {
        const total = Object.values(cpu.times).reduce((acc, time) => acc + time, 0)
        const usage = 100 - (cpu.times.idle / total * 100)
        return {
            model: cpu.model.split('@')[0].trim(),
            usage: usage.toFixed(1)
        }
    })
    const overallCpuUsage = (coreUsages.reduce((sum, core) => sum + parseFloat(core.usage), 0) / coreUsages.length).toFixed(1)
    
    const uptime = clockString(process.uptime() * 1000)
    const totalUsers = Object.keys(global.db.data.users).length
    const totalFeatures = Object.values(global.plugins).filter(p => p.help && !p.disabled).length
    
    const responseText = `
*STATUS SISTEM & PERFORMA BOT*

*BOT INFO*
* Nama Bot: ${global.info.namabot}
* Uptime: ${uptime}
* Total User: ${totalUsers}
* Total Fitur: ${totalFeatures}

*SERVER INFO*
* Hostname: ${hostname()}
* Platform: ${platform()}
* OS: ${release()}
* Arsitektur: ${arch()}
* Jaringan: ${getNetworkInfo()}

*PERFORMANCE*
* Response Time: ${ping} ms (${getPingStatus(ping)})
* Status: ${getPerformanceStatus(ping, parseFloat(overallCpuUsage), parseFloat(memoryUsage))}

*MEMORY*
* RAM Digunakan: ${format(usedMemory)} / ${format(totalMemory)} (*${memoryUsage}%*)
* RAM Tersisa: ${format(freeMemory)}

*CPU*
* Model: ${cpus[0]?.model.split('@')[0].trim() || 'N/A'}
* Total Core: ${cpus.length}
* Penggunaan CPU: *${overallCpuUsage}%*
`.trim()
    
    await conn.sendMessage(m.chat, {
        text: responseText,
        contextInfo: {
            externalAdReply: {
                title: `${global.info.namabot} | Status & Ping`,
                body: `Response: ${ping} ms | RAM: ${memoryUsage}% | CPU: ${overallCpuUsage}%`,
                thumbnailUrl: 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg',
                sourceUrl: 'https://instagram.com/raff_editz2',
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: m })
}

function getNetworkInfo() {
    const interfaces = networkInterfaces()
    for (const [name, nets] of Object.entries(interfaces)) {
        for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal) {
                return `${name}: ${net.address}`
            }
        }
    }
    return 'Tidak terdeteksi'
}

function getPingStatus(ping) {
    if (ping < 100) return 'Sangat Cepat'
    if (ping < 250) return 'Cepat'
    if (ping < 500) return 'Normal'
    return 'Lambat'
}

function getPerformanceStatus(ping, cpu, ram) {
    if (ping < 250 && cpu < 80 && ram < 85) return 'Optimal'
    if (ping < 500 && cpu < 90 && ram < 90) return 'Stabil'
    return 'Beban Tinggi'
}

function clockString(ms) {
    if (isNaN(ms)) return '--'
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

handler.help = ['ping']
handler.tags = ['info']
handler.command = /^(ping|status|stats)$/i

export default handler