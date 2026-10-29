/*
 * @Author: Rafli
 * @Feature: YouTube Music Charts
 * @Description: Menampilkan tangga lagu resmi dan musisi terpopuler di YouTube Music berdasarkan negara (default ID / Indonesia).
 */

import ytmusic from '../function/scrapers/ytmusic.js';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const country = (text.trim() || 'ID').toUpperCase();

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

    try {
        const charts = await ytmusic.getCharts(country);

        if (!charts || (!charts.topArtists?.length && !charts.chartPlaylists?.length)) {
            throw new Error(`Data tangga lagu untuk negara "${country}" tidak ditemukan.`);
        }

        let msg = `╭── ✦ *YOUTUBE MUSIC CHARTS (${charts.country})* ✦\n`;

        if (charts.topArtists?.length > 0) {
            msg += `• *ARTIS TERATAS:*\n`;
            charts.topArtists.slice(0, 15).forEach((artist, idx) => {
                const subs = artist.subscribers ? ` (${artist.subscribers})` : '';
                msg += `› *${idx + 1}.* ${artist.name}${subs}\n`;
            });
            msg += `\n`;
        }

        if (charts.chartPlaylists?.length > 0) {
            msg += `• *PLAYLIST TANGGA LAGU:*\n`;
            charts.chartPlaylists.forEach((pl, idx) => {
                const sub = pl.subtitle ? ` (${pl.subtitle})` : '';
                msg += `› *${idx + 1}.* ${pl.title}${sub}\n`;
            });
            msg += `\n`;
        }

        msg += `> _Gunakan perintah \`${usedPrefix}ytm <nama artis/lagu>\` untuk memutar musik._\n` +
               `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        const thumb = charts.topArtists?.[0]?.thumbnail || 'https://music.youtube.com/img/favicon_144.png';

        await conn.sendMessage(m.chat, {
            text: msg,
            contextInfo: {
                externalAdReply: {
                    title: `Top Charts • YouTube Music (${charts.country})`,
                    body: `Daftar Musisi & Tangga Lagu Populer`,
                    thumbnailUrl: thumb,
                    sourceUrl: 'https://music.youtube.com/charts',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error('[YTCHARTS ERROR]', err);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        m.reply(`*Gagal memuat tangga lagu:*\n_${err.message}_\n\n_Contoh penggunaan:_ \`${usedPrefix + command} ID\` atau \`${usedPrefix + command} US\``);
    }
};

handler.help = ['ytcharts <kode negara>'];
handler.tags = ['info', 'downloader'];
handler.command = /^(ytcharts|topmusic|trendingmusic)$/i;
handler.limit = false;

export default handler;
