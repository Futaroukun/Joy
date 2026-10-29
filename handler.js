import "./settings.js";
import { smsg } from "./function/core/simple.js";
import { storeMessage, handleMessageRevocation } from "./function/events/antidelete.js";
import { handleCall as antiCallHandler } from "./function/events/anticall.js";
import { getCommandCooldown, checkCooldown, setCooldown, isCooldownNotified, setCooldownNotified } from './function/events/cooldown.js';
import { autoReadHandler } from "./function/events/autoread.js"
import { checkAndSendAd } from './function/events/ads.js';
import { checkFiles } from './function/events/guard.js';
import { handleDidYouMean } from './function/events/didyoumean.js';
import { withTimeout } from './function/core/queue.js';
import { initUserSchema, syncUserAge, initChatSchema, initSettingSchema } from './function/core/schema.js';
import { fileURLToPath } from "url";
import path from "path";
import { format } from "util";
import { unwatchFile, watchFile } from "fs";
import chalk from "chalk";
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const isNumber = x => typeof x === "number" && !isNaN(x);
const printMessages = (await import("./function/events/print.js")).default;

const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), "./plugins");

import { cleanLID, ensureLID, participantsUpdate, groupsUpdate, catchDeleted } from './function/events/group-events.js';
export { cleanLID, ensureLID, participantsUpdate, groupsUpdate, catchDeleted };

let devSetCache = null;
let devListKey = '';
function getDevSet() {
    const list = (global.developer || []).concat(global.info?.nomorowner ? [global.info.nomorowner] : []);
    const key = list.join('|');
    if (devSetCache && devListKey === key) return devSetCache;
    devListKey = key;
    devSetCache = new Set(list.map(o => o.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '')));
    return devSetCache;
}

let ownerSetCache = null;
let ownerListKey = '';
function getStaticOwnerSet() {
    const list = global.owner || [];
    const key = list.join('|');
    if (ownerSetCache && ownerListKey === key) return ownerSetCache;
    ownerListKey = key;
    ownerSetCache = new Set(list.map(o => o.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '')));
    return ownerSetCache;
}

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

            // Plugin yang memiliki customPrefix ditangani khusus dan tidak boleh masuk ke command standard
            if (plugin.customPrefix) {
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


function parseAndDiagnoseError(err, pluginName = '') {
    const rawText = format(err);
    const stack = (err && typeof err === 'object' && err.stack) ? String(err.stack) : rawText;

    // Bersihkan path absolut Termux & query update cache-buster ESM
    const cleanedStack = stack
        .replace(/file:\/\/\/?data\/data\/com\.termux\/files\/home\/Joy\/?/g, '')
        .replace(/\/data\/data\/com\.termux\/files\/home\/Joy\/?/g, '')
        .replace(/\?update=\d+/g, '')
        .trim();

    const errorLines = cleanedStack.split('\n').map(l => l.trimEnd());
    const rawHeader = errorLines[0] || 'Error';

    // Cari letak spesifik file & baris penyebab error
    let culpritLocation = '-';
    const relevantStackLines = [];
    for (let line of errorLines.slice(1)) {
        // Abaikan baris pembungkus internal handler.js
        if (line.includes('handler.js') && (line.includes('m.reply') || line.includes('sendOwnerReport') || line.includes('console.error'))) continue;
        relevantStackLines.push(line);
        if (culpritLocation === '-') {
            const match = line.match(/((?:plugins|function|lib|handler|main)[^:\s)]+):(\d+):(\d+)/);
            if (match) {
                culpritLocation = `${match[1]} [Baris ${match[2]}, Kolom ${match[3]}]`;
            }
        }
    }
    if (culpritLocation === '-' && pluginName) {
        culpritLocation = `plugins/${pluginName}`;
    }

    // Ringkas stack trace (maksimal 4 baris pertama yang paling relevan)
    const shortStack = [rawHeader, ...relevantStackLines.slice(0, 3)].join('\n');

    // Analisis cerdas & rekomendasi langkah perbaikan
    let diagnosis = 'Terjadi kesalahan sistem saat mengeksekusi plugin.';
    let solution = 'Periksa alur logika atau tambahkan blok try-catch pada fungsi terkait.';

    const errStr = (rawHeader + ' ' + (err?.message || '')).toLowerCase();

    if (errStr.includes('unauthorized ip address') || errStr.includes('whitelist this ip') || errStr.includes('whitelist ip')) {
        diagnosis = 'IP server bot belum terdaftar di whitelist akun penyedia API.';
        solution = 'Buka dashboard penyedia API dan daftarkan IP server bot ke daftar IP Whitelist.';
    } else if (errStr.includes('cannot read propert') || errStr.includes('cannot read property') || errStr.includes('of undefined') || errStr.includes('of null')) {
        const propMatch = rawHeader.match(/reading '([^']+)'/i) || rawHeader.match(/property '([^']+)'/i);
        const propName = propMatch ? `'${propMatch[1]}'` : 'properti';
        diagnosis = `Mencoba mengakses ${propName} dari objek yang bernilai undefined atau null.`;
        solution = `Gunakan optional chaining (\`?.\`) atau lakukan validasi objek sebelum diakses (contoh: \`data?.${propMatch ? propMatch[1] : 'item'}\` atau \`if (data) { ... }\`).`;
    } else if (errStr.includes('is not defined')) {
        const varMatch = rawHeader.match(/([a-zA-Z0-9_$]+) is not defined/i);
        const varName = varMatch ? `\`${varMatch[1]}\`` : 'Variabel';
        diagnosis = `${varName} dipanggil namun belum dideklarasikan atau belum di-import.`;
        solution = `Deklarasikan variabel dengan \`const\`/\`let\` atau tambahkan import yang sesuai di baris atas file.`;
    } else if (errStr.includes('is not a function')) {
        const funcMatch = rawHeader.match(/([a-zA-Z0-9_$.]+) is not a function/i);
        diagnosis = `${funcMatch ? `\`${funcMatch[1]}\`` : 'Fungsi'} dipanggil sebagai fungsi padahal tipenya bukan function.`;
        solution = `Pastikan modul/library diexport dengan benar dan verifikasi tipe datanya menggunakan \`typeof\`.`;
    } else if (errStr.includes('enospc')) {
        diagnosis = 'Ruang penyimpanan disk internal/tmp di Termux penuh.';
        solution = 'Bersihkan file cache dan folder sementara di Termux (\`rm -rf tmp/*\`).';
    } else if (err?.name === 'TimeoutError' || errStr.includes('waktu eksekusi plugin melebihi batas')) {
        diagnosis = 'Eksekusi plugin melebihi batas waktu maksimum (Timeout). Terjadi kebuntuan (hanging promise) pada API eksternal atau proses child.';
        solution = 'Periksa respon endpoint API penyedia layanan atau optimalkan logika asynchronous pada plugin.';
    } else if (errStr.includes('timeout') || errStr.includes('etimedout') || errStr.includes('esockettimedout')) {
        diagnosis = 'Koneksi ke endpoint/API target mengalami batas waktu (timeout).';
        solution = 'Server target sedang lambat merespons. Periksa koneksi internet bot atau tingkatkan durasi timeout request (\`timeout: 30000\`).';
    } else if (errStr.includes('enotfound') || errStr.includes('econnrefused') || errStr.includes('network error')) {
        diagnosis = 'Gagal terhubung ke server/host API (domain tidak ditemukan atau server offline).';
        solution = 'Periksa domain endpoint API yang digunakan atau beralih ke penyedia API cadangan.';
    } else if (errStr.includes('fetch failed') || errStr.includes('undici') || errStr.includes('mmg.whatsapp.net')) {
        diagnosis = 'Permintaan HTTP (fetch) gagal terhubung ke CDN WhatsApp atau endpoint API eksternal.';
        solution = 'Koneksi jaringan terputus sementara atau media WhatsApp sudah kadaluarsa di server CDN. Coba kirim ulang media.';
    } else if (errStr.includes('403') || errStr.includes('forbidden') || errStr.includes('cloudflare')) {
        diagnosis = 'Akses diblokir oleh server target (403 Forbidden / Cloudflare Protection / Whitelist IP).';
        solution = 'Periksa apakah IP server bot perlu di-whitelist di dashboard API, atau gunakan header browser / scraper alternatif.';
    } else if (errStr.includes('404') || errStr.includes('not found')) {
        diagnosis = 'Media atau data tidak ditemukan di server target (404 Not Found).';
        solution = 'URL target mungkin telah kedaluwarsa, salah ketik, atau postingan telah dihapus/disetel privat.';
    } else if (errStr.includes('ffmpeg') || errStr.includes('exited with code')) {
        diagnosis = 'Proses konversi atau encoding FFmpeg gagal.';
        solution = 'Periksa argumen/filter FFmpeg yang digunakan dan pastikan file media input tidak korup.';
    } else if (errStr.includes('rate limit') || errStr.includes('429')) {
        diagnosis = 'Terkena batasan frekuensi panggilan API (Rate Limited / 429 Too Many Requests).';
        solution = 'Beri jeda delay antar request atau gunakan rotasi API key / proxy.';
    } else if (err?.message) {
        diagnosis = err.message;
        solution = 'Periksa parameter input dan baris kode pada lokasi di atas.';
    }

    return {
        culpritLocation,
        diagnosis,
        solution,
        shortStack,
        rawHeader
    };
}

export async function handleCall(json) {
    await antiCallHandler.call(this, json)
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
        const prefixExec = global.prefix.exec(m.text);
        const cmdPref = prefixExec ? prefixExec[0] : "";
        const isCommand = !!cmdPref;
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
        
        let isROwner = false;
        let isOwner = false;
        let isPremium = false;
        let userDb = {};
        let senderPn = null;
        let senderLid = null;
        
        try {
            if (global.db.data == null) await global.loadDatabase();
            
            // Note: JID-to-LID data migration and key merging are now handled transparently by the database Proxy in main.js
            
            if (!senderLID.endsWith('@g.us')) {
                const resolvedName = this.getAndVerifyUsername(senderLID, m);
                global.db.data.users[senderLID] = initUserSchema(global.db.data.users[senderLID], resolvedName);
            }

            userDb = global.db.data.users[senderLID] || {};
            syncUserAge(userDb);

            // ── Resolve Sender Phone Number & LID Real-Time ──
            const senderRaw = m.sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, "");
            senderPn = null;
            senderLid = null;

            if (m.sender.endsWith('@lid')) {
                senderLid = m.sender;
                if (conn?.storeLid) {
                    const mapped = conn.storeLid[senderLid] || conn.storeLid[senderRaw];
                    if (mapped && typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
                        senderPn = mapped.split('@')[0].split(':')[0].replace(/[^0-9]/g, "");
                    }
                }
            } else {
                senderPn = senderRaw;
                if (conn?.storeLid) {
                    const mapped = conn.storeLid[m.sender] || conn.storeLid[senderRaw];
                    if (mapped && typeof mapped === 'string' && mapped.endsWith('@lid')) {
                        senderLid = mapped;
                    }
                }
            }

            // ── Cek Developer Utama (isROwner) ──
            const cleanDevSet = getDevSet();

            isROwner = m.fromMe ||
                       (senderPn && cleanDevSet.has(senderPn)) ||
                       cleanDevSet.has(senderRaw) ||
                       (senderLid && cleanDevSet.has(senderLid.split('@')[0]));

            // ── Cek Owner (isOwner) Langsung dari Static & Database ──
            const cleanStaticOwnersSet = getStaticOwnerSet();

            const ownersDb = global.db?.data?.owners || {};
            const isDynamicOwner = !!(
                (senderPn && ownersDb[senderPn]) ||
                (senderLid && ownersDb[senderLid]) ||
                ownersDb[senderRaw] ||
                ownersDb[m.sender] ||
                (senderLid && ownersDb[senderLid.split('@')[0]])
            );

            isOwner = isROwner ||
                      m.fromMe ||
                      (senderPn && cleanStaticOwnersSet.has(senderPn)) ||
                      cleanStaticOwnersSet.has(senderRaw) ||
                      (senderLid && cleanStaticOwnersSet.has(senderLid.split('@')[0])) ||
                      isDynamicOwner ||
                      false;

            isPremium = isROwner || isOwner || userDb.premium === true;

            if (isOwner || isPremium) {
                userDb.limit = Infinity;
            }

            if (m.isGroup) {
                global.db.data.chats[m.chat] = initChatSchema(global.db.data.chats[m.chat]);
            }

            const setting = initSettingSchema(global.db.data.settings[botLid]);
            global.db.data.settings[botLid] = setting;
            global.autoRead = setting.autoread ?? true;

        } catch (error) {
            console.log('Database error:', error);
        }

        if (typeof m.text !== "string") m.text = "";
        

        let usedPrefix;
        let groupMetadata = {};
        if (m.isGroup) {
            const cached = conn.chats[m.chat]?.metadata;
            
            if (cached) {
                groupMetadata = cached;
            } else if (isCommand || hasCustomPrefix || m.mentionedJid?.length || chatData?.jualan) {
                groupMetadata = await conn.groupMetadata(m.chat).catch(() => ({}));
                if (groupMetadata.id) {
                    if (!conn.chats[m.chat]) conn.chats[m.chat] = { id: m.chat };
                    conn.chats[m.chat].metadata = groupMetadata;
                }
            }
        }
        
        const participants = (m.isGroup ? groupMetadata.participants : []) || [];
        
        const user = m.isGroup ? participants.find(u => u.id === senderLID) : {};
        const bot = m.isGroup ? participants.find(u => u.id === botLid) : {};
        
        const isRAdmin = user?.admin === "superadmin" || false;
        const isAdmin = isRAdmin || user?.admin === "admin" || false;
        const isBotAdmin = bot?.admin || false;

        const isRegister = global.db.data?.users[senderLID]?.register === true;
        const isBannned = global.db.data?.users[senderLID]?.banned === true;
        const isMuted = m.isGroup && global.db.data?.chats[m.chat]?.mute === true;
        const isSewa = m.isGroup && global.db.data?.chats[m.chat]?.sewa === true;
        const chatMode = global.db.data?.settings[botLid]?.chatMode;

        if ((chatMode === "owneronly" || chatMode === "self" || global.opts["owneronly"] || global.opts["self"]) && !isOwner) return;
        if ((chatMode === "pconly" || global.opts["pconly"]) && !isPremium && !isOwner && m.isGroup) return;
        if ((chatMode === "gconly" || global.opts["gconly"]) && !isPremium && !isOwner && !m.isGroup) return;
        if ((chatMode === "sewaonly" || global.opts["sewaonly"]) && !isPremium && !isOwner && !isSewa && m.isGroup) return;
        if (m.isGroup && chatData?.jualan) {
          const jualanManageCmds = /^(jualan|addproduk|delproduk|editproduk|listproduk|lihat|addalias|delalias)$/i
          const cmdText = cmdPref
            ? m.text?.slice(cmdPref.length).trim().split(/\s+/)[0]?.toLowerCase()
            : ''
            
          const rawFirstWord = (m.text || '').trim().split(/\s+/)[0]?.toLowerCase() || ''
          const isNoPrefixManage = !isCommand && jualanManageCmds.test(rawFirstWord) && (isAdmin || isOwner)
          
          const isJualanManage = (isCommand && jualanManageCmds.test(cmdText) && (isAdmin || isOwner)) || isNoPrefixManage

          if (!isJualanManage) {
              const items = chatData.jualanItems || {}
              const textInput = (m.text || '').trim().toLowerCase()
              
              const matchKey = Object.keys(items).find(k => {
                if (k.toLowerCase() === textInput) return true
                const aliases = items[k]?.aliases || []
                return aliases.some(a => a.toLowerCase() === textInput)
              })

              if (matchKey) {
                  const item = items[matchKey]
                  try {
                      const hasMedia = item.mediaMessage && item.mtype !== 'conversation' && item.mtype !== 'extendedTextMessage'
                      if (!hasMedia) {
                          const replyText = item.text || ''
                          if (replyText) await conn.sendMessage(m.chat, { text: replyText }, { quoted: m })
                      } else {
                          let msgContent = JSON.parse(JSON.stringify(item.mediaMessage))
                          const type = Object.keys(msgContent)[0]
                          const validTypes = ['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage']
                          if (validTypes.includes(type)) {
                              if (['imageMessage', 'videoMessage', 'documentMessage'].includes(type)) {
                                  msgContent[type].caption = item.text || ''
                              }
                              msgContent[type].contextInfo = {
                                  ...(msgContent[type].contextInfo || {}),
                                  quotedMessage: { conversation: matchKey },
                                  participant: '0@s.whatsapp.net',
                                  stanzaId: 'FAKE_' + Date.now(),
                                  remoteJid: 'status@broadcast'
                              }
                              await conn.relayMessage(m.chat, msgContent, {
                                  messageId: (Math.random() + 1).toString(36).substring(7)
                              })
                          } else if (item.text) {
                              await conn.sendMessage(m.chat, { text: item.text }, { quoted: m })
                          }
                      }
                  } catch (e) {
                      console.error('[JUALAN SEND]', e.message)
                      if (item.text) await conn.sendMessage(m.chat, { text: item.text }, { quoted: m })
                  }
                }

              if (senderLID && global.db.data.users[senderLID]) global.saveData('users', senderLID)
              if (m.chat && global.db.data.chats[m.chat]) global.saveData('chats', m.chat)
              const _botLidJual = cleanLID(conn?.user?.lid)
              if (_botLidJual && global.db.data.settings[_botLidJual]) global.saveData('settings', _botLidJual)
              return
          }
          
          if (isNoPrefixManage) {
            m.text = '.' + m.text
          }
      }

        // Intercept all messages if Qwen session is active in this chat
        if (chatData.isQwenOn) {
            if (isMuted && (!isROwner || !isAdmin)) return;
            if (isBannned && (!isROwner || !isOwner)) return;

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
                    return;
                }

                if (userDb.afk) {
                    try {
                        const afkPlugin = global.plugins['_afk.js'];
                        if (afkPlugin && typeof afkPlugin.before === 'function') {
                            await afkPlugin.before.call(this, m, { conn: this });
                        }
                    } catch (e) {
                        console.error('Failed to run AFK before hook inside session:', e);
                    }
                }

                const qwenPlugin = global.plugins['ai-qwen.js'];
                if (qwenPlugin) {
                    try {
                        await qwenPlugin.call(this, m, {
                            conn: this,
                            text: m.text,
                            usedPrefix: cmdPref || '.',
                            command: 'qwensession',
                            args: m.text.trim().split(/\s+/)
                        });
                        if (!isOwner && !isPremium) {
                            setCooldown(senderLID, 'qwen');
                        }
                    } catch (e) {
                        console.error('Qwen session execution error:', e);
                    }
                }
                return; // Intercept and stop execution of any other command/plugin
            }
        }

        const pluginIndex = getPluginIndex();
        const defaultPrefixExec = prefixExec;
        const defaultMatch = [defaultPrefixExec, global.prefix];
        const defaultUsedPrefix = cmdPref || "";
        const defaultNoPrefix = (m.text && defaultUsedPrefix) ? m.text.slice(defaultUsedPrefix.length) : (m.text || "");

        // ── 1. Eksekusi hook 'before' (hanya pada plugin yang mendaftarkannya) ──
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
            const __filename = path.join(___dirname, name);
            try {
                if (
                    await plugin.before.call(this, m, {
                        match,
                        usedPrefix: _usedPrefix,
                        command: beforeCommand,
                        conn: this,
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
                        __dirname: ___dirname,
                        __filename
                    })
                )
                    continue;
            } catch (e) {
                console.error('Plugin before error:', e);
            }
        }

        // Cek apakah pesan memenuhi syarat untuk diproses sebagai command
        if (isCommand || hasCustomPrefix || chatData.isMikuOn || !m.isGroup) {
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

                        const cmd = item.plugin.command;
                        let isAccept = false;
                        if (typeof cmd === "string") {
                            isAccept = cmd === command;
                        } else if (cmd instanceof RegExp) {
                            isAccept = cmd.test(command);
                        } else if (Array.isArray(cmd)) {
                            for (let k = 0; k < cmd.length; k++) {
                                const c = cmd[k];
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

                if (isMuted && (!isROwner || !isAdmin)) return;
                if (isBannned && (!isROwner || !isOwner)) return;

                if (plugin.rowner && plugin.owner && !(isROwner || isOwner)) {
                    global.dFail("owner", m, this);
                    return;
                }
                if (plugin.rowner && !isROwner) {
                    global.dFail("rowner", m, this);
                    return;
                }
                if (plugin.owner && !isOwner) {
                    global.dFail("owner", m, this);
                    return;
                }

                if (plugin.premium && !isPremium) {
                    global.dFail("premium", m, this);
                    return;
                }

                if (plugin.group && !m.isGroup) {
                    global.dFail("group", m, this);
                    return;
                } else if (plugin.botAdmin && !isBotAdmin) {
                    global.dFail("botAdmin", m, this);
                    return;
                } else if (plugin.admin && !isAdmin) {
                    global.dFail("admin", m, this);
                    return;
                }

                if (plugin.private && m.isGroup) {
                    global.dFail("private", m, this);
                    return;
                }
                if (plugin.register && !isRegister) {
                    global.dFail("unreg", m, this);
                    return;
                }
                if (plugin.restrict) {
                    global.dFail("restrict", m, this);
                    return;
                }

                if (plugin.requiredFiles) {
                    const isOk = checkFiles(m, plugin.requiredFiles, {
                        checkNotEmpty: plugin.requireNotEmpty || false,
                        customMsg: plugin.missingMsg || null
                    });
                    if (!isOk) return;
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
                  return;
                }

                m.plugin = name;
                let isErrorAlreadyReported = false;

                const sendOwnerReport = async (err, callerPlugin = null) => {
                    if (isErrorAlreadyReported) return;
                    isErrorAlreadyReported = true;

                    try {
                        const rawOwner = global.info?.nomorowner || (Array.isArray(global.owner) ? global.owner[0] : global.owner) || (Array.isArray(global.developer) ? global.developer[0] : global.developer);
                        const own = rawOwner ? `${rawOwner.toString().replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;
                        if (!own) return;

                        const pluginName = callerPlugin || m.plugin || name || '-';
                        const diag = parseAndDiagnoseError(err, pluginName);
                        const senderName = m.pushName || userDb?.name || 'User';
                        const senderNum = (typeof senderPn !== 'undefined' && senderPn) ? `+${senderPn}` : ((typeof senderLid !== 'undefined' && senderLid) || senderLID || '-');
                        const chatTitle = m.isGroup
                            ? (groupMetadata?.subject ? `Grup: ${groupMetadata.subject}` : `Grup: ${m.chat.split('@')[0]}`)
                            : 'Chat Pribadi';
                        const cmdUsed = (usedPrefix || '') + (command || '') || (m.text ? m.text.trim().slice(0, 30) : '-');

                        let msg =
                            `╭── ✦ *LAPORAN ERROR SISTEM* ✦\n` +
                            `• *📂 Plugin*: \`${pluginName}\`\n` +
                            `• *📍 Lokasi*: \`${diag.culpritLocation}\`\n` +
                            `• *📥 Command*: \`${cmdUsed}\`\n` +
                            `• *👤 Pengirim*: ${senderName} (\`${senderNum}\`)\n` +
                            `• *📄 Chat*: ${chatTitle}\n` +
                            `• *⏱️ Waktu*: \`${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\`\n\n` +
                            `*Penyebab Error:*\n` +
                            `› ${diag.diagnosis}\n\n` +
                            `*💡 Analisis & Solusi:*\n` +
                            `› ${diag.solution}\n\n` +
                            `*🔍 Stack Trace Ringkas:*\n` +
                            `\`\`\`${diag.shortStack}\`\`\`\n` +
                            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

                        console.log(`[HANDLER] Mengirim notifikasi log error ke owner: ${own}`);
                        const conn = this;
                        if (conn.reply) {
                            await conn.reply(own, msg).catch(() => conn.sendMessage(own, { text: msg }).catch(e => console.error('[ERROR NOTIFY FAILED]', e.message)));
                        } else {
                            await conn.sendMessage(own, { text: msg }).catch(e => console.error('[ERROR NOTIFY FAILED]', e.message));
                        }
                    } catch (reportErr) {
                        console.error('[REPORT ERROR HANDLER FAILED]', reportErr);
                    }
                };

                const reportError = async (err, customUserMsg = null) => {
                    const text = format(err);
                    console.log('[ERROR REPORTED]', text);

                    // 1. Kirim pesan ke user jika customUserMsg diberikan
                    if (customUserMsg && typeof customUserMsg === 'string') {
                        await m.reply(customUserMsg).catch(() => {});
                    }

                    // 2. Kirim laporan terstruktur detail ke Owner (hanya 1x)
                    if (isErrorAlreadyReported) return;
                    await sendOwnerReport(err);
                };

                const __filename = path.join(___dirname, name);
                let extra = {
                    match,
                    conn: this,
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
                    __dirname: ___dirname,
                    __filename
                };
                try { m.reportError = reportError; } catch (_) {}

                try {
                    const pluginTimeoutMs = typeof plugin.timeout === 'number' ? plugin.timeout : (plugin.timeout === false ? 0 : 60000);
                    const runPlugin = plugin.call(this, m, extra);
                    await (pluginTimeoutMs > 0 ? withTimeout(runPlugin, pluginTimeoutMs, `Waktu eksekusi plugin melebihi batas (Timeout ${pluginTimeoutMs / 1000}s)`) : runPlugin);
                    m.status = 'Success';
                    if (!isOwner && !isPremium) {
                      setCooldown(senderLID, primaryCommand);
                    }
                    if (user) {
                        user.exp = (user.exp || 0) + (Math.floor(Math.random() * 15) + 15);
                    }
                    if (!isOwner) await checkAndSendAd(this, m, extra);
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
                            await plugin.after.call(this, m, extra);
                        } catch (error) {
                            console.log('Plugin after error:', error);
                        }
                    }
                }
            }
        }
        
        // ── DID YOU MEAN (Fuzzy suggestion jika command salah ketik) ─────────
        if (!m.isCommand && isCommand && cmdPref) {
            if (!(isMuted && (!isROwner || !isAdmin)) && !(isBannned && (!isROwner || !isOwner))) {
                const typedCmd = m.text.slice(cmdPref.length).trim().split(/\s+/)[0]?.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '')?.toLowerCase();
                if (typedCmd && typedCmd.length >= 2) {
                    await handleDidYouMean(this, m, typedCmd, cmdPref);
                }
            }
        }

        // ── PASSIVE CHAT EXP (Batas Harian: 500 EXP Standar / 1.000 EXP Premium) ──
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
        
        if (senderLID && global.db.data.users[senderLID]) {
            global.saveData('users', senderLID);
        }
        if (m.chat && global.db.data.chats[m.chat]) {
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