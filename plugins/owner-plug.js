import { readdirSync } from 'fs';
import { join } from 'path';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const isEnable = /^(enableplugin|pon)$/i.test(command);
    const actionPast = isEnable ? 'ON' : 'OFF';

    if (!global.db.data.pluginSettings) {
        global.db.data.pluginSettings = {};
    }
    const pluginSettings = global.db.data.pluginSettings;

    const pluginsDir = join(process.cwd(), 'plugins');
    const allPlugins = readdirSync(pluginsDir)
        .filter(file => file.endsWith('.js'))
        .sort();

    if (!text) {
        let response = `*PANEL KONTROL PLUGIN*\n`;
        response += `Total Plugin: ${allPlugins.length}\n`;
        response += `__________________________\n\n`;

        const pluginList = allPlugins.map((plugin, index) => {
            const isOff = pluginSettings[plugin]?.disabled;
            const status = isOff ? '[ OFF ]' : '[ ON ]';
            
            return `${index + 1}. *${plugin.replace('.js', '')}*\n   Status: *${status}*`;
        }).join('\n\n');

        response += pluginList;
        response += `\n__________________________\n\n`;
        
        response += `*PANDUAN PENGGUNAAN*\n`;
        response += `Ketik perintah di bawah ini buat ubah status plugin:\n\n`;
        response += `*${usedPrefix}pon nomor/nama*\n> Untuk menyalakan plugin\n\n`;
        response += `*${usedPrefix}poff nomor/nama*\n> Untuk mematikan plugin\n\n`;
        response += `*Contoh:*\n${usedPrefix}poff 5\n${usedPrefix}pon antilink`;

        return m.reply(response);
    }

    let targetPlugin = null;
    const inputAsNumber = parseInt(text);

    if (!isNaN(inputAsNumber) && inputAsNumber > 0 && inputAsNumber <= allPlugins.length) {
        targetPlugin = allPlugins[inputAsNumber - 1];
    } else {
        let tempTarget = text.trim();
        if (!tempTarget.endsWith('.js')) {
            tempTarget += '.js';
        }
        if (allPlugins.includes(tempTarget)) {
            targetPlugin = tempTarget;
        }
    }

    if (!targetPlugin) {
        return m.reply(`*PLUGIN TIDAK DITEMUKAN*\n\nNama atau nomor *${text}* gak ada di daftar.\nCek lagi ya, pastikan tulisannya benar.`);
    }

    if (targetPlugin === 'owner-plug.js' && !isEnable) {
        return m.reply('*AKSES DITOLAK*\n\nFitur ini dikunci biar sistem nggak error. Jangan dimatiin ya.');
    }

    const isCurrentlyDisabled = pluginSettings[targetPlugin]?.disabled === true;

    if (isEnable && !isCurrentlyDisabled) {
        return m.reply(`*SUDAH AKTIF*\n\nPlugin *${targetPlugin.replace('.js', '')}* posisinya udah ON kok.`);
    }

    if (!isEnable && isCurrentlyDisabled) {
        return m.reply(`*SUDAH MATI*\n\nPlugin *${targetPlugin.replace('.js', '')}* emang udah statusnya OFF.`);
    }

    if (!pluginSettings[targetPlugin]) {
        pluginSettings[targetPlugin] = {};
    }
    pluginSettings[targetPlugin].disabled = !isEnable;

    if (global.plugins[targetPlugin]) {
        global.plugins[targetPlugin].disable = !isEnable;
    }

    await m.reply(`*BERHASIL DIUBAH*\n\nNama Plugin: *${targetPlugin.replace('.js', '')}*\nStatus Baru: *${actionPast}*`);
};

handler.help = ['enableplugin *plugin*', 'disableplugin *plugin*'];
handler.tags = ['owner'];
handler.command = /^(enableplugin|pon|disableplugin|poff)$/i;
handler.owner = true;

export default handler;