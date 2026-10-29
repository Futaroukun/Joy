import {
    processProfilePicture,
    extractMediaBuffer,
    sendUpdatePPQuery,
    sendDeletePPQuery,
    parsePPMode
} from '../function/media/profile-picture.js';

let handler = async (m, { conn, args, text, command, usedPrefix }) => {
    const isDelete = /^(del|remove|reset|hapus)$/i.test(text || args[0] || '');

    // Fitur Hapus Foto Profil Grup
    if (isDelete) {
        try {
            await m.react?.('⏳').catch(() => {});
            await sendDeletePPQuery(conn, m.chat);
            await m.react?.('✅').catch(() => {});
            return m.reply('*Foto profil grup berhasil dihapus.*');
        } catch (e) {
            console.error('[delppgc Error]:', e);
            await m.react?.('❌').catch(() => {});
            return m.reply(`*Gagal menghapus foto profil grup:*\n${e.message || e}`);
        }
    }

    // Fitur Ganti Foto Profil Grup
    const startTime = Date.now();
    const mode = parsePPMode(text || args[0] || '');

    let mediaBuffer;
    let mediaSource = 'unknown';

    try {
        const extracted = await extractMediaBuffer(m, conn, text || '');
        mediaBuffer = extracted.buffer;
        mediaSource = extracted.source;
    } catch (e) {
        return m.reply(
            `╭── ✦ *SET PROFILE GROUP* ✦\n` +
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
        await sendUpdatePPQuery(conn, m.chat, processed.img);

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
            `*Foto profil grup berhasil diperbarui!*\n\n` +
            `• *Mode*       : ${modeLabel}\n` +
            `• *Resolusi*   : ${processed.origWidth}x${processed.origHeight} -> 720x720\n` +
            `• *Format Asli*: ${processed.format.toUpperCase()}\n` +
            `• *Ukuran*     : ${sizeKb} KB\n` +
            `• *Sumber*     : ${mediaSource.toUpperCase()}\n` +
            `• *Kecepatan*  : ${duration}ms`;

        m.reply(caption);
    } catch (e) {
        console.error('[setppgc Error]:', e);
        await m.react?.('❌').catch(() => {});
        m.reply(`*Gagal mengganti foto profil grup:*\n${e.message || e}`);
    }
};

handler.help    = ['setppgc']
handler.tags    = ['group']
handler.command = /^(setppgc|setppgroup)$/i
handler.group   = true
handler.admin   = true
handler.botAdmin = true

export default handler
