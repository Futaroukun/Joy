/*
- @Author: Rafli
- @Feature: YouTube Audio Downloader
- @Description: Download audio YouTube via yt-dlp, YouTube Music API, SaveTube, dan lbserver.
*/

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn, spawnSync } from 'child_process'
import axios from 'axios'
import yts from 'yt-search'
import ytmusic from '../function/scrapers/ytmusic.js'
import { toAudioM4A } from '../function/media/converter.js'

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

// ── yt-dlp local fallback ─────────────────────────────────────────────────────

let _ytDlpPath = undefined;
function getYtDlpPath() {
    if (_ytDlpPath !== undefined) return _ytDlpPath;
    const candidates = [
        'yt-dlp',
        path.join(process.cwd(), 'yt-dlp'),
        path.join(process.cwd(), 'bin', 'yt-dlp'),
        path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp')
    ];
    for (const bin of candidates) {
        try {
            const res = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 2000 });
            if (!res.error && res.status === 0) {
                _ytDlpPath = bin;
                return _ytDlpPath;
            }
        } catch (_) {}
    }
    _ytDlpPath = null;
    return null;
}

function isYtDlpAvailable() {
    return !!getYtDlpPath();
}

function downloadViaYtDlp(url) {
    const bin = getYtDlpPath();
    if (!bin) {
        return Promise.reject(new Error('yt-dlp binary tidak ditemukan di server.'));
    }
    return new Promise((resolve, reject) => {
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFile = path.join(tmpDir, `yta_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

        const proc = spawn(bin, [
            '--js-runtimes', 'node',
            '-f', '140/ba[ext=m4a]/ba/b',
            '-N', '4',
            '--no-playlist',
            '--no-warnings',
            '-q',
            '-o', `${tmpFile}.%(ext)s`,
            url
        ], { stdio: 'ignore' });

        const timer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch (_) {}
            reject(new Error('yt-dlp proses timeout (melebihi 90 detik).'));
        }, 90000);

        proc.on('close', code => {
            clearTimeout(timer);
            const possibleFiles = [
                `${tmpFile}.m4a`,
                `${tmpFile}.mp3`,
                `${tmpFile}.opus`,
                `${tmpFile}.webm`
            ];
            for (const f of possibleFiles) {
                if (fs.existsSync(f)) {
                    try {
                        const buf = fs.readFileSync(f);
                        fs.unlinkSync(f);
                        if (isValidAudioBuffer(buf)) return resolve(buf);
                    } catch (e) {
                        return reject(e);
                    }
                }
            }
            reject(new Error(`yt-dlp gagal (code ${code})`));
        });

        proc.on('error', err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// ── Engine 3: SaveTube scraper ────────────────────────────────────────────────

class SaveTube {
    constructor() {
        this.ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
        this.re = /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i;
        this.ax = axios.create({
            headers: {
                'content-type': 'application/json',
                'origin'      : 'https://yt.savetube.me',
                'user-agent'  : 'Mozilla/5.0 (Android 15; Mobile; SM-F958; rv:130.0) Gecko/130.0 Firefox/130.0'
            },
            timeout: 20000
        });
    }

    async decrypt(enc) {
        if (!enc) throw new Error('Data enkripsi SaveTube kosong.');
        const sr  = Buffer.from(enc, 'base64');
        const ky  = Buffer.from(this.ky, 'hex');
        const iv  = sr.slice(0, 16);
        const dc  = crypto.createDecipheriv('aes-128-cbc', ky, iv);
        const res = Buffer.concat([dc.update(sr.slice(16)), dc.final()]);
        return JSON.parse(res.toString());
    }

    async getCdn() {
        try {
            const res = await this.ax.get('https://media.savetube.vip/api/random-cdn');
            if (res.data?.cdn) return res.data.cdn;
        } catch (_) {}
        return 'cdn403.savetube.vip';
    }

    async download(url) {
        const match = url.match(this.re);
        const id = match ? match[1] : null;
        if (!id) throw new Error('ID YouTube tidak ditemukan.');

        const cdn     = await this.getCdn();
        const infoRes = await this.ax.post(`https://${cdn}/v2/info`, {
            url: `https://www.youtube.com/watch?v=${id}`
        });

        if (!infoRes.data?.data) {
            throw new Error(infoRes.data?.message || 'Gagal memproses info video dari SaveTube.');
        }

        const dec = await this.decrypt(infoRes.data.data);

        const dlRes = await this.ax.post(`https://${cdn}/download`, {
            id,
            downloadType: 'audio',
            quality     : '128',
            key         : dec.key
        });

        const downloadUrl = dlRes.data?.data?.downloadUrl;
        if (!downloadUrl) throw new Error('Download URL SaveTube tidak ditemukan.');

        const audioRes = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 45000,
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const buffer = Buffer.from(audioRes.data);
        if (!isValidAudioBuffer(buffer)) {
            throw new Error('Hasil buffer SaveTube bukan file audio valid (HTML / Corrupt).');
        }

        return {
            title    : dec.title || 'Unknown',
            thumbnail: dec.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration : dec.durationLabel || '',
            buffer
        };
    }
}

function formatViews(n) {
    if (!n || n < 0) return '—';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
    return String(n);
}

// ── Handler ───────────────────────────────────────────────────────────────────

const savetube = new SaveTube();

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*YOUTUBE AUDIO DOWNLOADER*\n\n` +
        `Fitur ini digunakan untuk mengunduh lagu atau audio dari video YouTube dalam format MP3.\n\n` +
        `*Cara Penggunaan:*\n` +
        `Ketik perintah diikuti link video YouTube yang ingin didownload.\n` +
        `Format: \`${usedPrefix + command} <link video>\`\n\n` +
        `*Contoh:*\n` +
        `\`${usedPrefix + command} https://www.youtube.com/watch?v=2JMD8LoMSgM\``
    );

    let url = text.trim().split(/\s+/)[0];
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/(?:youtube\.com|youtu\.be)/i.test(url)) return m.reply('URL tidak valid. Pastikan link dari YouTube atau YouTube Music.');

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
    const loadMsg = await m.reply('_Sedang memproses link dan mengunduh audio YouTube..._');

    try {
        const ytIdRegex = /(?:youtu\.be\/|(?:www\.|m\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i;
        const match = url.match(ytIdRegex);
        const videoId = match ? match[1] : null;

        if (!videoId) throw new Error('ID YouTube tidak valid atau tidak ditemukan pada link.');
        const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;

        // 1. Ambil metadata video (yts fallback ke ytmusic)
        let meta = null;
        try {
            meta = await yts({ videoId });
        } catch (_) {}

        if (!meta?.title) {
            try {
                const track = await ytmusic.getTrack(videoId, { skipAudio: true });
                if (track?.title) {
                    meta = {
                        title: track.title,
                        thumbnail: track.thumbnail,
                        duration: { timestamp: track.duration || '—' },
                        views: 0,
                        ago: '—',
                        author: { name: track.author || track.artists?.[0]?.name || 'YouTube Music' },
                        url: canonicalUrl
                    };
                }
            } catch (_) {}
        }

        // 2. Unduh audio melalui multi-engine fallback
        let buffer = null;
        let lastErr = null;

        // Engine 1: YouTube Music Innertube Direct (Pure JS)
        try {
            const ytmDl = await ytmusic.download(videoId, {
                whatsapp: true,
                format: 'mp3'
            });
            if (ytmDl?.buffer && isValidAudioBuffer(ytmDl.buffer)) {
                buffer = ytmDl.buffer;
            }
        } catch (err) {
            lastErr = err;
            console.warn('[YTMP3] YouTube Music gagal, mencoba SaveTube:', err.message);
        }

        // Engine 2: yt-dlp local (hanya jika terinstal di sistem)
        if (!buffer && isYtDlpAvailable()) {
            try {
                const dlBuf = await downloadViaYtDlp(canonicalUrl);
                if (isValidAudioBuffer(dlBuf)) {
                    buffer = dlBuf;
                }
            } catch (err) {
                console.warn('[YTMP3] yt-dlp gagal:', err.message);
            }
        }

        // Engine 3: SaveTube scraper
        if (!buffer) {
            try {
                const st = await savetube.download(canonicalUrl);
                if (st?.buffer && isValidAudioBuffer(st.buffer)) {
                    buffer = st.buffer;
                }
            } catch (err) {
                console.warn('[YTMP3] SaveTube gagal:', err.message);
            }
        }

        if (!buffer || !isValidAudioBuffer(buffer)) {
            throw lastErr || new Error('Semua mesin download gagal mengunduh audio.');
        }

        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {});

        const title = meta?.title || 'YouTube Audio';
        const duration = meta?.duration?.timestamp || '—';
        const views = meta?.views ? formatViews(meta.views) : '—';
        const ago = meta?.ago || '—';
        const channel = meta?.author?.name || 'YouTube';
        const thumbUrl = meta?.image || meta?.thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const caption = [
            `*YOUTUBE AUDIO DOWNLOADER*\n`,
            `*Judul:* ${title}`,
            `├ Durasi: ${duration}`,
            `├ Viewer: ${views} views`,
            `├ Upload: ${ago}`,
            `├ Channel: ${channel}`,
            `└ Link: ${canonicalUrl}`
        ].join('\n');

        // 3. Kirim thumbnail + caption
        await conn.sendMessage(m.chat, {
            image  : { url: thumbUrl },
            caption: caption
        }, { quoted: m });

        // 4. Pastikan format AAC M4A WhatsApp-compatible (+faststart)
        let audioToSend = buffer;
        let mimeToSend = 'audio/mp4';
        const isNativeM4A = buffer.length > 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp';
        if (!isNativeM4A) {
            try {
                const isOgg = buffer.slice(0, 4).toString('ascii') === 'OggS';
                const isWebm = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
                const inputExt = isOgg ? 'ogg' : isWebm ? 'webm' : 'mp3';

                const m4a = await toAudioM4A(buffer, inputExt);
                if (m4a?.data && isValidAudioBuffer(m4a.data)) {
                    audioToSend = m4a.data;
                    if (typeof m4a.delete === 'function') await m4a.delete().catch(() => {});
                }
            } catch (convErr) {
                console.warn('[YTMP3] Gagal konversi audio ke M4A, fallback ke buffer langsung:', convErr.message);
                mimeToSend = 'audio/mpeg';
            }
        }

        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();
        const durationSec = meta?.seconds || meta?.duration?.seconds || 0;

        // 5. Kirim file audio
        try {
            await conn.sendMessage(m.chat, {
                audio   : audioToSend,
                mimetype: mimeToSend,
                fileName: `${cleanTitle}.${mimeToSend === 'audio/mp4' ? 'm4a' : 'mp3'}`,
                ptt     : false,
                seconds : durationSec || undefined
            }, { quoted: m });
        } catch (audioErr) {
            console.warn('[YTMP3] Gagal kirim sebagai audio, fallback ke document:', audioErr.message);
            await conn.sendMessage(m.chat, {
                document: audioToSend,
                mimetype: mimeToSend === 'audio/mp4' ? 'audio/mp4' : 'audio/mpeg',
                fileName: `${cleanTitle}.${mimeToSend === 'audio/mp4' ? 'm4a' : 'mp3'}`
            }, { quoted: m });
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (e) {
        console.error('[YTMP3]', e);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {});
        m.reply(`Gagal download audio.\n\n${e.message}\n\nCoba lagi nanti.`);
    }
};

handler.help    = ['ytmp3 *url*'];
handler.tags    = ['downloader'];
handler.command = /^(ytmp3|yta)$/i;
handler.limit   = false;
handler.timeout = 180000;

export default handler;
