import { toPTT } from '../function/media/converter.js';
import { getAudioWaveform } from '@whiskeysockets/baileys';

global.newsletterCache = global.newsletterCache || {};

async function getNewsletterJid(conn, target) {
    if (target.endsWith('@newsletter')) return target;
    const match = target.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
    const code = match ? match[1] : target;
    
    if (global.newsletterCache[code]) return global.newsletterCache[code];
    
    const res = await conn.newsletterMetadata("invite", code);
    if (res?.id) {
        global.newsletterCache[code] = res.id;
        return res.id;
    }
    throw new Error('Channel tidak ditemukan atau tidak dapat diakses.');
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let rawMime = (q.msg || q).mimetype || '';
    let mediaType = q.mediaType || '';

    // Deteksi apakah pesan benar-benar membawa binary media
    let isImage = /image/i.test(rawMime) || /imageMessage/i.test(mediaType);
    let isVideo = /video/i.test(rawMime) || /videoMessage/i.test(mediaType);
    let isAudio = /audio/i.test(rawMime) || /audioMessage/i.test(mediaType);
    let isSticker = /sticker/i.test(rawMime) || /stickerMessage/i.test(mediaType);
    let isDocument = /document/i.test(rawMime) || /documentMessage/i.test(mediaType) || 
                     (Boolean(rawMime) && !isImage && !isVideo && !isAudio && !isSticker && !/text|conversation/i.test(rawMime));

    let isMedia = isImage || isVideo || isAudio || isSticker || isDocument;

    let target = global.lch;
    let contentText = '';

    if (text) {
        if (text.includes('|')) {
            let parts = text.split('|');
            let potentialTarget = parts[0].trim();
            if (/whatsapp\.com\/channel/i.test(potentialTarget) || potentialTarget.endsWith('@newsletter')) {
                target = potentialTarget;
                contentText = parts.slice(1).join('|').trim();
            } else {
                contentText = text.trim();
            }
        } else {
            let arg = text.trim();
            if (/whatsapp\.com\/channel/i.test(arg) || arg.endsWith('@newsletter')) {
                target = arg;
                contentText = '';
            } else {
                contentText = arg;
            }
        }
    }

    // Jika reply pesan teks dan contentText tidak diisi via argumen command, ambil isi teks quoted
    if (!isMedia && !contentText && m.quoted) {
        contentText = m.quoted.text || m.quoted.caption || '';
    }

    if (!target) {
        return m.reply('Channel default tidak diatur di settings.js (global.lch) dan tidak ada argumen channel yang diberikan.');
    }

    if (!isMedia && !contentText) {
        return m.reply(
            `╭── ✦ *UPLOAD KE CHANNEL (UPCH)* ✦\n` +
            `Posting teks, foto, video, audio, atau file ke saluran WhatsApp.\n\n` +
            `*Cara Penggunaan:*\n` +
            `• *Kirim Teks:*\n` +
            `  › \`${usedPrefix + command} <pesan teks>\`\n` +
            `  › Atau reply pesan teks lalu ketik \`${usedPrefix + command}\`\n\n` +
            `• *Kirim Media:*\n` +
            `  › Kirim/Reply foto, video, vn, atau file dengan caption \`${usedPrefix + command} [teks]\`\n\n` +
            `• *Spesifik Saluran:*\n` +
            `  › \`${usedPrefix + command} https://whatsapp.com/channel/xxxx | Pesan Anda\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    try {
        let channelJid = await getNewsletterJid(conn, target);

        // ── 1. Kirim Pesan Teks Murni ──────────────────────────────────────
        if (!isMedia) {
            await conn.sendMessage(channelJid, { text: contentText });
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return m.reply(
                `╭── ✦ *BERHASIL POST CHANNEL* ✦\n` +
                `• Pesan teks berhasil dikirim ke saluran.\n` +
                `• *Target:* \`${channelJid}\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        // ── 2. Kirim Media Berkas ──────────────────────────────────────────
        let media = await q.download?.();
        if (!media) throw new Error('Gagal mengunduh media dari pesan.');

        let captionText = contentText || (m.quoted ? (m.quoted.text || m.quoted.caption || '') : '');

        if (isImage) {
            await conn.sendMessage(channelJid, { image: media, caption: captionText });
        } else if (isVideo) {
            await conn.sendMessage(channelJid, { video: media, caption: captionText });
        } else if (isAudio) {
            let ext = (rawMime && rawMime.split('/')[1]) || 'mp4';
            let result = await toPTT(media, ext);

            let waveform;
            try {
                waveform = await getAudioWaveform(result.data);
            } catch (werr) {
                console.warn('[WAVEFORM] Gagal generate waveform:', werr.message);
            }

            await conn.sendMessage(channelJid, {
                audio: result.data,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                waveform
            });

            if (result && typeof result.delete === 'function') {
                await result.delete();
            }
        } else if (isSticker) {
            await conn.sendMessage(channelJid, { sticker: media });
        } else {
            let fileName = q.filename || `file_${Date.now()}.${(rawMime && rawMime.split('/')[1]) || 'bin'}`;
            await conn.sendMessage(channelJid, {
                document: media,
                mimetype: rawMime || 'application/octet-stream',
                fileName: fileName,
                caption: captionText
            });
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return m.reply(
            `╭── ✦ *BERHASIL POST CHANNEL* ✦\n` +
            `• Media berhasil dikirim ke saluran.\n` +
            `• *Target:* \`${channelJid}\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );

    } catch (e) {
        console.error('[UPCH Error]', e);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply(
            `╭── ✦ *GAGAL POST CHANNEL* ✦\n` +
            `• *Error:* ${e.message}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }
};

handler.help = ['upch *media/teks*'];
handler.tags = ['owner'];
handler.command = /^(postch|chvn|uploadch|upch)$/i;
handler.rowner = true;

export default handler;