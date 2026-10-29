/*
- @Author     : Rafli
- @Feature    : Sfile.co Toolkit (Search, Bypass Downloader, Resumable Uploader, Account Management)
- @Description: Fitur Sfile.co lengkap: Cari file, unduh langsung tanpa iklan, unggah media/dokumen ke akun pribadi, dan manajemen akun/saldo khusus owner via (.sfile akun).
*/

import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import { sfile } from '../function/scrapers/sfile.js';

let handler = async (m, { conn, text, args, usedPrefix, command, isOwner }) => {
    let cmd = (command || '').toLowerCase();
    let sub = (args[0] || '').toLowerCase();
    let subArgs = args.slice(1).join(' ');

    // ── DIRECT COMMAND ALIASES ───────────────────────────────────────────────
    if (cmd === 'sfilesearch') {
        sub = 'search';
        subArgs = text;
    } else if (cmd === 'sfiledl') {
        sub = 'dl';
        subArgs = text;
    } else if (cmd === 'sfileup') {
        sub = 'up';
        subArgs = text;
    } else if (cmd === 'sfilestats') {
        sub = 'stats';
    } else if (cmd === 'sfilemyfiles') {
        sub = 'myfiles';
    }

    // ── HELP CARD (JIKA TANPA ARGUMEN ATAU .sfile help) ──────────────────────
    if (!sub || sub === 'help') {
        let helpText =
            `*PANDUAN TOOLKIT SFILE.CO*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `• *Pencarian File:*\n` +
            `  \`${usedPrefix}sfile search <kata kunci>\`\n` +
            `  _Contoh: \`${usedPrefix}sfile search whatsapp mod\`_\n\n` +
            `• *Download File Langsung (Bypass Iklan):*\n` +
            `  \`${usedPrefix}sfile dl <link sfile.co>\`\n` +
            `  _Contoh: \`${usedPrefix}sfile dl https://sfile.co/QM9e4wLMLOE\`_\n\n` +
            `• *Upload Media / Dokumen:*\n` +
            `  Reply file/dokumen/foto/video lalu ketik:\n` +
            `  \`${usedPrefix}sfile up [deskripsi file]\`\n\n`;

        if (isOwner) {
            helpText +=
                `*MANAJEMEN AKUN OWNER:*\n` +
                `• *Dashboard & Saldo Akun:*\n` +
                `  \`${usedPrefix}sfile akun\`\n` +
                `• *Daftar File Akun:*\n` +
                `  \`${usedPrefix}sfile akun files\`\n` +
                `• *Login / Ganti Akun:*\n` +
                `  \`${usedPrefix}sfile akun login <email> <password>\`\n\n`;
        }

        helpText += `━━━━━━━━━━━━━━━━━━━━━━`;
        return m.reply(helpText.trim());
    }

    // ── 1. MANAJEMEN AKUN OWNER (.sfile akun / .sfile stats / .sfile myfiles) ─
    if (sub === 'akun' || sub === 'account' || sub === 'stats' || sub === 'myfiles' || sub === 'login') {
        if (!isOwner) return m.reply('Menu manajemen akun Sfile hanya dapat diakses oleh Owner bot.');

        const akunAction = (args[1] || '').toLowerCase();
        const akunParam = args.slice(2).join(' ');

        // A. Login / Konfigurasi Akun (.sfile akun login <email> <password>)
        if (sub === 'login' || akunAction === 'login' || akunAction === 'auth') {
            const rawCreds = sub === 'login' ? subArgs : akunParam;
            const [email, pass] = rawCreds.split(/\s+/);
            if (!email || !pass) {
                return m.reply(`*Format:* \`${usedPrefix}sfile akun login <email> <password>\``);
            }

            await m.reply('_Sedang melakukan autentikasi ke Sfile.co..._');
            try {
                await sfile.login(email, pass);
                return m.reply(`*LOGIN BERHASIL*\n\nAkun *${email}* berhasil terhubung ke sistem Sfile bot.`);
            } catch (e) {
                return m.reply(`*LOGIN GAGAL*\n\nAlasan: ${e.message}`);
            }
        }

        // B. Daftar File Akun (.sfile akun files / .sfile myfiles)
        if (sub === 'myfiles' || akunAction === 'files' || akunAction === 'file' || akunAction === 'list') {
            await m.reply('_Mengambil daftar file dari akun Sfile..._');
            try {
                const data = await sfile.getMyFiles();

                let txt = `*DAFTAR FILE SAYA (SFILE.CO)*\n`;
                txt += `• Akun: ${data.email}\n`;
                txt += `• Penyimpanan: ${data.storageUsed} / 20 GB\n`;
                txt += `• Total Download: ${data.totalDownloads}\n`;
                txt += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

                if (!data.files || data.files.length === 0) {
                    txt += `_Belum ada file yang terdaftar di akun._`;
                } else {
                    data.files.slice(0, 15).forEach((f, i) => {
                        txt += `*${i + 1}. ${f.name}*\n   • Link: \`${f.url}\`\n   • Download: \`${usedPrefix}sfile dl ${f.url}\`\n\n`;
                    });
                }

                txt += `━━━━━━━━━━━━━━━━━━━━━━`;
                return m.reply(txt.trim());
            } catch (e) {
                return m.reply(`Gagal mengambil file akun: ${e.message}`);
            }
        }

        // C. Dashboard Akun & Saldo (.sfile akun / .sfile stats)
        await m.reply('_📊 Mengambil data statistik & pendapatan akun Sfile..._');
        try {
            const stats = await sfile.getAccountStats();
            const storageData = await sfile.getMyFiles().catch(() => ({ storageUsed: '0 B', totalDownloads: '0', files: [] }));

            const sections = [
                {
                    title: "Kelola Akun Sfile",
                    rows: [
                        {
                            header: "Daftar File",
                            title: "Lihat File Saya",
                            description: `Total: ${storageData.files?.length || 0} file (${storageData.storageUsed})`,
                            id: `${usedPrefix}sfile akun files`
                        },
                        {
                            header: "Statistik Saldo",
                            title: "💰 Cek Pendapatan & Saldo",
                            description: `Saldo: ${stats.currentBalance} • Total: ${stats.totalEarnings}`,
                            id: `${usedPrefix}sfile stats`
                        },
                        {
                            header: "Unggah File",
                            title: "📤 Panduan Upload",
                            description: "Cara upload media/dokumen ke akun Sfile",
                            id: `${usedPrefix}sfile up`
                        }
                    ]
                }
            ];

            const bodyText =
                `*Email Akun:* ${stats.email}\n` +
                `*Saldo Tersedia:* ${stats.currentBalance}\n` +
                `*Total Pendapatan:* ${stats.totalEarnings}\n` +
                `*Download Hari Ini:* ${stats.downloadsToday} kali\n` +
                `*Pendapatan Hari Ini:* ${stats.earningsToday}\n` +
                `*Penyimpanan Terpakai:* ${storageData.storageUsed} / 20 GB\n\n` +
                `Silakan pilih menu di bawah untuk mengelola akun:`;

            try {
                return await conn.sendButton(m.chat, {
                    header: "DASHBOARD AKUN SFILE.CO",
                    body: bodyText,
                    footer: `© ${global.info?.namabot || 'Joy'} • SFILE.CO`,
                    buttons: [{
                        name: "single_select",
                        buttonParamsJson: JSON.stringify({ title: "PILIH MENU AKUN", sections })
                    }]
                }, { quoted: m });
            } catch {
                let txt = `*DASHBOARD AKUN SFILE.CO*\n━━━━━━━━━━━━━━━━━━━━━━\n\n${bodyText}\n\n`;
                txt += `*Sub-Perintah Akun:*\n`;
                txt += `• \`${usedPrefix}sfile akun files\` — Lihat file akun\n`;
                txt += `• \`${usedPrefix}sfile akun login <email> <pass>\` — Ganti akun\n`;
                txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
                txt += `_Tarik saldo atau kelola payout di:_ https://sfile.co/user/v1/payouts`;
                return m.reply(txt.trim());
            }
        } catch (e) {
            return m.reply(`Gagal mengambil data akun: ${e.message}`);
        }
    }

    // ── 2. PENCARIAN FILE (.sfile search <query>) ────────────────────────────
    if (sub === 'search' || sub === 'cari') {
        const query = subArgs || args.slice(1).join(' ');
        if (!query) return m.reply(`Masukkan kata kunci pencarian!\n\nContoh: \`${usedPrefix}sfile search config hc\``);

        await m.reply(`_Mencari file "${query}" di Sfile.co..._`);
        try {
            const results = await sfile.search(query);
            if (!results || results.length === 0) {
                return m.reply(`Tidak ditemukan file dengan kata kunci *"${query}"*.`);
            }

            let txt = `*HASIL PENCARIAN SFILE.CO*\n`;
            txt += `Kata Kunci: *${query}*\n`;
            txt += `Total Ditemukan: *${results.length} file*\n`;
            txt += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

            results.slice(0, 10).forEach((item, index) => {
                txt += `*${index + 1}. ${item.title}*\n`;
                txt += `  • Ukuran: ${item.size}\n`;
                txt += `  • Tanggal: ${item.date}\n`;
                txt += `  • Download: \`${usedPrefix}sfile dl ${item.url}\`\n\n`;
            });

            txt += `━━━━━━━━━━━━━━━━━━━━━━\n`;
            txt += `_Ketik \`${usedPrefix}sfile dl <link>\` untuk mendownload langsung._`;

            return m.reply(txt.trim());
        } catch (e) {
            return m.reply(`Gagal mencari file: ${e.message}`);
        }
    }

    // ── 3. DOWNLOAD LANGSUNG (.sfile dl <link>) ──────────────────────────────
    if (sub === 'dl' || sub === 'download' || sub === 'get' || /^https?:\/\/sfile\.co\//i.test(sub)) {
        const targetUrl = /^https?:\/\/sfile\.co\//i.test(sub) ? sub : subArgs;
        if (!targetUrl || !targetUrl.includes('sfile.co/')) {
            return m.reply(`Masukkan link file Sfile yang valid!\n\nContoh: \`${usedPrefix}sfile dl https://sfile.co/QM9e4wLMLOE\``);
        }

        await m.reply('_⚡ Memproses dan melewati halaman iklan Sfile..._');
        try {
            const info = await sfile.download(targetUrl);

            // Cek batas ukuran download (maksimal 100MB untuk kestabilan RAM bot)
            if (info.sizeBytes > 100 * 1024 * 1024) {
                return m.reply(
                    `*FILE TERLALU BESAR*\n\n` +
                    `• *Nama:* ${info.title}\n` +
                    `• *Ukuran:* ${info.size}\n\n` +
                    `Ukuran file melebihi limit pengiriman bot (Maks 100 MB).\n` +
                    `Silakan download langsung melalui browser via link direct berikut:\n${info.downloadUrl}`
                );
            }

            await m.reply(`_⬇️ Mengunduh file: *${info.title}* (${info.size})..._`);

            const fileRes = await axios.get(info.downloadUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    'Referer': info.referer,
                    'Cookie': info.cookies
                },
                responseType: 'arraybuffer',
                timeout: 120000
            });

            const buffer = Buffer.from(fileRes.data);

            return await conn.sendMessage(m.chat, {
                document: buffer,
                fileName: info.title,
                mimetype: info.mimetype || 'application/octet-stream',
                caption: `*DOWNLOAD SELESAI*\n\n• *Nama:* ${info.title}\n• *Ukuran:* ${info.size}\n• *Sumber:* ${targetUrl}`
            }, { quoted: m });

        } catch (e) {
            return m.reply(`Gagal mendownload file: ${e.message}`);
        }
    }

    // ── 4. UPLOAD KE SFILE (.sfile up [deskripsi]) ───────────────────────────
    if (sub === 'up' || sub === 'upload') {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';
        const isMedia = /image|video|audio|document|sticker/.test(mime) || /image|video|audio|document|sticker/.test(q.mtype || '');

        // Validasi: Harus me-reply pesan atau mengirim media dengan caption
        if (!isMedia && !m.quoted) {
            return m.reply(
                `*CARA UPLOAD KE SFILE.CO*\n\n` +
                `• *Kirim Media:* Kirim file/foto/video/audio/dokumen dengan caption \`${usedPrefix + command} up [deskripsi]\`\n` +
                `• *Reply Media/Teks:* Reply file atau pesan teks dengan perintah \`${usedPrefix + command} up [deskripsi]\``
            );
        }

        // Jika quoted adalah teks biasa (bukan media)
        if (!isMedia && m.quoted && !m.quoted.text) {
            return m.reply('Pesan yang di-reply tidak memiliki konten/media yang dapat diunggah.');
        }

        const maxBytes = 150 * 1024 * 1024; // Maksimal 150 MB

        // Cek awal dari metadata pesan jika tersedia
        const estimatedSize = q.msg?.fileLength?.low || q.msg?.fileLength || 0;
        if (estimatedSize > maxBytes) {
            return m.reply(
                `*FILE TERLALU BESAR*\n\n` +
                `Ukuran file (*${(estimatedSize / (1024 * 1024)).toFixed(1)} MB*) melebihi batas maksimal upload (*150 MB*).\n` +
                `Silakan gunakan file yang lebih kecil.`
            );
        }

        await m.reply('_📤 Mengunggah file ke Sfile.co..._');
        try {
            let buffer;
            let fileName = 'file_' + Date.now();

            if (isMedia) {
                buffer = await q.download?.();
                if (!buffer) throw new Error('Gagal mengunduh media dari pesan.');

                const explicitName = q.fileName || q.filename || q.msg?.fileName || q.msg?.filename;
                if (explicitName) {
                    fileName = explicitName;
                } else {
                    let ext = '';
                    if (mime) {
                        ext = mime.split('/')[1]?.split(';')[0]?.replace('vnd.android.package-archive', 'apk') || '';
                        if (ext === 'jpeg') ext = 'jpg';
                    }
                    if (!ext) {
                        const ft = await fileTypeFromBuffer(buffer).catch(() => null);
                        ext = ft?.ext || 'bin';
                    }
                    fileName = `file_${Date.now()}.${ext}`;
                }
            } else {
                buffer = Buffer.from(m.quoted.text);
                fileName = `catatan_${Date.now()}.txt`;
            }

            if (buffer.length > maxBytes) {
                return m.reply(
                    `*FILE TERLALU BESAR*\n\n` +
                    `Ukuran file (*${(buffer.length / (1024 * 1024)).toFixed(1)} MB*) melebihi batas maksimal upload (*150 MB*).\n` +
                    `Silakan gunakan file yang lebih kecil.`
                );
            }

            const desc = subArgs || 'Uploaded via Joy WhatsApp Bot';
            const result = await sfile.upload(buffer, fileName, desc);

            return m.reply(
                `*UPLOAD BERHASIL*\n` +
                `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `• *Nama File:* ${result.name}\n` +
                `• *Ukuran:* ${result.size}\n` +
                `• *Status Akun:* ${result.isUserAuth ? 'Tersimpan di Akun Pribadi ' : 'Guest Upload (Anonim)'}\n` +
                `• *Link Download:* \`${result.url}\`\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            return m.reply(`Gagal mengunggah file: ${e.message}`);
        }
    }

    // Fallback: Jika pengguna langsung mengetik kata kunci pencarian
    return handler(m, { conn, text: `search ${text}`, args: ['search', ...args], usedPrefix, command, isOwner });
};

handler.help = ['sfile *search/dl/up*']
handler.tags    = ['downloader']
handler.command = /^(sfile|sfilesearch|sfiledl|sfileup)$/i

export default handler
