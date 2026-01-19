let handler = async (m, { conn }) => {
    let chat = global.db.data.chats[m.chat] || {}
    let isCiciOn = chat.isCiciOn || false
    let isMikuOn = chat.isMikuOn || false

    if (!isCiciOn && !isMikuOn) {
        return m.reply('*Tidak ada sesi AI yang sedang aktif saat ini.*')
    }

    let text = '*STATUS SESI AI SAAT INI:*\n\n'
    if (isCiciOn) text += '✅ *Cici AI*: Aktif\n'
    else text += '❌ *Cici AI*: Tidak Aktif\n'

    if (isMikuOn) text += '✅ *Miku AI*: Aktif\n'
    else text += '❌ *Miku AI*: Tidak Aktif\n'

    text += '\n_Ketik .cici off atau .miku off untuk menonaktifkan._'

    m.reply(text)
}

handler.help = ['cekai']
handler.tags = ['ai', 'info']
handler.command = /^cekai$/i

export default handler
