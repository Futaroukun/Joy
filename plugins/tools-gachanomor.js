import { getPoolCount, getRandomFromPool, addNumbersToPool } from '../function/core/gacha-pool.js';

const userCooldowns = new Map();
const COOLDOWN_MS = 15000;
const TARGET_POOL = 100;

const PROVIDER_PREFIXES = [
  { name: 'Telkomsel', prefixes: ['62812', '62813', '62821', '62822', '62852', '62853'] },
  { name: 'Indosat', prefixes: ['62815', '62816', '62856', '62857', '62858'] },
  { name: 'XL/Axis', prefixes: ['62817', '62818', '62819', '62831', '62838', '62877', '62878'] },
  { name: 'Tri (3)', prefixes: ['62895', '62896', '62897', '62898', '62899'] },
  { name: 'Smartfren', prefixes: ['62881', '62882', '62887', '62888'] }
];

function getRandomProvider() {
  const provider = PROVIDER_PREFIXES[Math.floor(Math.random() * PROVIDER_PREFIXES.length)];
  const prefix = provider.prefixes[Math.floor(Math.random() * provider.prefixes.length)];
  return { providerName: provider.name, prefix };
}

function generateRandomNumber() {
  const { providerName, prefix } = getRandomProvider();
  const suffix = Math.floor(1000000 + Math.random() * 9000000).toString();
  return { number: prefix + suffix, providerName };
}

function checkRarity(number) {
  const last4 = number.slice(-4);
  const last3 = number.slice(-3);
  const last2 = number.slice(-2);

  if (/^(\d)\1{3}$/.test(last4) || ['1234', '2345', '3456', '4567', '5678', '6789'].includes(last4)) {
    return { grade: 'Mythic (SSS)', emoji: '👑' };
  }
  if (/^(\d)\1{2}$/.test(last3) || (last4[0] === last4[2] && last4[1] === last4[3])) {
    return { grade: 'Legendary (SS)', emoji: '⭐' };
  }
  if (/^(\d)\1$/.test(last2) || last2 === '00') {
    return { grade: 'Epic (S)', emoji: '✨' };
  }
  return { grade: 'Common (A)', emoji: '🔹' };
}

let handler = async (m, { conn, usedPrefix, command, isPremium, isOwner }) => {
  const userId = m.sender;
  const now = Date.now();
  const lastUsed = userCooldowns.get(userId) || 0;

  const effectiveCooldownMs = isOwner ? 0 : (isPremium ? 5000 : COOLDOWN_MS);
  const remainingCooldown = Math.ceil((effectiveCooldownMs - (now - lastUsed)) / 1000);

  if (effectiveCooldownMs > 0 && (now - lastUsed < effectiveCooldownMs)) {
    return m.reply(
      `*Jeda Gacha (Anti-Spam)*\n\n` +
      `Tunggu \`${remainingCooldown} detik\` lagi untuk melakukan gacha nomor berikutnya.`
    );
  }

  userCooldowns.set(userId, now);
  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

  const currentPoolCount = getPoolCount();

  try {
    let resultNumber = null;
    let modeText = '';

    if (currentPoolCount < TARGET_POOL) {
      modeText = `Koleksi Vault (${currentPoolCount}/${TARGET_POOL})`;

      const candidate1 = generateRandomNumber().number;
      const candidate2 = generateRandomNumber().number;

      const checkRes = await conn.onWhatsApp(candidate1, candidate2);
      const activeFound = [];

      if (Array.isArray(checkRes)) {
        for (const item of checkRes) {
          if (item?.exists && item?.jid) {
            const num = item.jid.split('@')[0].split(':')[0].replace(/\D/g, '');
            activeFound.push(num);
          }
        }
      }

      if (activeFound.length > 0) {
        addNumbersToPool(activeFound);
        resultNumber = activeFound[0];
      } else {
        if (currentPoolCount > 0) {
          resultNumber = getRandomFromPool();
        } else {
          await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
          return m.reply(
            `╭── ✦ *GACHA NOMOR WHATSAPP* ✦\n` +
            `• Status Vault: ${currentPoolCount}/${TARGET_POOL} nomor\n` +
            `• Hasil: *Zonk (Belum Beruntung)*\n\n` +
            `Bot mencoba memindai \`+${candidate1}\` dan \`+${candidate2}\`, namun keduanya belum aktif di WhatsApp.\n\n` +
            `_Coba ketik \`${usedPrefix + command}\` lagi untuk mencari nomor aktif lainnya._\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
          );
        }
      }

    } else {
      modeText = `Vault Penuh (${currentPoolCount} nomor tersimpan)`;

      resultNumber = getRandomFromPool();

      if (Math.random() < 0.5) {
        (async () => {
          try {
            const probe = generateRandomNumber().number;
            const res = await conn.onWhatsApp(probe);
            if (Array.isArray(res) && res[0]?.exists && res[0]?.jid) {
              const freshNum = res[0].jid.split('@')[0].split(':')[0].replace(/\D/g, '');
              addNumbersToPool(freshNum);
            }
          } catch (_) {}
        })();
      }
    }

    const rarity = checkRarity(resultNumber);
    const updatedCount = getPoolCount();

    const caption =
      `╭── ✦ *HASIL GACHA NOMOR WHATSAPP* ✦\n` +
      `• Nomor: \`+${resultNumber}\`\n` +
      `• Rarity: ${rarity.emoji} *${rarity.grade}*\n` +
      `• Status Akun: ✅ Aktif Terdaftar\n` +
      `• Mode Sistem: ${modeText}\n` +
      `• Total Koleksi: ${updatedCount} nomor\n` +
      `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
      `*Tautan Langsung:*\n` +
      `• https://wa.me/${resultNumber}`;

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    if (typeof conn.sendButton === 'function') {
      try {
        const buttons = [
          {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
              display_text: 'Salin Nomor',
              copy_code: resultNumber
            })
          }
        ];

        return await conn.sendButton(m.chat, {
          body: caption,
          footer: `${global.info?.namabot || 'Joy'} • Gacha Number Vault`,
          buttons
        }, { quoted: m });
      } catch (_) {
        return await m.reply(caption);
      }
    }

    return await m.reply(caption);

  } catch (err) {
    console.error('[GACHA NOMOR ERROR]:', err);
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
    return m.reply(`*Gagal Melakukan Gacha:*\n\n_${err.message || 'Terjadi kesalahan sistem.'}_`);
  }
};

handler.help = ['gachanomor'];
handler.tags = ['tools'];
handler.command = /^(gachanom?or|gachawa|rngwa)$/i;
handler.limit = true;

export default handler;
