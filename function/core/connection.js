import readline from "readline";
import chalk from "chalk";
import { DisconnectReason, jidNormalizedUser } from '@whiskeysockets/baileys';
import { headerLog } from "./console.js";
import { unlinkSync, readdirSync, existsSync} from "fs";
import { join } from "path";
import { startPremiumScheduler } from "./cek-prem.js";

// ── Pastel Palette ────────────────────────────────────────────────────────────
const p = {
    pink:    chalk.hex('#F9A8D4'),
    blue:    chalk.hex('#93C5FD'),
    purple:  chalk.hex('#C4B5FD'),
    green:   chalk.hex('#6EE7B7'),
    yellow:  chalk.hex('#FDE68A'),
    peach:   chalk.hex('#FDBA74'),
    gray:    chalk.hex('#D1D5DB'),
    dimgray: chalk.hex('#6B7280'),
    red:     chalk.hex('#FCA5A5'),
    white:   chalk.hex('#F9FAFB'),
    cyan:    chalk.hex('#67E8F9'),
};

function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

const W = 50;

function top()    { return p.dimgray('╭' + '─'.repeat(W) + '╮'); }
function bottom() { return p.dimgray('╰' + '─'.repeat(W) + '╯'); }
function divider(label = '') {
    if (!label) return p.dimgray('├' + '─'.repeat(W) + '┤');
    const text  = ` ${label} `;
    const total = W - stripAnsi(text).length;
    const left  = Math.floor(total / 2);
    const right = total - left;
    return (
        p.dimgray('├' + '─'.repeat(left)) +
        p.purple(text) +
        p.dimgray('─'.repeat(right) + '┤')
    );
}
function row(content) {
    const visible = stripAnsi(content).length;
    const pad = Math.max(0, W - 2 - visible);
    return p.dimgray('│') + ' ' + content + ' '.repeat(pad) + ' ' + p.dimgray('│');
}
function kv(key, value, valColor = p.white) {
    return row(p.dimgray(key) + valColor(String(value)));
}
function emptyRow() { return row(''); }

// ── System log shorthand ──────────────────────────────────────────────────────
function syslog(msg, color = p.dimgray) {
    console.log(color(msg));
}

// ── Sleep helper ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ── Pairing ───────────────────────────────────────────────────────────────────
let isPairingRequested = false;

export async function requestPairing(conn) {
    if (!conn.authState.creds.registered && !isPairingRequested) {
        isPairingRequested = true;
        let rl = null;

        try {
            let PhoneNumber = String(global.info?.nomorbot || '').replace(/\D/g, '');
            if (PhoneNumber.startsWith('0')) {
                PhoneNumber = '62' + PhoneNumber.slice(1);
            }

            // Jika belum diatur di settings.js atau masih dummy (< 10 digit), minta input manual
            if (!PhoneNumber || PhoneNumber.length < 10) {
                rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });

                console.clear();
                await sleep(500);

                console.log('');
                console.log(top());
                console.log(divider('Autentikasi'));
                console.log(emptyRow());
                console.log(row(p.pink('  Masukkan nomor WhatsApp bot kamu')));
                console.log(row(p.dimgray('  Contoh  ') + p.blue('628123456789')));
                console.log(emptyRow());
                console.log(divider());
                console.log(row(p.dimgray('  ›')));
                console.log(bottom());
                console.log('');

                const question = text => new Promise(resolve => rl.question(text, resolve));
                while (!PhoneNumber || PhoneNumber.length < 10) {
                    const input = await question(p.purple('  Nomor › '));
                    PhoneNumber = input.replace(/\D/g, '');
                    if (PhoneNumber.startsWith('0')) {
                        PhoneNumber = '62' + PhoneNumber.slice(1);
                    }
                    if (!PhoneNumber || PhoneNumber.length < 10) {
                        console.log(p.red('  [!] Format nomor salah (minimal 10 digit, contoh: 628123456789). Coba lagi.'));
                    }
                }
                rl.close();
                rl = null;
            } else {
                syslog(`[PAIRING] Mengambil nomor dari settings.js: +${PhoneNumber}`, p.blue);
            }

            console.clear();
            syslog('Menunggu koneksi socket siap...', p.yellow);
            await sleep(3000);
            syslog('Meminta kode pairing...', p.yellow);

            const customCode = global.customCode || global.pairingCode || undefined;
            let code = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    code = await conn.requestPairingCode(PhoneNumber, customCode);
                    if (code) break;
                } catch (err) {
                    if (attempt === 3) throw err;
                    syslog(`[PAIRING] Percobaan ${attempt} gagal (${err?.message || err}), mencoba lagi dalam 3s...`, p.yellow);
                    await sleep(3000);
                }
            }
            code = code?.match(/.{1,4}/g)?.join('-') || code;

            console.log('');
            console.log(top());
            console.log(divider('Kode Pairing'));
            console.log(emptyRow());
            console.log(kv('  Nomor   ', PhoneNumber, p.blue));
            console.log(kv('  Kode    ', code,        p.green));
            console.log(emptyRow());
            console.log(divider('Cara Login'));
            console.log(row(p.dimgray('  1. ') + p.gray('Buka WhatsApp di HP kamu')));
            console.log(row(p.dimgray('  2. ') + p.gray('Ketuk Perangkat Tertaut')));
            console.log(row(p.dimgray('  3. ') + p.gray('Tautkan dengan nomor telepon')));
            console.log(row(p.dimgray('  4. ') + p.gray('Masukkan kode di atas')));
            console.log(emptyRow());
            console.log(bottom());
            console.log('');

        } catch (error) {
            syslog(`[PAIRING ERROR] Gagal request kode pairing: ${error?.message || error}`, p.red);
            syslog('Kemungkinan nomor bot salah / belum terdaftar di WhatsApp.', p.yellow);
            syslog('Periksa nomor bot di settings.js atau sessions sebelumnya.', p.yellow);
            isPairingRequested = false;
            if (rl) { try { rl.close(); } catch (_) {} }
            try {
                const credPath = './sessions/creds.json';
                if (existsSync(credPath)) unlinkSync(credPath);
            } catch (_) {}
        }
    }
}

// ── State ─────────────────────────────────────────────────────────────────────
let restartAttempts  = 0;
const MAX_RESTART_ATTEMPTS = 5;
const RESTART_COOLDOWN     = 10_000; // ms

let consecutive428   = 0;
const MAX_RESTART_428 = 3;

let consecutive440   = 0;
const MAX_RESTART_440 = 3;

// FIX: satu flag terpusat, di-reset sebelum reloadHandler agar tidak stuck
let isReconnecting   = false;
let reconnectTimer   = null;

function clearReconnectTimer() {
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
}

// ── Connection Update ─────────────────────────────────────────────────────────
export async function connectionUpdate(update, conn) {
    const { receivedPendingNotifications, connection, lastDisconnect } = update;

    if (connection === 'connecting') {
        console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.white('Menghubungkan ke WhatsApp gateway...'));
        return;
    }

    if (connection === 'open') {
        console.log(p.green('● ') + p.green.bold('[WS] ') + p.white('Koneksi terhubung ke server WhatsApp ') + p.dimgray('(Gateway Ready)'));
        conn?.sendPresenceUpdate?.('available').catch(() => {});
        startPremiumScheduler(conn);
        
        try {
        const _botLid = jidNormalizedUser(conn?.user?.lid)
          if (_botLid && global.db?.data?.settings?.[_botLid]) {
            const _setting = global.db.data.settings[_botLid]
            global.autoRead = _setting.autoread ?? true
          }
        } catch (_) {}

        // Reset semua counter saat berhasil connect
        restartAttempts = 0;
        consecutive428  = 0;
        consecutive440  = 0;
        isReconnecting  = false;
        clearReconnectTimer();

        // Background LID cache
        setTimeout(async () => {
            try {
                const data = await conn.groupFetchAllParticipating();
                for (const group of Object.values(data)) {
                    for (const participant of group.participants) {
                        if (participant.id?.endsWith('@lid') && participant.phoneNumber) {
                            const jid = `${participant.phoneNumber}@s.whatsapp.net`;
                            if (!conn.storeLid) conn.storeLid = {};
                            conn.storeLid[jid] = participant.id;
                        }
                    }
                }
            } catch (_) {}
        }, 30_000);

        return;
    }

    if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const rawReason  = lastDisconnect?.error?.message ?? (typeof lastDisconnect?.error?.toString === 'function' ? lastDisconnect.error.toString() : '');
        const reason     = String(rawReason || 'Unknown');

        console.log(p.red('● ') + p.red.bold('[WS] ') + p.white('Koneksi terputus ') + p.dimgray(`(${reason.slice(0, 35)} | Code: ${statusCode ?? 'N/A'})`));

        // Guard: jangan proses kalau sedang reconnect
        if (isReconnecting) {
            console.log(p.dimgray('● [WS] Sudah dalam antrean reconnect, menunggu...'));
            return;
        }

        // Helper reconnect aman: flag isReconnecting ditahan hingga reloadHandler selesai
        async function triggerReconnect(delayMs = 2000) {
            if (delayMs > 0) await sleep(delayMs);
            try {
                restartAttempts++;
                await global.reloadHandler(true);
            } catch (err) {
                console.error(p.red('[RECONNECT ERROR] Gagal reload handler:'), err?.message || err);
            } finally {
                isReconnecting = false;
            }
        }

        // Terlalu banyak restart → cooldown dulu
        if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow(`Batas restart tercapai (${restartAttempts}x). Cooldown ${RESTART_COOLDOWN / 1000}s...`));
            isReconnecting = true;
            await sleep(RESTART_COOLDOWN);
            restartAttempts = 0;
            await triggerReconnect(0);
            return;
        }

        isReconnecting = true;

        switch (statusCode) {

            // ── Connection Failure / Versi WA Ditolak (405) ──────────────────
            case 405: {
                console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow('Handshake 405 (Versi Baileys ditolak Meta)'));
                const delayMs = Math.min((restartAttempts + 1) * 3_000, 15_000);
                await triggerReconnect(delayMs);
                break;
            }

            // ── Logout permanen ──────────────────────────────────────────────
            case DisconnectReason.loggedOut: {
                console.log(p.red('● ') + p.red.bold('[AUTH] ') + p.red('Sesi logout. Membersihkan sesi lokal...'));
                const sessPath = './sessions';
                if (existsSync(sessPath)) {
                    readdirSync(sessPath).forEach(f => {
                        try { unlinkSync(join(sessPath, f)); } catch (_) {}
                    });
                }
                console.log(p.peach('● [AUTH] Silakan jalankan ulang bot untuk pairing kembali.'));
                isReconnecting = false;
                process.exit(1);
                break;
            }

            // ── Session bermasalah ───────────────────────────────────────────
            case DisconnectReason.badSession:
            case DisconnectReason.multideviceMismatch: {
                console.log(p.red('● ') + p.red.bold('[AUTH] ') + p.red('Bad session / device mismatch. Memuat ulang socket...'));
                await triggerReconnect(2_000);
                break;
            }

            // ── Connection Replaced / Conflict (440) ─────────────────────────
            case DisconnectReason.connectionReplaced:
            case 440: {
                consecutive440++;
                console.log(p.yellow('● ') + p.yellow.bold('[CONFLICT] ') + p.yellow(`Koneksi digantikan perangkat/server lain (440) [${consecutive440}/${MAX_RESTART_440}]`));

                if (consecutive440 >= MAX_RESTART_440) {
                    console.log(p.red('● ') + p.red.bold('[SHUTDOWN] ') + p.red('Sesi aktif di tempat lain. Mematikan bot lokal demi keamanan akun.'));
                    isReconnecting = false;
                    process.exit(0);
                }

                const delayMs = Math.min((consecutive440 + 1) * 3_000, 15_000);
                await triggerReconnect(delayMs);
                break;
            }
            
            // ── Meta Coexistence conflict ───────────────────────────────────────────
            case 463: {
                console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow('Meta Coexistence conflict (463), menunggu reconnect...'));
                const delayMs = Math.min((restartAttempts + 1) * 2_500, 15_000);
                await triggerReconnect(delayMs);
                break;
            }

            // ── Connection Terminated (428) ──────────────────────────────────
            case 428: {
                consecutive428++;
                console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow(`Connection Terminated (428) [${consecutive428}/${MAX_RESTART_428}]`));

                let delayMs = Math.min(consecutive428 * 2_000, 10_000);
                if (consecutive428 >= MAX_RESTART_428) {
                    // Bersihkan session keys Signal (bukan creds.json atau app-state) lalu reconnect
                    console.log(p.red('● ') + p.red.bold('[CLEANER] ') + p.red(`${consecutive428}x 428 berturut-turut, membersihkan session signal keys...`));
                    const sessPath = './sessions';
                    if (existsSync(sessPath)) {
                        readdirSync(sessPath).forEach(f => {
                            if (/^(pre-key|session|sender-key)-/.test(f)) {
                                try { unlinkSync(join(sessPath, f)); } catch (_) {}
                            }
                        });
                    }
                    consecutive428 = 0;
                    delayMs = 3_000;
                }

                await triggerReconnect(delayMs);
                break;
            }

            // ── Server error ─────────────────────────────────────────────────
            case 503:
            case 500: {
                console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow(`Server error (${statusCode}), reconnecting...`));
                const delayMs = Math.min((restartAttempts + 1) * 3_000, 15_000);
                await triggerReconnect(delayMs);
                break;
            }

            // ── Network issue biasa ──────────────────────────────────────────
            case DisconnectReason.connectionClosed:
            case DisconnectReason.connectionLost:
            case DisconnectReason.timedOut: {
                const isHandshakeTimeout = reason.includes('Opening handshake has timed out');
                if (isHandshakeTimeout) {
                    console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow('Handshake timeout (408) — mencoba reconnect IPv4...'));
                } else {
                    console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow(`Network drop (${statusCode ?? 'timeout'})`));
                }
                const baseDelay = isHandshakeTimeout ? 3_000 : 1_500;
                const delayMs = Math.min((restartAttempts + 1) * baseDelay, 15_000);
                await triggerReconnect(delayMs);
                break;
            }

            // ── Restart diminta oleh server ──────────────────────────────────
            case DisconnectReason.restartRequired: {
                console.log(p.blue('● ') + p.blue.bold('[WS] ') + p.blue('Restart required by server'));
                await triggerReconnect(2_000);
                break;
            }

            // ── Stream error ─────────────────────────────────────────────────
            default: {
                let delayMs = 5_000;
                if (reason.includes('Stream Errored') || reason.includes('Connection Failure')) {
                    console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.yellow('Stream errored, reconnecting...'));
                    delayMs = Math.min((restartAttempts + 1) * 5_000, 30_000);
                } else {
                    console.log(p.dimgray('● ') + p.dimgray.bold('[WS] ') + p.dimgray(`Disconnect (${statusCode ?? reason.slice(0, 30)})`));
                }
                await triggerReconnect(delayMs);
                break;
            }
        }
    }

    if (receivedPendingNotifications) {
        console.log(p.yellow('● ') + p.yellow.bold('[WS] ') + p.white('Sinkronisasi pesan tertunda selesai'));
    }
}