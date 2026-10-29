import {
  areJidsSameUser,
  downloadContentFromMessage,
  generateForwardMessageContent,
  generateWAMessageFromContent,
  isJidStatusBroadcast,
  proto
} from '@whiskeysockets/baileys'

export const MAX_CACHE_PER_GROUP  = 50
export const MAX_TOTAL_GROUPS     = 500
export const CACHE_DURATION       = 2 * 60 * 60 * 1000
export const GROUP_IDLE_TIMEOUT   = 6 * 60 * 60 * 1000
export const CLEANUP_INTERVAL     = 10 * 60 * 1000

const groupMessageStores = new Map()
const lastGroupActivity  = new Map()

function getContentType(content) {
  if (!content) return null
  const keys = Object.keys(content)
  const excludeKeys = ['messageContextInfo', 'senderKeyDistributionMessage']
  return keys.find(key => !excludeKeys.includes(key)) || null
}

function createLightMessage(message) {
  const mtype = getContentType(message.message)
  return {
    msg       : message.message,
    key       : message.key,
    participant: message.key.participant || message.key.remoteJid,
    pushName  : message.pushName || 'Unknown',
    timestamp : Date.now(),
    mtype,
    hasMedia  : !!(
      message.message?.imageMessage    ||
      message.message?.videoMessage    ||
      message.message?.audioMessage    ||
      message.message?.documentMessage ||
      message.message?.stickerMessage
    )
  }
}

async function downloadMedia(msg, mtype) {
  try {
    const typeMap = {
      imageMessage: 'image',
      videoMessage: 'video',
      audioMessage: 'audio',
      stickerMessage: 'sticker',
      documentMessage: 'document'
    }
    const streamType = typeMap[mtype]
    if (!streamType || !msg?.[mtype]) return null
    const stream = await downloadContentFromMessage(msg[mtype], streamType)
    let buffer = Buffer.from([])
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk])
    }
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

function cleanupGroupCache(groupId) {
  const store = groupMessageStores.get(groupId)
  if (!store) return 0

  const now     = Date.now()
  const entries = Array.from(store.entries())
  let removed   = 0

  for (const [msgId, data] of entries) {
    if (now - data.timestamp > CACHE_DURATION) {
      store.delete(msgId)
      removed++
    }
  }

  if (store.size > MAX_CACHE_PER_GROUP) {
    const sorted   = Array.from(store.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = sorted.slice(0, store.size - MAX_CACHE_PER_GROUP)
    toRemove.forEach(([msgId]) => store.delete(msgId))
    removed += toRemove.length
  }

  if (store.size === 0) {
    groupMessageStores.delete(groupId)
    lastGroupActivity.delete(groupId)
  }

  return removed
}

function runGlobalCleanup() {
  if (groupMessageStores.size === 0) return

  const now = Date.now()

  for (const groupId of [...groupMessageStores.keys()]) {
    const lastActive = lastGroupActivity.get(groupId) || 0
    if (now - lastActive > GROUP_IDLE_TIMEOUT) {
      groupMessageStores.delete(groupId)
      lastGroupActivity.delete(groupId)
      continue
    }
    cleanupGroupCache(groupId)
  }

  if (groupMessageStores.size > MAX_TOTAL_GROUPS) {
    const sorted = Array.from(lastGroupActivity.entries())
      .sort((a, b) => a[1] - b[1])
    const excess = sorted.slice(0, groupMessageStores.size - MAX_TOTAL_GROUPS)
    for (const [groupId] of excess) {
      groupMessageStores.delete(groupId)
      lastGroupActivity.delete(groupId)
    }
  }
}

const cleanupTimer = setInterval(runGlobalCleanup, CLEANUP_INTERVAL)

export async function copyNForward(conn, jid, message, forceForward = false, options = {}) {
  try {
    const content     = await generateForwardMessageContent(message, forceForward)
    const contentType = getContentType(content)

    if (!contentType) throw new Error('Invalid content type')

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
    const text =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text  ||
      message.message?.imageMessage?.caption  ||
      message.message?.videoMessage?.caption  ||
      message.message?.documentMessage?.caption ||
      null

    const mtype = getContentType(message.message) || 'unknown'

    if (text && text.trim()) {
      await conn.sendMessage(jid, {
        text: `*📩 ISI PESAN YANG DIHAPUS:*\n\n${text}`
      })
    } else {
      const mediaLabel = {
        imageMessage    : '🖼️ Gambar',
        videoMessage    : '🎬 Video',
        audioMessage    : '🎵 Audio',
        stickerMessage  : '🎭 Stiker',
        documentMessage : '📄 Dokumen',
        ptvMessage      : '📹 Video Note',
      }[mtype] || `📦 ${mtype}`

      await conn.sendMessage(jid, {
        text: `*📩 PESAN YANG DIHAPUS:*\n\n${mediaLabel} _— tidak dapat di-restore (media sudah kadaluarsa di server WhatsApp)_`
      })
    }
  }
}

export async function storeMessage(message, conn) {
  try {
    if (!message?.key?.id || !message?.message) return

    const messageId = message.key.id
    const remoteJid = message.key.remoteJid

    if (!remoteJid || remoteJid === 'status@broadcast' || isJidStatusBroadcast(remoteJid)) return

    if (!remoteJid.endsWith('@g.us')) return

    const chatData = global.db.data.chats[remoteJid]
    if (!chatData?.antidelete) return

    const mtype = getContentType(message.message)
    if ([
      'protocolMessage',
      'senderKeyDistributionMessage',
      'reactionMessage',
      'messageContextInfo'
    ].includes(mtype)) return

    lastGroupActivity.set(remoteJid, Date.now())

    let groupStore = groupMessageStores.get(remoteJid)
    if (!groupStore) {
      if (groupMessageStores.size >= MAX_TOTAL_GROUPS) {
        const oldestGroupId = [...lastGroupActivity.entries()]
          .sort((a, b) => a[1] - b[1])[0]?.[0]
        if (oldestGroupId) {
          groupMessageStores.delete(oldestGroupId)
          lastGroupActivity.delete(oldestGroupId)
        }
      }
      groupStore = new Map()
      groupMessageStores.set(remoteJid, groupStore)
    }

    groupStore.set(messageId, createLightMessage(message))

    if (groupStore.size > MAX_CACHE_PER_GROUP + 10) {
      setImmediate(() => cleanupGroupCache(remoteJid))
    }

  } catch (err) {
    console.error('[ANTIDELETE storeMessage ERROR]', err.message)
  }
}

export async function handleMessageRevocation(conn, revocationMessage) {
  try {
    const protocolMsg = revocationMessage.message?.protocolMessage
    if (!protocolMsg || protocolMsg.type !== 0) return

    const targetId  = protocolMsg.key.id
    const remoteJid = revocationMessage.key.remoteJid

    if (!remoteJid || remoteJid === 'status@broadcast' || isJidStatusBroadcast(remoteJid)) return
    if (!remoteJid.endsWith('@g.us')) return

    const chatData = global.db.data.chats[remoteJid]
    if (!chatData?.antidelete) return

    const groupStore = groupMessageStores.get(remoteJid)
    if (!groupStore) return

    const original = groupStore.get(targetId)
    if (!original) return

    if (original.key.fromMe) {
      groupStore.delete(targetId)
      return
    }

    const sender = original.participant
    const deleter = revocationMessage.key.participant || revocationMessage.key.remoteJid

    const resolveDisplayPhone = (jid) => {
      if (!jid) return 'unknown'
      const cleanJid = conn.decodeJid ? conn.decodeJid(jid) : jid
      if (cleanJid.endsWith('@s.whatsapp.net')) return cleanJid.split('@')[0].split(':')[0]
      if (conn.storeNumber?.[cleanJid]) return conn.storeNumber[cleanJid].replace(/[^0-9]/g, '')
      if (conn.storeLid?.[cleanJid]) {
        const mapped = conn.storeLid[cleanJid]
        if (typeof mapped === 'string') return mapped.replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '')
      }
      return cleanJid.split('@')[0].split(':')[0]
    }

    const senderNum = resolveDisplayPhone(sender)
    const deleterNum = resolveDisplayPhone(deleter)
    const isSelfDelete = areJidsSameUser(sender, deleter) || senderNum === deleterNum

    const resolveUserInfo = (jid, pushName) => {
      if (!jid) return { name: '-', phone: '', display: '-' }
      const cleanJid = conn.decodeJid ? conn.decodeJid(jid) : jid
      const phone = resolveDisplayPhone(cleanJid)

      let name = (pushName && pushName !== 'Unknown') ? pushName : null
      if (!name && typeof conn.getName === 'function') {
        try {
          name = conn.getName(cleanJid)
        } catch (_) {}
      }
      if (!name || /(?:@s\.whatsapp\.net|@lid)$/.test(name)) {
        name = global.db?.data?.users?.[cleanJid]?.name || null
      }
      if (!name || /(?:@s\.whatsapp\.net|@lid)$/.test(name)) {
        name = phone
      }

      const isOnlyNumber = /^\+?[0-9\s-]+$/.test(name) || name === phone
      const display = isOnlyNumber ? `@${phone}` : `${name} (@${phone})`
      return { name, phone, display }
    }

    const senderInfo = resolveUserInfo(sender, original.pushName)
    const deleterInfo = isSelfDelete ? senderInfo : resolveUserInfo(deleter)

    const mediaLabel = {
      imageMessage    : '🖼️ Gambar',
      videoMessage    : '🎬 Video',
      audioMessage    : '🎵 Audio',
      stickerMessage  : '🎭 Stiker',
      documentMessage : '📄 Dokumen',
      ptvMessage      : '📹 Video Note',
      extendedTextMessage: '💬 Teks',
      conversation    : '💬 Teks',
    }[original.mtype] || `📦 ${original.mtype || 'Tidak diketahui'}`

    const extractedText =
      original.msg?.conversation ||
      original.msg?.extendedTextMessage?.text ||
      original.msg?.imageMessage?.caption ||
      original.msg?.videoMessage?.caption ||
      original.msg?.documentMessage?.caption ||
      ''

    let header =
      `*🔍 ANTI-DELETE*\n\n` +
      `*Pengirim :* ${senderInfo.display}\n` +
      `*Dihapus  :* ${deleterInfo.display}${isSelfDelete ? ' _(sendiri)_' : ''}\n` +
      `*Tipe     :* ${mediaLabel}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `*Pesan asli:*`

    if (extractedText) {
      header += `\n${extractedText}`
    } else if (!original.hasMedia) {
      header += `\n_(Pesan kosong)_`
    }

    const allMentions = [...new Set([
      sender,
      deleter,
      senderInfo.phone ? `${senderInfo.phone}@s.whatsapp.net` : null,
      deleterInfo.phone ? `${deleterInfo.phone}@s.whatsapp.net` : null
    ].filter(Boolean))]

    if (original.hasMedia) {
      const mediaBuffer = await downloadMedia(original.msg, original.mtype)
      if (mediaBuffer) {
        if (original.mtype === 'imageMessage') {
          await conn.sendMessage(remoteJid, {
            image: mediaBuffer,
            caption: header,
            mentions: allMentions
          })
        } else if (original.mtype === 'videoMessage') {
          await conn.sendMessage(remoteJid, {
            video: mediaBuffer,
            caption: header,
            mentions: allMentions
          })
        } else if (original.mtype === 'stickerMessage') {
          await conn.sendMessage(remoteJid, { text: header, mentions: allMentions })
          await conn.sendMessage(remoteJid, { sticker: mediaBuffer })
        } else if (original.mtype === 'audioMessage') {
          await conn.sendMessage(remoteJid, { text: header, mentions: allMentions })
          await conn.sendMessage(remoteJid, {
            audio: mediaBuffer,
            mimetype: original.msg.audioMessage?.mimetype || 'audio/mp4',
            ptt: !!original.msg.audioMessage?.ptt
          })
        } else if (original.mtype === 'documentMessage') {
          await conn.sendMessage(remoteJid, {
            document: mediaBuffer,
            mimetype: original.msg.documentMessage?.mimetype || 'application/octet-stream',
            fileName: original.msg.documentMessage?.fileName || 'document',
            caption: header,
            mentions: allMentions
          })
        }
      } else {
        await conn.sendMessage(remoteJid, {
          text: header,
          mentions: allMentions
        })
        try {
          const fullMessage = {
            key: original.key,
            message: original.msg,
            pushName: original.pushName,
            messageTimestamp: Math.floor(original.timestamp / 1000)
          }
          await copyNForward(conn, remoteJid, fullMessage, true)
        } catch (e) {
          console.error('[ANTIDELETE RESTORE ERROR]', e.message)
        }
      }
    } else {
      await conn.sendMessage(remoteJid, {
        text: header,
        mentions: allMentions
      })
    }

    groupStore.delete(targetId)

  } catch (err) {
    console.error('[ANTIDELETE handleRevocation ERROR]', err.message)
  }
}

export function getCacheStats() {
  const stats = {
    totalGroups   : groupMessageStores.size,
    totalMessages : 0,
    idleGroups    : 0,
    perGroup      : {},
    memoryEstimate: ''
  }

  const now = Date.now()
  for (const [groupId, store] of groupMessageStores.entries()) {
    stats.totalMessages += store.size
    stats.perGroup[groupId] = store.size

    const lastActive = lastGroupActivity.get(groupId) || 0
    if (now - lastActive > GROUP_IDLE_TIMEOUT / 2) stats.idleGroups++
  }

  stats.memoryEstimate = `~${Math.round(stats.totalMessages * 5 / 1024)} MB`
  return stats
}

export function clearCache(groupId = null) {
  if (groupId) {
    const store = groupMessageStores.get(groupId)
    if (!store) return 0
    const size = store.size
    groupMessageStores.delete(groupId)
    lastGroupActivity.delete(groupId)
    return size
  }

  let total = 0
  for (const store of groupMessageStores.values()) total += store.size
  groupMessageStores.clear()
  lastGroupActivity.clear()
  return total
}

process.on('exit', () => {
  clearInterval(cleanupTimer)
  groupMessageStores.clear()
  lastGroupActivity.clear()
})

export default {
  storeMessage,
  handleMessageRevocation,
  copyNForward,
  getCacheStats,
  clearCache
}
