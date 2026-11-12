const linkRegex = /https?:\/\/[^\s]+|(?<!\w)www\.[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}[^\s]*/i
const waGroupLinkRegex = /chat\.whatsapp\.com\/(?:invite\/)?([0-9A-Za-z]{20,24})/i
const waChannelLinkRegex = /(?:whatsapp\.com\/channel\/|wa\.me\/channel\/)([0-9A-Za-z_-]{20,32})/i

export async function before(m, { conn, isAdmin, isBotAdmin, isOwner }) {
    if (m.isBaileys && m.fromMe) return true
    if (!m.isGroup) return true

    let chat = global.db.data.chats?.[m.chat]
    if (!chat || !chat.antilink) return true

    const body = m.text || m.caption || (m.msg && m.msg.caption) || (m.msg && m.msg.text) || ''
    if (!body) return true

    const isUrl = linkRegex.test(body) || waGroupLinkRegex.test(body) || waChannelLinkRegex.test(body)

    if (isUrl) {
        if (isAdmin || isOwner) return true

        if (!isBotAdmin) return true

        const isGroupLink = waGroupLinkRegex.exec(body)
        if (isGroupLink) {
            const linkId = isGroupLink[1]
            try {
                const currentCode = await conn.groupInviteCode(m.chat)
                if (linkId === currentCode) return true
            } catch (e) {
            }
        }

        try {
            await conn.sendMessage(m.chat, { delete: m.key })
        } catch (e) {
            console.error('[ANTILINK DELETE ERROR]', e.message)
        }

        let phone = conn.storeNumber?.[m.sender] || (conn.getNumber ? conn.getNumber(m.sender) : '')
        if (!phone && conn.storeLid?.[m.sender]) {
            const mapped = conn.storeLid[m.sender]
            if (typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
                phone = mapped.split('@')[0].split(':')[0]
            }
        }
        if (!phone && m.sender.endsWith('@s.whatsapp.net')) {
            phone = m.sender.split('@')[0].split(':')[0]
        }
        const displayTag = phone ? `@${phone}` : (m.name || 'Pengguna')

        await conn.sendMessage(m.chat, {
            text: `*LINK TERDETEKSI*\n\nMaaf ${displayTag}, dilarang mengirim tautan/link di grup ini. Pesan kamu telah dihapus.`,
            mentions: [m.sender, conn.storeLid?.[m.sender]].filter(Boolean)
        })

        return false
    }

    return true
}