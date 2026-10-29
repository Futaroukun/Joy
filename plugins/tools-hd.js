/*
 * @Author      : Rafli
 * @Feature     : HD / Image Enhancer & Upscaler
 * @Description : Meningkatkan resolusi, detail, dan kejernihan gambar menggunakan AI Upscaler dan multi-layer fallback engine.
 * @Version     : 2.1 (Multi-Layer AI & Local Ultra-Enhance)
 */

import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { uploadFile } from '../function/media/uploader.js';

async function getILoveAuth() {
    try {
        const html = await axios.get('https://www.iloveimg.com/upscale-image', { timeout: 8000 }).then(r => r.data);
        const token = html.match(/"token":"(eyJ[^"]+)"/)?.[1];
        const task = html.match(/ilovepdfConfig\.taskId\s*=\s*'([^']+)'/)?.[1];
        return { token, task };
    } catch {
        return null;
    }
}

/**
 * Local AI Super-Sampling & Sharpness Enhancement Filter
 */
async function localSuperEnhance(imgBuffer, scale = 2) {
    const meta = await sharp(imgBuffer).metadata();
    const newWidth = Math.round((meta.width || 800) * scale);
    const newHeight = Math.round((meta.height || 600) * scale);

    return await sharp(imgBuffer)
        .resize(newWidth, newHeight, {
            kernel: sharp.kernel.lanczos3,
            fit: 'fill'
        })
        .sharpen({
            sigma: 1.2,
            m1: 0.8,
            m2: 2.5
        })
        .modulate({
            brightness: 1.02,
            saturation: 1.05
        })
        .jpeg({ quality: 95, progressive: true })
        .toBuffer();
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';

    if (!mime || !/image\/(jpe?g|png|webp)/.test(mime)) {
        return m.reply(
            `*HD / UPSCALE GAMBAR*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Tingkatkan resolusi dan ketajaman gambar secara signifikan.\n\n` +
            `*Cara Pakai:*\n` +
            `Kirim atau reply gambar dengan \`${usedPrefix + command} <skala>\`\n\n` +
            `*Pilihan Skala:*\n` +
            `• \`${usedPrefix + command}\` (Default: 2x)\n` +
            `• \`${usedPrefix + command} 2\` (Perbesar 2x)\n` +
            `• \`${usedPrefix + command} 4\` (Perbesar 4x ultra detail)\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    let scale = '2';
    const cleanText = (text || '').trim();
    if (cleanText === '4' || cleanText === '4x') {
        scale = '4';
    } else if (cleanText === '2' || cleanText === '2x') {
        scale = '2';
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    const loadingMsg = await m.reply(`_Memproses peningkatan kualitas gambar ${scale}x..._`);

    const imgBuffer = await q.download();
    if (!imgBuffer || imgBuffer.length === 0) {
        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        return m.reply('Gagal mengunduh gambar.');
    }

    let beforeW = 0;
    let beforeH = 0;
    const beforeSize = imgBuffer.length;
    try {
        const beforeMeta = await sharp(imgBuffer).metadata();
        beforeW = beforeMeta.width || 0;
        beforeH = beforeMeta.height || 0;
    } catch (_) {}

    const buildCaption = (engine, afterW, afterH, afterBytes) => {
        return (
            `╭── ✦ *HD IMAGE ENHANCER* ✦\n` +
            `• Sebelum: *${beforeW}x${beforeH}* (${formatBytes(beforeSize)})\n` +
            `• Sesudah: *${afterW}x${afterH}* (${formatBytes(afterBytes)})\n` +
            `• Skala: *${scale}x*\n` +
            `• Engine: *${engine}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    };

    // ── LAYER 1: ILOVEIMG AI UPSCALE ─────────────────────────────────────────
    try {
        const auth = await getILoveAuth();
        if (auth?.token && auth?.task) {
            const { ext } = (await fileTypeFromBuffer(imgBuffer)) || { ext: 'jpg' };
            const filename = `enhance_${Date.now()}.${ext}`;

            const upForm = new FormData();
            upForm.append('name', filename);
            upForm.append('chunk', '0');
            upForm.append('chunks', '1');
            upForm.append('task', auth.task);
            upForm.append('preview', '1');
            upForm.append('v', 'web.0');
            upForm.append('file', imgBuffer, { filename });

            const uploadRes = await axios.post('https://api29g.iloveimg.com/v1/upload', upForm, {
                headers: {
                    ...upForm.getHeaders(),
                    Authorization: `Bearer ${auth.token}`,
                    Origin: 'https://www.iloveimg.com',
                    Referer: 'https://www.iloveimg.com/'
                },
                timeout: 20000
            });

            const processForm = new FormData();
            processForm.append('task', auth.task);
            processForm.append('server_filename', uploadRes.data.server_filename);
            processForm.append('scale', scale);

            const result = await axios.post('https://api29g.iloveimg.com/v1/upscale', processForm, {
                headers: {
                    ...processForm.getHeaders(),
                    Authorization: `Bearer ${auth.token}`,
                    Origin: 'https://www.iloveimg.com',
                    Referer: 'https://www.iloveimg.com/'
                },
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const resBuffer = Buffer.from(result.data);
            let afterW = beforeW * parseInt(scale, 10);
            let afterH = beforeH * parseInt(scale, 10);
            try {
                const afterMeta = await sharp(resBuffer).metadata();
                afterW = afterMeta.width || afterW;
                afterH = afterMeta.height || afterH;
            } catch (_) {}

            if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});

            await conn.sendMessage(m.chat, {
                image: resBuffer,
                caption: buildCaption('AI Super-Resolution', afterW, afterH, resBuffer.length)
            }, { quoted: m });

            return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
        }
    } catch (e1) {
        console.warn('[HD] Layer 1 (iLoveIMG) gagal:', e1.message);
    }

    // ── LAYER 2: ONLINE CLOUD AI BACKUP ───────────────────────────────────────
    try {
        const fileUrl = await uploadFile(imgBuffer);
        if (fileUrl) {
            const gimitaUrl = `https://api.gimita.id/api/tools/upscale?url=${encodeURIComponent(fileUrl)}`;
            const res = await axios.get(gimitaUrl, { timeout: 20000 });

            if (res.data?.success && res.data?.data?.url) {
                const resImg = await axios.get(res.data.data.url, { responseType: 'arraybuffer', timeout: 20000 });
                const resBuffer = Buffer.from(resImg.data);
                let afterW = beforeW * parseInt(scale, 10);
                let afterH = beforeH * parseInt(scale, 10);
                try {
                    const afterMeta = await sharp(resBuffer).metadata();
                    afterW = afterMeta.width || afterW;
                    afterH = afterMeta.height || afterH;
                } catch (_) {}

                if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});

                await conn.sendMessage(m.chat, {
                    image: resBuffer,
                    caption: buildCaption('Cloud AI Enhancer', afterW, afterH, resBuffer.length)
                }, { quoted: m });

                return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });
            }
        }
    } catch (e2) {
        console.warn('[HD] Layer 2 (Cloud AI) gagal:', e2.message);
    }

    // ── LAYER 3: LOCAL SUPER-SAMPLING ENHANCEMENT FILTER (FAIL-SAFE) ──────────
    try {
        const enhancedBuffer = await localSuperEnhance(imgBuffer, parseInt(scale, 10));
        let afterW = beforeW * parseInt(scale, 10);
        let afterH = beforeH * parseInt(scale, 10);
        try {
            const afterMeta = await sharp(enhancedBuffer).metadata();
            afterW = afterMeta.width || afterW;
            afterH = afterMeta.height || afterH;
        } catch (_) {}

        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});

        await conn.sendMessage(m.chat, {
            image: enhancedBuffer,
            caption: buildCaption('Adaptive HD Enhancer', afterW, afterH, enhancedBuffer.length)
        }, { quoted: m });

        return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (e3) {
        console.error('[HD] Layer 3 gagal:', e3.message);
        if (loadingMsg?.key) await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply(`*Gagal meningkatkan kualitas gambar:*\n\n_${e3.message}_`);
    }
};

handler.help = ['hd *skala*']
handler.tags    = ['tools']
handler.command = /^(hd|hdr|remini|upscale)$/i

export default handler