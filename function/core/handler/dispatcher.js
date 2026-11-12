import path from "path";
import { getCommandCooldown, checkCooldown, setCooldown, isCooldownNotified, setCooldownNotified } from '../../events/cooldown.js';
import { checkFiles } from '../../events/guard.js';
import { checkAndSendAd } from '../../events/ads.js';
import { withTimeout } from '../queue.js';
import { handleDidYouMean } from '../../events/didyoumean.js';
import { createErrorReporter } from './diagnostics.js';

const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");

export function extractExactCommands(cmd) {
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

export function getPluginIndex(plugins = global.plugins) {
    const currentPluginsCount = plugins && typeof plugins === 'object' ? Object.keys(plugins).length : 0;
    if (pluginIndexCache && lastPluginsRef === plugins && lastPluginsCount === currentPluginsCount && currentPluginsCount > 0) {
        return pluginIndexCache;
    }
    lastPluginsRef = plugins;
    lastPluginsCount = currentPluginsCount;

    const commandMap = new Map();
    const regexPlugins = [];
    const customPrefixPlugins = [];
    const beforePlugins = [];

    if (plugins && typeof plugins === 'object') {
        for (const name in plugins) {
            const plugin = plugins[name];
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

export function rebuildPluginIndex(plugins = global.plugins) {
    pluginIndexCache = null;
    return getPluginIndex(plugins);
}
global.rebuildPluginIndex = rebuildPluginIndex;

export function matchPluginCommand(command, pluginIndex) {
    if (!command || !pluginIndex) return null;
    const foundEntry = pluginIndex.commandMap?.get(command);
    if (foundEntry && !foundEntry.plugin?.disable) {
        return foundEntry;
    }
    if (pluginIndex.regexPlugins) {
        for (let i = 0; i < pluginIndex.regexPlugins.length; i++) {
            const item = pluginIndex.regexPlugins[i];
            if (item.plugin?.disable) continue;
            const cmd = item.plugin.command;
            let isAccept = false;
            if (cmd instanceof RegExp) {
                isAccept = cmd.test(command);
            } else if (Array.isArray(cmd)) {
                for (let j = 0; j < cmd.length; j++) {
                    const c = cmd[j];
                    if (c instanceof RegExp ? c.test(command) : c === command) {
                        isAccept = true;
                        break;
                    }
                }
            }
            if (isAccept) return item;
        }
    }
    return null;
}

export function checkPermissionGuards(plugin, m, conn, ctx = {}) {
    const {
        isROwner = false,
        isOwner = false,
        isRAdmin = false,
        isAdmin = false,
        isBotAdmin = false,
        isPremium = false,
        isBannned = false,
        isMuted = false,
        isRegister = false,
        user = {}
    } = ctx;

    if (isMuted && (!isROwner || !isAdmin)) return { passed: false, reason: 'muted' };
    if (isBannned && (!isROwner || !isOwner)) return { passed: false, reason: 'banned' };

    if (plugin.rowner && plugin.owner) {
        if (!(isROwner || isOwner)) {
            if (typeof global.dFail === 'function') global.dFail("owner", m, conn);
            return { passed: false, reason: 'owner' };
        }
    } else if (plugin.rowner && !isROwner) {
        if (typeof global.dFail === 'function') global.dFail("rowner", m, conn);
        return { passed: false, reason: 'rowner' };
    } else if (plugin.owner && !isOwner) {
        if (typeof global.dFail === 'function') global.dFail("owner", m, conn);
        return { passed: false, reason: 'owner' };
    }

    if (plugin.premium && !isPremium) {
        if (typeof global.dFail === 'function') global.dFail("premium", m, conn);
        return { passed: false, reason: 'premium' };
    }

    if (plugin.limit && !isPremium && !isOwner) {
        const requiredLimit = typeof plugin.limit === 'number' ? plugin.limit : 1;
        if ((user?.limit || 0) < requiredLimit) {
            if (typeof global.dFail === 'function') global.dFail("limit", m, conn);
            return { passed: false, reason: 'limit' };
        }
    }

    if (plugin.group && !m.isGroup) {
        if (typeof global.dFail === 'function') global.dFail("group", m, conn);
        return { passed: false, reason: 'group' };
    } else if (plugin.botAdmin && !isBotAdmin) {
        if (typeof global.dFail === 'function') global.dFail("botAdmin", m, conn);
        return { passed: false, reason: 'botAdmin' };
    } else if (plugin.admin && !isAdmin) {
        if (typeof global.dFail === 'function') global.dFail("admin", m, conn);
        return { passed: false, reason: 'admin' };
    }

    if (plugin.private && m.isGroup) {
        if (typeof global.dFail === 'function') global.dFail("private", m, conn);
        return { passed: false, reason: 'private' };
    }
    if (plugin.register && !isRegister) {
        if (typeof global.dFail === 'function') global.dFail("unreg", m, conn);
        return { passed: false, reason: 'unreg' };
    }
    if (plugin.restrict) {
        if (typeof global.dFail === 'function') global.dFail("restrict", m, conn);
        return { passed: false, reason: 'restrict' };
    }

    if (plugin.requiredFiles) {
        const isOk = checkFiles(m, plugin.requiredFiles, {
            checkNotEmpty: plugin.requireNotEmpty || false,
            customMsg: plugin.missingMsg || null
        });
        if (!isOk) return { passed: false, reason: 'requiredFiles' };
    }

    return { passed: true, reason: null };
}

export async function executeBeforeHooks(conn, m, pluginIndex, ctx) {
    const {
        defaultMatch,
        defaultUsedPrefix,
        defaultNoPrefix,
        pluginsDir,
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
        chatUpdate
    } = ctx;

    for (let i = 0; i < pluginIndex.beforePlugins.length; i++) {
        const { name, plugin } = pluginIndex.beforePlugins[i];
        if (plugin.disable) continue;

        let match = defaultMatch;
        let _usedPrefix = defaultUsedPrefix;
        let noPrefix = defaultNoPrefix;

        if (plugin.customPrefix && plugin._compiledPrefixes && m.text) {
            let found = null;
            for (let j = 0; j < plugin._compiledPrefixes.length; j++) {
                const re = plugin._compiledPrefixes[j];
                const execRes = re.exec(m.text);
                if (execRes) {
                    found = [execRes, re];
                    break;
                }
            }
            match = found || [null, null];
            _usedPrefix = (match[0] && typeof match[0][0] === "string") ? match[0][0] : "";
            noPrefix = _usedPrefix ? m.text.slice(_usedPrefix.length) : m.text;
        }

        const beforeCommand = noPrefix.trim().split(/\s+/)[0] || "";
        const __filename = path.join(pluginsDir, name);
        try {
            if (
                await plugin.before.call(conn, m, {
                    match,
                    usedPrefix: _usedPrefix,
                    command: beforeCommand,
                    conn,
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
                    chatUpdate,
                    __dirname: pluginsDir,
                    __filename
                })
            )
                continue;
        } catch (e) {
            console.error('Plugin before error:', e);
        }
    }
}

export async function dispatchCommand(conn, m, pluginIndex, ctx) {
    const {
        isCommand,
        hasCustomPrefix,
        chatData,
        defaultMatch,
        defaultUsedPrefix,
        defaultNoPrefix,
        pluginsDir,
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
        chatUpdate,
        senderPn,
        senderLid,
        senderLID,
        userDb
    } = ctx;

    if (!isCommand && !hasCustomPrefix && !chatData?.isMikuOn && m.isGroup) {
        return false;
    }

    let targetEntry = null;
    let match = defaultMatch;
    let usedPrefix = defaultUsedPrefix;
    let noPrefix = defaultNoPrefix;
    let command = "";
    let text = "";
    let _args = [];
    let args = [];

    // A. Cek Custom Prefix Plugin (jika hasCustomPrefix terdeteksi)
    if (hasCustomPrefix && m.text) {
        for (let i = 0; i < pluginIndex.customPrefixPlugins.length; i++) {
            const item = pluginIndex.customPrefixPlugins[i];
            if (item.plugin.disable) continue;
            if (!item.plugin._compiledPrefixes) continue;

            let found = null;
            for (let j = 0; j < item.plugin._compiledPrefixes.length; j++) {
                const re = item.plugin._compiledPrefixes[j];
                const execRes = re.exec(m.text);
                if (execRes) {
                    found = [execRes, re];
                    break;
                }
            }

            if (found) {
                match = found;
                usedPrefix = (match[0] && typeof match[0][0] === "string") ? match[0][0] : "";
                noPrefix = usedPrefix ? m.text.slice(usedPrefix.length) : m.text;
                let trimmed = noPrefix.trim();
                let spaceIdx = trimmed.indexOf(' ');
                command = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').toLowerCase();
                text = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
                _args = noPrefix.trim().split(` `).slice(1);
                args = text ? text.split(/\s+/) : [];

                targetEntry = item;
                break;
            }
        }
    }

    // B. Direct O(1) Map Lookup & Regex Fallback untuk standard command
    if (!targetEntry && isCommand && usedPrefix && m.text) {
        noPrefix = m.text.slice(usedPrefix.length);
        let trimmed = noPrefix.trim();
        let spaceIdx = trimmed.indexOf(' ');
        command = (spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)).replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').toLowerCase();
        text = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
        _args = noPrefix.trim().split(` `).slice(1);
        args = text ? text.split(/\s+/) : [];

        targetEntry = matchPluginCommand(command, pluginIndex);
    }

    // C. Eksekusi Plugin yang cocok
    if (targetEntry) {
        const { name, plugin } = targetEntry;
        m.plugin = name;

        const guardResult = checkPermissionGuards(plugin, m, conn, {
            isROwner,
            isOwner,
            isRAdmin,
            isAdmin,
            isBotAdmin,
            isPremium,
            isBannned,
            isMuted,
            isRegister,
            user
        });
        if (!guardResult.passed) return true;

        m.isCommand = true;

        let primaryCommand = 
          plugin.command instanceof RegExp ? plugin.command.source
          : Array.isArray(plugin.command)
            ? (typeof plugin.command[0] === 'string'
            ? plugin.command[0] 
              : name)
            : typeof plugin.command === 'string' ? plugin.command
            : command;

        const pluginCategory = plugin.tags || plugin.category || 'other';
        const cooldownMs = getCommandCooldown(primaryCommand, pluginCategory);
        const cdResult = await checkCooldown(senderLID, primaryCommand, cooldownMs, isOwner, isPremium);
        
        if (!cdResult.canUse) {
          if (!isCooldownNotified(senderLID, primaryCommand)) {
          let featureName = '';
          if (plugin.help) {
            const h = Array.isArray(plugin.help) ? plugin.help[0] : plugin.help;
            featureName = h.split(' ')[0].replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
          } else {
            featureName = primaryCommand.toUpperCase();
          }
          
          await m.reply(
            `*COOLDOWN AKTIF!*\n\n` +
            `*Fitur:* ${featureName}\n` +
            `*Tunggu:* ${cdResult.remaining} detik lagi\n\n` +
            `_Anti-spam protection untuk kualitas layanan yang lebih baik_\n\n` +
            `> Upgrade ke Premium untuk akses tanpa cooldown!`
          );
          setCooldownNotified(senderLID, primaryCommand);
          }
          return true;
        }

        m.plugin = name;

        const { reportError } = createErrorReporter({
            conn,
            m,
            name,
            command,
            usedPrefix,
            senderPn,
            senderLid,
            senderLID,
            userDb,
            groupMetadata
        });

        const __filename = path.join(pluginsDir, name);
        let extra = {
            match,
            conn,
            usedPrefix,
            noPrefix,
            _args,
            args,
            command,
            text,
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
            chatUpdate,
            reportError,
            __dirname: pluginsDir,
            __filename
        };
        try { m.reportError = reportError; } catch (_) {}

        try {
            const pluginTimeoutMs = typeof plugin.timeout === 'number' ? plugin.timeout : (plugin.timeout === false ? 0 : 60000);
            const runPlugin = plugin.call(conn, m, extra);
            await (pluginTimeoutMs > 0 ? withTimeout(runPlugin, pluginTimeoutMs, `Waktu eksekusi plugin melebihi batas (Timeout ${pluginTimeoutMs / 1000}s)`) : runPlugin);
            m.status = 'Success';
            if (!isOwner) {
              setCooldown(senderLID, primaryCommand);
            }
            if (plugin.limit && !isPremium && !isOwner && user) {
              const requiredLimit = typeof plugin.limit === 'number' ? plugin.limit : 1;
              user.limit = Math.max(0, (user.limit || 0) - requiredLimit);
            }
            if (user) {
                user.exp = (user.exp || 0) + (Math.floor(Math.random() * 15) + 15);
            }
            if (!isOwner) await checkAndSendAd(conn, m, extra);
        } catch (e) {
            m.status = 'Failed';
            console.log('Plugin execution error:', e);
            const userMsg = e.userMessage ||
                `╭── ✦ *TERJADI KESALAHAN* ✦\n` +
                `• ${e.message || 'Terjadi kesalahan sistem saat memproses perintah.'}\n\n` +
                `• Laporan error telah otomatis diteruskan ke Developer/Owner.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;
            await reportError(e, userMsg);
        } finally {
            if (typeof plugin.after === "function") {
                try {
                    await plugin.after.call(conn, m, extra);
                } catch (error) {
                    console.log('Plugin after error:', error);
                }
            }
        }
        return true;
    }
    return false;
}

export async function executeDidYouMean(conn, m, {
    isCommand,
    cmdPref,
    isMuted,
    isROwner,
    isAdmin,
    isBannned,
    isOwner
}) {
    if (!m.isCommand && isCommand && cmdPref) {
        if (!(isMuted && (!isROwner || !isAdmin)) && !(isBannned && (!isROwner || !isOwner))) {
            const typedCmd = m.text.slice(cmdPref.length).trim().split(/\s+/)[0]?.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')?.toLowerCase();
            if (typedCmd && typedCmd.length >= 2) {
                await handleDidYouMean(conn, m, typedCmd, cmdPref);
            }
        }
    }
}
