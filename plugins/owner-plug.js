/*
 * @Author      : Rafli
 * @Feature     : Plugin Control Switch
 * @Description : Mengaktifkan atau menonaktifkan plugin tertentu dari sistem tanpa menghapus filenya.
 * @Version     : 2.1 (No Decorational Emoji & Safe Core Protection)
 */

import { readdirSync } from 'fs';
import { join } from 'path';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let isEnable = /^(onplugin|pon)$/i.test(command);
    let targetText = text;

    if (/^(plugin|plug)$/i.test(command)) {
        const parts = (text || '').trim().split(/\s+/);
        const sub = parts[0]?.toLowerCase();
        if (/^(on|enable|1)$/i.test(sub)) {
            isEnable = true;
            targetText = parts.slice(1).join(' ');
        } else if (/^(off|disable|0)$/i.test(sub)) {
            isEnable = false;
            targetText = parts.slice(1).join(' ');
        } else if (sub === 'list' || sub === 'help' || !sub) {
            targetText = '';
        }
    }
    const actionPast = isEnable ? 'ON' : 'OFF';

    if (!global.db.data.pluginSettings) {
        global.db.data.pluginSettings = {};
    }
    const pluginSettings = global.db.data.pluginSettings;

    const pluginsDir = join(process.cwd(), 'plugins');
    const allPlugins = readdirSync(pluginsDir)
        .filter(file => file.endsWith('.js'))
        .sort();

    if (!targetText) {
        let response =
            `*PANEL KONTROL PLUGIN*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Total Plugin: ${allPlugins.length}\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        const pluginList = allPlugins.map((plugin, index) => {
            const isOff = pluginSettings[plugin]?.disabled;
            const status = isOff ? '[ OFF ]' : '[ ON ]';
            return `${index + 1}. *${plugin.replace('.js', '')}* (${status})`;
        }).join('\n');

        response += pluginList;
        response +=
            `\n\n━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Panduan Penggunaan:*\n` +
            `• \`${usedPrefix}plugin on <nama/nomor>\` - Mengaktifkan plugin\n` +
            `• \`${usedPrefix}plugin off <nama/nomor>\` - Menonaktifkan plugin\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix}plugin off antilink\`\n` +
            `• \`${usedPrefix}plugin on 5\``;

        return m.reply(response);
    }

    let targetPlugin = null;
    const inputAsNumber = parseInt(targetText, 10);

    if (!isNaN(inputAsNumber) && inputAsNumber > 0 && inputAsNumber <= allPlugins.length) {
        targetPlugin = allPlugins[inputAsNumber - 1];
    } else {
        let tempTarget = targetText.trim();
        if (!tempTarget.endsWith('.js')) {
            tempTarget += '.js';
        }
        if (allPlugins.includes(tempTarget)) {
            targetPlugin = tempTarget;
        } else {
            const found = allPlugins.find(p => p.toLowerCase() === tempTarget.toLowerCase());
            if (found) targetPlugin = found;
        }
    }

    if (!targetPlugin) {
        return m.reply(`*Plugin Tidak Ditemukan*\n\nNama atau nomor "${targetText}" tidak terdaftar di direktori plugins.`);
    }

    const protectedPlugins = ['owner-plug.js', 'owner-restart.js', 'owner-exec.js'];
    if (protectedPlugins.includes(targetPlugin) && !isEnable) {
        return m.reply('*Akses Ditolak*\n\nPlugin sistem inti tidak dapat dinonaktifkan.');
    }

    const isCurrentlyDisabled = pluginSettings[targetPlugin]?.disabled === true;

    if (isEnable && !isCurrentlyDisabled) {
        return m.reply(`*Sudah Aktif*\n\nPlugin *${targetPlugin.replace('.js', '')}* saat ini sudah berstatus [ ON ].`);
    }

    if (!isEnable && isCurrentlyDisabled) {
        return m.reply(`*Sudah Nonaktif*\n\nPlugin *${targetPlugin.replace('.js', '')}* saat ini sudah berstatus [ OFF ].`);
    }

    if (!pluginSettings[targetPlugin]) {
        pluginSettings[targetPlugin] = {};
    }
    pluginSettings[targetPlugin].disabled = !isEnable;

    if (global.plugins && global.plugins[targetPlugin]) {
        global.plugins[targetPlugin].disable = !isEnable;
    }

    if (global.saveData) {
        global.saveData('pluginSettings', 'GLOBAL_CONFIG');
    }

    return m.reply(
        `*STATUS PLUGIN DIUBAH*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Nama Plugin:* ${targetPlugin.replace('.js', '')}\n` +
        `• *Status Baru:* [ ${actionPast} ]\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
    );
};

handler.help = ['plugin *on/off nama*']
handler.tags    = ['owner']
handler.command = /^(plugin|plug)$/i
handler.rowner  = true

export default handler