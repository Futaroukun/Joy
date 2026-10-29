/*
 * @Author: Rafli
 * @Feature: YouTube Play (Audio)
 * @Description: Cari lagu via yt-search (smart ranking) dan download audio via SaveTube scraper, lbserver fallback, dan yt-dlp.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawn, spawnSync } from 'child_process';
import axios from 'axios';
import yts from 'yt-search';
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

// ── SaveTube scraper ──────────────────────────────────────────────────────────

class SaveTube {
    constructor() {
        this.ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12';
        this.re = /(?:youtu\.be\/|(?:www\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i;
        this.ax = axios.create({
            headers: {
                'content-type': 'application/json',
                'origin'      : 'https://yt.savetube.me',
                'user-agent'  : 'Mozilla/5.0 (Android 15; Mobile; SM-F958; rv:130.0) Gecko/130.0 Firefox/130.0'
            },
            timeout: 15000
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

        const cdn = await this.getCdn();
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
        const tmpFile = path.join(tmpDir, `play_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

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

function parseAgeInDays(ago) {
    if (!ago) return 0;
    const s = String(ago).toLowerCase().trim();
    if (/second|sec|detik|minute|min|menit|hour|hr|jam/i.test(s)) return 0.5;
    const dayMatch = s.match(/(\d+)\s*(?:day|hari|d)\b/i);
    if (dayMatch) return parseInt(dayMatch[1], 10);
    const weekMatch = s.match(/(\d+)\s*(?:week|minggu|w)\b/i);
    if (weekMatch) return parseInt(weekMatch[1], 10) * 7;
    const monthMatch = s.match(/(\d+)\s*(?:month|bulan|mo)\b/i);
    if (monthMatch) return parseInt(monthMatch[1], 10) * 30;
    const yearMatch = s.match(/(\d+)\s*(?:year|tahun|y)\b/i);
    if (yearMatch) return parseInt(yearMatch[1], 10) * 365;
    return 9999;
}

function rankVideos(videos = [], query = '', limit = 5) {
    const q = String(query).toLowerCase().trim();
    const isSeekingNew = /terbaru|baru|teranyar|latest|new|\b202[5-9]\b/i.test(q);
    const cleanQ = q.replace(/terbaru|baru|teranyar|latest|new|\b202[5-9]\b/gi, '').trim();
    const keywords = (cleanQ || q).split(/\s+/).filter(k => k.length > 1);

    const seen = new Set();
    const uniqueVideos = [];
    for (const v of videos) {
        if (!v || (v.type !== 'video' && v.type !== undefined)) continue;
        const id = v.videoId || v.url;
        if (!id || seen.has(id)) continue;
        if (v.url?.includes('/shorts/') || (v.seconds || 0) > 1800) continue;
        seen.add(id);
        uniqueVideos.push(v);
    }

    const scored = uniqueVideos.map((v, originalIndex) => {
        let score = 0;
        const title = (v.title || '').toLowerCase();
        const author = (v.author?.name || '').toLowerCase();
        const views = Number(v.views) || 0;
        const daysAgo = parseAgeInDays(v.ago);

        // 1. YouTube native ranking weight (relevansi natural mesin pencari YouTube)
        if (originalIndex === 0) score += 45;
        else if (originalIndex === 1) score += 32;
        else if (originalIndex === 2) score += 22;
        else if (originalIndex === 3) score += 14;
        else if (originalIndex <= 6) score += 6;

        // 2. Exact match judul dengan word boundary
        if (cleanQ && title.includes(cleanQ)) {
            score += 35;
            const regexExact = new RegExp('(?:^|[^a-zA-Z0-9])' + cleanQ.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:[^a-zA-Z0-9]|$)', 'i');
            if (regexExact.test(title)) score += 15;
        }

        // 3. Keyword matching
        let matchedKw = 0;
        for (const kw of keywords) {
            if (title.includes(kw)) matchedKw++;
        }
        const kwRatio = keywords.length > 0 ? matchedKw / keywords.length : 1;
        score += kwRatio * 30;

        for (const kw of keywords) {
            if (author.includes(kw)) {
                score += 15;
                break;
            }
        }

        // 4. Official Music / MV / Audio bonus
        if (/official\s*(music\s*video|video|audio|lyric|mv)|\(mv\)|\[mv\]/i.test(title)) {
            score += 15;
        }

        // 5. Popularitas / Views (logarithmic, hingga 40 poin untuk video ratusan juta views)
        score += Math.min(40, Math.log10(views + 1) * 4.5);

        // 6. Recency boost HANYA jika pengguna eksplisit mencari lagu terbaru/baru
        if (isSeekingNew) {
            if (daysAgo <= 7) score += 35;
            else if (daysAgo <= 30) score += 28;
            else if (daysAgo <= 90) score += 20;
            else if (daysAgo <= 180) score += 12;
            else if (daysAgo <= 365) score += 5;
            else score -= 15;
        }

        // 7. Penalti untuk Anime OP / TV Anime jika pengguna tidak mencari anime
        const isAnimeQuery = /anime|op|ed|ost|opening|ending/i.test(cleanQ);
        if (!isAnimeQuery && /ノンクレジット|tvアニメ|anime\s*(opening|op|ost|ed)/i.test(title)) {
            score -= 35;
        }

        // 8. Penalti reaction / karaoke
        if (!/reaction/i.test(cleanQ) && /reaction/i.test(title)) score -= 40;
        if (!/karaoke/i.test(cleanQ) && /karaoke|instrumental|minus\s*one/i.test(title)) score -= 25;

        return { v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.v);
}

function isBroadOrGeneral(q) {
    const clean = q.toLowerCase().replace(/terbaru|baru|teranyar|latest|new|\b202[5-9]\b/gi, '').trim();
    // Hanya anggap broad/general jika berupa frasa playlist/kompilasi/genre umum secara eksplisit
    return /^(dj\s+(tiktok|remix|full\s*bass)|lagu\s+(galau|santai|indo|barat|tiktok|sedih|tidur|kerja)|jedag\s*jedug|kompilasi\s+lagu|kumpulan\s+lagu)$/i.test(clean);
}

function parseDurationToSeconds(duration) {
    if (typeof duration === 'number' && !isNaN(duration)) return Math.floor(duration);
    if (!duration || typeof duration !== 'string') return 0;
    const parts = duration.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

function formatViews(n) {
    if (!n || n < 0) return '—';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return n.toString();
}

const savetube = new SaveTube();

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `╭── ✦ *YOUTUBE PLAY* ✦\n` +
        `Putar dan unduh audio lagu langsung dari YouTube.\n\n` +
        `• *Format:* \`${usedPrefix + command} <judul lagu / link YouTube> [nomor]\`\n` +
        `• *Contoh:* \`${usedPrefix + command} One Direction - Night Changes\`\n` +
        `• *Pilih Nomor:* \`${usedPrefix + command} judika 2\`\n` +
        `• *Contoh Genre:* \`${usedPrefix + command} lagu galau\` atau \`${usedPrefix + command} dj tiktok\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
    const loadingMsg = await m.reply('_Sedang mencari dan menyiapkan audio YouTube..._');

    try {
        let video = null;
        const ytIdRegex = /(?:youtu\.be\/|(?:www\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i;
        const match = text.trim().match(ytIdRegex);

        if (match) {
            const videoId = match[1];
            try {
                video = await yts({ videoId });
            } catch (_) {}
            if (!video) {
                video = {
                    title: 'YouTube Audio',
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId,
                    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    duration: { timestamp: '—' },
                    views: 0,
                    ago: '—',
                    author: { name: 'YouTube' }
                };
            }
        } else {
            let searchQuery = text.trim();
            let explicitIndex = null;
            const numMatch = searchQuery.match(/^(.*?)(?:\s+#?(\d+))$/);
            if (numMatch && numMatch[1].trim()) {
                const num = parseInt(numMatch[2], 10);
                if (num >= 1 && num <= 10) {
                    explicitIndex = num - 1;
                    searchQuery = numMatch[1].trim();
                }
            }

            const res = await yts(searchQuery);
            const rawList = res.videos || res.all || [];
            const ranked = rankVideos(rawList, searchQuery, 10);
            if (!ranked || ranked.length === 0) throw new Error('Lagu tidak ditemukan. Coba gunakan kata kunci lain.');

            if (explicitIndex !== null && explicitIndex < ranked.length) {
                video = ranked[explicitIndex];
            } else if (isBroadOrGeneral(searchQuery) && ranked.length > 1) {
                // Rotasi dari 5 kandidat terbaik agar hasil variatif dan tidak monoton
                const poolSize = Math.min(5, ranked.length);
                video = ranked[Math.floor(Math.random() * poolSize)];
            } else {
                video = ranked[0];
            }
        }

        await conn.sendMessage(m.chat, {
            text: `_Mengunduh audio..._\n*${video.title}*`,
            edit: loadingMsg?.key
        }).catch(() => {});

        let buffer = null;
        let downloadResult = null;
        let lastErr = null;

        // Engine 1: YouTube Music Direct (Pure JS Innertube VisionOS)
        try {
            const ytmDl = await ytmusic.download(video.videoId || video.url, {
                whatsapp: true,
                format: 'mp3'
            });
            if (ytmDl?.buffer && isValidAudioBuffer(ytmDl.buffer)) {
                buffer = ytmDl.buffer;
                downloadResult = ytmDl;
            }
        } catch (err) {
            lastErr = err;
            console.warn('[PLAY] YouTube Music error, mencoba fallback lain:', err.message);
        }

        // Engine 2: yt-dlp local (hanya jika binary terpasang di sistem)
        if (!buffer && isYtDlpAvailable()) {
            try {
                const dlBuf = await downloadViaYtDlp(video.url);
                if (isValidAudioBuffer(dlBuf)) {
                    buffer = dlBuf;
                }
            } catch (err) {
                console.warn('[PLAY] yt-dlp error:', err.message);
            }
        }

        // Engine 3: SaveTube scraper fallback
        if (!buffer) {
            try {
                const st = await savetube.download(video.url);
                if (st?.buffer && isValidAudioBuffer(st.buffer)) {
                    buffer = st.buffer;
                }
            } catch (err) {
                console.warn('[PLAY] SaveTube error:', err.message);
            }
        }

        if (!buffer || !isValidAudioBuffer(buffer)) {
            throw lastErr || new Error('Gagal mengunduh file audio dari semua sumber. Silakan coba judul atau kata kunci lain.');
        }

        await conn.sendMessage(m.chat, { delete: loadingMsg?.key }).catch(() => {});

        const title = downloadResult?.title || video.title || 'YouTube Audio';
        const thumbnail = video.image || video.thumbnail || downloadResult?.thumbnail || `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
        const channel = video.author?.name || video.author?.username || downloadResult?.artist || 'Unknown';
        const viewsStr = formatViews(video.views);
        const durationStr = video.duration?.timestamp || video.timestamp || downloadResult?.duration || '—';
        const ago = video.ago || '—';
        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();

        let durationSeconds = video.seconds ||
                              video.duration?.seconds ||
                              downloadResult?.durationSeconds ||
                              parseDurationToSeconds(durationStr) ||
                              0;

        if (!durationSeconds && buffer) {
            try {
                const mm = await import('music-metadata');
                const meta = await mm.parseBuffer(buffer, undefined, { duration: true });
                if (meta.format?.duration) {
                    durationSeconds = Math.round(meta.format.duration);
                }
            } catch (_) {}
        }

        const displayDuration = durationStr !== '—' ? durationStr : (durationSeconds ? `${Math.floor(durationSeconds / 60)}:${String(durationSeconds % 60).padStart(2, '0')}` : '—');

        let info = `╭── ✦ *YOUTUBE PLAY* ✦\n` +
                   `• *Judul:* ${title}\n` +
                   `• *Channel:* ${channel}\n` +
                   `• *Durasi:* ${displayDuration}\n` +
                   `• *Views:* ${viewsStr}\n` +
                   `• *Upload:* ${ago}\n` +
                   `• *Link:* ${video.url}\n` +
                   `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                   `> _Sedang mengirim file audio..._`;

        await conn.sendMessage(m.chat, {
            text: info,
            contextInfo: {
                externalAdReply: {
                    title: title,
                    body: `${channel} • YouTube Play`,
                    thumbnailUrl: thumbnail,
                    sourceUrl: video.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

        // Pastikan format AAC M4A WhatsApp-compatible (+faststart) agar audio dapat diputar langsung di HP
        let audioToSend = buffer;
        let mimeToSend = 'audio/mp4';
        const isNativeM4A = buffer.length > 8 && buffer.slice(4, 8).toString('ascii') === 'ftyp';
        if (!isNativeM4A) {
            try {
                const m4a = await toAudioM4A(buffer, 'mp3');
                if (m4a?.data && isValidAudioBuffer(m4a.data)) {
                    audioToSend = m4a.data;
                    if (typeof m4a.delete === 'function') await m4a.delete().catch(() => {});
                }
            } catch (convErr) {
                console.warn('[PLAY] Gagal konversi audio ke M4A, fallback ke buffer MP3:', convErr.message);
                mimeToSend = 'audio/mpeg';
            }
        }

        try {
            await conn.sendMessage(m.chat, {
                audio: audioToSend,
                mimetype: mimeToSend,
                fileName: `${cleanTitle}.${mimeToSend === 'audio/mp4' ? 'm4a' : 'mp3'}`,
                ptt: false,
                seconds: durationSeconds || undefined
            }, { quoted: m });
        } catch (audioErr) {
            console.warn('[PLAY] Gagal kirim sebagai audio, fallback ke document:', audioErr.message);
            await conn.sendMessage(m.chat, {
                document: audioToSend,
                mimetype: mimeToSend === 'audio/mp4' ? 'audio/mp4' : 'audio/mpeg',
                fileName: `${cleanTitle}.${mimeToSend === 'audio/mp4' ? 'm4a' : 'mp3'}`
            }, { quoted: m });
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error('[PLAY ERROR]', err);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        await conn.sendMessage(m.chat, {
            text: `*Gagal memutar lagu:*\n_${err.message}_\n\n_Silakan coba judul atau kata kunci lain._`,
            edit: loadingMsg?.key
        }).catch(() => m.reply(`*Gagal memutar lagu:*\n_${err.message}_`));
    }
};

handler.help = ['play *judul/link*'];
handler.tags    = ['downloader'];
handler.command = /^(play|song|lagu|ytplay)$/i;
handler.limit   = false;
handler.timeout = 180000;

export default handler;