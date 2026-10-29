/*
 * @Author      : Rafli
 * @Feature     : Image Resizer & Scaler
 * @Description : Memperbesar resolusi gambar dan stiker menggunakan algoritma Lanczos3 dan filter ketajaman adaptif.
 * @Version     : 2.1 (No Decorational Emoji & Auto Multiplier)
 */

import sharp from 'sharp';

async function upscaleImage(buffer, multiplier = 2, quality = 92) {
  try {
    const metadata = await sharp(buffer).metadata();

    const newWidth = Math.round(metadata.width * multiplier);
    const newHeight = Math.round(metadata.height * multiplier);

    let pipeline = sharp(buffer)
      .resize(newWidth, newHeight, {
        kernel: sharp.kernel.lanczos3,
        fit: 'fill',
        withoutEnlargement: false
      })
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 });

    const format = metadata.format || 'jpeg';

    if (format === 'jpeg' || format === 'jpg') {
      pipeline = pipeline.jpeg({ quality: quality, progressive: true, mozjpeg: true });
    } else if (format === 'png') {
      pipeline = pipeline.png({ compressionLevel: 6, progressive: true });
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: quality, effort: 4 });
    }

    const upscaled = await pipeline.toBuffer();

    return {
      buffer: upscaled,
      originalSize: {
        width: metadata.width,
        height: metadata.height,
        fileSize: buffer.length
      },
      newSize: {
        width: newWidth,
        height: newHeight,
        fileSize: upscaled.length
      },
      multiplier: multiplier,
      format: format
    };

  } catch (error) {
    throw new Error('Gagal memproses perbesaran gambar: ' + error.message);
  }
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || q.mediaType || '';

    if (!mime || !/image/.test(mime)) {
        return m.reply(
            `*PERBESAR RESOLUSI GAMBAR*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Tingkatkan resolusi gambar atau stiker dengan algoritma Lanczos3.\n\n` +
            `*Cara Pakai:*\n` +
            `Kirim atau reply gambar dengan \`${usedPrefix + command} <skala>\`\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix + command}\` (Default: 2x)\n` +
            `• \`${usedPrefix + command} 2\` (Perbesar 2x)\n` +
            `• \`${usedPrefix + command} 3\` (Perbesar 3x)\n` +
            `• \`${usedPrefix + command} 4\` (Perbesar 4x)\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (!/image\/(jpe?g|png|webp)/.test(mime)) {
        return m.reply('Format gambar tidak didukung. Harap gunakan format JPEG, PNG, atau WebP.');
    }

    const media = await q.download();
    if (!media) return m.reply('Gagal mengunduh media gambar.');

    const metadata = await sharp(media).metadata();
    const maxDimension = 8000;
    const maxMultiplier = Math.min(4, Math.floor(maxDimension / Math.max(metadata.width || 1, metadata.height || 1)));

    let multiplier = 2; // Default 2x
    if (text) {
        const parsed = parseFloat(text.trim());
        if (!isNaN(parsed) && parsed > 0) {
            if (parsed > maxMultiplier) {
                return m.reply(
                    `*Melebihi Batas Resolusi*\n\n` +
                    `Gambar ini hanya dapat diperbesar maksimal ${maxMultiplier}x.\n` +
                    `Resolusi maksimum: ${metadata.width * maxMultiplier} x ${metadata.height * maxMultiplier} px`
                );
            }
            multiplier = parsed;
        }
    }

    let loadingMsg;
    try {
        loadingMsg = await m.reply(`_Memperbesar gambar ${multiplier}x, mohon tunggu sebentar..._`);

        const result = await upscaleImage(media, multiplier, 92);

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }

        const sizeDiff = ((result.newSize.fileSize / result.originalSize.fileSize - 1) * 100).toFixed(1);

        let caption =
            `*HASIL PERBESAR GAMBAR*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Resolusi Awal:* ${result.originalSize.width} x ${result.originalSize.height} px (${formatBytes(result.originalSize.fileSize)})\n` +
            `• *Resolusi Baru:* ${result.newSize.width} x ${result.newSize.height} px (${formatBytes(result.newSize.fileSize)})\n` +
            `• *Skala:* ${multiplier}x (${result.format.toUpperCase()})\n` +
            `• *Algoritma:* Lanczos3 + Adaptive Sharpen\n` +
            `• *Perubahan Ukuran:* ${sizeDiff > 0 ? '+' : ''}${sizeDiff}%\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`;

        await conn.sendMessage(m.chat, {
            image: result.buffer,
            caption: caption,
            mimetype: `image/${result.format}`
        }, { quoted: m });

    } catch (error) {
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        return m.reply(`*Gagal memperbesar gambar:*\n\n_${error.message}_`);
    }
};

handler.help    = ['gedein'];
handler.tags    = ['tools'];
handler.command = /^(gedein|scale|perbesar|resize)$/i;

export default handler;