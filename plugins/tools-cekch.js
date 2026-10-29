/*
 * @Author      : Rafli
 * @Feature     : WhatsApp Channel/Newsletter Inspector
 * @Description : Memeriksa informasi detail saluran WhatsApp via Link, Invite Code, atau JID.
 * @Version     : 2.1 (No Decorational Emoji)
 */

import axios from 'axios';
import moment from 'moment-timezone';

const CHANNEL_URL_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:whatsapp\.com\/channel\/|wa\.me\/channel\/)([A-Za-z0-9_-]{20,32})/i;
const NEWSLETTER_JID_REGEX = /^([0-9]+)@newsletter$/i;
const INVITE_CODE_REGEX = /^[A-Za-z0-9_-]{20,32}$/;

function formatDateTime(timestamp) {
  if (!timestamp) return 'Tidak diketahui';
  const num = parseInt(timestamp, 10);
  if (isNaN(num)) return 'Tidak diketahui';
  const dateMs = num > 100000000000000 ? Math.floor(num / 1000) : (num > 10000000000 ? num : num * 1000);
  return moment(dateMs).tz('Asia/Jakarta').locale('id').format('dddd, DD MMMM YYYY [pukul] HH:mm:ss [WIB]');
}

function resolveReactionSetting(value) {
  switch (value) {
    case 'ALL': return 'Bebas (Semua Emoji)';
    case 'BASIC': return 'Emoji Standar';
    case 'BLOCKLIST': return 'Emoji Dibatasi';
    case 'NONE': return 'Nonaktif';
    default: return value || 'Standar';
  }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
  const quotedText = m.quoted?.text || m.quoted?.caption || '';
  const input = (text || quotedText || '').trim();

  if (!input) {
    return m.reply(
      `*INSPEKTOR SALURAN WHATSAPP*\n\n` +
      `Gunakan perintah ini untuk memeriksa informasi lengkap saluran WhatsApp.\n\n` +
      `*Cara Pakai:*\n` +
      `• \`${usedPrefix + command} <link saluran>\`\n` +
      `• \`${usedPrefix + command} <kode invite>\`\n` +
      `• \`${usedPrefix + command} <id@newsletter>\`\n\n` +
      `*Contoh:*\n` +
      `\`${usedPrefix + command} https://whatsapp.com/channel/0029VbCZyEa7NoZvaE75yY00\``
    );
  }

  let type = 'invite';
  let queryKey = '';

  const urlMatch = input.match(CHANNEL_URL_REGEX);
  if (urlMatch && urlMatch[1]) {
    type = 'invite';
    queryKey = urlMatch[1];
  } else if (NEWSLETTER_JID_REGEX.test(input)) {
    type = 'jid';
    queryKey = input.toLowerCase();
  } else if (INVITE_CODE_REGEX.test(input)) {
    type = 'invite';
    queryKey = input;
  } else {
    return m.reply(
      `*Format Tidak Valid*\n\n` +
      `Pastikan memasukkan Link Saluran yang benar atau ID Channel.\n\n` +
      `_Contoh: \`${usedPrefix + command} https://whatsapp.com/channel/0029VbCZyEa7NoZvaE75yY00\`_`
    );
  }

  const loadingMsg = await m.reply('_Sedang mengambil informasi saluran..._');

  try {
    const res = await conn.newsletterMetadata(type, queryKey);

    if (!res || !res.id) {
      throw new Error('Saluran tidak ditemukan atau tidak dapat diakses publik.');
    }

    const thread = res.thread_metadata || {};
    const channelId = res.id;
    const inviteCode = thread.invite || (type === 'invite' ? queryKey : null);
    const channelUrl = inviteCode ? `https://whatsapp.com/channel/${inviteCode}` : `https://whatsapp.com/channel/${channelId.split('@')[0]}`;

    const channelName = thread.name?.text || 'Tanpa Nama';
    const subscribersCount = thread.subscribers_count ? parseInt(thread.subscribers_count, 10).toLocaleString('id-ID') : '0';
    const isVerified = thread.verification === 'VERIFIED';
    const statusType = res.state?.type === 'ACTIVE' ? 'Aktif' : (res.state?.type || 'Tidak Aktif');
    const reactionType = resolveReactionSetting(thread.settings?.reaction_codes?.value);
    const createdAt = formatDateTime(thread.creation_time);
    const description = thread.description?.text || '_(Tidak ada deskripsi)_';

    let avatarBuffer = null;
    const directPath = thread.picture?.direct_path || thread.preview?.direct_path;
    if (directPath) {
      try {
        const cdnUrl = `https://pps.whatsapp.net${directPath}`;
        const picRes = await axios.get(cdnUrl, { responseType: 'arraybuffer', timeout: 10000 });
        if (picRes.status === 200 && picRes.data?.length > 0) {
          avatarBuffer = Buffer.from(picRes.data);
        }
      } catch (_) {}
    }

    const caption =
      `*INFORMASI SALURAN WHATSAPP*\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `• *Nama Saluran:* ${channelName}\n` +
      `• *ID Saluran:* \`${channelId}\`\n` +
      `• *Status:* ${statusType}\n` +
      `• *Verifikasi:* ${isVerified ? 'Terverifikasi (Official)' : 'Belum Terverifikasi'}\n` +
      `• *Pengikut:* ${subscribersCount} anggota\n` +
      `• *Izin Reaksi:* ${reactionType}\n` +
      `• *Dibuat Pada:* ${createdAt}\n` +
      `• *Link Undangan:* ${channelUrl}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `*Deskripsi Saluran:*\n` +
      `${description}`;

    const buttons = [
      {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: 'Buka Saluran',
          url: channelUrl,
          merchant_url: channelUrl
        })
      },
      {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: 'Salin ID Saluran',
          copy_code: channelId
        })
      },
      {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: 'Salin Link Saluran',
          copy_code: channelUrl
        })
      }
    ];

    if (loadingMsg?.key) {
      await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
    }

    try {
      if (avatarBuffer) {
        return await conn.sendButton(m.chat, {
          image: avatarBuffer,
          body: caption,
          footer: `${global.info?.namabot || 'Joy'} • Newsletter Inspector`,
          buttons
        }, { quoted: m });
      } else {
        return await conn.sendButton(m.chat, {
          body: caption,
          footer: `${global.info?.namabot || 'Joy'} • Newsletter Inspector`,
          buttons
        }, { quoted: m });
      }
    } catch (_) {
      if (avatarBuffer) {
        return await conn.sendMessage(m.chat, {
          image: avatarBuffer,
          caption
        }, { quoted: m });
      } else {
        return await conn.reply(m.chat, caption, m);
      }
    }

  } catch (err) {
    console.error('[CEKIDCH ERROR]:', err);

    if (loadingMsg?.key) {
      await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
    }

    if (err.message?.includes('not-found') || err.message?.includes('item-not-found')) {
      return m.reply('*Saluran Tidak Ditemukan*\n\nPastikan link atau kode undangan masih valid dan saluran belum dihapus.');
    }

    if (err.message?.includes('forbidden')) {
      return m.reply('*Akses Ditolak*\n\nSaluran ini bersifat privat atau akses dibatasi oleh WhatsApp.');
    }

    return m.reply(`*Gagal Memeriksa Saluran:*\n\n_${err.message || 'Terjadi kesalahan sistem.'}_`);
  }
};

handler.help = ['cekidch *url/id*']
handler.tags    = ['tools']
handler.command = /^(cekidch|cekch|infoch)$/i
handler.limit   = false

export default handler