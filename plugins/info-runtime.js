/*
 * @Author      : Rafli
 * @Feature     : System & Process Runtime
 * @Description : Menampilkan durasi aktif proses bot, waktu mulai, uptime server OS, dan statistik alokasi memori.
 * @Version     : 2.1 (No Decorational Emoji & Detailed Metrics)
 */

import os from 'os';
import moment from 'moment-timezone';

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function clockString(ms) {
    if (isNaN(ms) || ms <= 0) return '0 Detik';
    const d = Math.floor(ms / 86400000);
    const h = Math.floor(ms / 3600000) % 24;
    const m = Math.floor(ms / 60000) % 60;
    const s = Math.floor(ms / 1000) % 60;

    const parts = [];
    if (d > 0) parts.push(`${d} Hari`);
    if (h > 0) parts.push(`${h} Jam`);
    if (m > 0) parts.push(`${m} Menit`);
    if (s > 0 || parts.length === 0) parts.push(`${s} Detik`);

    return parts.join(' ');
}

let handler = async (m, { conn }) => {
    try {
        const botUptimeMs = process.uptime() * 1000;
        const osUptimeMs = os.uptime() * 1000;

        const startTime = moment(Date.now() - botUptimeMs).tz('Asia/Jakarta').format('dddd, DD MMMM YYYY [pukul] HH:mm:ss [WIB]');
        const currentTime = moment().tz('Asia/Jakarta').format('dddd, DD MMMM YYYY [pukul] HH:mm:ss [WIB]');

        const mem = process.memoryUsage();
        const heapUsed = formatBytes(mem.heapUsed);
        const heapTotal = formatBytes(mem.heapTotal);
        const rss = formatBytes(mem.rss);

        const totalSysMem = os.totalmem();
        const freeSysMem = os.freemem();
        const usedSysMem = totalSysMem - freeSysMem;
        const sysMemPct = ((usedSysMem / totalSysMem) * 100).toFixed(1);

        let totalUsers = 0, registeredUsers = 0, chatCount = 0;
        if (global.db?.data) {
            const allUsers = Object.values(global.db.data.users || {});
            totalUsers = allUsers.length;
            registeredUsers = allUsers.filter(u => u && u.register === true).length;
            chatCount = Object.keys(global.db.data.chats || {}).length;
        }

        const runtimeText =
            `*STATUS RUNTIME & AKTIVITAS SISTEM*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `• *Nama Bot:* ${global.info?.namabot || 'Joy'}\n` +
            `• *Uptime Bot:* *${clockString(botUptimeMs)}*\n` +
            `• *Uptime Server OS:* ${clockString(osUptimeMs)}\n` +
            `• *Dimulai Pada:* ${startTime}\n` +
            `• *Waktu Sekarang:* ${currentTime}\n\n` +
            `*STATISTIK MEMORI (RAM):*\n` +
            `• *Heap Digunakan:* ${heapUsed} / ${heapTotal}\n` +
            `• *Process RSS:* ${rss}\n` +
            `• *RAM Server:* ${formatBytes(usedSysMem)} / ${formatBytes(totalSysMem)} (${sysMemPct}%)\n\n` +
            `*STATISTIK ENTITAS DATABASE:*\n` +
            `• *Pengguna Terdaftar:* ${registeredUsers.toLocaleString('id-ID')} akun\n` +
            `• *Total Pengguna:* ${totalUsers.toLocaleString('id-ID')} akun\n` +
            `• *Grup / Percakapan:* ${chatCount.toLocaleString('id-ID')} chat\n` +
            `• *Platform Server:* ${os.platform()} (${os.arch()}) • Node.js ${process.version}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`;

        const thumbObj = Buffer.isBuffer(global.thum)
            ? { thumbnail: global.thum }
            : (global.thum ? { thumbnailUrl: global.thum } : {});

        await conn.sendMessage(m.chat, {
            text: runtimeText,
            contextInfo: {
                externalAdReply: {
                    title: `${global.info?.namabot || 'Joy'} • Runtime Monitor`,
                    body: `Uptime: ${clockString(botUptimeMs)} | RAM: ${heapUsed}`,
                    ...thumbObj,
                    sourceUrl: global.lgh || 'https://github.com/Futaroukun/Joy',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (error) {
        console.error('[RUNTIME ERROR]', error);
        await m.reply(`*Gagal memuat info runtime:*\n_${error.message}_`);
    }
};

handler.help    = ['runtime'];
handler.tags    = ['info'];
handler.command = /^(runtime|uptime|rt)$/i;

export default handler;