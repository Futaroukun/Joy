/*
- @Author: Rafli
- @Feature: Audio & Voice Note Converter (TOVN / TOMP3 / TTS)
- @Description: Konversi video/audio ke Voice Note (PTT) atau MP3 dengan waveform, filter audio (bass, chipmunk, robot, slow, nightcore, 8d, echo, dll), dan Text-to-Speech (TTS).
*/

import { toAudio, toPTT, ffmpeg } from '../function/media/converter.js';
import { getAudioWaveform } from '@whiskeysockets/baileys';
import fetch from 'node-fetch';

const AUDIO_FILTERS = {
    bass     : ['-af', 'equalizer=f=40:width_type=h:width=50:g=10'],
    blown    : ['-af', 'acrusher=level_in=8:level_out=18:bits=8:mode=log:aa=1'],
    chipmunk : ['-af', 'asetrate=48000*1.4,aresample=48000'],
    tupai    : ['-af', 'asetrate=48000*1.4,aresample=48000'],
    nightcore: ['-af', 'asetrate=48000*1.25,aresample=48000'],
    robot    : ['-af', 'asetrate=48000*0.85,aresample=48000,chorus=0.7:0.9:55:0.4:0.25:2'],
    reverse  : ['-af', 'areverse'],
    balik    : ['-af', 'areverse'],
    slow     : ['-af', 'asetrate=48000*0.8,aresample=48000'],
    vaporwave: ['-af', 'asetrate=48000*0.8,aresample=48000'],
    '8d'     : ['-af', 'apulsator=hz=0.125'],
    echo     : ['-af', 'aecho=0.8:0.9:1000:0.3'],
    reverb   : ['-af', 'aecho=0.8:0.9:1000:0.3'],
    fast     : ['-af', 'atempo=1.5'],
    cepat    : ['-af', 'atempo=1.5'],
    deep     : ['-af', 'asetrate=48000*0.75,aresample=48000,equalizer=f=40:width_type=h:width=50:g=6'],
    berat    : ['-af', 'asetrate=48000*0.75,aresample=48000,equalizer=f=40:width_type=h:width=50:g=6'],
    smooth   : ['-af', 'lowpass=f=3000'],
    halus    : ['-af', 'lowpass=f=3000']
};

async function getTTSBuffer(text, lang = 'id') {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${lang}&client=tw-ob`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        timeout: 10000
    });
    if (!res.ok) throw new Error('Gagal mengambil audio TTS dari server.');
    return Buffer.from(await res.arrayBuffer());
}

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';
    const hasMedia = /video|audio/.test(mime);

    // ── 1. MODE TTS (Text-to-Speech) JIKA TIDAK REPLY MEDIA DAN ADA TEKS ──
    if (!hasMedia && text && text.trim()) {
        let lang = 'id';
        let cleanText = text.trim();

        // Cek jika ada format bahasa [en] halo atau en|halo
        const langMatch = cleanText.match(/^\[([a-zA-Z-]+)\]\s*(.+)/) || cleanText.match(/^([a-zA-Z]{2,5})\s*\|\s*(.+)/);
        if (langMatch) {
            lang = langMatch[1].toLowerCase();
            cleanText = langMatch[2].trim();
        }

        await conn.sendMessage(m.chat, { react: { text: '🗣️', key: m.key } });

        let pttResult;
        try {
            const ttsBuf = await getTTSBuffer(cleanText, lang);
            pttResult = await toPTT(ttsBuf, 'mp3');

            let waveform;
            try {
                waveform = await getAudioWaveform(pttResult.data);
            } catch {}

            await conn.sendMessage(m.chat, {
                audio: pttResult.data,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                waveform
            }, { quoted: m });

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            return;
        } catch (e) {
            console.error('[TTS ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
            return m.reply(`Gagal membuat Voice Note TTS: ${e.message}`);
        } finally {
            if (pttResult && typeof pttResult.delete === 'function') {
                await pttResult.delete().catch(() => {});
            }
        }
    }

    // ── 2. MENU PANDUAN JIKA TIDAK ADA MEDIA & TEKS ──────────────────────
    if (!hasMedia) {
        return m.reply(
            `*AUDIO & VOICE NOTE CONVERTER*\n` +
            `──────────────\n` +
            `Ubah video/audio menjadi Voice Note (PTT), MP3, efek suara, atau ubah teks menjadi suara.\n\n` +
            `*Format Penggunaan:*\n` +
            `• Reply video/audio + \`${usedPrefix}tovn [efek]\` (Voice Note)\n` +
            `• Reply video/audio + \`${usedPrefix}tomp3 [efek]\` (File MP3)\n` +
            `• \`${usedPrefix}tovn <teks>\` (Text-to-Speech VN)\n` +
            `• \`${usedPrefix}tovn [en] <teks>\` (TTS Bahasa Inggris)\n\n` +
            `*Pilihan Efek Suara:*\n` +
            `\`bass\`, \`blown\`, \`chipmunk\`, \`nightcore\`, \`robot\`, \`reverse\`, \`slow\`, \`8d\`, \`echo\`, \`fast\`, \`deep\`, \`smooth\``
        );
    }

    // ── 3. MODE KONVERSI MEDIA (VIDEO/AUDIO KE VN/MP3 + FILTER) ──────────
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });

    let result;
    try {
        let media = await q.download();
        let ext = (mime.split('/')[1] || 'mp4').split(';')[0].trim();
        const isVN = /vn|ptt|tts/i.test(command);
        const filterName = (args[0] || '').toLowerCase().trim();
        const filterArgs = AUDIO_FILTERS[filterName] || null;

        if (filterArgs) {
            // Konversi dengan filter audio (Ultra HD)
            if (isVN) {
                result = await ffmpeg(media, [
                    '-vn',
                    '-c:a', 'libopus',
                    ...filterArgs,
                    '-b:a', '128k',
                    '-vbr', 'on',
                    '-compression_level', '10',
                    '-application', 'audio',
                    '-ar', '48000',
                    '-ac', '1',
                    '-cutoff', '24000',
                    '-avoid_negative_ts', 'make_zero',
                    '-map_metadata', '-1'
                ], ext, 'ogg');
            } else {
                result = await ffmpeg(media, [
                    '-vn',
                    '-c:a', 'libmp3lame',
                    ...filterArgs,
                    '-b:a', '320k',
                    '-q:a', '0',
                    '-ar', '48000',
                    '-ac', '2',
                    '-f', 'mp3'
                ], ext, 'mp3');
            }
        } else {
            // Konversi standar tanpa filter
            result = isVN ? await toPTT(media, ext) : await toAudio(media, ext);
        }

        if (isVN) {
            let waveform;
            try {
                waveform = await getAudioWaveform(result.data);
            } catch (werr) {
                console.warn('[WAVEFORM]', werr.message);
            }

            await conn.sendMessage(m.chat, {
                audio: result.data,
                mimetype: 'audio/ogg; codecs=opus',
                ptt: true,
                waveform
            }, { quoted: m });
        } else {
            await conn.sendMessage(m.chat, {
                audio: result.data,
                mimetype: 'audio/mpeg',
                ptt: false
            }, { quoted: m });
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (e) {
        console.error('[TOVN ERROR]', e);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply(`Gagal mengonversi media: ${e.message}`);
    } finally {
        if (result && typeof result.delete === 'function') {
            await result.delete().catch(() => {});
        }
    }
};

handler.help = ['tovn *audio/video*']
handler.tags    = ['tools']
handler.command = /^(tovn|toptt|tomp3|toaudio|tts)$/i

export default handler