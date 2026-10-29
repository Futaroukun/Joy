import sharp from 'sharp';
import { S_WHATSAPP_NET, areJidsSameUser, jidNormalizedUser } from '@whiskeysockets/baileys';

/**
 * Memproses buffer gambar menjadi 720x720 JPEG yang optimal untuk WhatsApp profile picture.
 * @param {Buffer} buffer
 * @param {'crop'|'full'|'blur'|'fit'|'black'|'white'} [mode='crop']
 * @returns {Promise<{ img: Buffer, origWidth: number, origHeight: number, format: string, mode: string, sizeBytes: number }>}
 */
export async function processProfilePicture(buffer, mode = 'crop') {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Buffer gambar tidak valid atau kosong.');
    }

    const targetSize = 720;
    const normalizedMode = String(mode || 'crop').toLowerCase().trim().replace(/^--/, '');

    try {
        const image = sharp(buffer, { failOnError: false }).rotate();
        const meta = await image.metadata();
        const origWidth = meta.width || targetSize;
        const origHeight = meta.height || targetSize;
        const format = meta.format || 'unknown';

        let outputBuffer;

        if (normalizedMode === 'full' || normalizedMode === 'blur') {
            // Mode Full Blur: Gambar asli di tengah + background blur estetik dari gambar yang sama
            const bg = await sharp(buffer, { failOnError: false })
                .rotate()
                .resize(64, 64, { fit: 'cover' })
                .blur(2)
                .resize(targetSize, targetSize)
                .modulate({ brightness: 0.65, saturation: 1.1 })
                .flatten({ background: '#000000' })
                .toBuffer();

            const fg = await sharp(buffer, { failOnError: false })
                .rotate()
                .resize(targetSize, targetSize, { fit: 'inside' })
                .toBuffer();

            outputBuffer = await sharp(bg)
                .composite([{ input: fg, gravity: 'center' }])
                .flatten({ background: '#000000' })
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer();

        } else if (normalizedMode === 'fit' || normalizedMode === 'black') {
            // Mode Fit Black: Full foto dengan frame hitam tanpa potong
            outputBuffer = await sharp(buffer, { failOnError: false })
                .rotate()
                .resize(targetSize, targetSize, {
                    fit: 'contain',
                    background: { r: 0, g: 0, b: 0, alpha: 1 }
                })
                .flatten({ background: '#000000' })
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer();

        } else if (normalizedMode === 'white') {
            // Mode Fit White: Full foto dengan frame putih
            outputBuffer = await sharp(buffer, { failOnError: false })
                .rotate()
                .resize(targetSize, targetSize, {
                    fit: 'contain',
                    background: { r: 255, g: 255, b: 255, alpha: 1 }
                })
                .flatten({ background: '#ffffff' })
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer();

        } else {
            // Mode Default: 1:1 Smart Center Crop (Presisi & Tajam)
            outputBuffer = await sharp(buffer, { failOnError: false })
                .rotate()
                .resize(targetSize, targetSize, {
                    fit: 'cover',
                    position: 'center'
                })
                .flatten({ background: '#000000' })
                .jpeg({ quality: 90, mozjpeg: true })
                .toBuffer();
        }

        return {
            img: outputBuffer,
            origWidth,
            origHeight,
            format,
            mode: normalizedMode === 'blur' ? 'full' : normalizedMode,
            sizeBytes: outputBuffer.length
        };
    } catch (sharpError) {
        // Fallback jika sharp mengalami kendala
        try {
            const { Jimp } = await import('jimp');
            const j = await Jimp.read(buffer);
            const origWidth = j.bitmap.width;
            const origHeight = j.bitmap.height;

            const min = Math.min(origWidth, origHeight);
            const x = Math.floor((origWidth - min) / 2);
            const y = Math.floor((origHeight - min) / 2);

            const cropped = j.crop({ x, y, w: min, h: min });
            const resized = await cropped.resize({ w: targetSize, h: targetSize });
            const img = await resized.getBuffer("image/jpeg");

            return {
                img,
                origWidth,
                origHeight,
                format: 'fallback-jimp',
                mode: 'crop',
                sizeBytes: img.length
            };
        } catch (jimpError) {
            throw new Error(`Gagal memproses gambar: ${sharpError.message || jimpError.message}`);
        }
    }
}

/**
 * Ekstraksi media buffer dari berbagai sumber: quoted message, direct media, atau URL
 * @param {object} m
 * @param {object} conn
 * @param {string} [text='']
 * @returns {Promise<{ buffer: Buffer, source: string, mime: string }>}
 */
export async function extractMediaBuffer(m, conn, text = '') {
    // 1. Cek apakah ada URL gambar di argumen teks
    const urlMatch = text.match(/https?:\/\/[^\s]+(?:\.png|\.jpe?g|\.webp|\.gif|\.bmp|\.avif|\?.*|$)/i);
    if (urlMatch) {
        try {
            const { data, mime } = await conn.getFile(urlMatch[0]);
            if (Buffer.isBuffer(data) && data.length > 0) {
                return { buffer: data, source: 'url', mime: mime || 'image/jpeg' };
            }
        } catch (e) {
            console.error('[extractMediaBuffer] URL fetch failed:', e.message);
        }
    }

    // 2. Cek quoted message
    const q = m.quoted ? m.quoted : m;
    const mime = (q.msg || q).mimetype || q.mediaType || '';

    if (/image|sticker|document/i.test(mime) || q.mediaMessage) {
        try {
            const buffer = typeof q.download === 'function' ? await q.download() : null;
            if (Buffer.isBuffer(buffer) && buffer.length > 0) {
                return { buffer, source: m.quoted ? 'quoted' : 'direct', mime };
            }
        } catch (e) {
            console.error('[extractMediaBuffer] Download failed:', e.message);
        }
    }

    // 3. Cek direct m download jika m bukan quoted
    if (m.mediaMessage && typeof m.download === 'function') {
        try {
            const buffer = await m.download();
            if (Buffer.isBuffer(buffer) && buffer.length > 0) {
                return { buffer, source: 'direct', mime: m.msg?.mimetype || 'image/jpeg' };
            }
        } catch (e) {}
    }

    throw new Error('Tidak ditemukan gambar, stiker, atau URL gambar yang valid.');
}

/**
 * Eksekusi update profile picture ke server WhatsApp
 * @param {object} conn
 * @param {string} jid
 * @param {Buffer} imgBuffer
 */
export async function sendUpdatePPQuery(conn, jid, imgBuffer) {
    const myJid = conn.user?.jid || conn.user?.id || '';
    const isMe = !jid || (myJid && areJidsSameUser(jid, myJid));
    const targetJid = isMe ? undefined : jidNormalizedUser(jid);

    return await conn.query({
        tag: 'iq',
        attrs: {
            to: S_WHATSAPP_NET,
            type: 'set',
            xmlns: 'w:profile:picture',
            ...(targetJid ? { target: targetJid } : {})
        },
        content: [{
            tag: 'picture',
            attrs: { type: 'image' },
            content: imgBuffer
        }]
    });
}

/**
 * Eksekusi hapus profile picture di server WhatsApp
 * @param {object} conn
 * @param {string} jid
 */
export async function sendDeletePPQuery(conn, jid) {
    const myJid = conn.user?.jid || conn.user?.id || '';
    const isMe = !jid || (myJid && areJidsSameUser(jid, myJid));
    const targetJid = isMe ? undefined : jidNormalizedUser(jid);

    return await conn.query({
        tag: 'iq',
        attrs: {
            to: S_WHATSAPP_NET,
            type: 'set',
            xmlns: 'w:profile:picture',
            ...(targetJid ? { target: targetJid } : {})
        }
    });
}

/**
 * Parsing opsi mode dari argumen input
 * @param {string} text
 * @returns {'crop'|'full'|'blur'|'fit'|'black'|'white'}
 */
export function parsePPMode(text = '') {
    const lower = String(text).toLowerCase();
    if (/\b(full|blur|panjang)\b/i.test(lower)) return 'full';
    if (/\b(fit|black|hitam)\b/i.test(lower)) return 'fit';
    if (/\b(white|putih)\b/i.test(lower)) return 'white';
    return 'crop';
}
