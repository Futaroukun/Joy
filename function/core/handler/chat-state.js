import { cleanLID } from '../../events/group-events.js';
import { getCommandCooldown, checkCooldown, setCooldown, isCooldownNotified, setCooldownNotified } from '../../events/cooldown.js';

export async function handleGroupJualan(conn, m, {
    chatData,
    cmdPref,
    isCommand,
    isAdmin,
    isOwner,
    senderLID
}) {
    if (!m.isGroup || !chatData?.jualan) return { handled: false, isNoPrefixManage: false };

    const jualanManageCmds = /^(jualan|addproduk|delproduk|editproduk|listproduk|lihat|addalias|delalias)$/i;
    const cmdText = cmdPref
        ? m.text?.slice(cmdPref.length).trim().split(/\s+/)[0]?.toLowerCase()
        : '';

    const rawFirstWord = (m.text || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
    const isNoPrefixManage = !isCommand && jualanManageCmds.test(rawFirstWord) && (isAdmin || isOwner);

    const isJualanManage = (isCommand && jualanManageCmds.test(cmdText) && (isAdmin || isOwner)) || isNoPrefixManage;

    if (!isJualanManage) {
        const items = chatData.jualanItems || {};
        const textInput = (m.text || '').trim().toLowerCase();

        const matchKey = Object.keys(items).find(k => {
            if (k.toLowerCase() === textInput) return true;
            const aliases = items[k]?.aliases || [];
            return aliases.some(a => a.toLowerCase() === textInput);
        });

        if (matchKey) {
            const item = items[matchKey];
            try {
                const hasMedia = item.mediaMessage && item.mtype !== 'conversation' && item.mtype !== 'extendedTextMessage';
                if (!hasMedia) {
                    const replyText = item.text || '';
                    if (replyText) await conn.sendMessage(m.chat, { text: replyText }, { quoted: m });
                } else {
                    let msgContent = JSON.parse(JSON.stringify(item.mediaMessage));
                    const type = Object.keys(msgContent)[0];
                    const validTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'];
                    if (validTypes.includes(type)) {
                        if (['imageMessage', 'videoMessage', 'documentMessage'].includes(type)) {
                            msgContent[type].caption = item.text || '';
                        }
                        msgContent[type].contextInfo = {
                            ...(msgContent[type].contextInfo || {}),
                            quotedMessage: { conversation: matchKey },
                            participant: '0@s.whatsapp.net',
                            stanzaId: 'FAKE_' + Date.now(),
                            remoteJid: 'status@broadcast'
                        };
                        await conn.relayMessage(m.chat, msgContent, {
                            messageId: (Math.random() + 1).toString(36).substring(7)
                        });
                    } else if (item.text) {
                        await conn.sendMessage(m.chat, { text: item.text }, { quoted: m });
                    }
                }
            } catch (e) {
                console.error('[JUALAN SEND]', e.message);
                if (item.text) await conn.sendMessage(m.chat, { text: item.text }, { quoted: m });
            }
        }

        if (senderLID && global.db.data.users[senderLID]) global.saveData('users', senderLID);
        if (m.chat && global.db.data.chats[m.chat]) global.saveData('chats', m.chat);
        const _botLidJual = cleanLID(conn?.user?.lid);
        if (_botLidJual && global.db.data.settings[_botLidJual]) global.saveData('settings', _botLidJual);
        return { handled: true, isNoPrefixManage: false };
    }

    if (isNoPrefixManage) {
        m.text = '.' + m.text;
    }

    return { handled: false, isNoPrefixManage };
}

export async function handleQwenSession(conn, m, {
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
}) {
    if (!chatData?.isQwenOn) return { handled: false };

    if (isMuted && (!isROwner || !isAdmin)) return { handled: true };
    if (isBannned && (!isROwner || !isOwner)) return { handled: true };

    const cmdText = cmdPref ? m.text.slice(cmdPref.length).trim().split(/\s+/)[0].toLowerCase() : "";
    const isQwenCommand = cmdPref && /^(qwen|qwenreset|qwenmodel)$/i.test(cmdText);

    if (!isQwenCommand) {
        const cooldownMs = getCommandCooldown('qwen', 'ai');
        const cdResult = await checkCooldown(senderLID, 'qwen', cooldownMs, isOwner, isPremium);
        if (!cdResult.canUse) {
            if (!isCooldownNotified(senderLID, 'qwen')) {
                await m.reply(`*COOLDOWN AKTIF!*\n\n*Fitur:* QWEN\n*Tunggu:* ${cdResult.remaining} detik lagi...`);
                setCooldownNotified(senderLID, 'qwen');
            }
            return { handled: true };
        }

        if (userDb?.afk) {
            try {
                const afkPlugin = global.plugins['_afk.js'];
                if (afkPlugin && typeof afkPlugin.before === 'function') {
                    await afkPlugin.before.call(conn, m, { conn });
                }
            } catch (e) {
                console.error('Failed to run AFK before hook inside session:', e);
            }
        }

        const qwenPlugin = global.plugins['ai-qwen.js'];
        if (qwenPlugin) {
            try {
                await qwenPlugin.call(conn, m, {
                    conn,
                    text: m.text,
                    usedPrefix: cmdPref || '.',
                    command: 'qwensession',
                    args: m.text.trim().split(/\s+/)
                });
                if (!isOwner) {
                    setCooldown(senderLID, 'qwen');
                }
            } catch (e) {
                console.error('Qwen session execution error:', e);
            }
        }
        return { handled: true };
    }

    return { handled: false };
}

export function handlePassiveExp(m, isCommand, user) {
    if (!isCommand && user && (m.text || m.isMedia)) {
        const now = Date.now();
        const today = new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);

        // Reset akumulasi harian saat berganti tanggal
        if (user.lastChatExpDay !== today) {
            user.dailyChatExp = 0;
            user.lastChatExpDay = today;
        }

        const maxDailyChatExp = user.premium ? 1000 : 500;
        const currentDailyExp = user.dailyChatExp || 0;

        if (currentDailyExp < maxDailyChatExp && now - (user.lastChatExp || 0) > 30000) {
            const potentialExp = Math.floor(Math.random() * 10) + 5;
            const grantedExp = Math.min(potentialExp, maxDailyChatExp - currentDailyExp);

            user.exp = (user.exp || 0) + grantedExp;
            user.dailyChatExp = currentDailyExp + grantedExp;
            user.lastChatExp = now;
        }
    }
}
