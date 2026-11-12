import path from "path";
import { getCommandCooldown, checkCooldown, setCooldown, isCooldownNotified, setCooldownNotified } from '../../events/cooldown.js';
import { checkFiles } from '../../events/guard.js';
import { checkAndSendAd } from '../../events/ads.js';
import { withTimeout } from '../queue.js';
import { handleDidYouMean } from '../../events/didyoumean.js';
import { createErrorReporter } from './diagnostics.js';

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

        // 1. Direct O(1) Map Lookup
        const foundEntry = pluginIndex.commandMap.get(command);
        if (foundEntry && !foundEntry.plugin.disable) {
            targetEntry = foundEntry;
        }

        // 2. Fallback Regex Plugins
        if (!targetEntry) {
            for (let i = 0; i < pluginIndex.regexPlugins.length; i++) {
                const item = pluginIndex.regexPlugins[i];
                if (item.plugin.disable) continue;
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
                if (isAccept) {
                    targetEntry = item;
                    break;
                }
            }
        }
    }

    // C. Eksekusi Plugin yang cocok
    if (targetEntry) {
        const { name, plugin } = targetEntry;
        m.plugin = name;

        if (isMuted && (!isROwner || !isAdmin)) return true;
        if (isBannned && (!isROwner || !isOwner)) return true;

        if (plugin.rowner && plugin.owner) {
            if (!(isROwner || isOwner)) {
                global.dFail("owner", m, conn);
                return true;
            }
        } else if (plugin.rowner && !isROwner) {
            global.dFail("rowner", m, conn);
            return true;
        } else if (plugin.owner && !isOwner) {
            global.dFail("owner", m, conn);
            return true;
        }

        if (plugin.premium && !isPremium) {
            global.dFail("premium", m, conn);
            return true;
        }

        if (plugin.limit && !isPremium && !isOwner) {
            const requiredLimit = typeof plugin.limit === 'number' ? plugin.limit : 1;
            if ((user?.limit || 0) < requiredLimit) {
                global.dFail("limit", m, conn);
                return true;
            }
        }

        if (plugin.group && !m.isGroup) {
            global.dFail("group", m, conn);
            return true;
        } else if (plugin.botAdmin && !isBotAdmin) {
            global.dFail("botAdmin", m, conn);
            return true;
        } else if (plugin.admin && !isAdmin) {
            global.dFail("admin", m, conn);
            return true;
        }

        if (plugin.private && m.isGroup) {
            global.dFail("private", m, conn);
            return true;
        }
        if (plugin.register && !isRegister) {
            global.dFail("unreg", m, conn);
            return true;
        }
        if (plugin.restrict) {
            global.dFail("restrict", m, conn);
            return true;
        }

        if (plugin.requiredFiles) {
            const isOk = checkFiles(m, plugin.requiredFiles, {
                checkNotEmpty: plugin.requireNotEmpty || false,
                customMsg: plugin.missingMsg || null
            });
            if (!isOk) return true;
        }

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
