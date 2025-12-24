import fs from 'fs';
import path from 'path';
import syntaxError from 'syntax-error';
import { pathToFileURL } from 'url';

let handler = async (m, { conn, usedPrefix, command }) => {
    await m.reply('*Menganalisis semua plugin, mohon tunggu...*');

    const pluginsDir = path.join(process.cwd(), 'plugins');
    const pluginFiles = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'));

    let totalPlugins = 0;
    let validPlugins = 0;
    let errorPlugins = 0;
    let warningPlugins = 0;

    const errorMessages = [];
    const warningMessages = [];

    for (const file of pluginFiles) {
        totalPlugins++;
        const filePath = path.join(pluginsDir, file);
        let hasError = false;

        // 1. Cek Sintaks
        const code = fs.readFileSync(filePath, 'utf8');
        const syntaxErr = syntaxError(code, file, {
            sourceType: 'module',
            allowAwaitOutsideFunction: true,
        });

        if (syntaxErr) {
            errorPlugins++;
            errorMessages.push(`*❌ [ERROR] ${file}*\n\`\`\`${syntaxErr}\`\`\``);
            hasError = true;
            continue; // Skip ke file selanjutnya jika ada error sintaks
        }

        // 2. Cek Struktur & Metadata
        try {
            // Gunakan cache-busting untuk memastikan file dibaca ulang
            const module = await import(`${pathToFileURL(filePath).href}?v=${Date.now()}`);
            const plugin = module.default;

            if (typeof plugin !== 'function') {
                warningPlugins++;
                warningMessages.push(`*⚠️ [WARNING] ${file}*\n- Tidak mengekspor \`default\` sebagai fungsi (handler).`);
                continue;
            }

            const warnings = [];
            if (!plugin.command && !plugin.customPrefix) {
                warnings.push('- Properti `command` atau `customPrefix` tidak ditemukan.');
            }
            if (!plugin.help) {
                warnings.push('- Properti `help` tidak ditemukan (tidak akan tampil di menu).');
            }
            if (!plugin.tags) {
                warnings.push('- Properti `tags` tidak ditemukan (tidak akan dikategorikan).');
            }

            if (warnings.length > 0) {
                warningPlugins++;
                warningMessages.push(`*⚠️ [WARNING] ${file}*\n${warnings.join('\n')}`);
            } else {
                validPlugins++;
            }
        } catch (e) {
            errorPlugins++;
            errorMessages.push(`*❌ [ERROR] ${file}*\n- Gagal saat import modul: \`${e.message}\``);
            hasError = true;
        }
    }

    // 3. Buat Laporan Hasil
    let report = `*LAPORAN VALIDASI PLUGIN*\n\n`;
    report += `*Total Plugin:* ${totalPlugins}\n`;
    report += `*✅ Valid:* ${validPlugins}\n`;
    report += `*❌ Error:* ${errorPlugins}\n`;
    report += `*⚠️ Peringatan:* ${warningPlugins}\n`;

    if (errorMessages.length > 0) {
        report += `\n\n==================================\n`;
        report += `*DETAIL ERROR*\n`;
        report += `_Plugin dengan error tidak akan dimuat dan dapat menyebabkan bot crash._\n\n`;
        report += errorMessages.join('\n\n');
    }

    if (warningMessages.length > 0) {
        report += `\n\n==================================\n`;
        report += `*DETAIL PERINGATAN*\n`;
        report += `_Plugin dengan peringatan mungkin tidak berfungsi sebagaimana mestinya._\n\n`;
        report += warningMessages.join('\n\n');
    }

    if (errorPlugins === 0 && warningPlugins === 0) {
        report += `\n\n*STATUS: SEMPURNA*\nSemua plugin valid dan siap digunakan.`;
    }

    await conn.reply(m.chat, report, m);
};

handler.help = ['checkplugins'];
handler.tags = ['owner'];
handler.command = /^(checkplugins|cekplugin|cp)$/i;
handler.owner = true;

export default handler;