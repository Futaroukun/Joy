import "./settings.js";
import path, { join } from "path";
import pino from "pino";
import ws from "ws";
import chalk from "chalk";
import platform from "process";
import lodash from "lodash";
import yargs from "yargs";
import syntaxerror from "syntax-error";
import { format } from "util";
import { fileURLToPath, pathToFileURL } from "url";
import { readdirSync, statSync, unlinkSync, existsSync, readFileSync, mkdirSync, watch } from "fs";
import { spawn } from "child_process";
import { createRequire } from "module";
import { Low, JSONFile } from "lowdb";
import { makeWASocket, protoType } from "./function/simple.js";
import { requestPairing, connectionUpdate } from "./function/connection.js";
import { startAutoClearSessions } from "./function/auto-clear-sessions.js";

const { Browsers, useMultiFileAuthState, fetchLatestWaWebVersion, makeCacheableSignalKeyStore, DisconnectReason } = await import('@whiskeysockets/baileys');

protoType();
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
const { state, saveCreds } = await useMultiFileAuthState("./sessions");
const { version, isLatest } = await fetchLatestWaWebVersion();

const connectionOptions = {
    version: version,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: Browsers.ubuntu("Chrome"),
    auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" }).child({ level: "store" }))
    },
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => {
        if (conn.chats) {
            const jid = key.remoteJid;
            const msg = conn.chats[jid]?.messages?.[key.id];
            return msg?.message || null;
        }
        return null;
    },
    patchMessageBeforeSending: message => {
        const requiresPatch = !!(message.buttonsMessage || message.templateMessage || message.listMessage);
        if (requiresPatch) {
            message = {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadataVersion: 2,
                            deviceListMetadata: {}
                        },
                        ...message
                    }
                }
            };
        }
        return message;
    },
    defaultQueryTimeoutMs: 60000, 
    connectTimeoutMs: 60000, 
    keepAliveIntervalMs: 30000, 
    qrTimeout: 60000, 
    emitOwnEvents: false,
    fireInitQueries: true,
    syncFullHistory: false,
    markOnlineOnConnect: true,
    retryRequestDelayMs: 5000, 
    maxMsgRetryCount: 5, 
    msgRetryCounterMap: {}, 
    
    shouldIgnoreJid: (jid) => {
        return jid === 'status@broadcast';
    }
};

global.opts = new Object(yargs(process.argv.slice(2)).exitProcess(false).parse());
global.conn = makeWASocket(connectionOptions, global.opts);

global.prefix = new RegExp("^[" + (opts.prefix || "‎xzXZ/i!#$%+£¢€¥^°=¶∆×÷π√✓©®:;?&.\\-").replace(/[|\\{}()[\]^$+*?.\-\^]/g, "\\$&") + "]");

const dbPath = join(__dirname, 'data', 'database.json');
global.db = new Low(new JSONFile(dbPath));
global.DATABASE = global.db;
global.loadDatabase = async function loadDatabase() {
    if (global.db.READ)
        return new Promise(resolve =>
            setInterval(function () {
                !global.db.READ ? (clearInterval(this), resolve(global.db.data == null ? global.loadDatabase() : global.db.data)) : null;
            }, 1 * 1000)
        );
    if (global.db.data !== null) return;
    global.db.READ = true;
    await global.db.read();
    global.db.READ = false;
    global.db.data = {
        users: {},
        chats: {},
        settings: {},
        ...(global.db.data || {})
    };
    global.db.chain = lodash.chain(global.db.data);
};

if (global.db) {
    setInterval(async () => {
        if (global.db.data) await global.db.write();
    }, 30 * 1000);
}

const tmpFolder = join(process.cwd(), "tmp");
if (!existsSync(tmpFolder)) {
    mkdirSync(tmpFolder, { recursive: true });
}

startAutoClearSessions(6);

async function StartPairing() {
    if (existsSync("./sessions/creds.json") && !conn.authState.creds.registered) {
        console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold(`ERROR SESSION RUSAK`)}`);
        process.exit(1);
    }

    if (!conn.authState.creds.registered) {
        await global.reloadHandler(true);
        conn.ev.on("connection.update", async update => {
            const { connection } = update;
            if (connection === "connecting") {
                await requestPairing(global.conn);
            }
        });
    }
}

let isHandlerInit = true;
let HandlerModule = await import("./handler.js");

global.reloadHandler = async function reloadHandler(restartConnection) {
    try {
        const NewHandler = await import(`./handler.js?update=${Date.now()}`).catch(console.error);
        if (NewHandler && Object.keys(NewHandler).length) {
            HandlerModule = NewHandler;
        }
    } catch (error) {
        console.error(error);
    }

    if (restartConnection) {
        const lastChats = global.conn.chats;
        try {
            global.conn.ws.close();
        } catch (error) {
            console.error(error);
        }
        conn.ev.removeAllListeners();
        
        global.conn = makeWASocket(connectionOptions, { chats: lastChats });
        isHandlerInit = true;
    }

    if (!isHandlerInit) {
        conn.ev.off("messages.upsert", conn.handler);
        conn.ev.off("group-participants.update", conn.participantsUpdate);
        conn.ev.off("groups.update", conn.groupsUpdate);
        conn.ev.off("message.delete", conn.onDelete);
        conn.ev.off("call", conn.onCall)
        conn.ev.off("connection.update", conn.connectionUpdate);
        conn.ev.off("creds.update", conn.credsUpdate);
    }

    conn.sWelcome = "Selamat Datang @user";
    conn.sBye = "Selamat Tinggal @user";
    conn.sSubject = "@subject";
    conn.sDesc = "@desc";
    conn.sPromote = "Selamat @user telah menjadi Admin";
    conn.sDemote = "@user telah diberhentikan sebagai Admin";

    conn.handler = HandlerModule.handler.bind(global.conn);
    conn.participantsUpdate = HandlerModule.participantsUpdate.bind(global.conn);
    conn.groupsUpdate = HandlerModule.groupsUpdate.bind(global.conn);
    conn.onDelete = HandlerModule.catchDeleted.bind(global.conn);
    conn.onCall = HandlerModule.handleCall.bind(global.conn)
    conn.connectionUpdate = async update => await connectionUpdate(update, conn);
    conn.credsUpdate = saveCreds.bind(global.conn);

    conn.ev.on("messages.upsert", conn.handler);
    conn.ev.on("group-participants.update", conn.participantsUpdate);
    conn.ev.on("groups.update", conn.groupsUpdate);
    conn.ev.on("message.delete", conn.onDelete);
    conn.ev.on("call", conn.onCall)
    conn.ev.on("connection.update", conn.connectionUpdate);
    conn.ev.on("creds.update", conn.credsUpdate);

    isHandlerInit = false;
    return true;
};

global.plugins = {};
const pluginFolder = global.__dirname(join(__dirname, "./plugins/index"));
const pluginFilter = filename => /\.js$/.test(filename);

async function featuresInit() {
    if (global.db.data === null) await global.loadDatabase();
    for (let filename of readdirSync(pluginFolder).filter(pluginFilter)) {
        try {
            let files = global.__filename(join(pluginFolder, filename));
            const module = await import(files);
            global.plugins[filename] = module.default || module;
            
            if (!global.db.data?.pluginSettings) {
                global.db.data = { ...(global.db.data || {}), pluginSettings: {} };
            }
            const pluginSettings = global.db.data?.pluginSettings?.[filename];
            if (pluginSettings && pluginSettings.disabled) {
                global.plugins[filename].disable = true;
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.blue.bold(`Plugin "${filename}" dinonaktifkan.`)}`);
            }
            
        } catch (error) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`FITUR ERROR "${filename}"`)}`);
            delete global.plugins[filename];
        }
    }
}
await featuresInit();

global.reloadPlugins = async (_ev, filename) => {
    if (!pluginFilter(filename)) return;

    const dir = global.__filename(join(pluginFolder, filename), true);
    if (filename in global.plugins) {
        if (existsSync(dir)) {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`FITUR DIUPDATE "${filename}"`)}`);
        } else {
            console.log(`${chalk.white.bold(" [INFO]")} ${chalk.red.bold(`FITUR DIHAPUS "${filename}"`)}`);
            return delete global.plugins[filename];
        }
    } else console.log(`${chalk.white.bold(" [INFO]")} ${chalk.blue.bold(`FITUR DITAMBAHKAN "${filename}"`)}`);

    if (!existsSync(dir)) return;

    const error = syntaxerror(readFileSync(dir), filename, {
        sourceType: "module",
        allowAwaitOutsideFunction: true
    });
    if (error) {
        console.log(`${chalk.white.bold(" [INFO]")} ${chalk.yellow.bold(`SYNTAXERROR "${filename}"`)}`);
        console.log(error);
        return;
    }

    try {
        const module = await import(`${global.__filename(dir)}?update=${Date.now()}`);
        global.plugins[filename] = module.default || module;
    } catch (e) {
        console.log(`${chalk.white.bold(" [INFO]")} ${chalk.green.bold(`FITUR ERROR "${filename}"`)}`);
        console.log(format(e));
    } finally {
        global.plugins = Object.fromEntries(Object.entries(global.plugins).sort(([a], [b]) => a.localeCompare(b)));
    }
};

Object.freeze(global.reloadPlugins);
await watch(pluginFolder, global.reloadPlugins);
await global.reloadHandler();
await StartPairing();

let keepAliveInterval;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;

function startKeepAlive() {
    if (keepAliveInterval) clearInterval(keepAliveInterval);
    
    keepAliveInterval = setInterval(async () => {
        if (conn?.ws?.readyState === ws.OPEN) {
            try {
                await conn.sendPresenceUpdate('available');
                reconnectAttempts = 0; 
            } catch (error) {
                console.error('Keep-alive error:', error);
                
                reconnectAttempts++;
                if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
                    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.red.bold("Keep-alive failed multiple times, restarting...")}`);
                    reconnectAttempts = 0;
                    await global.reloadHandler(true);
                }
            }
        }
    }, 60000); 
}

startKeepAlive();