import { elin } from '../function/scrapers/elin.js';

const userSessions = new Map();
const SESSION_TIMEOUT = 60 * 60 * 1000;

function getSession(userId) {
  const session = userSessions.get(userId);
  if (!session) return null;
  if (Date.now() - session.timestamp > SESSION_TIMEOUT) {
    userSessions.delete(userId);
    return null;
  }
  session.timestamp = Date.now();
  return session.chatId;
}

function setSession(userId, chatId) {
  userSessions.set(userId, {
    chatId,
    timestamp: Date.now()
  });
}

function formatWhatsAppText(text) {
  if (!text) return 'Tidak ada respon.';

  return text
    .replace(/\*\*\*(.+?)\*\*\*/gs, '*_$1_*')
    .replace(/\*\*([^*]+)\*\*/g, '*$1*')
    .replace(/__([^_]+)__/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-*•]\s+/gm, '• ')
    .replace(/^---+$/gm, '────────────────────────')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const userId = m.sender;
  const q = m.quoted || m;
  const mime = (q.msg || q).mimetype || '';
  const isImage = mime && mime.startsWith('image/');
  const hasInput = text || isImage || (m.quoted && (m.quoted.text || m.quoted.caption));

  if (!hasInput) {
    return m.reply(
      `╭── ✦ *ELIN AI ASSISTANT* ✦\n` +
      `• Asisten AI non-toxic dengan analisis gambar & percakapan kontekstual.\n\n` +
      `*Cara Pakai:*\n` +
      `• \`${usedPrefix + command} <pertanyaan>\`\n` +
      `• Kirim/Reply gambar dengan teks \`${usedPrefix + command} <caption/pertanyaan>\`\n` +
      `• \`${usedPrefix + command} reset\` (menghapus memori sesi percakapan)\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  if (text && text.toLowerCase().trim() === 'reset') {
    userSessions.delete(userId);
    return m.reply('╭── ✦ *ELIN AI* ✦\n• Sesi percakapan berhasil direset. Chat berikutnya akan dimulai dari awal.\n╰━━━━━━━━━━━━━━━━━━━━━━━');
  }

  await conn.sendPresenceUpdate('composing', m.chat);

  try {
    let imageBuffer = null;
    let mimeType = 'image/jpeg';

    if (isImage) {
      imageBuffer = await q.download();
      mimeType = mime;
    }

    let promptText = text || '';
    if (!promptText && m.quoted && (m.quoted.text || m.quoted.caption)) {
      promptText = m.quoted.text || m.quoted.caption;
    }

    if (!promptText && imageBuffer) {
      promptText = 'Jelaskan gambar ini secara detail.';
    }

    const currentChatId = getSession(userId);

    const response = await elin.chat(promptText, {
      chatId: currentChatId,
      image: imageBuffer,
      mimeType: mimeType
    });

    if (!response.status) {
      throw new Error(response.error || 'Gagal menerima respon dari Elin AI.');
    }

    if (response.chatId) {
      setSession(userId, response.chatId);
    }

    const textResponse = formatWhatsAppText(response.result);
    let finalMessage = textResponse;

    if (response.suggestions && response.suggestions.length > 0) {
      const suggestionList = response.suggestions.map((s) => `• _"${s}"_`).join('\n');
      finalMessage += `\n\n*Saran Balasan:*\n${suggestionList}`;
    }

    const sessionFooter = currentChatId ? '› _Sesi berlanjut_' : '› _Sesi baru_';
    finalMessage += `\n\n${sessionFooter}`;

    await conn.reply(m.chat, finalMessage, m);

  } catch (err) {
    console.error('[ELIN AI ERROR]', err);
    await m.reply(
      `╭── ✦ *ELIN AI ERROR* ✦\n` +
      `• ${err.message}\n\n` +
      `_Ketik \`${usedPrefix + command} reset\` jika error berlanjut._\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }
};

handler.help = ['elin *teks*'];
handler.tags = ['ai'];
handler.command = /^(elin|elinai)$/i;

export default handler;