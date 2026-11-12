import "./settings.js";
import { smsg } from "./function/core/simple.js";
import { storeMessage, handleMessageRevocation } from "./function/events/antidelete.js";
import { handleCall as antiCallHandler } from "./function/events/anticall.js";
import { autoReadHandler } from "./function/events/autoread.js";
import { fileURLToPath } from "url";
import path from "path";
import { unwatchFile, watchFile } from "fs";
import chalk from "chalk";

import { cleanLID, ensureLID, participantsUpdate, groupsUpdate, catchDeleted } from './function/events/group-events.js';
export { cleanLID, ensureLID, participantsUpdate, groupsUpdate, catchDeleted };

import { resolveSenderAuth, resolveGroupContext } from './function/core/handler/auth.js';
import { handleGroupJualan, handleQwenSession, handlePassiveExp } from './function/core/handler/chat-state.js';
import { executeBeforeHooks, dispatchCommand, executeDidYouMean } from './function/core/handler/dispatcher.js';
import { parseAndDiagnoseError } from './function/core/handler/diagnostics.js';
export { parseAndDiagnoseError };

const printMessages = (await import("./function/events/print.js")).default;
const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), "./plugins");

const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");

function extractExactCommands(cmd) {
    if (typeof cmd === 'string') {
        return [cmd.toLowerCase()];
    }
    if (Array.isArray(cmd)) {
        const list = [];
        for (const c of cmd) {
            if (typeof c === 'string') {
                list.push(c.toLowerCase());
            } else if (c instanceof RegExp) {
                const sub = extractExactCommands(c);
                if (sub) list.push(...sub);
                else return null;
            }
        }
        return list;
    }
    if (cmd instanceof RegExp) {
        let src = cmd.source;
        if (!src.startsWith('^') || !src.endsWith('$')) return null;
        let inner = src.slice(1, -1);
        if (inner.startsWith('(') && inner.endsWith(')')) inner = inner.slice(1, -1);
        if (/[+*?{\\\[\]().^$]/.test(inner)) return null;
        return inner.split('|').map(s => s.toLowerCase());
    }
    return null;
}

let pluginIndexCache = null;
let lastPluginsRef = null;
let lastPluginsCount = 0;

export function getPluginIndex() {
    const currentPluginsCount = global.plugins && typeof global.plugins === 'object' ? Object.keys(global.plugins).length : 0;
    if (pluginIndexCache && lastPluginsRef === global.plugins && lastPluginsCount === currentPluginsCount && currentPluginsCount > 0) {
        return pluginIndexCache;
    }
    lastPluginsRef = global.plugins;
    lastPluginsCount = currentPluginsCount;

    const commandMap = new Map();
    const regexPlugins = [];
    const customPrefixPlugins = [];
    const beforePlugins = [];

    if (global.plugins && typeof global.plugins === 'object') {
        for (const name in global.plugins) {
            const plugin = global.plugins[name];
            if (!plugin || plugin.disable) continue;

            const entry = { name, plugin };

            if (plugin.customPrefix) {
                if (!plugin._compiledPrefixes) {
                    const cp = plugin.customPrefix;
                    if (cp instanceof RegExp) {
                        plugin._compiledPrefixes = [cp];
                    } else if (Array.isArray(cp)) {
                        plugin._compiledPrefixes = cp.map(p => (p instanceof RegExp ? p : new RegExp(str2Regex(p))));
                    } else if (typeof cp === "string") {
                        plugin._compiledPrefixes = [new RegExp(str2Regex(cp))];
                    } else {
                        plugin._compiledPrefixes = [];
                    }
                }
                customPrefixPlugins.push(entry);
            }

            if (typeof plugin.before === 'function') {
                beforePlugins.push(entry);
            }

            if (typeof plugin !== 'function' && typeof plugin.run !== 'function') {
                continue;
            }

            // Plugin yang memiliki customPrefix ditangani khusus
            // Jika plugin tidak memiliki command standard, lewati commandMap
            if (plugin.customPrefix && !plugin.command) {
                continue;
            }

            const exactCmds = extractExactCommands(plugin.command);
            if (exactCmds && exactCmds.length > 0) {
                for (const cmd of exactCmds) {
                    if (!commandMap.has(cmd)) {
                        commandMap.set(cmd, entry);
                    }
                }
            } else if (plugin.command) {
                // Abaikan regex catch-all (misal /(?:)/) yang mencocokkan semua input
                if (plugin.command instanceof RegExp && (plugin.command.source === '(?:)' || plugin.command.source === '' || plugin.command.test(''))) {
                    continue;
                }
                regexPlugins.push(entry);
            }
        }
    }

    pluginIndexCache = {
        commandMap,
        regexPlugins,
        customPrefixPlugins,
        beforePlugins
    };
    return pluginIndexCache;
}

export function rebuildPluginIndex() {
    pluginIndexCache = null;
    return getPluginIndex();
}
global.rebuildPluginIndex = rebuildPluginIndex;

function getCustomPrefixPlugins() {
    return getPluginIndex().customPrefixPlugins.map(e => e.plugin);
}

export async function handleCall(json) {
    await antiCallHandler.call(this, json);
}

export async function handler(chatUpdate) {
    const conn = this;
    if (!chatUpdate) return;
    if (!chatUpdate.messages || !Array.isArray(chatUpdate.messages)) return;

    // Simpan pesan ke bounded message cache untuk retry/resend request (getMessage)
    if (global.msgCache) {
        for (const rawMsg of chatUpdate.messages) {
            if (rawMsg?.key?.id && rawMsg?.message) {
                global.msgCache.set(rawMsg.key.id, rawMsg.message);
            }
        }
    }

    try {
        await this.pushMessage(chatUpdate.messages);
    } catch (e) {
        console.error('Error pushing messages:', e);
    }

    let m = chatUpdate.messages[chatUpdate.messages.length - 1];
    if (!m) return;

    try {
        m = (await smsg(this, m)) || m;

        if (m.chat === 'status@broadcast' || m.sender.endsWith("@broadcast") || m.sender.endsWith("@newsletter")) return;

        autoReadHandler(this, m);
        let prefixExec = global.prefix.exec(m.text);
        let cmdPref = prefixExec ? prefixExec[0] : "";
        let isCommand = !!cmdPref;
        let chatData = global.db.data?.chats?.[m.chat] || {};

        let hasCustomPrefix = false;
        if (m.text) {
            const cpPlugins = getCustomPrefixPlugins();
            for (let i = 0; i < cpPlugins.length; i++) {
                const cp = cpPlugins[i].customPrefix;
                if (cp instanceof RegExp ? cp.test(m.text) : false) {
                    hasCustomPrefix = true;
                    break;
                }
            }
        }

        if (m.mtype === 'protocolMessage' && m.msg.type === 0) {
            console.log(chalk.white.bold(" [SISTEM]") + " " + chalk.red.bold(`ANTI-DELETE detected`));
            await handleMessageRevocation(this, m);
            return;
        }

        const senderLID = await ensureLID(this, m.sender);

        await storeMessage(m, this);

        if (m?.msg?.contextInfo?.mentionedJid?.length) {
            if (!this.storeMentions) this.storeMentions = {};
            const jidMentions = await Promise.all(
                m.msg.contextInfo.mentionedJid.map(jid => ensureLID(this, jid))
            );
            this.storeMentions[m.id] = [...new Set(jidMentions)];
        }

        if (m.isBaileys) return;

        const botLid = cleanLID(this?.user?.lid);

        // 1. Resolusi sender auth, permission & database schemas
        const auth = await resolveSenderAuth(this, m, senderLID, botLid);
        const { userDb, senderPn, senderLid, isROwner, isOwner, isPremium } = auth;

        if (typeof m.text !== "string") m.text = "";

        // 2. Resolusi context grup, participant & batasan chatMode
        const groupCtx = await resolveGroupContext(this, m, {
            senderLID,
            botLid,
            isCommand,
            hasCustomPrefix,
            chatData,
            isOwner,
            isPremium
        });

        if (groupCtx.shouldHalt) return;

        const {
            groupMetadata,
            participants,
            user,
            bot,
            isRAdmin,
            isAdmin,
            isBotAdmin,
            isRegister,
            isBannned,
            isMuted,
            isSewa,
            chatMode
        } = groupCtx;

        // 3. Handler Group Jualan
        const jualanResult = await handleGroupJualan(this, m, {
            chatData,
            cmdPref,
            isCommand,
            isAdmin,
            isOwner,
            senderLID
        });
        if (jualanResult.handled) return;
        if (jualanResult.isNoPrefixManage) {
            prefixExec = global.prefix.exec(m.text);
            cmdPref = prefixExec ? prefixExec[0] : "";
            isCommand = !!cmdPref;
        }

        // 4. Handler Qwen interactive session
        const qwenResult = await handleQwenSession(this, m, {
            chatData,
            cmdPref,
            isMuted,
            isROwner,
            isAdmin,
            isBannned,
            isOwner,
            isPremium,
            senderLID,
            userDb
        });
        if (qwenResult.handled) return;

        // 5. Eksekusi hook 'before' & command dispatcher
        const pluginIndex = getPluginIndex();
        const defaultMatch = [prefixExec, global.prefix];
        const defaultUsedPrefix = cmdPref || "";
        const defaultNoPrefix = (m.text && defaultUsedPrefix) ? m.text.slice(defaultUsedPrefix.length) : (m.text || "");

        const executionContext = {
            isCommand,
            hasCustomPrefix,
            cmdPref,
            chatData,
            defaultMatch,
            defaultUsedPrefix,
            defaultNoPrefix,
            pluginsDir: ___dirname,
            participants,
            groupMetadata,
            user,
            bot,
            isROwner,
            isOwner,
            isRAdmin,
            isAdmin,
            isBotAdmin,
            isPremium,
            isBannned,
            isMuted,
            isRegister,
            isSewa,
            chatMode,
            chatUpdate,
            senderPn,
            senderLid,
            senderLID,
            userDb
        };

        // Eksekusi hook 'before'
        await executeBeforeHooks(this, m, pluginIndex, executionContext);

        // Eksekusi plugin command
        await dispatchCommand(this, m, pluginIndex, executionContext);

        // 6. Did You Mean (Fuzzy suggestion jika salah ketik command)
        await executeDidYouMean(this, m, {
            isCommand,
            cmdPref,
            isMuted,
            isROwner,
            isAdmin,
            isBannned,
            isOwner
        });

        // 7. Passive Chat EXP
        handlePassiveExp(m, isCommand, user);

        // 8. Persistensi database
        if (senderLID && global.db.data?.users?.[senderLID]) {
            global.saveData('users', senderLID);
        }
        if (m.chat && global.db.data?.chats?.[m.chat]) {
            global.saveData('chats', m.chat);
        }

    } catch (error) {
        console.log('Handler error:', error);
    } finally {
        try {
            await printMessages(m, this);
        } catch (e) {
            console.log('Print error:', e);
        }
    }
}

global.dFail = (type, m, conn) => {
    let msg = {
        rowner: "*DEVELOPER ONLY*\nPerintah ini hanya dapat diakses oleh Developer Utama.",
        owner: "*OWNER ONLY*\nPerintah ini hanya dapat diakses oleh Owner / Developer.",
        premium: "*PREMIUM ONLY*",
        group: "*GROUP CHAT ONLY*",
        private: "*PRIVATE CHAT ONLY*",
        admin: "*ADMIN ONLY*",
        botAdmin: "*BOT ADMIN REQUIRED*",
        sewa: "*PAID GROUP ONLY*",
        unreg: "*KAMU BELUM TERDAFTAR*\nSilakan daftar terlebih dahulu untuk menggunakan fitur ini:\n*.daftar nama | tgl_lahir*\nContoh: *.daftar Rafli | 14-06-2006*",
        limit: "*LIMIT KAMU HABIS*\nLimit kamu tidak mencukupi untuk menggunakan fitur ini.\n• Beli tiket limit di *.toko* atau tunggu reset harian.\n• Upgrade ke *Premium* untuk menikmati limit tanpa batas!",
        restrict: "*RESTRICTED COMMAND*",
        disable: "*DISABLE COMMAND*"
    }[type];
    if (msg) return conn.reply(m.chat, msg, m);
};

let file = fileURLToPath(import.meta.url);
unwatchFile(file);
watchFile(file, () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "handler.js"`)}`);
    global.reloadHandler(false);
});
