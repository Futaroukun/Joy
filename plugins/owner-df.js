/*
 * @Author      : Rafli
 * @Feature     : Delete Plugin & File
 * @Description : Menghapus plugin atau file/folder dari server secara permanen.
 * @Version     : 2.1 (No Decorational Emoji & Safe Cleanup)
 */

import fs from 'fs';
import path from 'path';

const formatSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

let handler = async (m, { text, usedPrefix, command }) => {
    const isPluginMode = /^(dp|delplugin|deleteplugin)$/i.test(command);

    if (isPluginMode) {
        try {
            const pluginsDir = path.join(process.cwd(), 'plugins');
            const pluginFiles = fs.readdirSync(pluginsDir)
                .filter(file => file.endsWith('.js'))
                .sort();
            const pluginNames = pluginFiles.map(file => file.replace('.js', ''));

            if (!text) {
                let response =
                    `*HAPUS PLUGIN*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `Pilih plugin yang ingin dihapus:\n\n` +
                    `*Format:*\n` +
                    `• \`${usedPrefix + command} <nomor>\`\n` +
                    `• \`${usedPrefix + command} <nama_plugin>\`\n\n` +
                    `*Daftar Plugin (${pluginNames.length} File):*\n`;

                response += pluginNames.map((name, i) => `${i + 1}. ${name}`).join('\n');
                response += `\n━━━━━━━━━━━━━━━━━━━━━━`;
                return m.reply(response);
            }

            let targetPlugin = null;
            const inputAsNumber = parseInt(text, 10);

            if (!isNaN(inputAsNumber) && inputAsNumber > 0 && inputAsNumber <= pluginNames.length) {
                targetPlugin = pluginNames[inputAsNumber - 1];
            } else {
                const cleanInput = text.trim().toLowerCase().replace(/\.js$/i, '');
                const found = pluginNames.find(name => name.toLowerCase() === cleanInput);
                if (found) targetPlugin = found;
            }

            if (!targetPlugin) {
                return m.reply(
                    `*Plugin Tidak Ditemukan*\n\n` +
                    `Input "${text}" tidak terdaftar di folder plugins.\n` +
                    `Ketik \`${usedPrefix + command}\` tanpa argumen untuk melihat daftar.`
                );
            }

            const fileNameWithExt = `${targetPlugin}.js`;
            const filePath = path.join(pluginsDir, fileNameWithExt);

            if (!fs.existsSync(filePath)) {
                return m.reply(`File \`plugins/${fileNameWithExt}\` tidak ditemukan di server.`);
            }

            const stats = fs.statSync(filePath);
            const fileSize = formatSize(stats.size);

            if (global.db?.data?.pluginSettings?.[fileNameWithExt]) {
                delete global.db.data.pluginSettings[fileNameWithExt];
                if (global.saveData) global.saveData('pluginSettings', 'GLOBAL_CONFIG');
            }

            fs.unlinkSync(filePath);

            return m.reply(
                `*PLUGIN BERHASIL DIHAPUS*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `• *Plugin:* ${fileNameWithExt}\n` +
                `• *Lokasi:* \`plugins/${fileNameWithExt}\`\n` +
                `• *Ukuran:* ${fileSize}\n` +
                `• *Status:* Dihapus permanen dari server\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );

        } catch (error) {
            console.error('[DP ERROR]', error);
            return m.reply(`*Gagal Menghapus Plugin:*\n\n_${error.message}_`);
        }
    } else {
        if (!text) {
            return m.reply(
                `*HAPUS FILE / FOLDER*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n` +
                `*Format:* \`${usedPrefix + command} <path/file>\`\n\n` +
                `*Contoh:*\n` +
                `• \`${usedPrefix + command} tmp/sample.jpg\`\n` +
                `• \`${usedPrefix + command} data/cache.json\`\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        const cleanPath = text.trim().replace(/\.\.\//g, '').replace(/^\/+/, '');
        const fullPath = path.join(process.cwd(), cleanPath);

        if (!fs.existsSync(fullPath)) {
            return m.reply(`Lokasi \`${cleanPath}\` tidak ditemukan di server.`);
        }

        try {
            const stats = fs.statSync(fullPath);
            const fileSize = formatSize(stats.size);
            const isDirectory = stats.isDirectory();

            if (isDirectory) {
                fs.rmSync(fullPath, { recursive: true, force: true });
                return m.reply(
                    `*FOLDER BERHASIL DIHAPUS*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `• *Folder:* \`${cleanPath}\`\n` +
                    `• *Status:* Dihapus permanen beserta seluruh isinya\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                );
            } else {
                fs.unlinkSync(fullPath);
                return m.reply(
                    `*FILE BERHASIL DIHAPUS*\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `• *File:* \`${cleanPath}\`\n` +
                    `• *Ukuran:* ${fileSize}\n` +
                    `• *Status:* Dihapus permanen dari server\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━`
                );
            }

        } catch (error) {
            console.error('[DF ERROR]', error);
            return m.reply(`*Gagal Menghapus File:*\n\n_${error.message}_`);
        }
    }
};

handler.help = ['df *path/plugin*']
handler.tags    = ['owner']
handler.command = /^(df|dp|delfile|delplugin)$/i
handler.rowner  = true

export default handler