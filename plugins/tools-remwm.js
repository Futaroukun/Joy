/*
 * @Author      : Rafli
 * @Feature     : AI Watermark, Logo & Text Remover
 * @Description : Menghapus watermark, logo, dan teks dari gambar secara otomatis menggunakan deep learning inpainting AI.
 * @Version     : 2.1 (No Decorational Emoji & Fast Inpainting Pipeline)
 */

import fetch from 'node-fetch';
import FormData from 'form-data';
import crypto from 'crypto';
import sharp from 'sharp';
import { uploadFile } from '../function/media/uploader.js';
import axios from 'axios';

async function prepareImageBuffer(buffer) {
    try {
        return await sharp(buffer)
            .jpeg({ quality: 95 })
            .toBuffer();
    } catch {
        return buffer;
    }
}

async function createUnwatermarkJob(imageBuffer, productSerial) {
    const form = new FormData();
    form.append('original_image_file', imageBuffer, {
        filename: `image_${Date.now()}.jpg`,
        contentType: 'image/jpeg'
    });

    form.append('output_format', 'jpg');
    form.append('is_remove_text', 'true');
    form.append('is_remove_logo', 'true');
    form.append('is_enhancer', 'true');

    const response = await fetch(
        'https://api.unwatermark.ai/api/web/v1/image-watermark-auto-remove-upgrade/create-job',
        {
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'Product-Serial': productSerial,
                'Product-Code': '067003',
                'Origin': 'https://unwatermark.ai',
                'Referer': 'https://unwatermark.ai/'
            },
            body: form,
            timeout: 20000
        }
    );

    const data = await response.json();
    if (!data.result?.job_id) {
        throw new Error(data.message?.id || data.message?.en || 'Gagal menginisialisasi tugas AI.');
    }

    return data.result.job_id;
}

async function getUnwatermarkJob(jobId, productSerial) {
    const response = await fetch(
        `https://api.unwatermark.ai/api/web/v1/image-watermark-auto-remove-upgrade/get-job/${jobId}`,
        {
            method: 'GET',
            headers: {
                'Product-Serial': productSerial,
                'Product-Code': '067003',
                'Origin': 'https://unwatermark.ai',
                'Referer': 'https://unwatermark.ai/'
            },
            timeout: 15000
        }
    );

    return await response.json();
}

async function unwatermarkPrimary(imageBuffer) {
    const cleanJpeg = await prepareImageBuffer(imageBuffer);
    const productSerial = crypto.randomUUID();
    const jobId = await createUnwatermarkJob(cleanJpeg, productSerial);

    let attempts = 0;
    const maxAttempts = 15;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 2000));

        const status = await getUnwatermarkJob(jobId, productSerial);

        if (status.code === 100000 && status.result?.output_url) {
            const rawOutput = status.result.output_url;
            const finalUrl = Array.isArray(rawOutput) ? rawOutput[0] : rawOutput;
            if (finalUrl) {
                return {
                    url: finalUrl,
                    engine: 'Deep Inpainting AI'
                };
            }
        }

        attempts++;
    }

    throw new Error('Proses AI membutuhkan waktu terlalu lama.');
}

async function unwatermarkBackup(imageBuffer) {
    const fileUrl = await uploadFile(imageBuffer);
    if (!fileUrl) throw new Error('Gagal mengunggah file cadangan.');

    const apiUrl = `https://api.gimita.id/api/tools/watermark-remover?url=${encodeURIComponent(fileUrl)}`;
    const res = await axios.get(apiUrl, { timeout: 25000 });

    if (res.data?.success && res.data?.data?.url) {
        return {
            url: res.data.data.url,
            engine: 'Cloud Watermark Cleaner'
        };
    }

    throw new Error('Server cadangan tidak merespons.');
}

let handler = async (m, { conn, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';

    if (!mime || !/image/.test(mime)) {
        return m.reply(
            `*HAPUS WATERMARK GAMBAR*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Menghapus watermark, logo, dan teks mengganggu dari gambar secara otomatis.\n\n` +
            `*Cara Pakai:*\n` +
            `Kirim atau reply gambar dengan perintah \`${usedPrefix + command}\`\n\n` +
            `*Format Didukung:* JPG, PNG, WebP\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (!/image\/(jpe?g|png|webp)/.test(mime)) {
        return m.reply('*Format Tidak Didukung*\n\nHarap gunakan format gambar JPEG, PNG, atau WebP.');
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } });
    const loadingMsg = await m.reply('_Sedang memproses penghapusan watermark, mohon tunggu sebentar..._');

    try {
        const media = await q.download();
        if (!media || media.length === 0) throw new Error('Gagal mengunduh gambar.');

        let result = null;

        // ── 1. ENGINE UTAMA ──────────────────────────────────────────────────
        try {
            result = await unwatermarkPrimary(media);
        } catch (e1) {
            console.warn('[REMOVEWM] Engine utama gagal:', e1.message);
        }

        // ── 2. ENGINE CADANGAN ────────────────────────────────────────────────
        if (!result) {
            try {
                result = await unwatermarkBackup(media);
            } catch (e2) {
                console.warn('[REMOVEWM] Engine cadangan gagal:', e2.message);
            }
        }

        if (!result || !result.url) {
            throw new Error('Semua server penghapus watermark sedang sibuk. Silakan coba beberapa saat lagi.');
        }

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }

        const caption =
            `*WATERMARK BERHASIL DIHAPUS*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Engine:* ${result.engine}\n` +
            `• *Status:* Teks & Logo Berhasil Dihapus\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`;

        await conn.sendMessage(m.chat, {
            image: { url: result.url },
            caption: caption,
            contextInfo: {
                externalAdReply: {
                    title: `${global.info?.namabot || 'Joy'} • Watermark Remover`,
                    body: 'Watermark, Logo & Text Cleaned',
                    thumbnailUrl: result.url,
                    sourceUrl: result.url,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

        return await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('[REMOVEWM ERROR]', error);

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }

        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } });
        return m.reply(`*Gagal menghapus watermark:*\n\n_${error.message}_`);
    }
};

handler.help = ['removewm *reply gambar*']
handler.tags    = ['tools']
handler.command = /^(removewm|remwm|nowm)$/i
handler.limit   = false

export default handler