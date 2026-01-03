import cp from 'child_process';
import { promisify } from 'util';

const exec = promisify(cp.exec).bind(cp);

let handler = async (m, { conn, usedPrefix }) => {
    // Pesan tunggu, biar keliatan keren
    await conn.reply(m.chat, '*Menganalisis perubahan file di repositori...*', m);

    try {
        // Jalankan git status dengan format yang mudah diparsing
        const { stdout, stderr } = await exec('git status --porcelain');

        // Kalau ada error dari git (misal bukan repo git)
        if (stderr) {
            return conn.reply(m.chat, `*GIT ERROR:*\n${stderr}`, m);
        }

        // Kalau tidak ada perubahan
        if (!stdout.trim()) {
            return conn.reply(m.chat, '*STATUS GIT: BERSIH*\n\nTidak ada perubahan file yang terdeteksi. Repositori lu sinkron dengan commit terakhir.', m);
        }

        // Olah data perubahannya
        const lines = stdout.trim().split('\n');
        const changes = {
            modified: [],
            added: [],
            deleted: [],
            untracked: []
        };

        for (const line of lines) {
            const status = line.substring(0, 2).trim();
            const file = line.substring(3).trim();

            switch (status) {
                case 'M':
                    changes.modified.push(file);
                    break;
                case 'A':
                    changes.added.push(file);
                    break;
                case 'D':
                    changes.deleted.push(file);
                    break;
                case '??':
                    changes.untracked.push(file);
                    break;
            }
        }

        // Rakit pesan balasan
        let message = '*ANALISIS PERUBAHAN GIT*\n\nBerikut adalah ringkasan perubahan file sejak commit terakhir:\n';

        if (changes.modified.length > 0) {
            message += `\n*🔄 Diubah (${changes.modified.length}):*\n` + changes.modified.map(f => `  • \`${f}\``).join('\n');
        }
        if (changes.added.length > 0) {
            message += `\n\n*✨ Ditambahkan (staged):*\n` + changes.added.map(f => `  • \`${f}\``).join('\n');
        }
        if (changes.deleted.length > 0) {
            message += `\n\n*🗑️ Dihapus (${changes.deleted.length}):*\n` + changes.deleted.map(f => `  • \`${f}\``).join('\n');
        }
        if (changes.untracked.length > 0) {
            message += `\n\n*❓ File Baru (untracked):*\n` + changes.untracked.map(f => `  • \`${f}\``).join('\n');
        }

        message += `\n\nLu bisa upload perubahan ini pake command \`${usedPrefix}update <pesan commit>\`.`;

        await conn.reply(m.chat, message, m);

    } catch (e) {
        await conn.reply(m.chat, `*GAGAL MENJALANKAN PERINTAH:*\n${e.message}`, m);
    }
};

handler.help = ['gitstatus'];
handler.tags = ['owner'];
handler.command = /^(gitstatus|status|cekupdate)$/i;
handler.owner = true;

export default handler;