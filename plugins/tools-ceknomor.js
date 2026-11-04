/*
 * @Author      : Joy / Rafli
 * @Feature     : WhatsApp Number Scanner / Checker
 * @Description : Memindai ketersediaan nomor WhatsApp dengan wildcard 'x' (1-2 digit) dilengkapi sistem proteksi anti-ban (batching, delay throttled, dan cooldown).
 * @Version     : 2.0 (Anti-Ban & Safe USync Query)
 */

import { addNumbersToPool } from '../function/core/gacha-pool.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const userCooldowns = new Map();
const COOLDOWN_MS = 15000; // 15 detik jeda per pengguna

let handler = async (m, { conn, text, usedPrefix, command, isPremium, isOwner }) => {
  const userId = m.sender;
  const now = Date.now();
  const lastUsed = userCooldowns.get(userId) || 0;

  // Jeda keamanan: User biasa 15s, User premium dipersingkat 5s, Owner 0s
  const effectiveCooldownMs = isOwner ? 0 : (isPremium ? 5000 : COOLDOWN_MS);
  const remainingCooldown = Math.ceil((effectiveCooldownMs - (now - lastUsed)) / 1000);

  if (effectiveCooldownMs > 0 && (now - lastUsed < effectiveCooldownMs)) {
    return m.reply(
      `*Jeda Keamanan (Anti-Ban)*\n\n` +
      `Mohon tunggu \`${remainingCooldown} detik\` sebelum melakukan pengecekan nomor kembali agar akun bot tidak terkena pembatasan.`
    );
  }

  const quotedText = m.quoted?.text || m.quoted?.caption || '';
  const input = (text || quotedText || '').trim();

  if (!input) {
    return m.reply(
      `╭── ✦ *PEMERIKSA NOMOR WHATSAPP* ✦\n` +
      `• Memeriksa ketersediaan nomor aktif secara aman dengan proteksi anti-ban.\n\n` +
      `*Cara Pakai:*\n` +
      `• \`${usedPrefix + command} <nomor>x\` (1 digit: 0-9, total 10 nomor)\n` +
      `• \`${usedPrefix + command} <nomor>xx\` (2 digit: 00-99, total 100 nomor)\n` +
      `• \`${usedPrefix + command} <nomor>\` (Cek 1 nomor tunggal)\n\n` +
      `*Contoh Penggunaan:*\n` +
      `• \`${usedPrefix + command} 628385455157x\`\n` +
      `• \`${usedPrefix + command} 62838545515xx\`\n` +
      `• \`${usedPrefix + command} 08385455157x\`\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  // Bersihkan format (spasi, strip, tanda kurung, plus)
  let clean = input.replace(/[\s\-\(\)\+]/g, '');

  // Normalisasi format Indonesia 08xx -> 628xx
  if (/^08/i.test(clean)) {
    clean = '62' + clean.slice(1);
  }

  // Hitung jumlah karakter wildcard 'x'
  const xMatches = clean.match(/x/gi);
  const xCount = xMatches ? xMatches.length : 0;

  // Batasi maksimal 2 karakter 'x' di akhir nomor demi keamanan akun bot
  if (xCount > 2) {
    return m.reply(
      `*Peringatan Batasan Keamanan*\n\n` +
      `Maksimal wildcard hanya diizinkan *1 atau 2 huruf 'x'* di akhir nomor (maksimal 100 nomor).\n` +
      `Permintaan lebih dari 2 digit 'x' ditolak untuk mencegah pemblokiran (ban) akun bot oleh WhatsApp.`
    );
  }

  // Pastikan x hanya ada di bagian belakang
  if (xCount > 0 && !/x+$/i.test(clean)) {
    return m.reply(
      `*Format Posisi Salah*\n\n` +
      `Huruf \`x\` hanya boleh diletakkan di akhir nomor.\nContoh: \`${usedPrefix + command} 628385455157x\` atau \`${usedPrefix + command} 62838545515xx\``
    );
  }

  let numbersToCheck = [];

  if (xCount === 1) {
    for (let i = 0; i <= 9; i++) {
      numbersToCheck.push(clean.replace(/x$/i, i.toString()));
    }
  } else if (xCount === 2) {
    for (let i = 0; i <= 99; i++) {
      const padded = i.toString().padStart(2, '0');
      numbersToCheck.push(clean.replace(/xx$/i, padded));
    }
  } else {
    if (!/^\d{8,16}$/.test(clean)) {
      return m.reply(
        `*Format Nomor Tidak Valid*\n\n` +
        `Pastikan format nomor benar (8-16 digit) dan hanya gunakan 1 atau 2 'x' di ujung nomor.\n` +
        `Contoh: \`${usedPrefix + command} 628385455157x\``
      );
    }
    numbersToCheck.push(clean);
  }

  // Terapkan cooldown ke user pengirim
  userCooldowns.set(userId, Date.now());

  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

  try {
    const registeredMap = new Map();
    const BATCH_SIZE = 20; // Pecah menjadi batch kecil 20 nomor per request

    for (let i = 0; i < numbersToCheck.length; i += BATCH_SIZE) {
      const chunk = numbersToCheck.slice(i, i + BATCH_SIZE);
      const res = await conn.onWhatsApp(...chunk);

      if (Array.isArray(res)) {
        for (const item of res) {
          if (item?.exists && item?.jid) {
            const numOnly = item.jid.split('@')[0].split(':')[0].replace(/\D/g, '');
            registeredMap.set(numOnly, item.jid);
          }
        }
      }

      // Jeda 1 detik antar-batch untuk menghindari rate-limit jika lebih dari 1 batch
      if (i + BATCH_SIZE < numbersToCheck.length) {
        await sleep(1000);
      }
    }

    const registeredList = [];
    const unregisteredList = [];

    for (const num of numbersToCheck) {
      if (registeredMap.has(num)) {
        registeredList.push(num);
      } else {
        unregisteredList.push(num);
      }
    }

    if (registeredList.length > 0) {
      addNumbersToPool(registeredList);
    }

    let caption =
      `╭── ✦ *HASIL PEMERIKSAAN NOMOR* ✦\n` +
      `• Target Pola: ${clean}\n` +
      `• Total Pengecekan: ${numbersToCheck.length} nomor\n` +
      `• Terdaftar (Aktif): ${registeredList.length}\n` +
      `• Tidak Terdaftar: ${unregisteredList.length}\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // Jika 10 nomor atau kurang, tampilkan seluruh detail status
    if (numbersToCheck.length <= 10) {
      caption += `*Daftar Status:*\n`;
      for (const num of numbersToCheck) {
        if (registeredMap.has(num)) {
          caption += `• \`${num}\` › ✅ Terdaftar\n`;
        } else {
          caption += `• \`${num}\` › ❌ Tidak Terdaftar\n`;
        }
      }
    } else {
      // Jika 100 nomor (2 'x'), tampilkan hanya nomor aktif agar pesan ringkas & tidak lag
      caption += `*Nomor Terdaftar Ditemukan (${registeredList.length}):*\n`;
      if (registeredList.length === 0) {
        caption += `_Tidak ada nomor aktif yang ditemukan pada rentang 00-99._\n`;
      } else {
        for (const regNum of registeredList) {
          caption += `• \`${regNum}\` › ✅ Terdaftar\n`;
        }
      }
    }

    if (registeredList.length > 0 && registeredList.length <= 15) {
      caption += `\n*Tautan Langsung (WA.me):*\n`;
      for (const regNum of registeredList) {
        caption += `• https://wa.me/${regNum}\n`;
      }
    }

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    // CTA copy button jika didukung
    if (registeredList.length > 0 && typeof conn.sendButton === 'function') {
      try {
        const buttons = registeredList.slice(0, 3).map((num, idx) => ({
          name: 'cta_copy',
          buttonParamsJson: JSON.stringify({
            display_text: `Salin Nomor (${idx + 1})`,
            copy_code: num
          })
        }));

        return await conn.sendButton(m.chat, {
          body: caption,
          footer: `${global.info?.namabot || 'Joy'} • Safe WhatsApp Checker`,
          buttons
        }, { quoted: m });
      } catch (_) {
        return await m.reply(caption);
      }
    }

    return await m.reply(caption);

  } catch (err) {
    console.error('[CEKNOMOR ERROR]:', err);
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    return m.reply(`*Gagal Memeriksa Nomor:*\n\n_${err.message || 'Terjadi kesalahan sistem.'}_`);
  }
};

handler.help = ['ceknomor *<nomor>x*'];
handler.tags = ['tools'];
handler.command = /^(ceknom?or|checknum|cekhp|nowa)$/i;
handler.limit = true;

export default handler;
