/*
 * @Author     : Joy Multi-Device Assistant
 * @Feature    : Cek Spesifikasi HP & Gadget Lengkap (GSMArena Direct Engine)
 * @Description: Menampilkan spesifikasi teknis lengkap dari GSMArena tanpa hambatan Cloudflare.
 */

import {
  searchPhones,
  getDeviceDetail
} from '../function/scrapers/spekhp.js';

let handler = async (m, { conn, usedPrefix, command, text }) => {
  if (!text) {
    return m.reply(
      `*PANDUAN CEK SPESIFIKASI HP*\n\n` +
      `Gunakan perintah ini untuk melihat spesifikasi detail smartphone & gadget.\n\n` +
      `*Pencarian Berdasarkan Nama:*\n` +
      `- ${usedPrefix + command} <nama hp>\n` +
      `- Contoh: ${usedPrefix + command} poco x8 pro\n` +
      `- Contoh: ${usedPrefix + command} realme 15 5g\n` +
      `- Contoh: ${usedPrefix + command} s24 ultra\n\n` +
      `*Cek Langsung ID / Slug:*\n` +
      `- ${usedPrefix + command} <id>\n` +
      `- Contoh: ${usedPrefix + command} 14506`
    );
  }

  const query = text.trim();
  await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

  try {
    // 1. INPUT BERUPA ID ATAU SLUG LANGSUNG
    if (/^\d+$/.test(query) || /-\d+$/.test(query)) {
      const detail = await getDeviceDetail(query);
      if (!detail) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply(`Perangkat dengan ID/Slug \`${query}\` tidak ditemukan.`);
      }

      await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      if (detail.img) {
        return await conn.sendMessage(m.chat, {
          image: { url: detail.img },
          caption: detail.card
        }, { quoted: m });
      }
      return await conn.sendMessage(m.chat, { text: detail.card }, { quoted: m });
    }

    // 2. PENCARIAN DATABASE GSMARENA (INSTANT LOCAL INDEX)
    const results = await searchPhones(query, 10);

    // KASUS A: Ditemukan Persis 1 Perangkat -> Langsung Tampilkan Rincian
    if (results.length === 1) {
      const detail = await getDeviceDetail(results[0].slug || results[0].id);
      if (detail) {
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

        if (detail.img) {
          return await conn.sendMessage(m.chat, {
            image: { url: detail.img },
            caption: detail.card
          }, { quoted: m });
        }
        return await conn.sendMessage(m.chat, { text: detail.card }, { quoted: m });
      }
    }

    // KASUS B: Ditemukan Banyak Varian (> 1) -> Tampilkan Menu Single Select / List
    if (results.length > 1) {
      const rows = results.map((r, i) => {
        const shortName = r.name.length > 24 ? r.name.slice(0, 21) + '...' : r.name;
        return {
          header: `Model #${i + 1}`,
          title: shortName,
          description: `Lihat spesifikasi ${r.name}`.slice(0, 72),
          id: `${usedPrefix + command} ${r.id}`
        };
      });

      await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

      // Coba kirim via Single Select Button Baileys
      try {
        await conn.sendButton(m.chat, {
          header: 'HASIL PENCARIAN GADGET',
          body: `Ditemukan *${results.length}* model untuk pencarian *"${query}"*.\nPilih salah satu perangkat di bawah untuk melihat rincian spesifikasi:`,
          footer: 'GSMArena Direct Engine',
          buttons: [{
            name: 'single_select',
            buttonParamsJson: JSON.stringify({
              title: 'PILIH PERANGKAT',
              sections: [{ title: 'Daftar Perangkat Ditemukan', rows }]
            })
          }]
        }, { quoted: m });
        return;
      } catch {
        // Fallback teks jika Single Select Button gagal / tidak didukung
        const listText = [
          `*HASIL PENCARIAN GADGET*\n`,
          `Ditemukan *${results.length}* model untuk pencarian "${query}".\n`,
          `Ketik atau salin perintah di bawah untuk melihat rincian lengkap:\n`,
          results.map((r, i) => `${i + 1}. ${r.name}\nPerintah: ${usedPrefix + command} ${r.id}`).join('\n\n')
        ].join('\n');

        return await conn.sendMessage(m.chat, { text: listText }, { quoted: m });
      }
    }

    // KASUS C: Tidak ditemukan di database (0 hasil)
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    return m.reply(`Perangkat *"${query}"* tidak ditemukan dalam database spesifikasi.\nPastikan penulisan merek dan tipe perangkat sudah benar.`);

  } catch (err) {
    console.error('[SPEKHP-PLUGIN-ERROR]', err);
    await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
    return m.reply(`Gagal mengambil data spesifikasi: ${err.message}`);
  }
};

handler.help = ['spekhp *nama hp*'];
handler.tags = ['tools'];
handler.command = /^(spekhp|spek|spesifikasi|gsmarena|spekgadget)$/i;

export default handler;
