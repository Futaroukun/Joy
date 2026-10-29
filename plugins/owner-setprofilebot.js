import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    processProfilePicture,
    extractMediaBuffer,
    sendUpdatePPQuery,
    sendDeletePPQuery,
    parsePPMode
} from '../function/media/profile-picture.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let handler = async (m, { conn, args, text, command, usedPrefix }) => {
    const isDelete = /^(del|remove|reset|hapus)$/i.test(text || args[0] || '');

    // Fitur Hapus Foto Profil Bot
    if (isDelete) {
        try {
            await m.react?.('⏳').catch(() => {});
            await sendDeletePPQuery(conn, null);
            await m.react?.('✅').catch(() => {});
            return m.reply('*Foto profil bot berhasil dihapus.*');
        } catch (e) {
            console.error('[delppbot Error]:', e);
            await m.react?.('❌').catch(() => {});
            return m.reply(`*Gagal menghapus foto profil bot:*\n${e.message || e}`);
        }
    }

    // Fitur Ganti Foto Profil Bot
    const startTime = Date.now();
    const mode = parsePPMode(text || args[0] || '');
    const updateThumb = /--(thumb|local)/i.test(text || '');

    let mediaBuffer;
    let mediaSource = 'unknown';

    try {
        const extracted = await extractMediaBuffer(m, conn, text || '');
        mediaBuffer = extracted.buffer;
        mediaSource = extracted.source;
    } catch (e) {
        return m.reply(
            `╭── ✦ *SET PROFILE BOT* ✦\n` +
            `│\n` +
            `│ *Cara Penggunaan:*\n` +
            `│ • Reply gambar/stiker dengan caption:\n` +
            `│   \`${usedPrefix + command} [mode]\`\n` +
            `│ • Kirim gambar langsung dengan caption:\n` +
            `│   \`${usedPrefix + command} [mode]\`\n` +
            `│ • Masukkan tautan/URL gambar:\n` +
            `│   \`${usedPrefix + command} https://link-gambar.jpg\`\n` +
            `│\n` +
            `│ *Pilihan Mode:*\n` +
            `│ • \`crop\`   : Potong rasio 1:1 persegi (Default)\n` +
            `│ • \`full\`   : Foto utuh + latar blur (Tanpa crop)\n` +
            `│ • \`fit\`    : Foto utuh + latar hitam\n` +
            `│ • \`white\`  : Foto utuh + latar putih\n` +
            `│\n` +
            `│ *Hapus Foto Profil:*\n` +
            `│ • \`${usedPrefix + command} del\`\n` +
            `╰─────────────────────────`
        );
    }

    await m.react?.('⏳').catch(() => {});

    try {
        const processed = await processProfilePicture(mediaBuffer, mode);
        await sendUpdatePPQuery(conn, null, processed.img);

        // Update local thumbnail jika diminta
        if (updateThumb) {
            try {
                const localThumbPath = path.join(__dirname, '..', 'src', 'thumbnail.jpg');
                fs.writeFileSync(localThumbPath, processed.img);
                global.thum = processed.img;
            } catch (err) {
                console.error('[updateThumb Error]:', err.message);
            }
        }

        const duration = Date.now() - startTime;
        const sizeKb = (processed.sizeBytes / 1024).toFixed(1);
        const modeLabel = {
            crop: 'Square Center Crop (1:1)',
            full: 'Full Photo (Blur Background)',
            fit: 'Full Photo (Black Frame)',
            white: 'Full Photo (White Frame)'
        }[processed.mode] || processed.mode;

        await m.react?.('✅').catch(() => {});

        const caption =
            `*Foto profil bot berhasil diperbarui!*\n\n` +
            `• *Mode*       : ${modeLabel}\n` +
            `• *Resolusi*   : ${processed.origWidth}x${processed.origHeight} -> 720x720\n` +
            `• *Format Asli*: ${processed.format.toUpperCase()}\n` +
            `• *Ukuran*     : ${sizeKb} KB\n` +
            `• *Sumber*     : ${mediaSource.toUpperCase()}\n` +
            `• *Kecepatan*  : ${duration}ms` +
            (updateThumb ? `\n• *Thumbnail*  : Diperbarui (\`src/thumbnail.jpg\`)` : '');

        m.reply(caption);
    } catch (e) {
        console.error('[setppbot Error]:', e);
        await m.react?.('❌').catch(() => {});
        m.reply(`*Gagal mengganti foto profil bot:*\n${e.message || e}`);
    }
};

handler.help = ['setppbot']
handler.tags = ['owner']
handler.command = /^(setppbot|setprofilebot)$/i
handler.rowner = true

export default handler
