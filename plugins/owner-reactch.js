/**
 * Mengirim reaksi ke WhatsApp Channel melalui API
 * Description: Nih makan uy send React pesan saluran WhatsApp 😹
 * Credit by Zx 
 * Sumber: https://whatsapp.com/channel/0029VbDLqe7EquiSF4STU13o
 * Website Uploader: https://zfile.web.id/
 * Web Sewain Nomor WhatsApp: https://linksz.web.id/wa-sewa
 * 
 * Catatan: Kalau Mau Di Sher Lagi Pake Credit Atau sumber mas 😹
 */

import axios from 'axios';

const API_URL = 'https://apis.davidcyriltech.my.id/tools/wareact';

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://wa.dclabs.my.id/',
  'Accept': 'application/json',
};

const CHANNEL_POST_REGEX = /(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)/i;

function extractPostLink(str) {
  if (!str || typeof str !== 'string') return null;
  const match = str.match(CHANNEL_POST_REGEX);
  if (!match) return null;
  return {
    raw: match[0],
    normalized: `https://whatsapp.com/channel/${match[1]}/${match[2]}`,
    channelId: match[1],
    postId: match[2],
  };
}

async function sendreactch(linkSaluranWa, emoji = '❤️', timeoutMs = 30000) {
  const extracted = extractPostLink(linkSaluranWa);
  if (!extracted) {
    throw new Error('Format link harus berupa https://whatsapp.com/channel/<channelId>/<postId>');
  }

  const res = await axios.get(API_URL, {
    params: {
      url: extracted.normalized,
      emoji: emoji || '❤️',
    },
    headers: DEFAULT_HEADERS,
    timeout: timeoutMs,
    validateStatus: () => true,
  });

  const data = res.data;

  const rawMsg = typeof data === 'object' ? data?.message : String(data);
  if (rawMsg && /server is busy/i.test(rawMsg)) {
    throw new Error('Server API sedang sibuk (limit proxy/overload). Silakan coba beberapa saat lagi.');
  }

  if (res.status !== 200) {
    const errMsg = typeof data === 'object' ? (data?.message || JSON.stringify(data)) : String(data);
    throw new Error(`HTTP ${res.status}: ${errMsg.slice(0, 300)}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Response API bukan JSON valid.');
  }

  if (!data.success) {
    throw new Error(data.message || 'API mengembalikan status gagal.');
  }

  return data;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedText = m.quoted?.text || m.quoted?.caption || '';
  let targetUrl = '';
  let emoji = '❤️';

  // 1. Cek apakah link ada di text argumen atau quoted message
  const quotedLink = extractPostLink(quotedText);
  const textLink = extractPostLink(text);

  if (quotedLink) {
    targetUrl = quotedLink.normalized;
    // Jika link di reply, teks argumen dijadikan emoji (bila ada)
    const customEmoji = (text || '').trim();
    if (customEmoji) emoji = customEmoji;
  } else if (textLink) {
    targetUrl = textLink.normalized;
    // Ambil sisa teks setelah link dibuang
    let remainder = (text || '')
      .replace(textLink.raw, '')
      .replace(/^[\s|:]+|[\s|:]+$/g, '')
      .trim();
    if (remainder) emoji = remainder;
  }

  if (!targetUrl) {
    return m.reply(
      `╭── ✦ *REACT SALURAN WHATSAPP* ✦\n` +
      `Kirim satu atau banyak reaksi emoji sekaligus ke pesan postingan saluran WhatsApp via API.\n\n` +
      `*Cara Penggunaan:*\n` +
      `• *Format Langsung:*\n` +
      `  › \`${usedPrefix + command} <link_postingan> [emoji]\`\n\n` +
      `• *Contoh Single Emoji:*\n` +
      `  › \`${usedPrefix + command} https://whatsapp.com/channel/0029VbDETC25EjxtVygEQR0z/262 🔥\`\n\n` +
      `• *Contoh Multi Emoji:*\n` +
      `  › \`${usedPrefix + command} https://whatsapp.com/channel/0029VbDETC25EjxtVygEQR0z/262 ❤️,🔥,👍\`\n` +
      `  › \`${usedPrefix + command} https://whatsapp.com/channel/0029VbDETC25EjxtVygEQR0z/262 ❤️ 🔥 👍\`\n` +
      `  › \`${usedPrefix + command} https://whatsapp.com/channel/0029VbDETC25EjxtVygEQR0z/262 ❤️🔥👍\`\n\n` +
      `• *Via Reply Pesan:*\n` +
      `  › Balas pesan berisi link channel, lalu ketik:\n` +
      `  › \`${usedPrefix + command} [emoji/multi_emoji]\`\n\n` +
      `*Catatan:*\n` +
      `• Link harus spesifik memiliki ID pesan saluran (\`.../channel/<id>/<postId>\`).\n` +
      `• Default emoji adalah ❤️ jika tidak disertakan.\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

  try {
    const result = await sendreactch(targetUrl, emoji);
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    const displayedEmoji = Array.isArray(result.emojis) ? result.emojis.join(' ') : emoji;
    const duration = result.took_ms ? `${result.took_ms} ms` : '-';

    return m.reply(
      `╭── ✦ *REACT SALURAN SUKSES* ✦\n` +
      `• *Target:* ${result.target || targetUrl}\n` +
      `• *Emoji:* ${displayedEmoji}\n` +
      `• *Waktu:* ${duration}\n` +
      `• *Pesan:* ${result.message || 'All reactions sent'}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  } catch (err) {
    console.error('[REACTCH Error]', err);
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });

    return m.reply(
      `╭── ✦ *GAGAL REACT SALURAN* ✦\n` +
      `• *Error:* ${err.message || 'Terjadi kesalahan sistem'}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }
};

handler.help = ['reactch <link> [emoji]'];
handler.tags = ['owner'];
handler.command = /^(reactch|chreact|saluranreact)$/i;
handler.owner = true;
handler.rowner = true;

export default handler;
export { sendreactch, extractPostLink };
