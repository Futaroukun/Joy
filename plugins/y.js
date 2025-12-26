import { 
    getExpProgress, 
    getRankTitle, 
    formatNumber,
    generateProgressBar 
} from '../lib/leveling.js'

let handler = async (m, { conn }) => {
    try {
        // Ambil data user yang mention atau sender
        let who = m.mentionedJid?.[0] || m.quoted?.sender || m.sender
        let user = global.db.data.users[who]
        
        if (!user) {
            return m.reply('*USER TIDAK DITEMUKAN*\n\nUser tidak terdaftar dalam database.')
        }
        
        // Hitung progress EXP
        const progress = getExpProgress(user.exp, user.level)
        const rankTitle = getRankTitle(user.level)
        const progressBar = generateProgressBar(progress.percentage, 15)
        
        // Format pesan
        let message = `*PROFILE LEVELING*\n\n`
        message += `*Nama:* ${user.name}\n`
        message += `*Level:* ${user.level}\n`
        message += `*Rank:* ${rankTitle}\n`
        message += `*Total EXP:* ${formatNumber(user.exp)}\n\n`
        
        message += `*PROGRESS KE LEVEL ${user.level + 1}*\n`
        message += `${progressBar} ${progress.percentage}%\n`
        message += `${formatNumber(progress.current)} / ${formatNumber(progress.needed)} EXP\n\n`
        
        message += `*STATUS AKUN*\n`
        message += `• Premium: ${user.premium ? 'Aktif (2x EXP) ⭐' : 'Tidak Aktif'}\n`
        message += `• Limit: ${user.limit}\n`
        message += `• Registered: ${user.register ? 'Ya' : 'Tidak'}\n\n`
        
        if (user.premium) {
            message += `*BONUS PREMIUM:*\n`
            message += `• Mendapat 2x lipat EXP setiap interaksi\n`
            message += `• EXP per chat: 6 (3 x 2)\n\n`
        } else {
            message += `*INFO:*\n`
            message += `• EXP per chat: 3\n`
            message += `• Upgrade ke Premium untuk 2x EXP!\n\n`
        }
        
        message += `Terus aktif untuk naik level! 🚀`
        
        await conn.reply(m.chat, message, m, {
            mentions: [who]
        })
        
    } catch (error) {
        console.error('Rank command error:', error)
        m.reply('*TERJADI KESALAHAN*\n\nGagal mengambil data leveling.')
    }
}

handler.help = ['rank', 'level']
handler.tags = ['info']
handler.command = /^(rank|level|lvl)$/i

export default handler