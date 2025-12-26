import { getExpRequirement } from '../lib/leveling.js';

let handler = async (m, { conn, text }) => {
    // 1. Tentukan target: user yang di-mention atau pengirim pesan
    let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.sender;
    let user = global.db.data.users[who];

    if (!user) {
        return m.reply('User tidak ditemukan di database.');
    }

    // 2. Tentukan Level Maksimum
    const MAX_LEVEL = 120; // Sesuai dengan rank "God" di leveling.js

    // 3. Hitung total EXP yang dibutuhkan untuk mencapai MAX_LEVEL
    // Kita jumlahkan semua requirement EXP dari level 1 sampai 120.
    let totalExpNeeded = 0;
    for (let i = 1; i <= MAX_LEVEL; i++) {
        totalExpNeeded += getExpRequirement(i);
    }
    // Tambah 1 exp buat mastiin dia pas di level 120
    totalExpNeeded += 1;

    // 4. Langsung update data user di database
    user.level = MAX_LEVEL;
    user.exp = totalExpNeeded;
    user.limit = Infinity; // Biar jadi dewa sekalian, limit tak terbatas

    // 5. Kirim pesan konfirmasi
    conn.reply(m.chat, 
        `*CHEAT MODE: GOD LEVEL ACTIVATED*\n\n` +
        `Berhasil mengatur @${who.split('@')[0]} ke:\n` +
        `• *Level:* ${MAX_LEVEL} (MAX)\n` +
        `• *EXP:* ~${(totalExpNeeded / 1e9).toFixed(2)} Miliar\n` +
        `• *Limit:* ∞ (Tak Terbatas)\n\n` +
        `Selamat, Anda telah menjadi Dewa!`, 
    m, { mentions: [who] });
};

handler.help = ['maxlevel'];
handler.tags = ['owner'];
handler.command = /^(maxlevel|godmode)$/i;

// Ini kunci utamanya, cuma owner yang bisa akses
handler.owner = true;

export default handler;