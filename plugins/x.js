let handler = async (m, { conn, text }) => {
    let jid = m.chat // Default: Ambil ID Chat saat ini (ID Grup/User)
    let type = 'Chat/Group JID'

    // 1. Cek apakah user mereply pesan?
    if (m.quoted) {
        jid = m.quoted.sender
        type = 'User JID (Quoted)'
    } 
    // 2. Cek apakah user mentag orang?
    else if (m.mentionedJid && m.mentionedJid.length > 0) {
        jid = m.mentionedJid[0]
        type = 'User JID (Mentioned)'
    }

    // Kirim hasilnya
    m.reply(`🔖 *${type}:*\n${jid}`)
}

handler.help = ['getjid']
handler.tags = ['tools', 'owner']
handler.command = /^(getjid|jid|id|cekid)$/i

export default handler