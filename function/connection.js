import readline from "readline";
import chalk from "chalk";
import { DisconnectReason } from '@whiskeysockets/baileys';
import { headerLog } from "../function/console.js";
import { clearSessionFiles } from "./auto-clear-sessions.js";
import { unlinkSync, readdirSync, existsSync } from "fs";
import { join } from "path";

/**
- Fungsi untuk membuat pairing kode.
- @param {ReturnType<typeof makeWASocket>} conn
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
- Fungsi untuk update koneksi dengan LOGIKA RECONNECT YANG AGRESIF (FIX ERROR 428)
- @param {*} update
- @param {ReturnType<typeof makeWASocket>} conn
 */
export async function connectionUpdate(update, conn) {
    const { receivedPendingNotifications, connection, lastDisconnect, isOnline, isNewLogin } = update;
    
    try {
        if (isNewLogin) await headerLog();
    } catch (e) {
        console.log(e);
    }
    
    if (connection === "connecting") {
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`MENCOBA TERHUBUNG... ⏳`)}`);
        return;
    }
    
    if (connection === "open") {
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`TERHUBUNG ✅`)}`);
        return;
    }

    if (connection === "close") {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.toString() || "Unknown Reason";
        
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold(`KONEKSI TERPUTUS`)}`);
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold(`Penyebab: ${reason} (Code: ${statusCode})`)}`);

        // === LOGIKA PERBAIKAN DI SINI ===

        switch (statusCode) {
            // 1. FATAL: Logged Out -> Hapus semua session & matikan bot
            case DisconnectReason.loggedOut:
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("❌ BOT LOGGED OUT! Sesi tidak valid.")}`);
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Menghapus semua file sessions...")}`);
                
                // Pastikan folder ini sesuai dengan settingan bot kamu
                const sessionsPath = './sessions'; 
                if (existsSync(sessionsPath)) {
                    readdirSync(sessionsPath).forEach(file => {
                        try { unlinkSync(join(sessionsPath, file)); } catch {}
                    });
                }
                
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Silakan restart bot dan lakukan pairing ulang.")}`);
                process.exit(1);
                break;

            // 2. FATAL: Sesi Buruk / Error Auth -> Bersihkan session & hard restart
            case DisconnectReason.badSession:
            case DisconnectReason.connectionReplaced:
            case DisconnectReason.multideviceMismatch:
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("⚠️  Sesi tidak valid atau digantikan. Resetting...")}`);
                await clearSessionFiles();
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Melakukan hard restart...")}`);
                await global.reloadHandler(true);
                break;

            // 3. SEMENTARA: Masalah Jaringan (TERMASUK FIX 428 DISINI)
            // KITA PAKSA RESTART SUPAYA TIDAK STUCK
            case 428: // <-- Code Error yang kamu alami
            case DisconnectReason.connectionClosed:
            case DisconnectReason.connectionLost:
            case DisconnectReason.timedOut:
            case DisconnectReason.restartRequired:
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellow.bold("Masalah jaringan (428/Timeout). Memaksa restart koneksi...")}`);
                
                // FIX: Memanggil reloadHandler agar bot nyambung lagi
                await global.reloadHandler(true); 
                break;

            // 4. DEFAULT: Untuk error lain yang tidak terduga
            default:
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.magenta.bold("Error tidak dikenal. Memaksa restart...")}`);
                await global.reloadHandler(true);
                break;
        }
    }
    
    if (receivedPendingNotifications) {
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.yellowBright.bold(`MENUNGGU PESAN MASUK 📥`)}`);
    }
}
