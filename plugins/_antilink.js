const linkRegex = /((https?:\/\/[^\s]+)|(www\.[^\s]+))/i
const waLinkRegex = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,24})/i

export async function before(m, { conn, isAdmin, isBotAdmin, isOwner }) {
    if (m.isBaileys && m.fromMe) return true
    if (!m.isGroup) return true

    let chat = global.db.data.chats[m.chat]
    
    if (!chat || !chat.antilink) return true

    const body = m.text || m.caption || (m.msg && m.msg.caption) || (m.msg && m.msg.text) || ''
    const isUrl = linkRegex.test(body)

    if (isUrl) {
        if (isAdmin || isOwner) return true
        if (!isBotAdmin) return true

        const isGroupLink = waLinkRegex.exec(body)
        if (isGroupLink) {
            const linkId = isGroupLink[1]
            try {
                const code = await conn.groupInviteCode(m.chat)
                if (linkId === code) return true
            } catch (e) {
                console.error(e)
            }
        }

        await conn.sendMessage(m.chat, { delete: m.key })

        await conn.sendMessage(m.chat, {
            text: `*LINK TERDETEKSI*\n\nMaaf @${m.sender.split('@')[0]}, dilarang kirim link apa pun di grup ini. Pesan kamu saya hapus ya.`,
            contextInfo: { mentionedJid: [m.sender] }
        })
        
        return false
    }

    return true
}