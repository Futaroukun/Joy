/* XRDHZ-MD
  Script ini tidak untuk diperjual-belikan atau gratis.
  Script masih dalam tahap pengembangan mungkin akan ada bug, error dan lain sebagainya.
*/

import readline from "readline";
import chalk from "chalk";
import { DisconnectReason } from "baileys";
import { headerLog } from "../function/console.js";
import { unlinkSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { clearSessionFiles } from './auto-clear-sessions.js';

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
 * Fungsi untuk update koneksi dengan auth error handling
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
            const errorMessage = lastDisconnect?.error?.message || '';
            
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold(`GAGAL TERHUBUNG ❌`)}`);
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`Status Code: ${statusCode}`)}`);
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`Error: ${errorMessage}`)}`);

            // Handle AUTH ERRORS (428, 401, 403, dll)
            const authErrorCodes = [428, 401, 403, 515];
            const isAuthError = 
                authErrorCodes.includes(statusCode) || 
                errorMessage.includes('auth') || 
                errorMessage.includes('authenticate') ||
                errorMessage.includes('Unsupported state');

            if (isAuthError) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("⚠️  AUTH ERROR DETECTED!")}`);
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Cleaning corrupted sessions...")}`);
                
                // Clear sessions kecuali creds.json
                clearSessionFiles();
                
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Attempting to reconnect with fresh session...")}`);
                
                // Delay sebelum reconnect
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // Reload dengan connection restart
                await global.reloadHandler(true);
                
                return false;
            }

            // Handle LOGGED OUT
            if (statusCode === DisconnectReason.loggedOut) {
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("❌ BOT LOGGED OUT!")}`);
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Clearing all sessions...")}`);
                
                // Clear semua termasuk creds.json karena logged out
                const sessionsPath = './sessions';
                if (existsSync(sessionsPath)) {
                    const files = readdirSync(sessionsPath);
                    for (const file of files) {
                        try {
                            unlinkSync(join(sessionsPath, file));
                        } catch {}
                    }
                }
                
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Please restart and re-pair the bot")}`);
                process.exit(1);
            }

            // Handle NORMAL DISCONNECT (reconnect)
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`MENGHUBUNGKAN KEMBALI 🌐`)}`);
            await global.reloadHandler(true);
        }

        if (receivedPendingNotifications) {
            console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellowBright.bold(`MENUNGGU PESAN MASUK 📥`)}`);
        }

        return false;
    } catch (error) {
        console.error('Connection update error:', error);
        
        // Jika error saat handle connection, coba clean & reconnect
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Unexpected error, attempting recovery...")}`);
        clearSessionFiles();
        
        await new Promise(resolve => setTimeout(resolve, 3000));
        await global.reloadHandler(true);
        
        return false;
    }
}