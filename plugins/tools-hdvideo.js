import { exec } from 'child_process';
import { promisify } from 'util';
import { statSync, existsSync } from 'fs';
import { join } from 'path';
import tmpManager from '../function/core/safe-tmp.js';

const execAsync = promisify(exec);

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getVideoDimensions(filePath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${filePath}"`,
            { timeout: 15000 }
        );
        const dims = stdout.trim().split('x').map(Number);
        return { width: dims[0] || 0, height: dims[1] || 0 };
    } catch {
        return { width: 0, height: 0 };
    }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';

    if (!mime || !/video/.test(mime)) {
        return m.reply(
            `╭── ✦ *HD VIDEO ENHANCER* ✦\n` +
            `• Tingkatkan resolusi & ketajaman video secara instan.\n\n` +
            `*Cara Pakai:*\n` +
            `› Balas atau kirim video dengan \`${usedPrefix + command} <opsi>\`\n\n` +
            `*Pilihan Skala:*\n` +
            `• \`${usedPrefix + command}\` (Default: 720p HD)\n` +
            `• \`${usedPrefix + command} 1080\` (Full HD 1080p)\n` +
            `• \`${usedPrefix + command} 720\` (HD 720p)\n` +
            `• \`${usedPrefix + command} 2x\` (Skala 2x lipat)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    const statusMsg = await m.reply('_Sedang memproses peningkatan kualitas video..._');

    let tempIn = null;
    let tempOut = null;

    try {
        const videoBuffer = await q.download();
        if (!videoBuffer || videoBuffer.length === 0) {
            throw new Error('Gagal mengunduh video.');
        }

        tempIn = await tmpManager.writeBuffer(videoBuffer, '.mp4');
        const outFilename = tmpManager.generateFilename('.mp4');
        tempOut = join(tmpManager.tmpDir, outFilename);

        const beforeDim = await getVideoDimensions(tempIn);

        let scaleFilter = 'scale=-2:720:flags=lanczos';
        const opt = (text || '').trim().toLowerCase();

        if (opt === '1080' || opt === '1080p') {
            scaleFilter = 'scale=-2:1080:flags=lanczos';
        } else if (opt === '2x' || opt === '2') {
            scaleFilter = 'scale=iw*2:ih*2:flags=lanczos';
        }

        const vf = `${scaleFilter},cas=0.55,unsharp=5:5:0.7:5:5:0.0`;

        await execAsync(
            `ffmpeg -y -i "${tempIn}" -vf "${vf}" -c:v libx264 -crf 19 -preset veryfast -c:a copy "${tempOut}"`,
            { timeout: 180000 }
        );

        if (!existsSync(tempOut)) {
            throw new Error('Hasil pemrosesan video tidak ditemukan.');
        }

        const afterDim = await getVideoDimensions(tempOut);
        const afterSize = statSync(tempOut).size;

        const caption =
            `╭── ✦ *HD VIDEO ENHANCER* ✦\n` +
            `• Sebelum: *${beforeDim.width}x${beforeDim.height}* (${formatBytes(videoBuffer.length)})\n` +
            `• Sesudah: *${afterDim.width}x${afterDim.height}* (${formatBytes(afterSize)})\n` +
            `• Preset: *Lanczos + AMD CAS*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        await conn.sendMessage(
            m.chat,
            { video: { url: tempOut }, caption },
            { quoted: m }
        );

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        if (statusMsg?.key) await conn.sendMessage(m.chat, { delete: statusMsg.key }).catch(() => {});
    } catch (err) {
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        m.reply(`Gagal memproses video: ${err.message}`);
    } finally {
        if (tempIn) tmpManager.deleteFile(tempIn);
        if (tempOut) tmpManager.deleteFile(tempOut);
    }
};

handler.help = ['hdvideo', 'hdvid'];
handler.tags = ['tools'];
handler.command = /^(hdvid|hdvideo|vhd|upscalevid)$/i;

export default handler;
