/* XRDHZ-MD - FIXED CONNECTION HANDLER */

import readline from "readline";
import chalk from "chalk";
import { DisconnectReason } from "baileys";
import { headerLog } from "../function/console.js";
import { unlinkSync, readdirSync, existsSync } from "fs";
import { join } from "path";

/**
 * Fungsi untuk membuat pairing kode.
 * @param {ReturnType<typeof makeWASocket>} conn
 */
export async function requestPairing(conn) {
    if (!conn.authState.creds.registered) {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        try {
            console.clear();
            await new Promise(resolve => setTimeout(resolve, 1000));
            console.log(chalk.bold.yellow("=============================================="));
            console.log(chalk.bold.yellow("           AUTENTIKASI WHATSAPP BOT           "));
            console.log(chalk.bold.yellow("=============================================="));
            console.log(chalk.bold.red("• Masukkan Nomor Bot Whatsapp Anda."));
            console.log(chalk.bold.red("• Contoh : 628123456789"));
            const question = text => new Promise(resolve => rl.question(text, resolve));
            let PhoneNumber = await question(chalk.redBright("➢ "));
            PhoneNumber = PhoneNumber.replace(/\D/g, "");
            rl.close();
            if (PhoneNumber) {
                console.clear();
                let code = await conn.requestPairingCode(PhoneNumber);
                code = code?.match(/.{1,4}/g)?.join("-") || code;
                console.log(chalk.bold.green("=============================================="));
                console.log(chalk.bold.green("           KODE AUTENTIKASI WHATSAPP          "));
                console.log(chalk.bold.green("=============================================="));
                console.log(chalk.bold.white(` ➢  NOMOR BOT : ${PhoneNumber}`));
                console.log(chalk.bold.white(" ➢  KODE PAIRING : ") + chalk.bold.green(code));
                console.log(chalk.yellow.bold("\n LANGKAH UNTUK LOGIN"));
                console.log(chalk.white(" 1. Salin Kode dan Buka Whatsapp ditelepon"));
                console.log(chalk.white(" 2. Ketuk Perangkat tertaut, lalu Tautkan perangkat"));
                console.log(chalk.white(" 3. Ketuk Tautkan dengan nomor telepon saja"));
                console.log(chalk.white(" 4. Lalu masukkan kode ditelepon Anda."));
            } else {
                process.exit(1);
            }
        } catch (error) {
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold(`GAGAL MEMINTA KODE PAIRING ❌`)}`);
            console.log(error);
            process.exit(1);
        }
    }
}

/**
 * Clear semua session files kecuali creds.json
 */
function clearCorruptedSessions() {
    const sessionsPath = './sessions';
    if (!existsSync(sessionsPath)) {
        console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.yellow("Folder sessions tidak ditemukan")}`);
        return;
    }

    try {
        const files = readdirSync(sessionsPath);
        let deletedCount = 0;
        
        for (const file of files) {
            // Skip creds.json dan file .backup
            if (file === 'creds.json' || file.endsWith('.backup')) {
                continue;
            }
            
            const filePath = join(sessionsPath, file);
            
            try {
                unlinkSync(filePath);
                deletedCount++;
            } catch (error) {
                console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.red.bold(`Gagal menghapus ${file}`)}`);
            }
        }
        
        if (deletedCount > 0) {
            console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.green.bold(`✅ Berhasil membersihkan ${deletedCount} file sessions usang.`)}`);
        }
    } catch (error) {
        console.log(`${chalk.white.bold(" [SESSION-CLEANER]")} ${chalk.red.bold(`Error: ${error.message}`)}`);
    }
}

/**
 * Fungsi untuk update koneksi dengan FIXED ERROR HANDLING
 * @param {*} update
 * @param {ReturnType<typeof makeWASocket>} conn
 */
export async function connectionUpdate(update, conn) {
    const { receivedPendingNotifications, connection, lastDisconnect, isOnline, isNewLogin } = update;
    
    try {
        if (isNewLogin) await headerLog();
    } catch (e) {
        console.log(e);
    }

    try {
        if (connection === "open") {
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`TERHUBUNG ✅`)}`);
            return true;
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            const errorMessage = lastDisconnect?.error?.message || '';
            
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold(`KONEKSI TERPUTUS`)}`);
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`Status Code: ${statusCode}`)}`);
            
            // === HANDLE SPECIFIC ERROR CODES ===
            
            // LOGGED OUT - Hapus semua sessions
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("❌ BOT LOGGED OUT!")}`);
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Menghapus semua sessions...")}`);
                
                const sessionsPath = './sessions';
                if (existsSync(sessionsPath)) {
                    const files = readdirSync(sessionsPath);
                    for (const file of files) {
                        try {
                            unlinkSync(join(sessionsPath, file));
                        } catch {}
                    }
                }
                
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Silakan restart bot dan re-pair")}`);
                process.exit(1);
            }
            
            // AUTH ERRORS (428, 401, 403, 515, 503, dll)
            const authErrorCodes = [428, 401, 403, 515, 503, 500];
            const isAuthError = 
                authErrorCodes.includes(statusCode) || 
                errorMessage.toLowerCase().includes('auth') || 
                errorMessage.toLowerCase().includes('stream error') ||
                errorMessage.toLowerCase().includes('connection') ||
                errorMessage.toLowerCase().includes('terminated');

            if (isAuthError) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("⚠️  AUTH/STREAM ERROR DETECTED!")}`);
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Membersihkan corrupted sessions...")}`);
                
                // Clear corrupted sessions (kecuali creds.json)
                clearCorruptedSessions();
                
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Reconnecting dengan fresh session...")}`);
                
                // Delay sebelum reconnect
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Reload handler dengan restart connection
                await global.reloadHandler(true);
                
                return false;
            }

            // BAD SESSION - Restart dengan clean
            if (statusCode === DisconnectReason.badSession) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("⚠️  BAD SESSION!")}`);
                clearCorruptedSessions();
                await new Promise(resolve => setTimeout(resolve, 3000));
                await global.reloadHandler(true);
                return false;
            }

            // CONNECTION CLOSED - Normal reconnect
            if (statusCode === DisconnectReason.connectionClosed) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("CONNECTION CLOSED - Reconnecting...")}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await global.reloadHandler(true);
                return false;
            }

            // CONNECTION LOST - Reconnect
            if (statusCode === DisconnectReason.connectionLost) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("CONNECTION LOST - Reconnecting...")}`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                await global.reloadHandler(true);
                return false;
            }

            // RESTART REQUIRED
            if (statusCode === DisconnectReason.restartRequired) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("RESTART REQUIRED - Restarting...")}`);
                await global.reloadHandler(true);
                return false;
            }

            // TIMED OUT
            if (statusCode === DisconnectReason.timedOut) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("TIMED OUT - Reconnecting...")}`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                await global.reloadHandler(true);
                return false;
            }

            // DEFAULT - Reconnect jika shouldReconnect = true
            if (shouldReconnect) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`RECONNECTING... (Code: ${statusCode})`)}`);
                await new Promise(resolve => setTimeout(resolve, 3000));
                await global.reloadHandler(true);
            }
        }

        if (receivedPendingNotifications) {
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellowBright.bold(`MENUNGGU PESAN MASUK 📥`)}`);
        }

        return false;
    } catch (error) {
        console.error('Connection update error:', error);
        
        // Jika error saat handle connection, coba clean & reconnect
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Unexpected error, attempting recovery...")}`);
        clearCorruptedSessions();
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        await global.reloadHandler(true);
        
        return false;
    }
}