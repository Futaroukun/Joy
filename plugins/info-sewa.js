import { getNomorOwner } from '../function/core/cek-sewa.js';

let handler = async (m, { conn, usedPrefix }) => {
    const nomorOwner = getNomorOwner();
    const namaBot = global.info?.namabot || 'Joy Bot';

    const text =
        `╭── ✦ *SEWA ${namaBot.toUpperCase()} & PREMIUM* ✦\n` +
        `Bot WhatsApp 24 jam nonstop dengan fitur AI cerdas (Gemini, Qwen, DeepSeek), downloader media tanpa watermark, RPG, dan proteksi grup.\n\n` +
        `*SEWA BOT (UNTUK 1 GRUP)*\n` +
        `• *7 Hari*    : Rp 5.000\n` +
        `• *15 Hari*   : Rp 8.000\n` +
        `• *30 Hari*   : Rp 13.000\n` +
        `• *60 Hari*   : Rp 22.000\n` +
        `• *Permanen*  : Rp 50.000\n` +
        `› Semua member di dalam grup bisa menggunakan bot.\n\n` +
        `*USER PREMIUM (UNTUK PRIBADI)*\n` +
        `• *7 Hari*    : Rp 3.000\n` +
        `• *15 Hari*   : Rp 5.000\n` +
        `• *30 Hari*   : Rp 8.000\n` +
        `• *60 Hari*   : Rp 15.000\n` +
        `• *Permanen*  : Rp 28.000\n` +
        `› Limit Unlimited, bebas PC bot, cooldown dipotong 50%.\n\n` +
        `*PAKET COMBO HEMAT:*\n` +
        `• *Bulanan*   : Rp 18.000 (Sewa 1 Bln + Prem 1 Bln)\n` +
        `• *Permanen*  : Rp 65.000 (Sewa Perm + Prem Perm)\n\n` +
        `*CARA PEMESANAN:*\n` +
        `1. Hubungi Owner melalui tautan di bawah.\n` +
        `2. Lakukan pembayaran via QRIS / E-Wallet.\n` +
        `3. Konfirmasi pembayaran ke Owner.\n` +
        `4. Bot atau akun premium akan langsung diaktifkan.\n\n` +
        `*Kontak Owner*: wa.me/${nomorOwner}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`;

    await conn.sendMessage(m.chat, {
        text,
        contextInfo: {
            externalAdReply: {
                title: `Sewa ${namaBot} & Akun Premium`,
                body: `Mulai dari Rp 3.000`,
                previewType: 'PHOTO',
                thumbnailUrl: 'https://files.catbox.moe/k3h578.jpg',
                sourceUrl: `https://wa.me/${nomorOwner}`
            }
        }
    }, { quoted: m });
};

handler.help    = ['sewabot'];
handler.tags    = ['info'];
handler.command = /^(sewabot|sewa-bot|rentbot)$/i;

export default handler;
