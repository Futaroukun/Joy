import { 
    downloadContentFromMessage, 
    generateForwardMessageContent, 
    generateWAMessageFromContent, 
    proto 
} from 'baileys'

/**
 * ANTI-DELETE SYSTEM
 * Menyimpan dan mengembalikan pesan yang dihapus
 */

// In-memory message store untuk caching pesan
const messageStore = new Map()
const MAX_CACHE_SIZE = 5000
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 jam

/**
 * Cleanup cache secara periodik
 */
setInterval(() => {
    const now = Date.now()
    
    // Hapus pesan yang sudah lebih dari 24 jam
    for (const [key, value] of messageStore.entries()) {
        if (now - value.timestamp > CACHE_DURATION) {
            messageStore.delete(key)
        }
    }
    
    // Jika masih melebihi batas, hapus yang paling lama
    if (messageStore.size > MAX_CACHE_SIZE) {
        const sortedEntries = Array.from(messageStore.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)
        
        const toRemove = sortedEntries.slice(0, messageStore.size - MAX_CACHE_SIZE)
        toRemove.forEach(([key]) => messageStore.delete(key))
    }
}, 300000) // Setiap 5 menit

/**
 * Mendapatkan tipe konten dari pesan
 */
function getContentType(content) {
    if (!content) return null
    
    const keys = Object.keys(content)
    const excludeKeys = ['messageContextInfo', 'senderKeyDistributionMessage']
    
    return keys.find(key => !excludeKeys.includes(key)) || null
}

/**
 * Copy dan forward pesan
 */
export async function copyNForward(conn, jid, message, forceForward = false, options = {}) {
    try {
        const content = await generateForwardMessageContent(message, forceForward)
        const contentType = getContentType(content)
        
        if (!contentType) {
            throw new Error('Invalid content type')
        }
        
        // Ambil context info dari pesan asli
        let context = {}
        const originalMType = getContentType(message.message)
        if (originalMType && originalMType !== 'conversation') {
            context = message.message[originalMType]?.contextInfo || {}
        }
        
        // Gabungkan context info
        content[contentType].contextInfo = {
            ...context,
            ...content[contentType].contextInfo,
            ...options.contextInfo
        }
        
        // Generate dan kirim pesan
        const waMessage = await generateWAMessageFromContent(jid, content, {
            ...options,
            userJid: conn.user.jid
        })
        
        await conn.relayMessage(jid, waMessage.message, {
            messageId: waMessage.key.id
        })
        
        return waMessage
    } catch (e) {
        console.error('Error in copyNForward:', e)
        
        // Fallback: kirim sebagai teks jika memungkinkan
        const text = message.message?.conversation || 
                     message.message?.extendedTextMessage?.text ||
                     message.message?.imageMessage?.caption ||
                     message.message?.videoMessage?.caption
        
        if (text) {
            await conn.sendMessage(jid, { 
                text: `📝 *Pesan yang dihapus (fallback):*\n\n${text}` 
            })
        }
    }
}

/**
 * Simpan pesan untuk deteksi delete
 */
export async function storeMessage(message, conn) {
    try {
        if (!message?.key?.id || !message?.message) return
        
        const messageId = message.key.id
        const remoteJid = message.key.remoteJid
        
        // Skip status broadcast
        if (remoteJid === 'status@broadcast') return
        
        // Cek apakah fitur anti-delete aktif untuk chat ini
        const isGroup = remoteJid.endsWith('@g.us')
        const chatData = global.db.data.chats[remoteJid]
        
        // Jika di grup, cek setting grup
        if (isGroup && chatData && !chatData.antidelete) return
        
        // Deteksi tipe pesan
        const mtype = getContentType(message.message)
        
        // Skip protocol/control messages
        if ([
            'protocolMessage', 
            'senderKeyDistributionMessage', 
            'reactionMessage',
            'messageContextInfo'
        ].includes(mtype)) return
        
        // Deep copy untuk menghindari modifikasi object asli
        const storedMessage = {
            message: JSON.parse(JSON.stringify(message.message)),
            key: message.key,
            remoteJid: remoteJid,
            participant: message.key.participant || remoteJid,
            pushName: message.pushName || 'Unknown',
            timestamp: Date.now(),
            messageType: mtype
        }
        
        // Download media jika ada (opsional, untuk performa lebih baik)
        if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage'].includes(mtype)) {
            try {
                // Tandai bahwa pesan ini memiliki media
                storedMessage.hasMedia = true
            } catch (e) {
                console.error('Error marking media:', e.message)
            }
        }
        
        messageStore.set(messageId, storedMessage)
        
    } catch (err) {
        console.error('Error in storeMessage:', err)
    }
}

/**
 * Handle pesan yang dihapus
 */
export async function handleMessageRevocation(conn, revocationMessage) {
    try {
        const protocolMsg = revocationMessage.message?.protocolMessage
        
        // Pastikan ini adalah pesan delete (type 0 = REVOKE)
        if (!protocolMsg || protocolMsg.type !== 0) return
        
        const targetId = protocolMsg.key.id
        const remoteJid = revocationMessage.key.remoteJid
        const isGroup = remoteJid.endsWith('@g.us')
        
        // Cek setting anti-delete
        if (isGroup) {
            const chatData = global.db.data.chats[remoteJid]
            if (!chatData || !chatData.antidelete) return
        }
        
        // Ambil pesan asli dari cache
        const original = messageStore.get(targetId)
        
        if (!original) {
            console.log(`⚠️ Pesan yang dihapus tidak ditemukan di cache: ${targetId}`)
            return
        }
        
        // Skip jika pesan dari bot sendiri
        if (original.key.fromMe) {
            messageStore.delete(targetId)
            return
        }
        
        const sender = original.participant
        const deleter = revocationMessage.key.participant || revocationMessage.key.remoteJid
        
        console.log(`♻️ Anti-delete triggered: ${targetId} in ${remoteJid}`)
        
        // Format nama pengirim dan penghapus
        const senderName = original.pushName || sender.split('@')[0]
        const deleterName = await conn.getName(deleter) || deleter.split('@')[0]
        
        // Buat header pesan
        const botName = global.info?.namabot || 'Joy Bot'
        const header = 
            `*🔰 ANTI-DELETE DETECTED 🔰*\n\n` +
            `*📱 Bot:* ${botName}\n` +
            `*👤 Pengirim Asli:* @${sender.split('@')[0]}\n` +
            `*🗑️ Dihapus oleh:* @${deleter.split('@')[0]}\n` +
            `*💬 Tipe Pesan:* ${original.messageType}\n` +
            `*🕒 Chat:* ${isGroup ? 'Group' : 'Private'}\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `*Pesan asli di bawah ini:*`
        
        // Kirim header dengan mention
        await conn.sendMessage(remoteJid, {
            text: header,
            mentions: [sender, deleter]
        })
        
        // Tunggu sebentar agar header terkirim dulu
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Kirim ulang pesan asli
        try {
            await copyNForward(conn, remoteJid, original, true)
        } catch (e) {
            console.error('Error forwarding deleted message:', e)
            
            // Fallback: kirim info saja
            await conn.sendMessage(remoteJid, {
                text: `⚠️ Gagal mengembalikan pesan. Tipe: ${original.messageType}`
            })
        }
        
        // Hapus dari cache setelah diproses
        messageStore.delete(targetId)
        
    } catch (err) {
        console.error('Error in handleMessageRevocation:', err)
    }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
    return {
        totalMessages: messageStore.size,
        maxSize: MAX_CACHE_SIZE,
        cacheDuration: `${CACHE_DURATION / (60 * 60 * 1000)} jam`
    }
}

/**
 * Clear cache manually
 */
export function clearCache() {
    const size = messageStore.size
    messageStore.clear()
    return size
}

export default {
    storeMessage,
    handleMessageRevocation,
    copyNForward,
    getCacheStats,
    clearCache
}