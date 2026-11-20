let handler = async (m, { conn, usedPrefix }) => {
    const nomorOwner = (global.info?.nomorowner || global.owner?.[0] || '').toString().replace(/\D/g, '');
    const namaBot = global.info?.namabot || 'Joy Bot';

    const text =
        `╭── ✦ *SEWA ${namaBot.toUpperCase()}* ✦\n` +
        `Tertarik memasukkan bot ke grup kamu agar lebih interaktif dan tertib? Kami menyediakan layanan sewa bot dengan beragam fitur unggulan!\n\n` +
        `*KEUNTUNGAN SEWA BOT:*\n` +
        `• 🟢 Aktif 24 Jam Nonstop di VPS\n` +
        `• 🛡️ Fitur Proteksi Grup (Antilink, Antidelete, dsb.)\n` +
        `• 🤖 Akses AI Chat Cerdas (Gemini, Qwen, DeepSeek)\n` +
        `• 📥 Pengunduh Media Cepat (TikTok, IG, YouTube, dsb.)\n` +
        `• 🎮 Game RPG, Toko, Profil, dan Stiker Lengkap\n` +
        `• ⚡ Respons super cepat tanpa delay berat\n\n` +
        `*DAFTAR HARGA SEWA:*\n` +
        `• *1 Minggu (7 Hari)* : Rp 5.000\n` +
        `• *1 Bulan (30 Hari)* : Rp 15.000\n` +
        `• *2 Bulan (60 Hari)* : Rp 25.000\n` +
        `• *Permanen* : Rp 50.000\n\n` +
        `*CARA PEMESANAN:*\n` +
        `1. Hubungi Owner melalui tautan di bawah.\n` +
        `2. Lakukan pembayaran via QRIS / E-Wallet.\n` +
        `3. Kirimkan link grup kamu ke Owner.\n` +
        `4. Bot akan otomatis masuk dan aktif di grup kamu!\n\n` +
        `*Kontak Owner*: wa.me/${nomorOwner}\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`;

    await conn.sendMessage(m.chat, {
        text,
        contextInfo: {
            externalAdReply: {
                title: `Sewa ${namaBot} untuk Grup Kamu!`,
                body: `Mulai dari Rp 5.000 / minggu`,
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
