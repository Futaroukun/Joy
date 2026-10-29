import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execute = promisify(exec);
const RESTART_EXIT_CODE = 42;

function isPM2() {
    return process.env.pm_id !== undefined;
}

const handler = async (m, { conn, isOwner }) => {
    if (!isOwner) return m.reply('Fitur ini khusus untuk owner.');

    // Bersihkan database & tutup socket WhatsApp secara rapi sebelum keluar
    const gracefulCleanup = async () => {
        try {
            if (conn?.sendPresenceUpdate) {
                await conn.sendPresenceUpdate('unavailable').catch(() => {});
            }
        } catch {}

        try {
            if (global.sqlite?.open) {
                global.sqlite.pragma('wal_checkpoint(TRUNCATE)');
            }
        } catch (e) {
            console.error('[RESTART DB FLUSH ERROR]', e.message);
        }

        try {
            if (conn?.ws) {
                conn.ws.close();
                conn.end?.();
            }
        } catch {}
    };
  
    if (isPM2()) {
        const pmId   = process.env.pm_id;
        const pmName = process.env.name || 'bot';

        await m.reply(`Memulai restart...\n_PM2 · ${pmName} (id: ${pmId})_`);
        await gracefulCleanup();

        try {
            await execute(`pm2 restart ${pmId}`);
        } catch (e) {
            await conn.reply(m.chat, `Restart gagal.\n\n_${e.message}_`, m);
        }

    } else if (typeof process.send === 'function') {
        // node start.js (Supervisor dengan IPC): kirim exit code 42
        await m.reply('Memulai restart...\n_Runtime: node (supervisor start.js)_');
        setTimeout(async () => {
            await gracefulCleanup();
            process.exit(RESTART_EXIT_CODE);
        }, 800);

    } else {
        // node main.js langsung (standalone)
        await m.reply('Memulai restart...\n_Runtime: node (standalone)_');
        setTimeout(async () => {
            await gracefulCleanup();
            try {
                const startScript = path.join(process.cwd(), 'start.js');
                const mainScript  = path.join(process.cwd(), 'main.js');
                const targetScript = fs.existsSync(startScript) ? startScript : mainScript;

                const child = spawn(process.argv[0], [targetScript], {
                    detached: true,
                    stdio: 'inherit',
                    cwd: process.cwd()
                });
                child.unref();
                process.exit(0);
            } catch (err) {
                console.error('[RESTART ERROR]', err);
                process.exit(1);
            }
        }, 800);
    }
};

handler.help    = ['restart'];
handler.tags    = ['owner'];
handler.command = /^(restart|reboot)$/i;
handler.owner   = true;

export default handler;