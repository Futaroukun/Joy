let handler = async (m, { conn }) => {
    let _uptime = process.uptime() * 1000
    let uptime = clockString(_uptime)
    
    let message = `*INFO RUNTIME*\n\n` +
                  `Bot telah aktif selama:\n` +
                  `*${uptime}*`
                  
    m.reply(message)
}

handler.help = ['runtime']
handler.tags = ['info']
handler.command = /^(runtime|uptime|rt)$/i

export default handler

// Fungsi untuk memformat durasi waktu
function clockString(ms) {
    let d = isNaN(ms) ? '--' : Math.floor(ms / 86400000)
    let h = isNaN(ms) ? '--' : Math.floor(ms / 3600000) % 24
    let m = isNaN(ms) ? '--' : Math.floor(ms / 60000) % 60
    let s = isNaN(ms) ? '--' : Math.floor(ms / 1000) % 60
    return [d, ' Hari ', h, ' Jam ', m, ' Menit ', s, ' Detik'].map(v => v.toString().padStart(2, 0)).join('')
}