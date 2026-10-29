/*
 * @Author: Rafli
 * @Feature: YouTube Music Downloader & Streamer
 * @Description: Putar dan unduh musik dari YouTube Music dengan kualitas tinggi, metadata ID3, dan lirik otomatis.
 */

import ytmusic from '../function/scrapers/ytmusic.js';
import { toAudioM4A } from '../function/media/converter.js';

function isValidAudioBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 50000) return false;
    const headerStr = buf.slice(0, 200).toString('utf-8').toLowerCase();
    if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('<?xml')) {
        return false;
    }
    const isId3 = buf.slice(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    const isM4a = buf.slice(4, 8).toString('ascii') === 'ftyp';
    const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
    const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const isRiff = buf.slice(0, 4).toString('ascii') === 'RIFF';

    return isId3 || isMp3Sync || isM4a || isOgg || isWebm || isRiff;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `╭── ✦ *YOUTUBE MUSIC* ✦\n` +
            `• *Format:* ${usedPrefix + command} <judul / link YTM>\n` +
            `• *Contoh:* ${usedPrefix + command} die with a smile\n` +
            `• *Fitur Tambahan:* Ketik \`${usedPrefix + command} <judul> --lyrics\` untuk menampilkan lirik lagu.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    const wantLyrics = text.includes('--lyrics') || text.includes('-l');
    const query = text.replace(/--lyrics|-l/gi, '').trim();

    if (!query) {
        return m.reply(`• Masukkan judul lagu atau link YouTube Music.`);
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

    let loadingMsg = null;
    try {
        loadingMsg = await conn.sendMessage(m.chat, {
            text: `╭── ✦ *YOUTUBE MUSIC* ✦\n` +
                  `• *Mencari:* ${query}\n` +
                  `• *Status:* Sedang mengambil stream audio...\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━`
        }, { quoted: m });

        const result = await ytmusic.download(query, {
            whatsapp: true,
            format: 'mp3'
        });

        if (!result || !result.buffer) {
            throw new Error('Gagal mendapatkan buffer audio dari YouTube Music.');
        }

        const songUrl = `https://music.youtube.com/watch?v=${result.videoId}`;
        const title = result.title || query;
        const artist = result.artist || 'YouTube Music';
        const duration = result.duration || '—';
        const sizeStr = result.formattedSize || '—';
        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();

        let lirikText = null;
        if (wantLyrics) {
            try {
                const lrc = await ytmusic.getLyrics(result.videoId);
                if (lrc?.lyrics) {
                    lirikText = lrc.lyrics;
                }
            } catch {}
        }

        let upNext = [];
        try {
            const qData = await ytmusic.getQueue(result.videoId).catch(() => null);
            if (qData?.queue?.length) {
                upNext = qData.queue.slice(0, 3).map(q => `${q.title}${q.subtitle ? ` (${q.subtitle})` : ''}`);
            }
        } catch {}

        await conn.sendMessage(m.chat, { delete: loadingMsg?.key }).catch(() => {});

        let caption = `╭── ✦ *YOUTUBE MUSIC* ✦\n` +
                      `• *Judul:* ${title}\n` +
                      `• *Artis:* ${artist}\n` +
                      `• *Durasi:* ${duration}\n` +
                      `• *Ukuran:* ${sizeStr}\n` +
                      `• *Format:* MP3 (192kbps)\n` +
                      `• *Link:* ${songUrl}\n` +
                      `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        if (upNext.length > 0) {
            caption += `╭── ✦ *REKOMENDASI BERIKUTNYA* ✦\n` +
                       upNext.map((song, i) => `• ${i + 1}. ${song}`).join('\n') + '\n' +
                       `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
        }

        caption += `> _Sedang mengirim file audio..._`;

        await conn.sendMessage(m.chat, {
            text: caption,
            contextInfo: {
                externalAdReply: {
                    title: title,
                    body: `${artist} • YouTube Music`,
                    thumbnailUrl: result.thumbnail,
                    sourceUrl: songUrl,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

        let audioToSend = result.buffer;
        let mimeToSend = 'audio/mp4';
        try {
            const m4a = await toAudioM4A(result.buffer, 'mp3');
            if (m4a?.data && isValidAudioBuffer(m4a.data)) {
                audioToSend = m4a.data;
                if (typeof m4a.delete === 'function') await m4a.delete().catch(() => {});
            }
        } catch (convErr) {
            console.warn('[YTMUSIC] Gagal konversi audio ke M4A, fallback ke buffer MP3:', convErr.message);
            mimeToSend = 'audio/mpeg';
        }

        try {
            await conn.sendMessage(m.chat, {
                audio: audioToSend,
                mimetype: mimeToSend,
                fileName: `${cleanTitle}.${mimeToSend === 'audio/mp4' ? 'm4a' : 'mp3'}`,
                ptt: false,
                seconds: result.durationSeconds || undefined
            }, { quoted: m });
        } catch (audioErr) {
            console.warn('[YTMUSIC] Gagal kirim sebagai audio, fallback ke document:', audioErr.message);
            await conn.sendMessage(m.chat, {
                document: result.buffer,
                mimetype: 'audio/mpeg',
                fileName: `${cleanTitle}.mp3`
            }, { quoted: m });
        }

        if (wantLyrics) {
            if (lirikText) {
                await conn.sendMessage(m.chat, {
                    text: `╭── ✦ *LIRIK LAGU* ✦\n` +
                          `• *Judul:* ${title}\n` +
                          `• *Artis:* ${artist}\n` +
                          `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                          `${lirikText}\n\n` +
                          `╰━━━━━━━━━━━━━━━━━━━━━━━`
                }, { quoted: m });
            } else {
                await m.reply(`> _Lirik lagu untuk "${title}" tidak ditemukan._`);
            }
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error('[YTMUSIC ERROR]', err);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        const errMsg = `*Gagal memutar lagu dari YouTube Music:*\n_${err.message}_\n\n_Silakan coba judul atau kata kunci lain._`;
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { text: errMsg, edit: loadingMsg.key }).catch(() => m.reply(errMsg));
        } else {
            await m.reply(errMsg);
        }
    }
};

handler.help = ['ytm <judul/link>'];
handler.tags = ['downloader'];
handler.command = /^(ytmusic|ytm|playmusic|musikaudio)$/i;
handler.limit = false;

export default handler;
