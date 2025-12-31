import {
   downloadContentFromMessage,
   generateForwardMessageContent,
   generateWAMessageFromContent,
   proto
} from '@whiskeysockets/baileys'

const messageStore = new Map()
const MAX_CACHE_SIZE = 5000
const CACHE_DURATION = 24 * 60 * 60 * 1000

setInterval(() => {
   const now = Date.now()
   
   for (const [key, value] of messageStore.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
         messageStore.delete(key)
      }
   }
   
   if (messageStore.size > MAX_CACHE_SIZE) {
      const sortedEntries = Array.from(messageStore.entries())
         .sort((a, b) => a[1].timestamp - b[1].timestamp)
      
      const toRemove = sortedEntries.slice(0, messageStore.size - MAX_CACHE_SIZE)
      toRemove.forEach(([key]) => messageStore.delete(key))
   }
}, 300000)

function getContentType(content) {
   if (!content) return null
   
   const keys = Object.keys(content)
   const excludeKeys = ['messageContextInfo', 'senderKeyDistributionMessage']
   
   return keys.find(key => !excludeKeys.includes(key)) || null
}

export async function copyNForward(conn, jid, message, forceForward = false, options = {}) {
   try {
      const content = await generateForwardMessageContent(message, forceForward)
      const contentType = getContentType(content)
      
      if (!contentType) {
         throw new Error('Invalid content type')
      }
      
      let context = {}
      const originalMType = getContentType(message.message)
      if (originalMType && originalMType !== 'conversation') {
         context = message.message[originalMType]?.contextInfo || {}
      }
      
      content[contentType].contextInfo = {
         ...context,
         ...content[contentType].contextInfo,
         ...options.contextInfo
      }
      
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
      
      const text = message.message?.conversation ||
         message.message?.extendedTextMessage?.text ||
         message.message?.imageMessage?.caption ||
         message.message?.videoMessage?.caption
      
      if (text) {
         await conn.sendMessage(jid, {
            text: `*PESAN YANG DIHAPUS (FALLBACK):*\n\n${text}`
         })
      }
   }
}

export async function storeMessage(message, conn) {
   try {
      if (!message?.key?.id || !message?.message) return
      
      const messageId = message.key.id
      const remoteJid = message.key.remoteJid
      
      if (remoteJid === 'status@broadcast') return
      
      const isGroup = remoteJid.endsWith('@g.us')
      const chatData = global.db.data.chats[remoteJid]
      
      if (!isGroup || !chatData?.antidelete) return
      
      const mtype = getContentType(message.message)
      
      if ([
            'protocolMessage',
            'senderKeyDistributionMessage',
            'reactionMessage',
            'messageContextInfo'
         ].includes(mtype)) return
      
      const storedMessage = {
         message: JSON.parse(JSON.stringify(message.message)),
         key: message.key,
         remoteJid: remoteJid,
         participant: message.key.participant || remoteJid,
         pushName: message.pushName || 'Unknown',
         timestamp: Date.now(),
         messageType: mtype
      }
      
      messageStore.set(messageId, storedMessage)
      
   } catch (err) {
      console.error('Error in storeMessage:', err)
   }
}

export async function handleMessageRevocation(conn, revocationMessage) {
   try {
      const protocolMsg = revocationMessage.message?.protocolMessage
      
      if (!protocolMsg || protocolMsg.type !== 0) return
      
      const targetId = protocolMsg.key.id;
      const remoteJid = revocationMessage.key.remoteJid
      const isGroup = remoteJid.endsWith('@g.us')
      const chatData = global.db.data.chats[remoteJid]
      
      if (!isGroup || !chatData?.antidelete) {
         return
      }
      
      const original = messageStore.get(targetId)
      
      if (!original) {
         console.log(`Pesan yang dihapus tidak ditemukan di cache: ${targetId}`)
         return
      }
      
      if (original.key.fromMe) {
         messageStore.delete(targetId)
         return
      }
      
      const sender = original.participant
      const deleter = revocationMessage.key.participant || revocationMessage.key.remoteJid
      
      console.log(`Anti-delete triggered: ${targetId} in ${remoteJid}`)
      
      const botName = global.info?.namabot || 'Joy Bot'
      const header =
         `*ANTI-DELETE DETECTED*\n\n` +
         `*Bot:* ${botName}\n` +
         `*Pengirim Asli:* @${sender.split('@')[0]}\n` +
         `*Dihapus oleh:* @${deleter.split('@')[0]}\n` +
         `*Tipe Pesan:* ${original.messageType}\n` +
         `*Chat:* ${isGroup ? 'Group' : 'Private'}\n` +
         `━━━━━━━━━━━━━━━━━━━━\n` +
         `*Pesan asli di bawah ini:*`
      
      await conn.sendMessage(remoteJid, {
         text: header,
         mentions: [sender, deleter]
      })
      
      
      try {
         await copyNForward(conn, remoteJid, original, true)
      } catch (e) {
         console.error('Error forwarding deleted message:', e)
         
         await conn.sendMessage(remoteJid, {
            text: `*GAGAL MENGEMBALIKAN PESAN*\n\nTipe: ${original.messageType}`
         })
      }
      
      messageStore.delete(targetId)
      
   } catch (err) {
      console.error('Error in handleMessageRevocation:', err)
   }
}

export function getCacheStats() {
   return {
      totalMessages: messageStore.size,
      maxSize: MAX_CACHE_SIZE,
      cacheDuration: `${CACHE_DURATION / (60 * 60 * 1000)} jam`
   }
}

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