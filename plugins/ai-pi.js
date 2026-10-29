/*
 * @Author      : Rafli
 * @Feature     : Pi AI Assistant (Inflection AI)
 * @Description : Asisten AI empatik & personal dengan memori sesi percakapan, SSE streaming, dan auto-reply
 * @Version     : 1.0 (Clean Architecture & WhatsApp Standard Layout)
 */

import { pi } from '../function/ai/pi.js';

const SESSION_TIMEOUT = 14 * 24 * 60 * 60 * 1000; // 14 hari
const userSessions = new Map();
const processingChats = new Set();

function getUserSession(senderLID) {
  const memSession = userSessions.get(senderLID);
  const now = Date.now();

  if (memSession && (now - memSession.timestamp) < SESSION_TIMEOUT) {
    memSession.timestamp = now;
    return memSession.cookie;
  }

  const dbCookie = global.db?.data?.users?.[senderLID]?.piCookie;
  if (dbCookie) {
    userSessions.set(senderLID, { cookie: dbCookie, timestamp: now });
    return dbCookie;
  }

  return null;
}

function setUserSession(senderLID, cookie) {
  userSessions.set(senderLID, { cookie, timestamp: Date.now() });
  if (global.db?.data?.users?.[senderLID]) {
    global.db.data.users[senderLID].piCookie = cookie;
    global.saveData('users', senderLID);
  }
}

function clearUserSession(senderLID) {
  userSessions.delete(senderLID);
  if (global.db?.data?.users?.[senderLID]) {
    delete global.db.data.users[senderLID].piCookie;
    global.saveData('users', senderLID);
  }
}

function formatWhatsAppText(text) {
  if (!text) return '';

  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, '*_$1_*')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/^(?:-{3,}|\*{3,}|_{3,})$/gm, '────────────────────────')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let handler = async (m, { conn, text, usedPrefix, command, args }) => {
  const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender;
  const opt = args?.[0]?.toLowerCase();

  // Mode Auto-Reply ON
  if (opt === 'on') {
    if (!global.db.data.chats) global.db.data.chats = {};
    if (!global.db.data.chats[m.chat]) {
      global.db.data.chats[m.chat] = { isPiOn: false };
    }
    const chat = global.db.data.chats[m.chat];

    if (chat.isPiOn) {
      return m.reply('╭── ✦ *PI AI* ✦\n• Mode auto-reply Pi AI sudah aktif di obrolan ini.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
    }
    chat.isPiOn = true;
    global.saveData('chats', m.chat);
    return m.reply('╭── ✦ *PI AI* ✦\n• Mode auto-reply diaktifkan. Pi akan merespon otomatis semua pesan masuk.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Mode Auto-Reply OFF
  if (opt === 'off') {
    if (!global.db.data.chats?.[m.chat]?.isPiOn) {
      return m.reply('╭── ✦ *PI AI* ✦\n• Mode auto-reply Pi AI sedang tidak aktif.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
    }
    global.db.data.chats[m.chat].isPiOn = false;
    global.saveData('chats', m.chat);
    return m.reply('╭── ✦ *PI AI* ✦\n• Mode auto-reply dimatikan.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Reset Sesi Percakapan
  if (text?.toLowerCase().trim() === 'reset') {
    clearUserSession(senderLID);
    return m.reply('╭── ✦ *PI AI* ✦\n• Sesi ingatan percakapan Pi berhasil direset. Chat berikutnya akan dimulai dari awal.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  // Tampilkan Menu Bantuan
  if (!text && !m.quoted) {
    return m.reply(
      `╭── ✦ *PI AI ASSISTANT* ✦\n` +
      `• Asisten AI personal & empatik dari Inflection AI.\n\n` +
      `*Panduan Perintah:*\n` +
      `• \`${usedPrefix + command} <pertanyaan>\` › Tanya langsung ke Pi\n` +
      `• \`${usedPrefix + command} on\`          › Aktifkan auto-reply room\n` +
      `• \`${usedPrefix + command} off\`         › Matikan auto-reply room\n` +
      `• \`${usedPrefix + command} reset\`       › Hapus memori percakapan lama\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  let prompt = text || '';
  if (!prompt && m.quoted) {
    prompt = m.quoted.text || m.quoted.caption || '';
  }

  if (!prompt) {
    return m.reply('╭── ✦ *PI AI* ✦\n• Pertanyaan tidak boleh kosong.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  if (processingChats.has(m.chat)) {
    return m.reply('╭── ✦ *PI AI* ✦\n• Mohon tunggu sebentar, pesan sebelumnya masih diproses.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  processingChats.add(m.chat);
  await conn.sendPresenceUpdate('composing', m.chat);

  try {
    const existingCookie = getUserSession(senderLID);

    const response = await pi.chat(prompt, {
      cookie: existingCookie
    });

    if (!response.status) {
      throw new Error(response.error || 'Gagal menerima respon dari Pi AI.');
    }

    if (response.cookie) {
      setUserSession(senderLID, response.cookie);
    }

    const formatted = formatWhatsAppText(response.text);
    await m.reply(formatted);

  } catch (err) {
    console.error('[PI AI ERROR]', err);
    await m.reply(
      `╭── ✦ *PI AI ERROR* ✦\n` +
      `• ${err.message}\n\n` +
      `_Ketik \`${usedPrefix + command} reset\` jika masalah terus berlanjut._\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  } finally {
    processingChats.delete(m.chat);
  }
};

handler.before = async (m, { conn }) => {
  if (m.isBaileys || m.fromMe) return;
  const isChatOn = global.db?.data?.chats?.[m.chat]?.isPiOn;
  if (!isChatOn) return;
  if (processingChats.has(m.chat)) return;

  const prefixRegex = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^]/;
  if (m.text && !prefixRegex.test(m.text)) {
    processingChats.add(m.chat);
    await conn.sendPresenceUpdate('composing', m.chat);

    try {
      const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender;
      const existingCookie = getUserSession(senderLID);

      const response = await pi.chat(m.text, {
        cookie: existingCookie
      });

      if (response.status && response.text) {
        if (response.cookie) {
          setUserSession(senderLID, response.cookie);
        }
        const formatted = formatWhatsAppText(response.text);
        await m.reply(formatted);
      }
    } catch (error) {
      console.error('[PI AI AUTO-REPLY ERROR]', error);
    } finally {
      processingChats.delete(m.chat);
    }
    return true;
  }
};

handler.help = ['pi *teks*'];
handler.tags = ['ai'];
handler.command = /^(pi|piai)$/i;

export default handler;
