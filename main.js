import "./settings.js";
import path, { join } from "path";
import pino from "pino";
import ws from "ws";
import chalk from "chalk";
import platform from "process";
import lodash from "lodash";
global.lodash = lodash;
import yargs from "yargs";
import syntaxerror from "syntax-error";
import { format } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, mkdirSync, watch, copyFileSync } from "fs";
import { spawn } from "child_process";
import { createRequire } from "module";
import { makeWASocket, protoType } from "./function/core/simple.js";
import { initDatabase, wrapStoreLid, closeDatabase, initDailyLimitResetCron } from "./function/core/database.js";
import { initCooldown } from "./function/events/cooldown.js";
import { initAutoGempaScheduler } from "./function/scrapers/gempa.js";
import { requestPairing, connectionUpdate } from "./function/core/connection.js";
import { stopPremiumScheduler } from "./function/core/cek-prem.js";
import { initAutoBackupScheduler } from "./function/core/backup.js";
import { initAutoSessionCleaner } from "./function/core/session-cleaner.js";
import { initAutoGroupScheduler } from "./function/events/autogroup.js";
import { useAtomicAuthState } from "./function/core/auth.js";
import { applyBaileysPatches } from "./function/core/patch-baileys.js";
import cron from 'node-cron';
import dns from 'dns';
import https from 'https';

dns.setDefaultResultOrder?.('ipv4first');

const customHttpsAgent = new https.Agent({
    keepAlive: true,
    family: 4,
    timeout: 60_000
});

applyBaileysPatches();

import { headerLog } from "./function/core/console.js";
import { Browsers,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore,
        DisconnectReason } from '@whiskeysockets/baileys';

protoType();
global.autoRead = true;
await headerLog();

global.__filename = function filename(pathURL = import.meta.url, rmPrefix = platform !== "win32") {
    return rmPrefix ? (/file:\/\/\//.test(pathURL) ? fileURLToPath(pathURL) : pathURL) : pathToFileURL(pathURL).toString();
};
global.__require = function require(dir = import.meta.url) {
    return createRequire(dir);
};
global.__dirname = function dirname(pathURL) {
    return path.dirname(global.__filename(pathURL, true));
};
const __dirname = global.__dirname(import.meta.url);
const localTmpDir = join(__dirname, 'tmp');
if (!existsSync(localTmpDir)) mkdirSync(localTmpDir, { recursive: true });
process.env.TMPDIR = localTmpDir;

const dataDir = join(__dirname, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
initDatabase(dataDir);

// ── Bounded LRU Message Cache untuk getMessage retry/resend ───────────────────
class MessageLRUCache {
    constructor(maxSize = 1000) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }
    set(id, msg) {
        if (!id || !msg) return;
        if (this.cache.has(id)) this.cache.delete(id);
        this.cache.set(id, msg);
        if (this.cache.size > this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
    }
    get(id) {
        if (!id || !this.cache.has(id)) return null;
        const msg = this.cache.get(id);
        this.cache.delete(id);
        this.cache.set(id, msg);
        return msg;
    }
}
global.msgCache = new MessageLRUCache(1000);

let { state, saveCreds } = await useAtomicAuthState("./sessions");

let cachedWaVersion = null;

export async function getWaVersion() {
    if (cachedWaVersion) return cachedWaVersion;

    const cacheFile = join(dataDir, 'wa-version.json');
    try {
        if (existsSync(cacheFile)) {
            const diskCache = JSON.parse(readFileSync(cacheFile, 'utf8'));
            if (Array.isArray(diskCache?.version) && diskCache.version.length === 3 && (Date.now() - (diskCache.timestamp || 0) < 24 * 60 * 60 * 1000)) {
                cachedWaVersion = diskCache.version;
                return cachedWaVersion;
            }
        }
    } catch (_) {}

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 2500);
        const res = await fetch('https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json', { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data?.version) && data.version.length === 3) {
                cachedWaVersion = data.version;
                try {
                    writeFileSync(cacheFile, JSON.stringify({ version: cachedWaVersion, timestamp: Date.now() }));
                } catch (_) {}
                return cachedWaVersion;
            }
        }
    } catch (_) {}

    try {
        const { version: v } = await fetchLatestBaileysVersion();
        if (v) {
            cachedWaVersion = v;
            try {
                writeFileSync(cacheFile, JSON.stringify({ version: cachedWaVersion, timestamp: Date.now() }));
            } catch (_) {}
            return cachedWaVersion;
        }
    } catch (_) {}

    cachedWaVersion = [2, 3000, 1043857760];
    return cachedWaVersion;
}

let version = await getWaVersion();

const msgRetryCounterMap = {};

function buildConnectionOptions(authState) {
    return {
        version,
        printQRInTerminal: false,
        logger: pino({ level: "silent" }),
        browser: Browsers.ubuntu("Chrome"),
        agent: customHttpsAgent,
        auth: {
            creds: authState.creds,
            keys: makeCacheableSignalKeyStore(
                authState.keys,
                pino({ level: "silent" }).child({ level: "store" })
            )
        },
        generateHighQualityLinkPreview: true,
        getMessage: async (key) => {
            if (key?.id && global.msgCache) {
                const cached = global.msgCache.get(key.id);
                if (cached) return cached;
            }
            if (global.conn?.chats && key?.remoteJid) {
                const jid = key.remoteJid;
                const msg = global.conn?.chats[jid]?.messages?.[key.id];
                return msg?.message || null;
            }
            return null;
        },
        defaultQueryTimeoutMs: 60000,
        connectTimeoutMs: 30000,
        keepAliveIntervalMs: 25000,
        qrTimeout: 60000,
        emitOwnEvents: false,
        fireInitQueries: true,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        retryRequestDelayMs: 2500,
        maxMsgRetryCount: 3,
        msgRetryCounterMap,
    };
}

let keepAliveInterval = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

const gracefulShutdown = (signal) => {
    stopPremiumScheduler();
    closeDatabase();
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    process.exit(0);
};

process.on('SIGINT',  () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP',  () => gracefulShutdown('SIGHUP'));
process.on('exit', () => { closeDatabase(); });

process.on('uncaughtException', (error) => {
    console.error(chalk.red.bold(" [UNCAUGHT EXCEPTION]"), error.message);
    console.error(chalk.gray(error.stack));
    if (error.code === 'EBADF' || error.code === 'SQLITE_ERROR' || error.message?.includes('FATAL')) {
        console.error(chalk.red(' [CRITICAL] Performing emergency shutdown...'));
        closeDatabase();
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason) => {
    console.error(chalk.red.bold(" [UNHANDLED REJECTION]"), reason);
    if (reason instanceof Error) console.error(chalk.gray(reason.stack));
});

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.conn = makeWASocket(buildConnectionOptions(state), global.opts);
wrapStoreLid(global.conn);

global.prefix = new RegExp("^[" + (opts.prefix || "‎/!#%+£¢€¥^°¶∆×÷π√✓©®:;?&.\\-").replace(/[|\\{}()[\]^$+*?.\-\^]/g, "\\$&") + "]");

await global.loadDatabase();
initDailyLimitResetCron();

initCooldown()
initAutoGempaScheduler(() => global.conn)
initAutoBackupScheduler(() => global.conn)
initAutoSessionCleaner()
initAutoGroupScheduler(() => global.conn)

const tmpFolder = join(process.cwd(), "tmp");
if (!existsSync(tmpFolder)) mkdirSync(tmpFolder, { recursive: true });

async function StartPairing() {
    if (!global.conn.authState.creds.registered) {
        if (existsSync("./sessions/creds.json")) {
            console.log(chalk.yellow("[PAIRING] Membersihkan sisa sesi belum terdaftar dari percobaan sebelumnya..."));
            try {
                unlinkSync("./sessions/creds.json");
            } catch (_) {}
        }
        await requestPairing(global.conn);
    }
}

let isHandlerInit = true;
let HandlerModule = await import("./handler.js");

global.reloadHandler = async function reloadHandler(restartConnection) {
    try {
        const NewHandler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (NewHandler && Object.keys(NewHandler).length) HandlerModule = NewHandler;
    } catch (e) {
        console.error(e);
    }

    if (restartConnection) {
        const lastChats = global.conn?.chats;

        try { global.conn?.ev?.removeAllListeners?.(); } catch (_) {}
        try { global.conn?.ws?.close?.(); } catch (_) {}
        try { global.conn?.ws?.terminate?.(); } catch (_) {}
        try { global.conn?.end?.(); } catch (_) {}
        await new Promise(r => setTimeout(r, 1000));

        try {
            const fresh = await useAtomicAuthState("./sessions");
            state     = fresh.state;
            saveCreds = fresh.saveCreds;
            version   = await getWaVersion();
        } catch (e) {
            console.error(chalk.yellow(" [RELOAD] Gagal reload auth state, pakai yang lama"), e.message);
        }

        global.conn = makeWASocket(buildConnectionOptions(state), { chats: lastChats });
        wrapStoreLid(global.conn);
        isHandlerInit = true;
    }

    const activeConn = global.conn;

    if (!isHandlerInit) {
        activeConn.ev.off("messages.upsert",            activeConn.handler);
        activeConn.ev.off("group-participants.update",  activeConn.participantsUpdate);
        activeConn.ev.off("groups.update",              activeConn.groupsUpdate);
        activeConn.ev.off("message.delete",             activeConn.onDelete);
        activeConn.ev.off("call",                       activeConn.onCall);
        activeConn.ev.off("connection.update",          activeConn.connectionUpdate);
        activeConn.ev.off("creds.update",               activeConn.credsUpdate);
    }

    activeConn.sWelcome = "Selamat Datang @user";
    activeConn.sBye     = "Selamat Tinggal @user";
    activeConn.sSubject = "@subject";
    activeConn.sDesc    = "@desc";
    activeConn.sPromote = "Selamat @user telah menjadi Admin";
    activeConn.sDemote  = "@user telah diberhentikan sebagai Admin";

    // ── 6. Ikat handler ke activeConn ────────────────────────────────────────
    activeConn.handler            = HandlerModule.handler.bind(activeConn);
    activeConn.participantsUpdate = HandlerModule.participantsUpdate.bind(activeConn);
    activeConn.groupsUpdate       = HandlerModule.groupsUpdate.bind(activeConn);
    activeConn.onDelete           = HandlerModule.catchDeleted.bind(activeConn);
    activeConn.onCall             = HandlerModule.handleCall.bind(activeConn);
    activeConn.connectionUpdate   = async update => await connectionUpdate(update, activeConn);
    activeConn.credsUpdate        = saveCreds;

    // ── 7. Daftarkan listener ke activeConn ──────────────────────────────────
    activeConn.ev.on("messages.upsert",           activeConn.handler);
    activeConn.ev.on("group-participants.update", activeConn.participantsUpdate);
    activeConn.ev.on("groups.update",             activeConn.groupsUpdate);
    activeConn.ev.on("message.delete",            activeConn.onDelete);
    activeConn.ev.on("call",                      activeConn.onCall);
    activeConn.ev.on("connection.update",         activeConn.connectionUpdate);
    activeConn.ev.on("creds.update",              activeConn.credsUpdate);

    isHandlerInit = false;

    if (restartConnection) {
        global.conn.isHandlerInit = true;
        setTimeout(() => { global.conn.isHandlerInit = false; }, 5000);
    }

    return true;
};

// ── Plugin system ─────────────────────────────────────────────────────────────
global.plugins = {};
const pluginFolder = global.__dirname(join(__dirname, "./plugins/index"));
const pluginFilter = filename => /\.js$/.test(filename);

async function featuresInit() {
    for (let filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            const files  = global.__filename(join(pluginFolder, filename));
            const module = await import(files);
            global.plugins[filename] = module.default || module;

            if (!global.db.data?.pluginSettings) {
                global.db.data = { ...(global.db.data || {}), pluginSettings: {} };
            }
            const pluginSettings = global.db.data?.pluginSettings?.[filename];
            if (pluginSettings?.disabled) global.plugins[filename].disable = true;
        } catch (error) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.red.bold(`Plugin error: "${filename}"`)}`);
            console.error(error)
            delete global.plugins[filename];
        }
    }
}
await featuresInit();
if (global.rebuildPluginIndex) global.rebuildPluginIndex();

global.conn.isHandlerInit = true;
const debounceMap = new Map();

global.reloadPlugins = async (_ev, filename) => {
    if (!pluginFilter(filename)) return;
    if (debounceMap.has(filename)) clearTimeout(debounceMap.get(filename));
    debounceMap.set(filename, setTimeout(async () => {
        debounceMap.delete(filename);
        const dir = global.__filename(join(pluginFolder, filename), true);

        if (filename in global.plugins) {
            if (existsSync(dir)) {
                console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`UPDATE "${filename}"`)}`);
            } else {
                console.log(`${chalk.white.bold(" [INFO]")} ${chalk.red.bold(`DELETE "${filename}"`)}`);
                return delete global.plugins[filename];
            }
        } else {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.blue.bold(`ADD "${filename}"`)}`);
        }

        if (!existsSync(dir)) return;

        const error = syntaxerror(readFileSync(dir), filename, {
            sourceType: "module",
            allowAwaitOutsideFunction: true
        });
        if (error) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.yellow.bold(`SYNTAX ERROR "${filename}"`)}`);
            console.error(error)
            return;
        }

        try {
            const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
            global.plugins[filename] = module.default || module;
        } catch (e) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`ERROR "${filename}"`)}`);
            console.error(e)
            global.plugins[filename] = null;
        } finally {
            global.plugins = Object.fromEntries(
                Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b))
            );
            if (global.rebuildPluginIndex) global.rebuildPluginIndex();
        }
    }, 300));
};

Object.freeze(global.reloadPlugins);
await watch(pluginFolder, global.reloadPlugins);
await global.reloadHandler();

setTimeout(() => { global.conn.isHandlerInit = false; }, 5000);

await StartPairing();

// ── Keep-alive ────────────────────────────────────────────────────────────────
function startKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    keepAliveInterval = setInterval(async () => {
        try {
            const readyState = global.conn?.ws?.readyState;
            if (readyState === ws.OPEN) {
                try { global.conn.ws.ping(); } catch {}
                try { await global.conn?.sendPresenceUpdate?.('available'); } catch {}
                reconnectAttempts = 0;
            } else if (readyState === ws.CLOSED || readyState === ws.CLOSING) {
                reconnectAttempts++;
                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.log(chalk.yellow(' [KEEP-ALIVE] Websocket hang terdeteksi, trigger reload...'));
                    reconnectAttempts = 0;
                    await global.reloadHandler(true);
                }
            }
        } catch (error) {
            console.error(chalk.yellow(' [KEEP-ALIVE ERROR]'), error.message);
        }
    }, 30000);
}

startKeepAlive();

console.log(chalk.green.bold("\nBot sudah siap sepenuhnya. Yuk mulai berinteraksi\n"));
