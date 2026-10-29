/*
- @Author: Rafli
- @Feature: Add / Mix Music to Video & Photo (BGM Media Editor)
- @Description: Menambahkan musik ke video (ganti total/mix) atau ke foto (menghasilkan video musik), dengan fitur potong/atur durasi mulai & panjang durasi.
*/

import { promises as fsPromises } from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import tmpManager from '../function/core/safe-tmp.js';

const execAsync = promisify(exec);

// Map penampung sesi aktif per user
const sessions = new Map();

function normalizeTime(str) {
    if (!str) return '00:00:00';
    str = str.trim();
    if (/^\d+(\.\d+)?$/.test(str)) {
        return str;
    }
    if (/^(?:(\d+):)?([0-5]?\d):([0-5]?\d)$/.test(str)) {
        return str;
    }
    return '00:00:00';
}

function parseModeAndStart(input = '') {
    if (!input) return { mode: null, start: '00:00:00', duration: null };
    const parts = input.trim().split(/\s+/);
    let mode = null;
    let start = '00:00:00';
    let duration = null;

    for (let part of parts) {
        const p = part.toLowerCase();
        if (p === '1' || p === 'replace' || p === 'ganti' || p === 'full') {
            mode = 'replace';
        } else if (p === '2' || p === 'mix' || p === 'campur') {
            mode = 'mix';
        } else if (/^(\d+)s$/i.test(p)) {
            duration = parseInt(p, 10);
        } else if (/^(?:dur|durasi)[:=](\d+)$/i.test(p)) {
            const m = p.match(/^(?:dur|durasi)[:=](\d+)$/i);
            if (m) duration = parseInt(m[1], 10);
        } else if (/^\d+(\.\d+)?$/.test(p) || /^(?:(\d+):)?([0-5]?\d):([0-5]?\d)$/.test(p)) {
            if (start === '00:00:00') {
                start = normalizeTime(p);
            } else if (!duration) {
                duration = parseInt(p, 10);
            }
        }
    }

    return { mode, start, duration };
}

const runFfmpeg = (args) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args);
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('error', err => reject(new Error(`FFmpeg spawn error: ${err.message}`)));
    proc.on('close', code => {
        if (code !== 0) {
            reject(new Error(`FFmpeg exit ${code}: ${stderr.slice(-300)}`));
        } else {
            resolve();
        }
    });
});

async function renderPhotoWithMusic(photoBuf, audioBuf, startTime = '00:00:00', duration = null) {
    let tmpImg = null;
    let tmpAud = null;
    let tmpOut = null;

    try {
        tmpImg = await tmpManager.writeBuffer(photoBuf, '.jpg');
        tmpAud = await tmpManager.writeBuffer(audioBuf, '.mp3');
        tmpOut = tmpImg.replace(/\.[a-zA-Z0-9]+$/, '_out.mp4');

        const cleanStart = normalizeTime(startTime);

        const ffmpegArgs = [
            '-y',
            '-loop', '1',
            '-i', tmpImg,
            '-ss', cleanStart,
            '-i', tmpAud,
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '20',
            '-tune', 'stillimage',
            '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p',
            '-r', '25',
            '-c:a', 'aac',
            '-b:a', '192k',
            ...(duration ? ['-t', String(duration)] : []),
            '-shortest',
            '-avoid_negative_ts', 'make_zero',
            '-movflags', '+faststart',
            tmpOut
        ];

        await runFfmpeg(ffmpegArgs);

        let width = undefined;
        let height = undefined;
        let seconds = undefined;
        try {
            const { stdout: probeOut } = await execAsync(
                `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=noprint_wrappers=1 "${tmpOut}"`
            );
            const wMatch = probeOut.match(/width=(\d+)/);
            const hMatch = probeOut.match(/height=(\d+)/);
            const dMatch = probeOut.match(/duration=([\d.]+)/);
            if (wMatch) width = parseInt(wMatch[1], 10);
            if (hMatch) height = parseInt(hMatch[1], 10);
            if (dMatch) seconds = Math.round(parseFloat(dMatch[1]));
        } catch {}

        let jpegThumbnail = undefined;
        try {
            const thumbPath = tmpOut.replace(/\.mp4$/, '_thumb.jpg');
            await execAsync(
                `ffmpeg -y -ss 00:00:00 -i "${tmpOut}" -frames:v 1 -update 1 -vf "scale='min(640,iw)':-2" -q:v 3 "${thumbPath}"`
            );
            try {
                jpegThumbnail = await fsPromises.readFile(thumbPath);
                await fsPromises.unlink(thumbPath);
            } catch {}
        } catch {}

        const outBuffer = await fsPromises.readFile(tmpOut);
        const isHD = Boolean(
            (width && width >= 720) ||
            (height && height >= 720)
        );

        return {
            buffer: outBuffer,
            width,
            height,
            seconds,
            jpegThumbnail,
            isHD,
            isFallback: false
        };
    } finally {
        if (tmpImg) tmpManager.deleteFile(tmpImg);
        if (tmpAud) tmpManager.deleteFile(tmpAud);
        if (tmpOut) tmpManager.deleteFile(tmpOut);
    }
}

async function renderVideoWithMusic(videoBuf, audioBuf, mode = 'replace', startTime = '00:00:00') {
    let tmpVid = null;
    let tmpAud = null;
    let tmpOut = null;

    try {
        tmpVid = await tmpManager.writeBuffer(videoBuf, '.mp4');
        tmpAud = await tmpManager.writeBuffer(audioBuf, '.mp3');
        tmpOut = tmpVid.replace(/\.mp4$/, '_out.mp4');

        // Cek apakah video asal memiliki audio stream
        let hasOriginalAudio = false;
        try {
            const { stdout } = await execAsync(
                `ffprobe -v error -select_streams a:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 "${tmpVid}"`
            );
            hasOriginalAudio = stdout.trim() === 'audio';
        } catch {}

        const cleanStart = normalizeTime(startTime);

        let ffmpegArgs = [];
        if (mode === 'mix' && hasOriginalAudio) {
            ffmpegArgs = [
                '-y',
                '-fflags', '+genpts',
                '-i', tmpVid,
                '-ss', cleanStart,
                '-stream_loop', '-1',
                '-i', tmpAud,
                '-filter_complex', '[0:a]volume=1.0[a0];[1:a]volume=0.45[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]',
                '-map', '0:v:0',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                tmpOut
            ];
        } else {
            ffmpegArgs = [
                '-y',
                '-fflags', '+genpts',
                '-i', tmpVid,
                '-ss', cleanStart,
                '-stream_loop', '-1',
                '-i', tmpAud,
                '-map', '0:v:0',
                '-map', '1:a:0',
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-shortest',
                '-avoid_negative_ts', 'make_zero',
                '-movflags', '+faststart',
                tmpOut
            ];
        }

        try {
            await runFfmpeg(ffmpegArgs);
        } catch (copyErr) {
            console.warn('[ADDMUSIC] Stream copy failed, fallback to high-quality re-encode:', copyErr.message);
            let fallbackArgs = [];
            if (mode === 'mix' && hasOriginalAudio) {
                fallbackArgs = [
                    '-y',
                    '-i', tmpVid,
                    '-ss', cleanStart,
                    '-stream_loop', '-1',
                    '-i', tmpAud,
                    '-filter_complex', '[0:a]volume=1.0[a0];[1:a]volume=0.45[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2[aout]',
                    '-map', '0:v:0',
                    '-map', '[aout]',
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '19',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-shortest',
                    '-movflags', '+faststart',
                    tmpOut
                ];
            } else {
                fallbackArgs = [
                    '-y',
                    '-i', tmpVid,
                    '-ss', cleanStart,
                    '-stream_loop', '-1',
                    '-i', tmpAud,
                    '-map', '0:v:0',
                    '-map', '1:a:0',
                    '-c:v', 'libx264',
                    '-preset', 'veryfast',
                    '-crf', '19',
                    '-pix_fmt', 'yuv420p',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-shortest',
                    '-movflags', '+faststart',
                    tmpOut
                ];
            }
            await runFfmpeg(fallbackArgs);
        }

        let width = undefined;
        let height = undefined;
        let seconds = undefined;
        try {
            const { stdout: probeOut } = await execAsync(
                `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -show_entries format=duration -of default=noprint_wrappers=1 "${tmpOut}"`
            );
            const wMatch = probeOut.match(/width=(\d+)/);
            const hMatch = probeOut.match(/height=(\d+)/);
            const dMatch = probeOut.match(/duration=([\d.]+)/);
            if (wMatch) width = parseInt(wMatch[1], 10);
            if (hMatch) height = parseInt(hMatch[1], 10);
            if (dMatch) seconds = Math.round(parseFloat(dMatch[1]));
        } catch {}

        let jpegThumbnail = undefined;
        try {
            const thumbPath = tmpOut.replace(/\.mp4$/, '_thumb.jpg');
            await execAsync(
                `ffmpeg -y -ss 00:00:00 -i "${tmpOut}" -frames:v 1 -update 1 -vf "scale='min(640,iw)':-2" -q:v 3 "${thumbPath}"`
            );
            try {
                jpegThumbnail = await fsPromises.readFile(thumbPath);
                await fsPromises.unlink(thumbPath);
            } catch {}
        } catch {}

        const outBuffer = await fsPromises.readFile(tmpOut);
        const isHD = Boolean(
            (width && width >= 720) ||
            (height && height >= 720)
        );

        return {
            buffer: outBuffer,
            width,
            height,
            seconds,
            jpegThumbnail,
            isHD,
            isFallback: (mode === 'mix' && !hasOriginalAudio)
        };
    } finally {
        if (tmpVid) tmpManager.deleteFile(tmpVid);
        if (tmpAud) tmpManager.deleteFile(tmpAud);
        if (tmpOut) tmpManager.deleteFile(tmpOut);
    }
}

function checkIsHD(msg) {
    if (!msg) return false;
    const v = msg.msg || msg;
    if (v?.contextInfo?.pairedMediaType === 2) return true;
    if (v?.width >= 720 || v?.height >= 720) return true;
    if (v?.thumbnailDirectPath) return true;
    return false;
}

async function handleRenderExecution(m, conn, session) {
    clearTimeout(session.timeout);
    sessions.delete(m.sender);

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});

    try {
        const isImage = session.mediaType === 'image';
        let res;
        if (isImage) {
            res = await renderPhotoWithMusic(
                session.media,
                session.audio,
                session.startTime || '00:00:00',
                session.duration || null
            );
        } else {
            res = await renderVideoWithMusic(
                session.media,
                session.audio,
                session.mode || 'replace',
                session.startTime || '00:00:00'
            );
        }

        let note = '';
        if (res.isFallback) {
            note = `\n_Catatan: Video asli tidak memiliki audio, otomatis dialihkan ke mode replace._`;
        }

        const isHD = Boolean(
            session.isHD ||
            res.isHD ||
            (res.width && res.width >= 720) ||
            (res.height && res.height >= 720)
        );

        const modeLabel = isImage ? 'Foto ke Video' : (session.mode === 'mix' ? 'Mix (Campur)' : 'Replace (Ganti Total)');
        let durNote = '';
        if (res.seconds) {
            durNote = `\n• *Durasi*: \`${res.seconds}s\``;
        }

        const caption =
            `╭── ✦ *${isImage ? 'FOTO BERHASIL DIPROSES' : 'VIDEO BERHASIL DIPROSES'}* ✦\n` +
            `• *Mode*: ${modeLabel}\n` +
            `• *Mulai Musik*: \`${session.startTime || '00:00:00'}\`${durNote}${note}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        const messagePayload = {
            video: res.buffer,
            caption: caption,
            mimetype: 'video/mp4',
            width: res.width,
            height: res.height,
            seconds: res.seconds,
            ...(res.jpegThumbnail ? { jpegThumbnail: res.jpegThumbnail } : {})
        };

        if (isHD) {
            messagePayload.contextInfo = {
                pairedMediaType: 2
            };
        }

        await conn.sendMessage(m.chat, messagePayload, { quoted: m });
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
    } catch (e) {
        console.error('[ADDMUSIC EXEC ERROR]', e);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        m.reply(`*Gagal memproses ${session.mediaType === 'image' ? 'foto' : 'video'}:*\n_${e.message}_`);
    }
}

let handler = async (m, { conn, usedPrefix, command, text, args }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';
    let isVideo = /video/.test(mime);
    let isImage = /image/.test(mime);
    let isAudio = /audio/.test(mime);

    // Cek jika user mengirim media langsung bersama pesan perintah
    let directMime = (m.msg || m).mimetype || m.mediaType || '';
    let directIsVideo = /video/.test(directMime);
    let directIsImage = /image/.test(directMime);
    let directIsAudio = /audio/.test(directMime);

    // Parsir mode, start time, dan duration dari text/args
    const parsed = parseModeAndStart(text || '');

    // ── KASUS 1: FOTO & AUDIO TERSEDIA LANGSUNG (Quoted + Direct Message) ──
    if ((isImage && directIsAudio) || (isAudio && directIsImage)) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            let imgBuf = isImage ? await q.download() : await m.download();
            let audBuf = isAudio ? await q.download() : await m.download();
            const isSourceHD = checkIsHD(isImage ? q : m);

            return handleRenderExecution(m, conn, {
                media: imgBuf,
                mediaType: 'image',
                audio: audBuf,
                startTime: parsed.start,
                duration: parsed.duration,
                isHD: isSourceHD
            });
        } catch (e) {
            console.error('[ADDMUSIC IMAGE SINGLE STEP ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal memproses media:*\n_${e.message}_`);
        }
    }

    // ── KASUS 2: VIDEO & AUDIO TERSEDIA LANGSUNG (Quoted + Direct Message) ──
    if ((isVideo && directIsAudio) || (isAudio && directIsVideo)) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            let vidBuf = isVideo ? await q.download() : await m.download();
            let audBuf = isAudio ? await q.download() : await m.download();
            const isSourceHD = checkIsHD(isVideo ? q : m);

            if (!parsed.mode) {
                sessions.set(m.sender, {
                    media: vidBuf,
                    mediaType: 'video',
                    audio: audBuf,
                    mode: null,
                    startTime: parsed.start,
                    duration: parsed.duration,
                    isHD: isSourceHD,
                    timeout: setTimeout(() => sessions.delete(m.sender), 3 * 60 * 1000)
                });

                return m.reply(
                    `╭── ✦ *PILIH OPSI AUDIO* ✦\n` +
                    `• Video & Audio berhasil diterima!\n` +
                    `• Balas pesan ini dengan memilih opsi:\n` +
                    `  *1* / *replace* : Ganti total suara video (suara video jadi 0)\n` +
                    `  *2* / *mix* : Gabung suara asli video + musik latar (BGM)\n` +
                    `• (Opsional) Tentukan detik mulai musik, contoh: \`1 00:30\` atau \`2 15\`\n` +
                    `• Ketik *batal* untuk membatalkan.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                );
            }

            return handleRenderExecution(m, conn, {
                media: vidBuf,
                mediaType: 'video',
                audio: audBuf,
                mode: parsed.mode,
                startTime: parsed.start,
                duration: parsed.duration,
                isHD: isSourceHD
            });
        } catch (e) {
            console.error('[ADDMUSIC VIDEO SINGLE STEP ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal memproses media:*\n_${e.message}_`);
        }
    }

    // ── KASUS 3: USER REPLY / KIRIM FOTO ──
    if (isImage) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            const imgBuf = await q.download();
            if (!imgBuf || imgBuf.length === 0) throw new Error('Foto kosong atau gagal didownload.');

            if (sessions.has(m.sender)) {
                clearTimeout(sessions.get(m.sender).timeout);
                sessions.delete(m.sender);
            }

            sessions.set(m.sender, {
                media: imgBuf,
                mediaType: 'image',
                audio: null,
                mode: 'replace',
                startTime: parsed.start,
                duration: parsed.duration,
                isHD: checkIsHD(q),
                timeout: setTimeout(() => sessions.delete(m.sender), 3 * 60 * 1000)
            });

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            return m.reply(
                `╭── ✦ *SESI TAMBAH MUSIK* ✦\n` +
                `• *Status*: Foto diterima (${(imgBuf.length / 1024).toFixed(1)} KB)\n` +
                `• Silakan *kirim / reply file audio (lagu/musik)* yang ingin dipasang ke foto ini.\n` +
                `• (Opsional) Atur detik mulai lagu atau durasi video, contoh:\n` +
                `  - \`00:30\` (mulai lagu dari detik 30)\n` +
                `  - \`00:15 30s\` (mulai detik 15, durasi 30 detik)\n` +
                `• Ketik *batal* untuk membatalkan sesi.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            console.error('[ADDMUSIC PHOTO DOWNLOAD ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal mengunduh foto:*\n_${e.message}_`);
        }
    }

    // ── KASUS 4: USER REPLY / KIRIM VIDEO ──
    if (isVideo) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            const vidBuf = await q.download();
            if (!vidBuf || vidBuf.length === 0) throw new Error('Video kosong atau gagal didownload.');

            if (sessions.has(m.sender)) {
                clearTimeout(sessions.get(m.sender).timeout);
                sessions.delete(m.sender);
            }

            sessions.set(m.sender, {
                media: vidBuf,
                mediaType: 'video',
                audio: null,
                mode: parsed.mode,
                startTime: parsed.start,
                duration: parsed.duration,
                isHD: checkIsHD(q),
                timeout: setTimeout(() => sessions.delete(m.sender), 3 * 60 * 1000)
            });

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            return m.reply(
                `╭── ✦ *SESI TAMBAH MUSIK* ✦\n` +
                `• *Status*: Video diterima (${(vidBuf.length / (1024 * 1024)).toFixed(1)} MB)\n` +
                `• Silakan *kirim / reply file audio (lagu/musik)* yang ingin dipasang ke video ini.\n` +
                `• Bisa langsung sertakan opsi pada caption/pesan audio:\n` +
                `  - \`replace\` : Ganti total suara video (suara video jadi 0)\n` +
                `  - \`mix\` : Gabung suara asli video + musik latar\n` +
                `  - (Opsional) Detik mulai, contoh: \`replace 00:30\` atau \`mix 15\`\n` +
                `• Ketik *batal* untuk membatalkan sesi.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            console.error('[ADDMUSIC VIDEO DOWNLOAD ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal mengunduh video:*\n_${e.message}_`);
        }
    }

    // ── KASUS 5: USER REPLY / KIRIM AUDIO ──
    if (isAudio) {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            const audBuf = await q.download();
            if (!audBuf || audBuf.length === 0) throw new Error('Audio kosong atau gagal didownload.');

            if (sessions.has(m.sender)) {
                clearTimeout(sessions.get(m.sender).timeout);
                sessions.delete(m.sender);
            }

            sessions.set(m.sender, {
                media: null,
                mediaType: null,
                audio: audBuf,
                mode: parsed.mode,
                startTime: parsed.start,
                duration: parsed.duration,
                timeout: setTimeout(() => sessions.delete(m.sender), 3 * 60 * 1000)
            });

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            return m.reply(
                `╭── ✦ *SESI TAMBAH MUSIK* ✦\n` +
                `• *Status*: Audio musik diterima (${(audBuf.length / (1024 * 1024)).toFixed(1)} MB)\n` +
                `• Silakan *kirim / reply file foto atau video* yang ingin ditambahkan musik ini.\n` +
                `• Ketik *batal* untuk membatalkan sesi.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            console.error('[ADDMUSIC AUDIO DOWNLOAD ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal mengunduh audio:*\n_${e.message}_`);
        }
    }

    // ── KASUS 6: TIDAK ADA MEDIA YANG DI-REPLY (PANDUAN) ──
    return m.reply(
        `╭── ✦ *TAMBAH MUSIK KE FOTO / VIDEO* ✦\n` +
        `• Menambahkan musik/lagu ke foto (menjadi video animasi musik) atau video.\n` +
        `• *Untuk Foto*: Otomatis dijadikan video dengan lagu latar.\n` +
        `• *Untuk Video*: Tersedia 2 pilihan mode:\n` +
        `  *1. Replace* : Suara asli video dimatikan (0) & diganti musik full.\n` +
        `  *2. Mix* : Suara asli video digabung dengan musik latar (BGM).\n\n` +
        `*Cara Penggunaan:*\n` +
        `1. Reply foto/video dengan: \`${usedPrefix + command}\`\n` +
        `2. Kirim atau balas lagu/audio yang diinginkan.\n` +
        `3. Jika foto, video langsung dibuat. Jika video, pilih mode *1* atau *2*.\n\n` +
        `*Atau Langsung Satu Perintah:*\n` +
        `• Reply foto: \`${usedPrefix + command} 00:15\` (mulai detik 15)\n` +
        `• Reply foto: \`${usedPrefix + command} 00:00 30s\` (durasi 30 detik)\n` +
        `• Reply video: \`${usedPrefix + command} replace 00:15\`\n` +
        `• Reply video: \`${usedPrefix + command} mix\`\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
};

// ── BEFORE HOOK: MENDETEKSI LANJUTAN SESI ──
handler.before = async (m, { conn }) => {
    if (!m.sender || m.isBaileys) return false;
    if (!sessions.has(m.sender)) return false;

    const session = sessions.get(m.sender);
    const textMsg = (m.text || '').trim();

    // 1. Opsi Pembatalan
    if (/^(batal|cancel)$/i.test(textMsg)) {
        clearTimeout(session.timeout);
        sessions.delete(m.sender);
        await m.reply(`_Sesi penambahan musik berhasil dibatalkan._`);
        return true;
    }

    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';
    let isVideo = /video/.test(mime);
    let isImage = /image/.test(mime);
    let isAudio = /audio/.test(mime);

    // 2. Menunggu Audio (Session memiliki Media foto/video, belum punya Audio)
    if (session.media && !session.audio) {
        if (!isAudio) {
            if (textMsg && !/^(batal|cancel)$/i.test(textMsg)) {
                await m.reply(
                    `_Sesi sedang menunggu file audio/musik._\n` +
                    `Kirim atau reply file audio/lagu, atau ketik *batal* untuk mengakhiri sesi.`
                );
                return true;
            }
            return false;
        }

        try {
            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
            const audBuf = await q.download();
            if (!audBuf || audBuf.length === 0) throw new Error('Audio kosong');

            session.audio = audBuf;

            const parsed = parseModeAndStart(textMsg);
            if (parsed.mode) session.mode = parsed.mode;
            if (parsed.start && parsed.start !== '00:00:00') session.startTime = parsed.start;
            if (parsed.duration) session.duration = parsed.duration;

            // Jika media adalah FOTO: langsung render tanpa perlu tanya opsi replace/mix
            if (session.mediaType === 'image') {
                await handleRenderExecution(m, conn, session);
                return true;
            }

            // Jika media adalah VIDEO dan sudah ada mode
            if (session.mode) {
                await handleRenderExecution(m, conn, session);
                return true;
            }

            // Jika media VIDEO dan belum ada mode: minta user pilih
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
            await m.reply(
                `╭── ✦ *PILIH OPSI AUDIO* ✦\n` +
                `• Musik berhasil diterima!\n` +
                `• Balas pesan ini dengan angka/opsi:\n` +
                `  *1* / *replace* : Ganti total suara video (suara video jadi 0)\n` +
                `  *2* / *mix* : Gabung suara asli video + musik latar (BGM)\n` +
                `• (Opsional) Tambahkan durasi mulai lagu, contoh:\n` +
                `  - \`1 00:30\` (Ganti total, mulai lagu detik 30)\n` +
                `  - \`2 15\` (Mix BGM, mulai lagu detik 15)\n` +
                `• Ketik *batal* untuk membatalkan.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
            return true;
        } catch (e) {
            console.error('[ADDMUSIC BEFORE AUDIO ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            await m.reply(`*Gagal mengunduh audio:*\n_${e.message}_`);
            return true;
        }
    }

    // 3. Menunggu Media (Session memiliki Audio, belum punya Media Foto/Video)
    if (session.audio && !session.media) {
        if (!isVideo && !isImage) {
            if (textMsg && !/^(batal|cancel)$/i.test(textMsg)) {
                await m.reply(
                    `_Sesi sedang menunggu file foto atau video._\n` +
                    `Kirim atau reply file foto/video, atau ketik *batal* untuk mengakhiri sesi.`
                );
                return true;
            }
            return false;
        }

        try {
            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
            const mediaBuf = await q.download();
            if (!mediaBuf || mediaBuf.length === 0) throw new Error('File media kosong');

            session.media = mediaBuf;
            session.mediaType = isImage ? 'image' : 'video';
            session.isHD = checkIsHD(q);

            const parsed = parseModeAndStart(textMsg);
            if (parsed.mode) session.mode = parsed.mode;
            if (parsed.start && parsed.start !== '00:00:00') session.startTime = parsed.start;
            if (parsed.duration) session.duration = parsed.duration;

            // Jika media FOTO: langsung render
            if (isImage) {
                await handleRenderExecution(m, conn, session);
                return true;
            }

            // Jika media VIDEO dan sudah ada mode
            if (session.mode) {
                await handleRenderExecution(m, conn, session);
                return true;
            }

            // Jika media VIDEO dan belum ada mode: minta user pilih
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
            await m.reply(
                `╭── ✦ *PILIH OPSI AUDIO* ✦\n` +
                `• Video berhasil diterima!\n` +
                `• Balas pesan ini dengan angka/opsi:\n` +
                `  *1* / *replace* : Ganti total suara video (suara video jadi 0)\n` +
                `  *2* / *mix* : Gabung suara asli video + musik latar (BGM)\n` +
                `• (Opsional) Tambahkan durasi mulai lagu, contoh: \`1 00:30\`\n` +
                `• Ketik *batal* untuk membatalkan.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
            return true;
        } catch (e) {
            console.error('[ADDMUSIC BEFORE MEDIA ERROR]', e);
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            await m.reply(`*Gagal mengunduh media:*\n_${e.message}_`);
            return true;
        }
    }

    // 4. Kedua Media Video & Audio Lengkap, Menunggu Pemilihan Mode
    if (session.media && session.audio && !session.mode) {
        if (textMsg) {
            const parsed = parseModeAndStart(textMsg);
            if (parsed.mode) {
                session.mode = parsed.mode;
                if (parsed.start && parsed.start !== '00:00:00') {
                    session.startTime = parsed.start;
                }
                if (parsed.duration) {
                    session.duration = parsed.duration;
                }
                await handleRenderExecution(m, conn, session);
                return true;
            } else {
                await m.reply(
                    `Pilihan tidak valid. Silakan balas dengan:\n` +
                    `• *1* atau *replace* (suara video nol & diganti musik)\n` +
                    `• *2* atau *mix* (suara video + musik latar)\n` +
                    `Atau ketik *batal* untuk mengakhiri.`
                );
                return true;
            }
        }
    }

    return false;
};

handler.help = ['addmusic *[opsi]*', 'bgm *[opsi]*', 'fotobgm *[opsi]*'];
handler.tags = ['tools'];
handler.command = /^(addmusic|bgm|videobgm|tovideomusic|editbgm|setaudio|fotobgm|photobgm)$/i;

export default handler;
