import { exec } from 'child_process'
import { promisify } from 'util'

const execute = promisify(exec)

let handler = async (m, { conn, isOwner }) => {
    if (!isOwner) {
        return m.reply('*Fitur ini cuma buat owner aja.*')
    }

    try {
        await m.reply('*Bot lagi di-restart...*\n\nTunggu bentar ya, nanti bot bakal balik online sendiri.')

        const { stdout, stderr } = await execute('pm2 restart start')
        
        if (stderr) {
            console.error('PM2 Restart Stderr:', stderr)
        }
        
    } catch (e) {
        console.error('PM2 Restart Error:', e)
        await conn.reply(m.chat, `*GAGAL RESTART BOT*\n\n*Error:* ${e.message}\n\nPastiin PM2 udah ke-install dan nama prosesnya bener. Cek pake \`pm2 list\` di terminal.`, m)
    }
}

handler.help = ['restart']
handler.tags = ['owner']
handler.command = /^(restart|reboot)$/i
handler.owner = true

export default handler