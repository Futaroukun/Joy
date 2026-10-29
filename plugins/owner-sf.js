/*
 * @Author      : Rafli
 * @Feature     : Save Plugin & File
 * @Description : Menyimpan kode atau media langsung ke file/plugin tujuan dengan verifikasi sintaks JavaScript otomatis.
 * @Version     : 2.1 (No Decorational Emoji & Strict Syntax Validation)
 */

import fs from 'fs';
import path from 'path';
import syntaxerror from 'syntax-error';

const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const sanitizePluginName = (name) => {
    return name.trim().toLowerCase()
        .replace(/\.js$/i, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9\-_]/g, '')
        .replace(/^-+|-+$/g, '');
};

const sanitizeFilePath = (pathStr) => {
    return pathStr.replace(/\.\.\//g, '')
        .replace(/\.\.\\/g, '')
        .replace(/^\/+/, '')
        .replace(/^[a-zA-Z]:/, '');
};

let handler = async (m, { text, usedPrefix, command }) => {
    const isPluginMode = /^(sp|saveplugin)$/i.test(command);

    if (!text || text.trim() === '') {
        if (isPluginMode) {
            return m.reply(
                `*SAVE PLUGIN*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Format:* \`${usedPrefix + command} <nama_plugin>\`\n\n` +
                `*Contoh:* \`${usedPrefix + command} tools-gemini\`\n` +
                `*Lokasi:* Folder \`plugins/\`\n\n` +
                `_Reply pesan teks yang berisi kode JavaScript plugin._\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );
        } else {
            return m.reply(
                `*SAVE FILE*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Format:* \`${usedPrefix + command} <path/file>\`\n\n` +
                `*Contoh:*\n` +
                `• \`${usedPrefix + command} function/helper.js\`\n` +
                `• \`${usedPrefix + command} src/thumbnail.jpg\`\n` +
                `• \`${usedPrefix + command} data/config.json\`\n\n` +
                `_Reply pesan yang berisi kode, teks, atau file media._\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
    }

    if (!m.quoted) {
        return m.reply('*Harap reply pesan* yang berisi kode teks atau media yang ingin disimpan.');
    }

    const input = text.trim();
    const q = m.quoted;
    const mime = (q.msg || q).mimetype || q.mediaType || '';
    const isMedia = /image|video|audio|document|sticker/.test(mime);

    try {
        if (isPluginMode) {
            if (isMedia) {
                return m.reply('*Media Tidak Diizinkan*\n\nPlugin harus berupa script JavaScript (.js) berbasis teks.');
            }

            const content = q.text || '';
            if (!content || content.trim() === '') {
                return m.reply('*Kode Kosong*\n\nReply pesan yang berisi kode JavaScript.');
            }

            const pluginName = sanitizePluginName(input);
            if (!pluginName) {
                return m.reply('*Nama Plugin Tidak Valid*\n\nGunakan hanya huruf, angka, dan tanda hubung (-).');
            }

            const pluginPath = path.join(process.cwd(), 'plugins', `${pluginName}.js`);
            const pluginRelativePath = path.join('plugins', `${pluginName}.js`);

            const error = syntaxerror(content, pluginPath, {
                sourceType: 'module',
                allowAwaitOutsideFunction: true
            });

            if (error) {
                return m.reply(
                    `*SYNTAX ERROR TERDETEKSI*\n\n` +
                    `Plugin *${pluginName}.js* mengandung kesalahan sintaks:\n\n` +
                    `\`\`\`\n${error}\n\`\`\`\n\n` +
                    `_File dibatalkan disimpan agar tidak menyebabkan bot crash._`
                );
            }

            const isUpdate = fs.existsSync(pluginPath);
            let oldSize = 0;
            if (isUpdate) {
                try { oldSize = fs.statSync(pluginPath).size; } catch (_) {}
            }

            const dir = path.dirname(pluginPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            await fs.promises.writeFile(pluginPath, content, 'utf8');

            const newSize = Buffer.byteLength(content, 'utf8');
            const lines = content.split('\n').length;

            return m.reply(
                `*PLUGIN BERHASIL ${isUpdate ? 'DIUPDATE' : 'DISIMPAN'}*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `• *File:* ${pluginName}.js\n` +
                `• *Lokasi:* \`${pluginRelativePath}\`\n` +
                `• *Ukuran:* ${formatSize(newSize)}${isUpdate ? ` (Sebelumnya: ${formatSize(oldSize)})` : ''}\n` +
                `• *Total Baris:* ${lines} baris\n` +
                `• *Status:* Sintaks Valid & Auto-Reload Aktif\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );

        } else {
            const filePath = sanitizeFilePath(input);
            if (!filePath || filePath.trim() === '') {
                return m.reply('*Path Tidak Valid*\n\nGunakan path file relatif yang aman.');
            }

            const fullPath = path.join(process.cwd(), filePath);
            const ext = path.extname(filePath).toLowerCase();
            const isUpdate = fs.existsSync(fullPath);

            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (isMedia) {
                const mediaBuffer = await q.download();
                if (!mediaBuffer) {
                    return m.reply('*Gagal Mengunduh Media*\n\nMedia gagal diunduh dari server WhatsApp.');
                }
                await fs.promises.writeFile(fullPath, mediaBuffer);
                const size = formatSize(mediaBuffer.length);

                return m.reply(
                    `*MEDIA BERHASIL ${isUpdate ? 'DIUPDATE' : 'DISIMPAN'}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `• *Path:* \`${filePath}\`\n` +
                    `• *Ukuran:* ${size}\n` +
                    `• *Tipe:* ${ext ? ext.slice(1).toUpperCase() : 'BINARY'}\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                );
            } else {
                const content = q.text || '';
                if (!content || content.trim() === '') {
                    return m.reply('*Teks Kosong*\n\nReply pesan yang berisi teks atau kode.');
                }

                if (ext === '.js') {
                    const error = syntaxerror(content, filePath, {
                        sourceType: 'module',
                        allowAwaitOutsideFunction: true
                    });

                    if (error) {
                        return m.reply(
                            `*SYNTAX ERROR TERDETEKSI*\n\n` +
                            `File *${filePath}* mengandung kesalahan sintaks:\n\n` +
                            `\`\`\`\n${error}\n\`\`\`\n\n` +
                            `_Penyimpanan dibatalkan._`
                        );
                    }
                }

                await fs.promises.writeFile(fullPath, content, 'utf8');
                const stats = fs.statSync(fullPath);

                return m.reply(
                    `*FILE BERHASIL ${isUpdate ? 'DIUPDATE' : 'DISIMPAN'}*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `• *Path:* \`${filePath}\`\n` +
                    `• *Ukuran:* ${formatSize(stats.size)}\n` +
                    `• *Total Baris:* ${content.split('\n').length} baris\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                );
            }
        }

    } catch (error) {
        console.error('[SF ERROR]', error);
        return m.reply(`*Gagal Menyimpan File:*\n\n_${error.message}_`);
    }
};

handler.help = ['sf *path/plugin*'];
handler.tags    = ['owner'];
handler.command = /^(sf|sp|savefile|saveplugin)$/i;
handler.rowner  = true;

export default handler;