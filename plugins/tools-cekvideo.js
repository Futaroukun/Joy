/*
- @Author: Rafli
- @Feature: Video Quality & Media Inspector (Probe)
- @Description: Cek kualitas video mendalam (resolusi 4K/2K/1080p/SD, FPS 120/90/60/30/24, codec H.264/HEVC/AV1, bitrate, bit depth 8/10-bit HDR, audio specs, & kesesuaian WhatsApp).
*/

import { exec } from 'child_process';
import { promisify } from 'util';
import { join } from 'path';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';

const execAsync = promisify(exec);

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatBitrate(bps) {
    if (!bps || isNaN(bps) || Number(bps) === 0) return null;
    const num = Number(bps);
    if (num >= 1000000) {
        return (num / 1000000).toFixed(2) + ' Mbps';
    }
    return (num / 1000).toFixed(0) + ' kbps';
}

function formatDuration(sec) {
    if (!sec || isNaN(sec)) return '-';
    const s = Math.round(Number(sec));
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    if (hrs > 0) {
        return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function gcd(a, b) {
    return b ? gcd(b, a % b) : a;
}

function getAspectRatio(w, h) {
    if (!w || !h) return null;
    const ratio = w / h;
    if (Math.abs(ratio - 16 / 9) < 0.04) return '16:9';
    if (Math.abs(ratio - 9 / 16) < 0.04) return '9:16';
    if (Math.abs(ratio - 4 / 3) < 0.04) return '4:3';
    if (Math.abs(ratio - 3 / 4) < 0.04) return '3:4';
    if (Math.abs(ratio - 1) < 0.04) return '1:1';
    if (Math.abs(ratio - 21 / 9) < 0.04) return '21:9';
    if (Math.abs(ratio - 9 / 21) < 0.04) return '9:21';
    const divisor = gcd(w, h);
    const rw = Math.round(w / divisor);
    const rh = Math.round(h / divisor);
    if (rw < 100 && rh < 100) return `${rw}:${rh}`;
    return ratio.toFixed(2) + ':1';
}

function getResolutionLabel(w, h) {
    const max = Math.max(w, h);
    const min = Math.min(w, h);
    if (max >= 7680 || min >= 4320) return '8K Ultra HD (4320p)';
    if (max >= 3840 || min >= 2160) return '4K Ultra HD (2160p)';
    if (max >= 2560 || min >= 1440) return '2K Quad HD (1440p)';
    if (max >= 1920 || min >= 1080) return '1080p Full HD';
    if (max >= 1280 || min >= 720) return '720p HD';
    if (max >= 854 || min >= 480) return '480p SD';
    if (max >= 640 || min >= 360) return '360p';
    if (max >= 426 || min >= 240) return '240p';
    return '144p';
}

function parseFps(vStream) {
    const fpsRaw = vStream.r_frame_rate || vStream.avg_frame_rate;
    if (!fpsRaw || fpsRaw === '0/0') return null;
    let fpsNum = null;
    if (fpsRaw.includes('/')) {
        const [num, den] = fpsRaw.split('/').map(Number);
        if (den && !isNaN(num) && !isNaN(den)) {
            fpsNum = num / den;
        }
    } else {
        const val = parseFloat(fpsRaw);
        if (!isNaN(val)) fpsNum = val;
    }
    if (fpsNum === null) return null;

    const formattedVal = fpsNum % 1 === 0 ? fpsNum.toString() : fpsNum.toFixed(2);
    let tag = '';
    if (fpsNum >= 115) tag = ' (120 FPS Ultra Smooth)';
    else if (fpsNum >= 85) tag = ' (90 FPS High Refresh)';
    else if (fpsNum >= 58 && fpsNum <= 62) tag = ' (60 FPS Smooth)';
    else if (fpsNum >= 29 && fpsNum <= 31) tag = ' (30 FPS Standard)';
    else if (fpsNum >= 23.5 && fpsNum <= 25) tag = ' (24 FPS Cinematic)';

    return `${formattedVal} fps${tag}`;
}

function formatVideoCodec(vStream) {
    const codec = (vStream.codec_name || '').toLowerCase();
    let name = codec.toUpperCase();
    if (codec === 'h264') name = 'H.264 / AVC';
    else if (codec === 'hevc' || codec === 'h265') name = 'H.265 / HEVC';
    else if (codec === 'av1' || codec === 'av01') name = 'AOMedia AV1';
    else if (codec === 'vp9') name = 'Google VP9';
    else if (codec === 'vp8') name = 'Google VP8';
    else if (codec === 'mpeg4') name = 'MPEG-4 Part 2';
    else if (codec === 'prores') name = 'Apple ProRes';

    const profile = vStream.profile;
    if (profile && profile !== 'unknown' && profile !== '-99') {
        name += ` [${profile}]`;
    }
    return name;
}

function getDynamicRangeInfo(vStream) {
    const pixFmt = vStream.pix_fmt || '';
    const is10Bit = /10le|10be|p10|10/.test(pixFmt) || vStream.bits_per_raw_sample === '10';
    const is12Bit = /12le|12be|p12|12/.test(pixFmt) || vStream.bits_per_raw_sample === '12';
    const bitDepth = is12Bit ? '12-bit' : (is10Bit ? '10-bit' : '8-bit');

    const transfer = (vStream.color_transfer || '').toLowerCase();
    let hdrType = 'SDR (Standard Dynamic Range)';
    if (transfer === 'smpte2084') hdrType = 'HDR10 / Dolby Vision';
    else if (transfer === 'arib-std-b67') hdrType = 'HLG (Hybrid Log-Gamma)';
    else if (is10Bit) hdrType = '10-bit Color Depth';

    return { bitDepth, hdrType, pixFmt: pixFmt || '-' };
}

function formatAudio(aStream) {
    if (!aStream) return null;
    const codec = (aStream.codec_name || '').toUpperCase();
    const profile = aStream.profile && aStream.profile !== 'unknown' ? ` [${aStream.profile}]` : '';
    const sampleRate = aStream.sample_rate ? `${Number(aStream.sample_rate).toLocaleString('id-ID')} Hz` : null;
    const channels = aStream.channels;
    const channelLayout = aStream.channel_layout;
    let chText = channels ? `${channels} Ch` : null;
    if (channels === 1) chText = '1 Ch (Mono)';
    else if (channels === 2) chText = '2 Ch (Stereo)';
    else if (channels === 6) chText = '6 Ch (5.1 Surround)';
    else if (channelLayout) chText = `${channels} Ch (${channelLayout})`;

    const bitrate = formatBitrate(aStream.bit_rate || aStream.tags?.BPS);
    const rawLang = (aStream.tags?.language || '').toLowerCase().trim();
    const lang = (rawLang && !['und', 'zxx', 'mis', 'root'].includes(rawLang)) ? aStream.tags.language : null;
    return { codec: codec + profile, sampleRate, chText, bitrate, lang };
}

function getWhatsAppAssessment(w, h, fpsStr, vCodec, sizeBytes) {
    const notes = [];
    const maxDim = Math.max(w, h);
    if (maxDim > 1920) {
        notes.push('Resolusi melebihi 1080p, WhatsApp akan mengompres/downscale otomatis');
    }
    if (/HEVC|AV1|VP9/i.test(vCodec)) {
        notes.push('Codec HEVC/AV1 mungkin memerlukan transcoding di sebagian perangkat penerima');
    }
    if (sizeBytes > 64 * 1024 * 1024 && sizeBytes <= 100 * 1024 * 1024) {
        notes.push('Ukuran video > 64 MB (masuk rentang limit video 100 MB Joy)');
    } else if (sizeBytes > 100 * 1024 * 1024) {
        notes.push('Ukuran file > 100 MB, dikirim sebagai dokumen');
    }
    return notes;
}

let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';
    const fileName = (q.msg || q).fileName || '';
    const isVideo = /video/.test(mime) || /\.(mp4|mkv|mov|webm|avi|ts|flv)$/i.test(fileName);

    if (!isVideo) {
        return m.reply(
            `╭── ✦ *CEK KUALITAS VIDEO* ✦\n` +
            `• Analisis resolusi, FPS, bitrate, codec, dan metadata video secara mendalam.\n\n` +
            `• *Cara Pakai*:\n` +
            `  › Kirim video dengan caption: \`${usedPrefix + command}\`\n` +
            `  › Reply video/dokumen video dengan: \`${usedPrefix + command}\`\n\n` +
            `• *Info yang Dianalisis*:\n` +
            `  › Resolusi & Kategori (4K, 2K, 1080p, 720p, 480p, dll)\n` +
            `  › Real Frame Rate (120, 90, 60, 30, 24 fps)\n` +
            `  › Codec Video & Audio (H.264, HEVC, AV1, AAC, dll)\n` +
            `  › Bitrate, Bit Depth (8-bit / 10-bit HDR), & Audio Specs\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    const fileLength = Number((q.msg || q).fileLength || 0);
    if (fileLength > 150 * 1024 * 1024) {
        return m.reply(
            `╭── ✦ *FILE TERLALU BESAR* ✦\n` +
            `• Ukuran video (${(fileLength / (1024 * 1024)).toFixed(1)} MB) melebihi batas maksimal analisis (*150 MB*).\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    let tempFilePath = null;
    try {
        const mediaBuffer = await q.download();
        if (!mediaBuffer || mediaBuffer.length === 0) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply('Gagal mengunduh file media video.');
        }

        const tmpDir = process.env.TMPDIR || tmpdir();
        tempFilePath = join(tmpDir, `probe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`);
        writeFileSync(tempFilePath, mediaBuffer);

        const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${tempFilePath}"`;
        const { stdout } = await execAsync(cmd, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 });

        const probeData = JSON.parse(stdout);
        const vStream = probeData.streams?.find(s => s.codec_type === 'video');

        if (!vStream) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply('File media ini tidak memiliki video stream valid.');
        }

        const aStreams = probeData.streams?.filter(s => s.codec_type === 'audio') || [];
        const aStream = aStreams[0] || null;
        const format = probeData.format || {};

        const width = vStream.width || 0;
        const height = vStream.height || 0;
        const rotation = Math.abs(parseInt(vStream.tags?.rotate || 0));
        const isRotated = rotation === 90 || rotation === 270;
        const dispW = isRotated ? height : width;
        const dispH = isRotated ? width : height;

        const qualityLabel = getResolutionLabel(dispW, dispH);
        const aspectRatio = getAspectRatio(dispW, dispH);
        const orientation = dispH > dispW ? 'Portrait (Vertikal)' : (dispW > dispH ? 'Landscape (Horizontal)' : 'Square (1:1)');

        const fps = parseFps(vStream) || '-';
        const vCodec = formatVideoCodec(vStream);
        const drInfo = getDynamicRangeInfo(vStream);
        const vBitrate = formatBitrate(vStream.bit_rate || vStream.tags?.BPS);
        const totalBitrate = formatBitrate(format.bit_rate);
        const duration = formatDuration(format.duration || vStream.duration);
        const fileSize = formatBytes(mediaBuffer.length || parseInt(format.size || 0));
        const totalFrames = vStream.nb_frames
            ? Number(vStream.nb_frames).toLocaleString('id-ID')
            : (parseFloat(format.duration || 0) && parseFloat(fps) ? Math.round(parseFloat(format.duration) * parseFloat(fps)).toLocaleString('id-ID') : null);

        const audioInfo = formatAudio(aStream);
        const rawFormat = (format.format_name || '').toLowerCase();
        let container = 'MP4';
        if (rawFormat.includes('mp4') || rawFormat.includes('mov')) container = 'MP4 / QuickTime (MOV)';
        else if (rawFormat.includes('matroska') || rawFormat.includes('mkv')) container = 'MKV (Matroska)';
        else if (rawFormat.includes('webm')) container = 'WebM';
        else if (rawFormat.includes('avi')) container = 'AVI';
        else if (rawFormat.includes('flv')) container = 'FLV';
        else if (rawFormat) container = rawFormat.split(',')[0].toUpperCase();
        const encoder = format.tags?.encoder || vStream.tags?.encoder || null;
        const notes = getWhatsAppAssessment(dispW, dispH, fps, vCodec, mediaBuffer.length);

        let resultText =
            `╭── ✦ *VIDEO QUALITY & MEDIA INFO* ✦\n` +
            `• *Kualitas*: ${qualityLabel}\n` +
            `• *Resolusi*: ${dispW} × ${dispH}${aspectRatio ? ` (${aspectRatio})` : ''}\n` +
            `• *Orientasi*: ${orientation}\n` +
            `• *Frame Rate*: ${fps}\n` +
            `• *Durasi*: ${duration}\n` +
            `• *Ukuran File*: ${fileSize}\n` +
            (totalBitrate ? `• *Total Bitrate*: ${totalBitrate}\n` : '') +
            `\n` +
            `╭── ✦ *VIDEO STREAM* ✦\n` +
            `• *Codec*: ${vCodec}\n` +
            (vBitrate ? `• *Video Bitrate*: ${vBitrate}\n` : '') +
            `• *Color Depth*: ${drInfo.bitDepth} (${drInfo.pixFmt})\n` +
            `• *Dynamic Range*: ${drInfo.hdrType}\n` +
            (totalFrames ? `• *Total Frame*: ${totalFrames} frame\n` : '');

        if (audioInfo) {
            resultText +=
                `\n╭── ✦ *AUDIO STREAM* ✦\n` +
                `• *Codec*: ${audioInfo.codec}\n` +
                (audioInfo.bitrate ? `• *Audio Bitrate*: ${audioInfo.bitrate}\n` : '') +
                (audioInfo.sampleRate ? `• *Sample Rate*: ${audioInfo.sampleRate}\n` : '') +
                (audioInfo.chText ? `• *Channels*: ${audioInfo.chText}\n` : '') +
                (audioInfo.lang ? `• *Bahasa*: ${audioInfo.lang}\n` : '');
        } else {
            resultText +=
                `\n╭── ✦ *AUDIO STREAM* ✦\n` +
                `• *Audio*: Video Bisu (Tanpa Audio Track)\n`;
        }

        resultText +=
            `\n╭── ✦ *CONTAINER & METADATA* ✦\n` +
            `• *Format*: ${container}\n` +
            (encoder ? `• *Encoder*: ${encoder}\n` : '');

        if (notes.length > 0) {
            resultText +=
                `\n╭── ✦ *CATATAN WHATSAPP* ✦\n` +
                notes.map(n => `• ${n}`).join('\n') + `\n`;
        }

        resultText += `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        return m.reply(resultText);

    } catch (err) {
        console.error('[CEKVIDEO ERROR]', err);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply(
            `╭── ✦ *GAGAL MENGANALISIS* ✦\n` +
            `• ${err.message || 'Terjadi kesalahan saat memproses media video.'}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    } finally {
        if (tempFilePath && existsSync(tempFilePath)) {
            try { unlinkSync(tempFilePath); } catch {}
        }
    }
};

handler.help = ['cekvideo *reply/kirim video*'];
handler.tags = ['tools'];
handler.command = /^(cekvideo|vinfo|videoinfo|probevideo|infovideo|cekfps)$/i;

export default handler;
