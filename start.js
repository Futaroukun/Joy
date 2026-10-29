import { spawn, execSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import chalk from "chalk";
import dns from "dns";

dns.setDefaultResultOrder?.("ipv4first");
if (existsSync(".env") && typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(".env"); } catch (_) {}
}
if (!process.env.NODE_OPTIONS?.includes("--dns-result-order=ipv4first")) {
    process.env.NODE_OPTIONS = ((process.env.NODE_OPTIONS || "") + " --dns-result-order=ipv4first").trim();
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAIN_FILE = path.join(__dirname, "main.js");
const localTmp = path.join(__dirname, "tmp");
if (!existsSync(localTmp)) mkdirSync(localTmp, { recursive: true });
process.env.TMPDIR = localTmp;

const npmrcFile = path.join(__dirname, ".npmrc");
if (!existsSync(npmrcFile)) {
    writeFileSync(npmrcFile, "legacy-peer-deps=true\nallow-git=all\n");
}

const RESTART_EXIT_CODE = 42;

const MAX_CRASH_RESTART = 5;
const CRASH_WINDOW_MS   = 60_000; // 1 menit
const RESTART_DELAY_MS  = 3_000;
const MAX_REBUILD_ATTEMPTS = 2;

let crashCount       = 0;
let crashWindowStart = Date.now();
let rebuildAttempts  = 0;
let currentProcess   = null;

const REBUILD_ERROR_REGEX = /NODE_MODULE_VERSION|was compiled against a different Node\.js|Could not locate the bindings file|invalid ELF header|No native build was found|ERR_DLOPEN_FAILED/i;

function log(msg, color = chalk.white) {
    console.log(color(msg));
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractNativeModule(errorText) {
    const nodeFileMatch = errorText.match(/node_modules[\\/]((?:@[a-z0-9-_.]+[\\/])?[a-z0-9-_.]+)[\\/][^\n\r]*?\.node/i);
    if (nodeFileMatch && nodeFileMatch[1]) {
        return nodeFileMatch[1].replace(/\\/g, '/');
    }
    const generalMatch = errorText.match(/node_modules[\\/]((?:@[a-z0-9-_.]+[\\/])?[a-z0-9-_.]+)[\\/]/i);
    if (generalMatch && generalMatch[1]) {
        return generalMatch[1].replace(/\\/g, '/');
    }
    return null;
}

function checkAndAutoRebuild(errorText) {
    if (!REBUILD_ERROR_REGEX.test(errorText)) return false;

    if (rebuildAttempts >= MAX_REBUILD_ATTEMPTS) {
        log(`[AUTO-REPAIR] Batas percobaan rebuild (${MAX_REBUILD_ATTEMPTS}x) tercapai. Melewati auto-rebuild.`, chalk.red);
        return false;
    }

    rebuildAttempts++;
    const targetModule = extractNativeModule(errorText);
    const cmd = targetModule ? `npm rebuild ${targetModule} --allow-scripts` : "npm rebuild --allow-scripts";

    log(`[AUTO-REPAIR] Modul native butuh rebuild terdeteksi: ${targetModule || "all"}`, chalk.yellow.bold);
    log(`[AUTO-REPAIR] Menjalankan '${cmd}'...`, chalk.cyan);

    try {
        execSync(cmd, { stdio: "inherit", cwd: __dirname });
        log(`[AUTO-REPAIR] Rebuild berhasil! Merestart Joy...`, chalk.green.bold);
        return true;
    } catch (err) {
        log(`[AUTO-REPAIR] Gagal rebuild: ${err.message}`, chalk.red.bold);
        return false;
    }
}

async function startBot() {
    let stderrBuffer = "";

    currentProcess = spawn(process.argv[0], [MAIN_FILE, ...process.argv.slice(2)], {
        stdio: ["inherit", "inherit", "pipe", "ipc"],
        env: { ...process.env }
    });

    if (currentProcess.stderr) {
        currentProcess.stderr.on("data", (chunk) => {
            stderrBuffer += chunk.toString();
            if (stderrBuffer.length > 32768) {
                stderrBuffer = stderrBuffer.slice(-32768);
            }
            process.stderr.write(chunk);
        });
    }

    currentProcess.on("error", err => {
        log(`Spawn error: ${err.message}`, chalk.red);
    });

    currentProcess.on("exit", async (code, signal) => {
        currentProcess = null;

        if (code === RESTART_EXIT_CODE) {
            log("Diminta restart, tunggu sebentar ya, sedang dinyalakan ulang", chalk.yellow);
            await delay(RESTART_DELAY_MS);
            crashCount       = 0;
            crashWindowStart = Date.now();
            rebuildAttempts  = 0;
            return startBot();
        }

        if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
            log("Bot berhenti", chalk.gray);
            process.exit(0);
        }

        const isRebuilt = checkAndAutoRebuild(stderrBuffer);
        if (isRebuilt) {
            crashCount       = 0;
            crashWindowStart = Date.now();
            await delay(1000);
            return startBot();
        }

        const now = Date.now();
        if (now - crashWindowStart > CRASH_WINDOW_MS) {
            crashCount       = 0;
            crashWindowStart = now;
            rebuildAttempts  = 0;
        }

        crashCount++;
        log(`Aduh, bot mengalami crash (code: ${code ?? signal}). Ini crash ke-${crashCount}/${MAX_CRASH_RESTART}`, chalk.red);

        if (crashCount >= MAX_CRASH_RESTART) {
            log(`Waduh, bot terlalu banyak crash dalam ${CRASH_WINDOW_MS / 1000} detik. Kita berhenti dulu ya`, chalk.red.bold);
            process.exit(1);
        }

        const wait = RESTART_DELAY_MS * crashCount;
        log(`Sedang bersiap restart ulang dalam ${wait / 1000} detik`, chalk.yellow);
        await delay(wait);
        startBot();
    });
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(sig, () => {
        if (currentProcess) currentProcess.kill(sig);
        else process.exit(0);
    });
}

await startBot();