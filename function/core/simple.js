import store from "./store.js";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import chalk from "chalk";
import { Jimp, JimpMime } from "jimp";
import sharp from "sharp";
import fetch from "node-fetch";
import crypto from "crypto";

import { format } from "util";
import { fileTypeFromBuffer } from "file-type";
import { parsePhoneNumber } from 'awesome-phonenumber';
import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";
import { toAudio } from "../media/converter.js";
import { imageToWebp, videoToWebp, writeExifImg, writeExifVid } from "../media/exif.js";
import { processProfilePicture } from "../media/profile-picture.js";
import tmpManager from './safe-tmp.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
   default: _makeWASocket,
   proto,
   areJidsSameUser,
   downloadContentFromMessage,
   generateForwardMessageContent,
   generateWAMessageFromContent,
   generateWAMessage,
   getDevice,
   WAMessageStubType,
   extractMessageContent,
   jidDecode,
   jidNormalizedUser,
   generateMessageIDV2,
   prepareWAMessageMedia,
   getBinaryNodeChild
} = await import("@whiskeysockets/baileys");

const isNumber = x => {
   if (typeof x === "number" && !isNaN(x)) return true;
   const int = parseInt(x);
   return typeof int === "number" && !isNaN(int);
};

const tmpFile = (ext = "") => path.join(process.cwd(), 'tmp', `${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
const _isStatusJid = (id) => !id || id === "status@broadcast";
const _isGroupJid = (id = "") => id && id.endsWith("@g.us");

/**
 * Fungsi membuat socket ke baileys dengan fitur lengkap
 */
export function makeWASocket(connectionOptions, options = {}) {
   let conn = _makeWASocket(connectionOptions);

   // Auto-tag view_once meta node di level stanza untuk pesan view-once (PR #2837)
   const origRelayMsg = conn.relayMessage.bind(conn);
   conn.relayMessage = async function(jid, message, options = {}) {
      const isVO = Boolean((message?.viewOnceMessage || message?.viewOnceMessageV2 || message?.viewOnceMessageV2Extension)?.message);
      if (isVO) {
         options.additionalNodes = options.additionalNodes || [];
         if (!options.additionalNodes.some(n => n?.tag === 'meta' && n?.attrs?.view_once)) {
            options.additionalNodes.push({ tag: 'meta', attrs: { view_once: 'true' } });
         }
      }
      return origRelayMsg(jid, message, options);
   };
   
   // Override sendMessage untuk auto-mention
   const OrigMsg = conn.sendMessage.bind(conn);
   const origGroupMetadata = conn.groupMetadata ? conn.groupMetadata.bind(conn) : null;
   
   let sock = Object.defineProperties(conn, {
      chats: {
         value: { ...(options.chats || {}) },
         writable: true
      },
      storeLid: {
         value: {},
         writable: true,
         configurable: true
      },
      storeNumber: {
         value: {},
         writable: true,
         configurable: true
      },
      storeMentions: {
         value: {},
         writable: true,
         configurable: true
      },
      _groupMetaCache: {
         value: new Map(),
         writable: true,
         configurable: true
      },
      isLid: {
         value: new Map(),
         writable: true,
         configurable: true
      },

      groupMetadata: {
         async value(jid) {
            if (!jid || !jid.endsWith('@g.us')) return {};
            const cache = conn._groupMetaCache?.get(jid);
            if (cache && (Date.now() - cache.timestamp < 30_000)) {
               return cache.data;
            }
            if (!origGroupMetadata) return {};
            try {
               const data = await origGroupMetadata(jid);
               if (data && conn._groupMetaCache) {
                  conn._groupMetaCache.set(jid, { data, timestamp: Date.now() });
               }
               return data;
            } catch (e) {
               if (cache?.data) return cache.data;
               throw e;
            }
         },
         writable: true,
         configurable: true
      },
      
      sendMessage: {
        async value(jid, content, options = {}) {
          let text = content?.text || content?.caption || '';
          const mentions = content.mentions || conn.parseMention(text);
          
          const hasMedia = !!(
            content.image || content.video || content.audio ||
            content.document || content.sticker  || content.location ||
            content.contacts || content.forward  || content.delete  ||
            content.react    || content.poll     || content.pin     ||
            content.keep
            )
            
            if (!hasMedia && content.contextInfo?.externalAdReply && !jid.endsWith('@newsletter')) {
              const ad = content.contextInfo.externalAdReply;
              const title = ad.title || global.info?.namabot || '';
              const body = ad.body || '';
              const sourceUrl = ad.sourceUrl || global.lgh || '';
              const thumbnailUrl = ad.thumbnailUrl || global.thum || '';
              const renderLargerThumbnail = ad.renderLargerThumbnail ?? true;
              
              // Helper download thumbnail dengan User-Agent browser
                async function fetchThumbBuffer(urlOrBuffer) {
                  if (!urlOrBuffer) return null;
                  // Kalau sudah berupa Buffer langsung pakai
                  if (Buffer.isBuffer(urlOrBuffer)) return urlOrBuffer;
                  // Kalau URL → fetch dengan header browser
                  if (/^https?:\/\//i.test(urlOrBuffer)) {
                    try {
                      const res = await fetch(urlOrBuffer, {
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                          'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
                          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
                          'Referer': 'https://www.google.com/'
                        },
                        signal: AbortSignal.timeout(8000)
                      });
                      if (!res.ok) return null;
                      return Buffer.from(await res.arrayBuffer());
                    } catch { return null; }
                  }
                  // File lokal
                  if (fs.existsSync(urlOrBuffer)) return fs.readFileSync(urlOrBuffer);
                  return null;
                }

                // Validasi magic bytes — pastikan buffer benar-benar gambar
                function isValidImageBuffer(buf) {
                  if (!Buffer.isBuffer(buf) || buf.length < 4) return false;
                  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return true; // JPEG
                  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return true; // PNG
                  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true; // WEBP
                  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true; // GIF
                  return false;
                }

              try {
                let thumb = ad.thumbnail || thumbnailUrl;

                // Prioritas: buffer langsung → URL → file lokal fallback
                let thumbBuffer = await fetchThumbBuffer(thumb);

                // Fallback ke thumbnail.jpg lokal jika download gagal atau bukan gambar
                if (!thumbBuffer || !isValidImageBuffer(thumbBuffer)) {
                  const localThumb = path.join(process.cwd(), 'src', 'thumbnail.jpg');
                  if (fs.existsSync(localThumb)) {
                    thumbBuffer = fs.readFileSync(localThumb);
                  } else {
                    thumbBuffer = null;
                  }
                }
                
                if (thumbBuffer) {
                  const buffer = await sharp(thumbBuffer)
                  .resize({ width: 1024, withoutEnlargement: true })
                  .jpeg({ quality: 80 })
                  .toBuffer();
                  
                  const uploaded = await prepareWAMessageMedia(
                    { image: buffer },
                    { upload: conn.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
                    );
                    
                    const im = uploaded.imageMessage;
                    
                    let displayText = text;
                    if (sourceUrl && !displayText.includes(sourceUrl)) {
                      displayText = `${sourceUrl}\n\n${displayText}`;
                    }
                    return await conn.relayMessage(jid, {
                        extendedTextMessage: {
                           text                  : displayText,
                           matchedText           : sourceUrl,
                           description           : body,
                           title,
                           previewType           : 0,
                           renderLargerThumbnail,
                           jpegThumbnail         : im.jpegThumbnail,
                           thumbnailDirectPath   : im.directPath,
                           thumbnailSha256       : im.fileSha256,
                           thumbnailEncSha256    : im.fileEncSha256,
                           mediaKey              : im.mediaKey,
                           mediaKeyTimestamp     : im.mediaKeyTimestamp,
                           thumbnailHeight       : im.height || 576,
                           thumbnailWidth        : im.width  || 1024,
                           contextInfo: {
                              mentionedJid: mentions,
                              ...(options.quoted ? {
                                 stanzaId     : options.quoted.key.id,
                                 participant  : options.quoted.key.participant || options.quoted.key.remoteJid,
                                 remoteJid    : options.quoted.key.remoteJid  || jid,
                                 quotedMessage: options.quoted.message
                              } : {})
                           }
                        }
                    }, {messageId: generateMessageIDV2(conn.user?.id) });
                }
              } catch (e) {
                console.error('[HQ THUMBNAIL ERROR]:', e.message);
              }
            }
            
            const outContent = { ...content };
            
            if (!hasMedia && text ) {
              outContent.text = text;
            }
            if (mentions.length > 0) {
              outContent.mentions = mentions;
            }
            
            const res = await OrigMsg(jid, outContent, {
              ...options,
              useCachedGroupMetadata: options.useCachedGroupMetadata ?? true
            });
            if (res?.key?.id && res?.message && global.msgCache) {
              global.msgCache.set(res.key.id, res.message);
            }
            return res;
        }
      },
      
      decodeJid: {
         value(jid) {
            if (!jid || typeof jid !== "string") return (!nullish(jid) && jid) || null;
            return jid.decodeJid();
         }
      },
      
      profilePictureUrl: {
         async value(jid, type = 'image', query = 'url') {
            try {
               const result = await conn.query({
                  tag: 'iq',
                  attrs: {
                     target: jid,
                     to: 's.whatsapp.net',
                     type: 'get',
                     xmlns: 'w:profile:picture'
                  },
                  content: [{ tag: 'picture', attrs: { type, query } }]
               }, 15000);
               
               const child = getBinaryNodeChild(result, 'picture');
               return child?.content || child?.attrs?.url;
            } catch {
               return query == 'buffer' 
                  ? fs.readFileSync(path.resolve(__dirname, '../media/avatar_contact.png'))
                  : 'https://telegra.ph/file/24fa902ead26340f3df2c.png';
            }
         }
      },
      
      getJid: {
         value(sender) {
            try {
               if (!sender || typeof sender !== "string") return sender || "";
               sender = conn.decodeJid(sender);
               if (!sender) return "";
               if (!sender.endsWith('@lid')) return sender;

               // 1. Cek identitas Bot
               const botLid = (conn.user?.lid || '').decodeJid?.() || conn.user?.lid;
               const botId = (conn.user?.id || '').decodeJid?.() || conn.user?.id;
               if (botLid && sender === botLid && botId) return botId;

               // 2. Cek in-memory cache conn.storeLid
               if (conn.storeLid?.[sender]) {
                  const mapped = conn.storeLid[sender];
                  if (typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) return mapped;
               }

               // 3. Cek database SQLite storeLid
               if (global.sqlite) {
                  try {
                     const row = global.sqlite.prepare('SELECT pn FROM storeLid WHERE lid = ? LIMIT 1').get(sender);
                     if (row?.pn) {
                        if (conn.storeLid) conn.storeLid[sender] = row.pn;
                        return row.pn;
                     }
                  } catch {}
               }

               // 4. Fallback scanning metadata grup di memori
               for (const chat of Object.values(conn.chats || {})) {
                  if (!chat?.metadata?.participants) continue;
                  const user = chat.metadata.participants.find(p => p.lid === sender || p.id === sender);
                  if (user) {
                     const jid = user?.phoneNumber || user?.jid || (user?.id?.endsWith?.('@s.whatsapp.net') ? user.id : null);
                     if (jid && jid.endsWith('@s.whatsapp.net')) {
                        if (conn.storeLid) conn.storeLid[sender] = jid;
                        return jid;
                     }
                  }
               }
               return sender;
            } catch (e) {
               return sender;
            }
         }
      },
      
      logger: {
         get() {
            let dates = new Date().toLocaleString('en-US', { timeZone: 'Asia/Jakarta' });
            return {
               info(...args) {
                  console.log(chalk.bold.bgRgb(51, 204, 51)('INFO '), 
                     `[${chalk.rgb(255, 255, 255)(dates)}]:`, 
                     chalk.cyan(util.format(...args)));
               },
               error(...args) {
                  console.log(chalk.bold.bgRgb(247, 38, 33)('ERROR '), 
                     `[${chalk.rgb(255, 255, 255)(dates)}]:`, 
                     chalk.rgb(255, 38, 0)(util.format(...args)));
               },
               warn(...args) {
                  console.log(chalk.bold.bgRgb(255, 153, 0)('WARNING '), 
                     `[${chalk.rgb(255, 255, 255)(dates)}]:`, 
                     chalk.redBright(util.format(...args)));
               },
               trace(...args) {
                  console.log(chalk.grey('TRACE '), 
                     `[${chalk.rgb(255, 255, 255)(dates)}]:`, 
                     chalk.white(util.format(...args)));
               },
               debug(...args) {
                  console.log(chalk.bold.bgRgb(66, 167, 245)('DEBUG '), 
                     `[${chalk.rgb(255, 255, 255)(dates)}]:`, 
                     chalk.white(util.format(...args)));
               }
            };
         },
         enumerable: true
      },
      
      getNumber: {
         value(sender) {
            try {
               if (!conn.storeNumber) conn.storeNumber = {};
               if (!sender || typeof sender !== "string") return "";
               if (sender.endsWith("@s.whatsapp.net")) return sender.split("@")[0].split(":")[0];
         
               if (conn.storeNumber[sender]) return conn.storeNumber[sender];

               if (conn.storeLid?.[sender]) {
                  const mapped = conn.storeLid[sender];
                  if (typeof mapped === 'string' && mapped.endsWith("@s.whatsapp.net")) {
                     const num = mapped.split("@")[0].split(":")[0];
                     conn.storeNumber[sender] = num;
                     return num;
                  }
               }

               if (global.sqlite) {
                  try {
                     const row = global.sqlite.prepare('SELECT pn FROM storeLid WHERE lid = ? LIMIT 1').get(sender);
                     if (row?.pn) {
                        const num = row.pn.split('@')[0].split(':')[0];
                        conn.storeNumber[sender] = num;
                        if (conn.storeLid) conn.storeLid[sender] = row.pn;
                        return num;
                     }
                  } catch {}
               }

               for (let chat of Object.values(conn.chats || {})) {
                  if (!chat.metadata?.participants) continue;
                  const user = chat.metadata.participants.find(p => p.id === sender || p.lid === sender);
                  if (user?.phoneNumber) return conn.storeNumber[sender] = (user.phoneNumber).split("@")[0].split(":")[0];
               }
               return sender.endsWith("@lid") ? "" : sender.split("@")[0].split(":")[0];
            } catch (e) {
               return sender || "";
            }
         }
      },
      
      getLid: {
         value(sender) {
            try {
               if (!sender || typeof sender !== "string") return "";
               const decoded = jidNormalizedUser(sender);
               if (!decoded) return "";
               if (decoded.endsWith("@lid")) return decoded;

               // 1. Cek identitas Bot
               const botLid = (conn.user?.lid || '').decodeJid?.() || conn.user?.lid;
               const botId = (conn.user?.id || '').decodeJid?.() || conn.user?.id;
               if (botId && (decoded === botId || decoded.split('@')[0] === botId.split('@')[0]) && botLid) return botLid;

               // 2. Cek in-memory cache conn.storeLid
               if (conn.storeLid) {
                  if (conn.storeLid[decoded]?.endsWith?.('@lid')) return conn.storeLid[decoded];
                  const rawPn = decoded.split('@')[0];
                  if (conn.storeLid[rawPn]?.endsWith?.('@lid')) return conn.storeLid[rawPn];
               }

               // 3. Cek database SQLite storeLid
               if (global.sqlite) {
                  try {
                     const rawPn = decoded.split('@')[0];
                     const row = global.sqlite.prepare('SELECT lid FROM storeLid WHERE pn = ? OR pn LIKE ? LIMIT 1').get(decoded, `%${rawPn}%`);
                     if (row?.lid) {
                        if (conn.storeLid) conn.storeLid[decoded] = row.lid;
                        return row.lid;
                     }
                  } catch {}
               }

               // 4. Fallback scanning metadata grup di memori
               for (const chat of Object.values(conn.chats || {})) {
                  if (!chat?.metadata?.participants) continue;
                  const user = chat.metadata.participants.find(p => p.id === decoded || p.phoneNumber === decoded);
                  if (user?.lid && user.lid.endsWith('@lid')) {
                     if (conn.storeLid) conn.storeLid[decoded] = user.lid;
                     return user.lid;
                  }
               }
               return decoded;
            } catch (e) {
               return sender || "";
            }
         }
      },
      
      getLidPN: {
         async value(sender) {
            try {
               if (!sender || typeof sender !== "string") return "";
               sender = conn.decodeJid(sender);
               if (!sender) return "";

               // 1. Fast-path synchronous check (RAM & SQLite)
               if (sender.endsWith("@s.whatsapp.net")) {
                  const fastLid = conn.getLid(sender);
                  if (fastLid && fastLid.endsWith("@lid")) return fastLid;
               } else if (sender.endsWith("@lid")) {
                  const fastJid = conn.getJid(sender);
                  if (fastJid && fastJid.endsWith("@s.whatsapp.net")) return fastJid;
               }

               // 2. Query Baileys Signal Repository dengan write-back auto-cache
               if (sender.endsWith("@s.whatsapp.net")) {
                  const lid = await conn.signalRepository?.lidMapping?.getLIDForPN?.(sender);
                  const resLid = (lid && typeof lid.decodeJid === 'function') ? lid.decodeJid() : lid;
                  if (resLid && resLid.endsWith("@lid")) {
                     if (conn.storeLid) conn.storeLid[sender] = resLid;
                     return resLid;
                  }
               } else if (sender.endsWith("@lid")) {
                  const Jid = await conn.signalRepository?.lidMapping?.getPNForLID?.(sender);
                  const resJid = (Jid && typeof Jid.decodeJid === 'function') ? Jid.decodeJid() : Jid;
                  if (resJid && resJid.endsWith("@s.whatsapp.net")) {
                     if (conn.storeLid) conn.storeLid[sender] = resJid;
                     return resJid;
                  }
               }
               return sender;
            } catch (e) {
               return sender || "";
            }
         }
      },
      
      waitEvent: {
         value(eventName, is = () => true, maxTries = 25, timeoutMs = 5000) {
            return new Promise((resolve, reject) => {
               let tries = 0;
               let timeout;

               const onEvent = (...args) => {
                  tries++;
                  if (is(...args)) {
                     clearTimeout(timeout);
                     conn.ev.off(eventName, onEvent);
                     resolve(...args);
                  } else if (tries >= maxTries) {
                     clearTimeout(timeout);
                     conn.ev.off(eventName, onEvent);
                     reject(new Error(`Max tries reached for event: ${eventName}`));
                  }
               };

               conn.ev.on(eventName, onEvent);

               timeout = setTimeout(() => {
                  conn.ev.off(eventName, onEvent);
                  reject(new Error(`Timeout reached for event: ${eventName}`));
               }, timeoutMs);
            });
         },
         enumerable: true
      },
      
      pushMessage: {
         async value(m) {
            if (!m) return;
            if (!Array.isArray(m)) m = [m];
            for (const message of m) {
               try {
                  if (!message) continue;
                  if (message.messageStubType && message.messageStubType != WAMessageStubType.CIPHERTEXT) 
                     conn.processMessageStubType(message).catch(console.error);
                     
                  const _mtype = Object.keys(message.message || {});
                  const mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(_mtype[0]) && _mtype[0]) ||
                     (_mtype.length >= 3 && _mtype[1] !== 'messageContextInfo' && _mtype[1]) ||
                     _mtype[_mtype.length - 1];
                     
                  const chat = conn.decodeJid(message.key.remoteJid || message.message?.senderKeyDistributionMessage?.groupId || '');
                  
                  if (message.message?.[mtype]?.contextInfo?.quotedMessage) {
                     let context = message.message[mtype].contextInfo;
                     let participant = conn.decodeJid(context.participant);
                     const remoteJid = conn.decodeJid(context.remoteJid || participant);
                     let quoted = message.message[mtype].contextInfo.quotedMessage;
                     
                     if ((remoteJid && remoteJid !== 'status@broadcast') && quoted) {
                        let qMtype = Object.keys(quoted)[0];
                        if (qMtype == 'conversation') {
                           quoted.extendedTextMessage = { text: quoted[qMtype] };
                           delete quoted.conversation;
                           qMtype = 'extendedTextMessage';
                        }
                        if (!quoted[qMtype].contextInfo) quoted[qMtype].contextInfo = {};
                        quoted[qMtype].contextInfo.mentionedJid = context.mentionedJid || quoted[qMtype].contextInfo.mentionedJid || [];
                        
                        const isGroup = remoteJid.endsWith('g.us');
                        if (isGroup && !participant) participant = remoteJid;
                        
                        const qM = {
                           key: {
                              remoteJid,
                              fromMe: areJidsSameUser((conn?.user?.lid || conn?.user?.id || '').decodeJid(), remoteJid),
                              id: context.stanzaId,
                              participant
                           },
                           message: JSON.parse(JSON.stringify(quoted)),
                           ...(isGroup ? { participant } : {})
                        };
                        
                        let qChats = conn.chats[participant];
                        if (!qChats) qChats = conn.chats[participant] = { id: participant, isChats: !isGroup };
                        if (!qChats.messages) qChats.messages = {};
                        if (!qChats.messages[context.stanzaId] && !qM.key.fromMe) qChats.messages[context.stanzaId] = qM;
                        
                        let qChatsMessages;
                        if ((qChatsMessages = Object.entries(qChats.messages)).length > 40) 
                           qChats.messages = Object.fromEntries(qChatsMessages.slice(30, qChatsMessages.length));
                     }
                  }
                  
                  if (!chat || chat === 'status@broadcast') continue;
                  const isGroup = chat.endsWith('@g.us');
                  let chats = conn.chats[chat];
                  
                  if (!chats) {
                     if (isGroup) await conn.insertAllGroup().catch(console.error);
                     chats = conn.chats[chat] = { id: chat, isChats: true, ...(conn.chats[chat] || {}) };
                  }
                  
                  let metadata, sender;
                  if (isGroup) {
                     if (!chats.subject || !chats.metadata) {
                        metadata = (await conn.groupMetadata(chat).catch(_ => ({}))) || {};
                        if (!chats.subject) chats.subject = metadata.subject || '';
                        if (!chats.metadata) chats.metadata = metadata;
                     }
                     sender = conn.decodeJid((message.key?.fromMe && (conn?.user?.lid || conn?.user?.id || '').decodeJid()) || 
                        message.participant || message.key?.participant || chat || '');
                     if (sender !== chat) {
                        let chats = conn.chats[sender];
                        if (!chats) chats = conn.chats[sender] = { id: sender };
                        if (!chats.name) chats.name = message.pushName || chats.name || '';
                     }
                  } else if (!chats.name) chats.name = message.pushName || chats.name || '';
                  
                  if (['senderKeyDistributionMessage', 'messageContextInfo'].includes(mtype)) continue;
                  chats.isChats = true;
                  if (!chats.messages) chats.messages = {};
                  
                  if (message.key?.id && message.message && global.msgCache) {
                     global.msgCache.set(message.key.id, message.message);
                  }
                  
                  const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, (conn?.user?.lid || conn?.user?.id || '').decodeJid());
                  if (!['protocolMessage'].includes(mtype) && !fromMe && 
                      message.messageStubType != WAMessageStubType.CIPHERTEXT && message.message) {
                     delete message.message.messageContextInfo;
                     delete message.message.senderKeyDistributionMessage;
                     chats.messages[message.key.id] = JSON.parse(JSON.stringify(message, null, 2));
                     
                     let chatsMessages;
                     if ((chatsMessages = Object.entries(chats.messages)).length > 40) 
                        chats.messages = Object.fromEntries(chatsMessages.slice(30, chatsMessages.length));
                  }
               } catch (e) {
                  console.error('[pushMessage Error]:', e);
               }
            }
         }
      },
      
      getAndVerifyUsername: {
         value(jid, m) {
            try {
               if (!jid) return 'Unknown';
               const cleanJid = jidNormalizedUser(jid.decodeJid?.() ?? jid);
               const userInDb = global.db?.data?.users?.[cleanJid];
               if (userInDb?.name && typeof userInDb.name === 'string' && !/@s\.whatsapp\.net|@lid$/.test(userInDb.name)) {
                  return userInDb.name;
               }
               
               let name = (typeof m?.pushName === 'string' && m.pushName.trim()) || m?.name || m?.verifiedBizName;
               if (!name || /@s\.whatsapp\.net|@lid$/.test(name)) {
                  const chatData = conn.chats?.[cleanJid];
                  if (chatData?.name && !/@s\.whatsapp\.net|@lid$/.test(chatData.name)) {
                     name = chatData.name;
                  }
               }
               
               if (!name || /@s\.whatsapp\.net|@lid$/.test(name)) {
                  const parts = cleanJid.split('@')[0];
                  name = parts.length > 10 ? parts.slice(-10) : parts || 'Unknown';
               }
               
               if (userInDb && name && !/@s\.whatsapp\.net|@lid$/.test(name)) {
                  userInDb.name = name;
               }
               
               return name;
            } catch (e) {
               return 'Unknown';
            }
         },
         enumerable: true
      },
      
      getFile: {
         async value(PATH, saveToFile = false) {
            let res, filename;
            const data = Buffer.isBuffer(PATH)
               ? PATH
               : PATH instanceof ArrayBuffer
               ? PATH.toBuffer()
               : /^data:.*?\/.*?;base64,/i.test(PATH)
               ? Buffer.from(PATH.split`,`[1], "base64")
               : /^https?:\/\//.test(PATH)
               ? (res = await fetch(PATH), Buffer.from(await res.arrayBuffer()))
               : fs.existsSync(PATH)
               ? ((filename = PATH), fs.readFileSync(PATH))
               : typeof PATH === "string"
               ? PATH
               : Buffer.alloc(0);
               
            if (!Buffer.isBuffer(data)) throw new TypeError("Result is not a buffer");
            const type = (await fileTypeFromBuffer(data)) || {
               mime: "application/octet-stream",
               ext: ".bin"
            };
            
            if (data && saveToFile && !filename) {
               filename = path.join(process.cwd(), "tmp", `${new Date() * 1}.${type.ext}`);
               await fs.promises.writeFile(filename, data);
            }
               
            return {
               res,
               filename,
               ...type,
               data,
               deleteFile() {
                  return filename && fs.promises.unlink(filename);
               }
            };
         },
         enumerable: true
      },
      
      sendAlbum: {
         async value(jid, items = [], options = {}) {
            options = { ...options };
            const delay = !isNaN(options.delay) ? options.delay : 500;
            
            const userJid = jidNormalizedUser(this.user?.id || this.user?.jid || '');
            const album = generateWAMessageFromContent(jid, {
               messageContextInfo: {
                  messageSecret: crypto.randomBytes(32)
               },
               albumMessage: {
                  expectedImageCount: items.filter(a => a.hasOwnProperty("image")).length,
                  expectedVideoCount: items.filter(a => a.hasOwnProperty("video")).length,
                  ...(options.quoted ? {
                     contextInfo: {
                        remoteJid: options.quoted.key.remoteJid,
                        fromMe: options.quoted.key.fromMe,
                        stanzaId: options.quoted.key.id,
                        participant: options.quoted.key.participant || options.quoted.key.remoteJid,
                        quotedMessage: options.quoted.message,
                        ...(options.mentions ? { mentionedJid: options.mentions } : {})
                     }
                  } : {})
               }
            }, {
               userJid,
               upload: this.waUploadToServer
            });

            await this.relayMessage(album.key.remoteJid, album.message, {
               messageId: album.key.id
            });

            const childIds = [];
            for (let content of items) {
               const img = await generateWAMessage(album.key.remoteJid, content, {
                  ...(options.quoted ? { quoted: options.quoted } : {}),
                  ...(options.mentions ? { mentions: options.mentions } : {}),
                  userJid,
                  upload: this.waUploadToServer,
               });

               img.message.messageContextInfo = {
                  messageSecret: crypto.randomBytes(32),
                  messageAssociation: {
                     associationType: 1,
                     parentMessageKey: album.key
                  }
               };

               await this.relayMessage(img.key.remoteJid, img.message, {
                  messageId: img.key.id
               });
               childIds.push(img.key.id);
               await new Promise(resolve => setTimeout(resolve, delay));
            }

            try {
               if (!this.albumCache) this.albumCache = new Map();

               if (this.albumCache.size > 100) {
                  const now = Date.now();
                  for (const [k, v] of this.albumCache.entries()) {
                     if (now - (v.timestamp || 0) > 15 * 60 * 1000) {
                        this.albumCache.delete(k);
                     }
                  }
               }

               const mediaItems = items.map(item => {
                  if (item.image) {
                     return {
                        type: 'image',
                        url: item.image?.url || (typeof item.image === 'string' ? item.image : null),
                        buffer: Buffer.isBuffer(item.image) ? item.image : null
                     };
                  } else if (item.video) {
                     return {
                        type: 'video',
                        url: item.video?.url || (typeof item.video === 'string' ? item.video : null),
                        buffer: Buffer.isBuffer(item.video) ? item.video : null
                     };
                  }
                  return null;
               }).filter(Boolean);

               const cacheEntry = {
                  albumId: album.key.id,
                  items: mediaItems,
                  timestamp: Date.now()
               };

               this.albumCache.set(album.key.id, cacheEntry);
               for (const cId of childIds) {
                  this.albumCache.set(cId, cacheEntry);
               }

               setTimeout(() => {
                  this.albumCache?.delete(album.key.id);
                  for (const cId of childIds) {
                     this.albumCache?.delete(cId);
                  }
               }, 15 * 60 * 1000).unref?.();
            } catch (e) {
               console.error('[sendAlbum cache error]:', e);
            }

            return album;
         },
         enumerable: true
      },
      
      sendSticker: {
         async value(jid, filePath, m, options = {}) {
            const { data, mime } = await conn.getFile(filePath);
            if (data.length === 0) throw new TypeError('File tidak ditemukan');
            
            const exif = { 
               packName: options.packname || global.stickpack, 
               packPublish: options.packpublish || global.stickauth 
            };
            
            const stickerModule = await import('./exif.js');
            const sticker = await stickerModule.writeExif({ mimetype: mime, data }, exif);
            
            return conn.sendMessage(jid, { sticker }, { 
               quoted: m, 
               ephemeralExpiration: m?.expiration 
            });
         }
      },
      
      sendStickerImage: {
         async value(jid, path, quoted, options = {}) {
            let buff = Buffer.isBuffer(path)
               ? path
               : /^data:.*?\/.*?;base64,/i.test(path)
               ? Buffer.from(path.split`,`[1], "base64")
               : /^https?:\/\//.test(path)
               ? Buffer.from(await (await fetch(path)).arrayBuffer())
               : fs.existsSync(path)
               ? fs.readFileSync(path)
               : Buffer.alloc(0);
            
            if (!buff || buff.length === 0) {
               throw new Error('Invalid image buffer')
            }

            console.log(`[STICKER] Processing image: ${buff.length} bytes`)
            
            let sticker, buffer;
            try {
               if (options && (options.packname || options.author)) {
                  sticker = await writeExifImg(buff, options);
               } else {
                  sticker = await imageToWebp(buff);
               }

               if (!sticker || (Buffer.isBuffer(sticker) && sticker.length === 0)) {
                  throw new Error('Sticker conversion failed')
               }

               console.log(`[STICKER] Sending: ${sticker.length} bytes`)
               await conn.sendMessage(jid, { sticker: sticker, ...options }, { quoted });
               
               return buffer;
            } catch (error) {
               console.error('[STICKER ERROR]', error.message)
               throw error
            }
         }
      },
      
      sendStickerVideo: {
         async value(jid, path, quoted, options = {}) {
            let buff = Buffer.isBuffer(path)
               ? path
               : /^data:.*?\/.*?;base64,/i.test(path)
               ? Buffer.from(path.split`,`[1], "base64")
               : /^https?:\/\//.test(path)
               ? Buffer.from(await (await fetch(path)).arrayBuffer())
               : fs.existsSync(path)
               ? fs.readFileSync(path)
               : Buffer.alloc(0);
               
            let sticker, buffer;
            if (options && (options.packname || options.author)) {
               sticker = await writeExifVid(buff, options);
            } else {
               sticker = await videoToWebp(buff);
            }

            await conn.sendMessage(jid, { sticker: sticker, ...options }, { quoted });
            return buffer;
         }
      },
      
      sendMedia: {
         async value(jid, path, quoted, options = {}) {
            let { mime, data } = await conn.getFile(path);
            let messageType = mime.split('/')[0];
            let pase = messageType.replace('application', 'document') || messageType;
            return conn.sendMessage(jid, { 
               [`${pase}`]: data, 
               mimetype: mime, 
               ...options 
            }, { quoted });
         }
      },
      
      sendFile: {
         async value(jid, path, filename = "", caption = "", quoted, ptt = false, options = {}) {
            let type = await conn.getFile(path, true);
            let { res, data: file, filename: pathFile } = type;
      
            if ((res && res.status !== 200) || !file || file.length === 0) {
               throw new Error('Download failed or file is empty');
            }
      
            if (file.length <= 65536) {
               try {
                  throw { json: JSON.parse(file.toString()) };
               } catch (e) {
                  if (e.json) throw e.json;
               }
            }
      
            console.log(`[SENDFILE] Processing: ${filename || 'unnamed'} (${file.length} bytes)`)
      
            let opt = { filename };
            if (quoted) opt.quoted = quoted;
            if (!type) options.asDocument = true;
      
            let mtype = "",
               mimetype = options.mimetype || type.mime,
               convert;
      
            if (/webp/.test(type.mime) || (/image/.test(type.mime) && options.asSticker))
               mtype = "sticker";
            else if (/image/.test(type.mime) || (/webp/.test(type.mime) && options.asImage))
               mtype = "image";
            else if (/video/.test(type.mime))
               mtype = "video";
            else if (/audio/.test(type.mime)) {
               console.log('[SENDFILE] Converting to audio...')
               convert = await toAudio(file, type.ext)
         
               if (!convert || !convert.data || convert.data.length === 0) {
                  throw new Error('Audio conversion failed: empty result')
               }
         
               file = convert.data
               pathFile = convert.filename
               mtype = "audio"
               mimetype = options.mimetype || "audio/mpeg"
            } else {
               mtype = "document";
            }
      
            if (options.asDocument) mtype = "document";
      
            delete options.asSticker;
            delete options.asLocation;
            delete options.asVideo;
            delete options.asDocument;
            delete options.asImage;
      
            let message = {
               ...options,
               caption,
               ptt,
               [mtype]: { url: pathFile },
               mimetype,
               fileName: filename || pathFile.split("/").pop()
            };
      
            let m;
            try {
               console.log(`[SENDFILE] Sending as ${mtype}...`)
               m = await conn.sendMessage(jid, message, { ...opt, ...options });
            } catch (e) {
               console.error('[SENDFILE] First attempt failed:', e.message);
               console.log('[SENDFILE] Retrying with raw buffer...')
         
               m = await conn.sendMessage(jid, {
                  ...message,
                  [mtype]: file
               }, { ...opt, ...options });
            } finally {
               if (convert && convert.delete) {
                  try { await convert.delete() } catch {}
               }
               if (pathFile && pathFile.includes('/tmp/')) {
                  tmpManager.deleteFile(pathFile)
               }
               file = null;
               return m;
            }
         },
         enumerable: true
      },
      
      sendButton: {
         async value(jid, content = {}, options = {}) {
            let header = {};

            if (content.header) header.title = content.header;

            let mime = null;
            if (content.image) mime = 'image';
            else if (content.video) mime = 'video';
            else if (content.document) mime = 'document';
            else if (content.audio) mime = 'audio';

            if (mime) {
               const media = await prepareWAMessageMedia(
                  { [mime]: content[mime] }, 
                  { upload: conn.waUploadToServer }
               );

               header = {
                  hasMediaAttachment: true,
                  [`${mime}Message`]: media[`${mime}Message`]
               };
            }

            const msg = generateWAMessageFromContent(jid, {
               interactiveMessage: {
                  header,
                  body: { text: content.body || content.text || content.caption },
                  footer: { text: content.footer },
                  nativeFlowMessage: {
                     buttons: content.buttons || []
                  }
               }
            }, options);

            await conn.relayMessage(jid, msg.message, {
               messageId: msg.key.id,
               additionalNodes: [{
                  tag: 'biz',
                  attrs: {},
                  content: [{
                     tag: 'interactive',
                     attrs: { type: 'native_flow', v: '1' },
                     content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                  }]
               }]
            });

            return msg;
         }
      },

      sendCarousel: {
         async value(jid, data = {}, options = {}) {
            const { text = '', body = '', footer = '', cards = [] } = data;

            const preparedCards = [];
            for (const card of cards) {
               let header = {};
               if (card.header) header.title = card.header;

               let mime = null;
               if (card.image) mime = 'image';
               else if (card.video) mime = 'video';
               else if (card.document) mime = 'document';

               if (mime) {
                  const media = await prepareWAMessageMedia(
                     { [mime]: card[mime] },
                     { upload: conn.waUploadToServer }
                  );

                  header = {
                     hasMediaAttachment: true,
                     [`${mime}Message`]: media[`${mime}Message`]
                  };
               }

               preparedCards.push({
                  header,
                  body: { text: card.body || card.text || card.caption || '' },
                  footer: { text: card.footer || '' },
                  nativeFlowMessage: {
                     buttons: card.buttons || []
                  }
               });
            }

            const msg = generateWAMessageFromContent(jid, {
               viewOnceMessage: {
                  message: {
                     interactiveMessage: {
                        body: { text: text || body },
                        footer: { text: footer },
                        carouselMessage: {
                           cards: preparedCards,
                           messageVersion: 1
                        }
                     }
                  }
               }
            }, options);

            await conn.relayMessage(jid, msg.message, {
               messageId: msg.key.id,
               additionalNodes: [{
                  tag: 'biz',
                  attrs: {},
                  content: [{
                     tag: 'interactive',
                     attrs: { type: 'native_flow', v: '1' },
                     content: [{ tag: 'native_flow', attrs: { v: '9', name: 'mixed' } }]
                  }]
               }]
            });

            return msg;
         }
      },
      
      sendContact: {
         async value(jid, data, quoted, options) {
            if (!Array.isArray(data[0]) && typeof data[0] === 'string') data = [data];
            let contacts = [];
            
            for (let [number, name] of data) {
               number = number.replace(/[^0-9]/g, '');
               let njid = number + '@s.whatsapp.net';
               let biz = (await conn.getBusinessProfile(njid).catch(_ => null)) || {};
               
               let vcard = `
BEGIN:VCARD
VERSION:3.0
N:;${name.replace(/\n/g, '\\n')};;;
FN:${name.replace(/\n/g, '\\n')}
TEL;type=CELL;type=VOICE;waid=${number}:${parsePhoneNumber('+' + number).number?.international || number}${
   biz.description ? `
X-WA-BIZ-NAME:${(conn.chats[njid]?.vname || conn.getName(njid) || name).replace(/\n/, '\\n')}
X-WA-BIZ-DESCRIPTION:${biz.description.replace(/\n/g, '\\n')}
`.trim() : ''
}
END:VCARD
               `.trim();
               contacts.push({ vcard, displayName: name });
            }
            
            return conn.sendMessage(jid, {
               ...options,
               contacts: {
                  ...options,
                  displayName: (contacts.length >= 2 
                     ? `${contacts.length} kontak` 
                     : contacts[0].displayName) || null,
                  contacts
               }
            }, { quoted, ...options });
         },
         enumerable: true
      },
      
      reply: {
         async value(jid, text = '', quoted, options) {
            return Buffer.isBuffer(text)
               ? conn.sendFile(jid, text, "file", "", quoted, false, options)
               : conn.sendMessage(jid, {
                    ...options,
                    text,
                    contextInfo: {
                       mentionedJid: conn.parseMention(text)
                    },
                    ...options
                 }, { quoted, ...options });
         }
      },
      
      adReply: {
         async value(jid, text, path, m, options = {}) {
            try {
               const { data } = await conn.getFile(path);
               return await conn.sendMessage(jid, {
                  text: text,
                  contextInfo: {
                     externalAdReply: {
                        title: options.title || global.info?.namabot || 'Joy Bot',
                        body: options.body || '',
                        thumbnail: data,
                        mediaType: 1,
                        renderLargerThumbnail: options.large || true,
                        thumbnailUrl: options.source || global.thum || '',
                        sourceUrl: options.source || global.lgh || ''
                     }
                  }
               }, { quoted: m });
            } catch (e) {
               console.error('[ADREPLY ERROR]:', e.message);
               // Fallback: kirim pesan teks biasa tanpa adReply jika gagal
               return await conn.sendMessage(jid, { text: text }, { quoted: m });
            }
         }
      },
      
      sendPoll: {
         async value(jid, name = '', optiPoll = [], options = {}) {
            let values = [];
            if (Array.isArray(optiPoll)) {
               values = optiPoll.map(btn => {
                  if (typeof btn === 'string') return btn;
                  if (Array.isArray(btn)) return btn[0];
                  if (btn && typeof btn === 'object') return btn.optionName || btn.name || '';
                  return String(btn || '');
               }).filter(Boolean);
            }
            const selectableCount = options.selectableCount ?? (options.selectableOptionsCount ?? 1);
            return conn.sendMessage(jid, {
               poll: {
                  name,
                  values,
                  selectableCount
               }
            }, options);
         }
      },

      pinMessage: {
         async value(jid, key, durationInSeconds = 86400, options = {}) {
            return conn.sendMessage(jid, {
               pin: key,
               type: 1,
               time: durationInSeconds
            }, options);
         }
      },

      unpinMessage: {
         async value(jid, key, options = {}) {
            return conn.sendMessage(jid, {
               pin: key,
               type: 2
            }, options);
         }
      },
      
      downloadAndSaveMediaMessage: {
         async value(message, filename, attachExtension = true) {
            let quoted = message.msg ? message.msg : message;
            let mime = (message.msg || message).mimetype || '';
            let messageType = message.mtype ? message.mtype.replace(/Message/gi, "") : mime.split("/")[0];
            
            const stream = await downloadContentFromMessage(quoted, messageType);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
               buffer = Buffer.concat([buffer, chunk]);
            }
            
            let type = await fileTypeFromBuffer(buffer);
            let trueFileName = attachExtension ? filename + "." + type.ext : filename;
            await fs.writeFileSync(trueFileName, buffer);
            return trueFileName;
         }
      },
      
      msToDate: {
         async value(ms) {
            let days = Math.floor(ms / (24 * 60 * 60 * 1000));
            let daysms = ms % (24 * 60 * 60 * 1000);
            let hours = Math.floor(daysms / (60 * 60 * 1000));
            let hoursms = ms % (60 * 60 * 1000);
            let minutes = Math.floor(hoursms / (60 * 1000));
            let minutesms = ms % (60 * 1000);
            let sec = Math.floor(minutesms / 1000);
            return days + " Hari " + hours + " Jam " + minutes + " Menit";
         }
      },
      
      delay: {
         async value(ms) {
            return new Promise((resolve) => setTimeout(resolve, ms));
         }
      },
      
      cMod: {
         value(jid, message, text = '', sender = (conn?.user?.lid || conn?.user?.id || '').decodeJid(), options = {}) {
            if (options.mentions && !Array.isArray(options.mentions)) options.mentions = [options.mentions];
            let copy = message.toJSON();
            delete copy.message.messageContextInfo;
            delete copy.message.senderKeyDistributionMessage;
            
            let mtype = Object.keys(copy.message)[0];
            let msg = copy.message;
            let content = msg[mtype];
            
            if (typeof content === 'string') msg[mtype] = text || content;
            else if (content.caption) content.caption = text || content.caption;
            else if (content.text) content.text = text || content.text;
            
            if (typeof content !== 'string') {
               msg[mtype] = { ...content, ...options };
               msg[mtype].contextInfo = {
                  ...(content.contextInfo || {}),
                  mentionedJid: options.mentions || content.contextInfo?.mentionedJid || []
               };
            }
            
            if (copy.participant) sender = copy.participant = sender || copy.participant;
            else if (copy.key.participant) sender = copy.key.participant = sender || copy.key.participant;
            if (copy.key.remoteJid.includes('@s.whatsapp.net')) sender = sender || copy.key.remoteJid;
            else if (copy.key.remoteJid.includes('@broadcast')) sender = sender || copy.key.remoteJid;
            
            copy.key.remoteJid = jid;
            copy.key.fromMe = areJidsSameUser(sender, (conn?.user?.lid || conn?.user?.id || '').decodeJid()) || false;
            return proto.WebMessageInfo.create(copy);
         },
         enumerable: true
      },
      
      copyNForward: {
         async value(jid, message, forwardingScore = true, options = {}) {
            let vtype;
            if (options.readViewOnce && message.message.viewOnceMessage?.message) {
               vtype = Object.keys(message.message.viewOnceMessage.message)[0];
               delete message.message.viewOnceMessage.message[vtype].viewOnce;
               message.message = proto.Message.create(
                  JSON.parse(JSON.stringify(message.message.viewOnceMessage.message))
               );
               message.message[vtype].contextInfo = message.message.viewOnceMessage.contextInfo;
            }
            
            let mtype = Object.keys(message.message)[0];
            let m = generateForwardMessageContent(message, !!forwardingScore);
            let ctype = Object.keys(m)[0];
            
            if (forwardingScore && typeof forwardingScore === 'number' && forwardingScore > 1) 
               m[ctype].contextInfo.forwardingScore += forwardingScore;
               
            m[ctype].contextInfo = {
               ...(message.message[mtype].contextInfo || {}),
               ...(m[ctype].contextInfo || {})
            };
            
            m = generateWAMessageFromContent(jid, m, {
               ...options,
               userJid: (conn?.user?.lid || conn?.user?.id || '').decodeJid()
            });
            
            await conn.relayMessage(jid, m.message, {
               messageId: m.key.id,
               additionalAttributes: { ...options }
            });
            return m;
         },
         enumerable: true
      },
      
      fakeReply: {
         value(jid, text = '', fakeJid = (conn?.user?.lid || conn?.user?.id || '').decodeJid(), fakeText = '', fakeGroupJid, options) {
            return conn.reply(jid, text, {
               key: {
                  fromMe: areJidsSameUser(fakeJid, (conn?.user?.lid || conn?.user?.id || '').decodeJid()),
                  participant: fakeJid,
                  ...(fakeGroupJid ? { remoteJid: fakeGroupJid } : {})
               },
               message: { conversation: fakeText },
               ...options
            });
         }
      },
      
      downloadM: {
         async value(m, type, saveToFile, parentMsg = null) {
            try {
               if (!m || !(m.url || m.directPath)) {
                  throw new Error('Invalid message or media not found.');
               }
               
               const dlType = type === 'sticker' ? 'image' : type;
               
               const toBuffer = async (s) => {
                  if (s && typeof s.getReader === 'function') {
                     const reader = s.getReader();
                     const chunks = [];
                     for (;;) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        if (value) chunks.push(Buffer.from(value));
                     }
                     return Buffer.concat(chunks);
                  }
                  if (s && typeof s[Symbol.asyncIterator] === 'function') {
                     const chunks = [];
                     for await (const chunk of s) {
                        chunks.push(Buffer.from(chunk));
                     }
                     return Buffer.concat(chunks);
                  }
                  throw new Error('Unsupported stream type from downloadContentFromMessage');
               };

               const getStreamWithFix = async (targetMedia) => {
                  try {
                     return await downloadContentFromMessage(targetMedia, dlType);
                  } catch (e) {
                     if (/readableStream/i.test(String(e?.message)) && /PassThrough/i.test(String(e?.message))) {
                        const nodeStream = await import('stream');
                        const origFromWeb = nodeStream.Readable.fromWeb?.bind(nodeStream.Readable);
                        if (origFromWeb) {
                           try {
                              nodeStream.Readable.fromWeb = function(rs, opts) {
                                 if (rs && typeof rs.getReader !== 'function') return rs;
                                 return origFromWeb(rs, opts);
                              };
                              return await downloadContentFromMessage(targetMedia, dlType);
                           } finally {
                              nodeStream.Readable.fromWeb = origFromWeb;
                           }
                        }
                     }
                     throw e;
                  }
               };

               let targetMedia = m;
               let buffer;
               let lastErr;
               const maxAttempts = 3;

               for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                  try {
                     const stream = await getStreamWithFix(targetMedia);
                     buffer = await toBuffer(stream);
                     if (buffer && buffer.length > 0) {
                        break;
                     }
                  } catch (err) {
                     lastErr = err;
                     const errMsg = String(err?.message || err);
                     const isRetryable = /fetch failed|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|403|404|410|expired/i.test(errMsg);

                     if (parentMsg?.key && typeof conn.updateMediaMessage === 'function' && attempt < maxAttempts && isRetryable) {
                        try {
                           const updated = await Promise.race([
                              conn.updateMediaMessage(parentMsg),
                              new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout updateMediaMessage')), 6000))
                           ]);
                           const updatedMsg = updated?.message || parentMsg?.message;
                           if (updatedMsg) {
                              const mContent = extractMessageContent(updatedMsg);
                              const cType = Object.keys(mContent || {})[0];
                              if (cType && mContent[cType]?.directPath) {
                                 targetMedia = mContent[cType];
                              }
                           }
                        } catch (_) {}
                     }

                     if (attempt < maxAttempts) {
                        await new Promise(res => setTimeout(res, attempt * 600));
                     }
                  }
               }

               if (!buffer || buffer.length === 0) {
                  throw lastErr || new Error('Gagal mengunduh media dari WhatsApp.');
               }
               
               if (saveToFile) {
                  const fileType = await fileTypeFromBuffer(buffer);
                  const filename = saveToFile || `downloaded_media.${fileType?.ext || 'bin'}`;
                  await fs.promises.writeFile(filename, buffer);
                  return filename;
               }
               
               return buffer;
            } catch (err) {
               throw new Error('Failed to download media: ' + (err?.message || 'unknown error'));
            }
         },
         enumerable: true
      },
      
      parseMention: {
         value(text = "") {
            try {
               if (!text || typeof text !== "string") return [];
               const regex = /@([0-9]{5,20})/g;
               const mentions = [];
               let match;

               while ((match = regex.exec(text)) !== null) {
                  const raw = match[1];
                  if (raw) {
                     mentions.push(`${raw}@s.whatsapp.net`);
                  }
               }

               return [...new Set(mentions)];
            } catch (e) {
               return [];
            }
         },
         enumerable: true
      },
      
      saveName: {
         async value(id, name = '') {
            if (!id) return;
            id = conn.decodeJid(id);
            let isGroup = id.endsWith('@g.us');
            if (id in conn.contacts && conn.contacts[id][isGroup ? 'subject' : 'name'] && id in conn.chats) return;
            
            let metadata = {};
            if (isGroup) metadata = await conn.groupMetadata(id).catch(() => ({}));
            let chat = {
               ...(conn.contacts[id] || {}),
               id,
               ...(isGroup ? { subject: metadata?.subject || '', desc: metadata?.desc || '' } : { name })
            };
            conn.contacts[id] = chat;
            conn.chats[id] = chat;
         }
      },
      
      getName: {
        value(jid = '', withoutContact = false) {
          jid = conn.decodeJid(jid);
          if (!jid || typeof jid !== 'string') return '';
          withoutContact = conn.withoutContact || withoutContact;
          let v;
          if (jid.endsWith('@g.us')) {
            v = conn.chats[jid] || {};
            return (withoutContact ? '' : v.name) || v.subject || jid;
          } else {
            v = jid === '0@s.whatsapp.net' ? {
              jid,
              vname: 'Whatsapp'
            } : areJidsSameUser(jid, conn.user?.id) ?
            conn.user : (conn.chats[jid] || {});
          }
          return (withoutContact ? '' : v.name) || v.subject || v.vname || v.notify || v.verifiedName || jid.split('@')[0];
        },
        enumerable: true
      },
      
      loadMessage: {
         value(messageID) {
            return Object.entries(conn.chats)
               .filter(([_, { messages }]) => typeof messages === 'object')
               .find(([_, { messages }]) => Object.entries(messages)
                  .find(([k, v]) => k === messageID || v.key?.id === messageID))?.[1].messages?.[messageID];
         },
         enumerable: true
      },
      
      processMessageStubType: {
         async value(m) {
            if (!m.messageStubType) return;
            const chat = conn.decodeJid(m.key.remoteJid || m.message?.senderKeyDistributionMessage?.groupId || '');
            if (!chat || chat === 'status@broadcast') return;
            
            const emitGroupUpdate = update => {
               conn.ev.emit('groups.update', [{ id: chat, ...update }]);
            };
            
            switch (m.messageStubType) {
               case WAMessageStubType.REVOKE:
               case WAMessageStubType.GROUP_CHANGE_INVITE_LINK:
                  emitGroupUpdate({ revoke: m.messageStubParameters[0] });
                  break;
               case WAMessageStubType.GROUP_CHANGE_ICON:
                  emitGroupUpdate({ icon: m.messageStubParameters[0] });
                  break;
               default:
                  break;
            }
            
            const isGroup = chat.endsWith('@g.us');
            if (!isGroup) return;
            
            let chats = conn.chats[chat];
            if (!chats) chats = conn.chats[chat] = { id: chat };
            chats.isChats = true;
            
            const metadata = await conn.groupMetadata(chat).catch(_ => null);
            if (!metadata) return;
            chats.subject = metadata.subject;
            chats.metadata = metadata;
         }
      },
      
      relayWAMessage: {
         async value(fullMessage) {
            if (fullMessage.message.audioMessage) {
               await conn.sendPresenceUpdate("recording", fullMessage.key.remoteJid);
            } else {
               await conn.sendPresenceUpdate("composing", fullMessage.key.remoteJid);
            }
            
            var skirim = await conn.relayMessage(fullMessage.key.remoteJid, fullMessage.message, {
               messageId: fullMessage.key.id
            });
            conn.ev.emit("messages.upsert", { messages: [fullMessage], type: "append" });
            return skirim;
         }
      },
      
      sendGroupV4Invite: {
         async value(groupJid, participant, inviteCode, inviteExpiration, groupName, caption, jpegThumbnail, options = {}) {
            const msg = generateWAMessageFromContent(participant, {
               groupInviteMessage: {
                  inviteCode,
                  inviteExpiration: parseInt(inviteExpiration) || Date.now() + 3 * 86400000,
                  groupJid,
                  groupName,
                  jpegThumbnail,
                  caption
               }
            }, {
               userJid: conn.user.id,
               ...options
            });

            await conn.relayMessage(participant, msg.message, {
               messageId: msg.key.id
            });
            return msg;
         },
         enumerable: true
      },
      
      insertAllGroup: {
         async value() {
            const groups = (await conn.groupFetchAllParticipating().catch(_ => null)) || {};
            for (const group in groups)
               conn.chats[group] = {
                  ...(conn.chats[group] || {}),
                  id: group,
                  subject: groups[group].subject,
                  isChats: true,
                  metadata: groups[group]
               };
            return conn.chats;
         }
      },
      
      serializeM: {
         value(m) {
            return smsg(conn, m);
         }
      },
      
      updateProfilePicture: {
         async value(jid, content, mode = 'crop') {
            const { img } = await generateProfilePicture(content, mode);
            const myJid = conn.user?.jid || conn.user?.id || '';
            const isMe = !jid || (myJid && areJidsSameUser(jid, myJid));
            const targetJid = isMe ? undefined : jidNormalizedUser(jid);
            return conn.query({
               tag: "iq",
               attrs: {
                  to: "@s.whatsapp.net",
                  type: "set",
                  xmlns: "w:profile:picture",
                  ...(targetJid ? { target: targetJid } : {})
               },
               content: [{ tag: "picture", attrs: { type: "image" }, content: img }]
            });
         },
         enumerable: true
      },

      removeProfilePicture: {
         async value(jid) {
            const myJid = conn.user?.jid || conn.user?.id || '';
            const isMe = !jid || (myJid && areJidsSameUser(jid, myJid));
            const targetJid = isMe ? undefined : jidNormalizedUser(jid);
            return conn.query({
               tag: "iq",
               attrs: {
                  to: "@s.whatsapp.net",
                  type: "set",
                  xmlns: "w:profile:picture",
                  ...(targetJid ? { target: targetJid } : {})
               }
            });
         },
         enumerable: true
      },
      
      ...(typeof conn.chatRead !== "function" ? {
         chatRead: {
            value(jid, participant = (conn?.user?.lid || conn?.user?.id || '').decodeJid(), messageID) {
               return conn.sendReadReceipt(jid, participant, [messageID]);
            },
            enumerable: true
         }
      } : {}),
      
      ...(typeof conn.setStatus !== "function" ? {
         setStatus: {
            value(status) {
               return conn.query({
                  tag: "iq",
                  attrs: {
                     to: "@s.whatsapp.net",
                     type: "set",
                     xmlns: "status"
                  },
                  content: [{
                     tag: "status",
                     attrs: {},
                     content: Buffer.from(status, "utf-8")
                  }]
               });
            },
            enumerable: true
         }
      } : {})
   });

   if (sock.user?.id) sock.user.jid = sock.decodeJid(sock.user.id);
   store.bind(sock);
   return sock;
}

/**
 * Helper function untuk parse message content
 */
function parseMessage(content) {
   let wrapperContextInfo = null;
   if (content) {
      const type = Object.keys(content)[0];
      if (type && content[type] && content[type].contextInfo) {
         wrapperContextInfo = content[type].contextInfo;
      }
   }

   content = extractMessageContent(content);
   if (content && content.viewOnceMessageV2Extension) {
      content = content.viewOnceMessageV2Extension.message;
   }
   if (content && content.protocolMessage && content.protocolMessage.type == 14) {
      let type = getContentType(content.protocolMessage);
      content = content.protocolMessage[type];
   }
   if (content && content.message) {
      let type = getContentType(content.message);
      content = content.message[type];
   }

   if (wrapperContextInfo && content) {
      const type = Object.keys(content)[0];
      if (type && content[type] && typeof content[type] === 'object') {
         if (!content[type].contextInfo) {
            content[type].contextInfo = wrapperContextInfo;
         }
      } else if (typeof content === 'object') {
         if (!content.contextInfo) {
            content.contextInfo = wrapperContextInfo;
         }
      }
   }

   return content;
}

const getContentType = (content) => {
   if (content) {
      const keys = Object.keys(content);
      const key = keys.find(k => 
         (k === 'conversation' || k.endsWith('Message') || k.includes('V2') || k.includes('V3')) && 
         k !== 'senderKeyDistributionMessage'
      );
      return key;
   }
};
const MEDIA_TYPE_SET = new Set([
   "audioMessage", "bcallMessage", "botInvokeMessage", "buttonsMessage",
   "buttonsResponseMessage", "contactMessage", "conversation", "contactsArrayMessage",
   "documentMessage", "documentWithCaptionMessage", "editedMessage", "ephemeralMessage",
   "extendedTextMessage", "groupInviteMessage", "groupMentionedMessage", "imageMessage",
   "interactiveMessage", "interactiveResponseMessage", "invokeMessage", "listMessage",
   "listResponseMessage", "liveLocationMessage", "locationMessage", "lottieStickerMessage",
   "messageHistoryBundle", "newsletterAdminInviteMessage", "orderMessage",
   "pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3",
   "pollUpdateMessage", "productMessage", "protocolMessage", "ptvMessage",
   "reactionMessage", "requestPaymentMessage", "scheduledCallCreationMessage",
   "scheduledCallEditMessage", "sendPaymentMessage", "senderKeyDistributionMessage",
   "stickerMessage", "templateButtonReplyMessage", "templateMessage", "videoMessage",
   "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"
]);

function isBaileysId(id) {
   if (!id || typeof id !== 'string') return false;
   return (
      (id.startsWith('BAE5') && id.length === 16) ||
      (id.startsWith('3EB0') && (id.length === 20 || id.length === 22)) ||
      (id.startsWith('B1E') && id.length === 20) ||
      (/^[A-F0-9]{16}$/i.test(id)) ||
      (/^[A-F0-9]{22}$/i.test(id))
   );
}

/**
 * Serialize Message dengan dukungan interactive message
 */
export async function smsg(conn, m, hasParent) {
   if (!m) return m;

   m = proto.WebMessageInfo.create(m);
   m.message = parseMessage(m.message);

   const primary = (m.key?.participant || m.key?.remoteJid || '').decodeJid();
   const alt = (m.key?.participantAlt || m.key?.remoteJidAlt || '').decodeJid();
   if (primary && alt && primary !== alt) {
      if (!conn.storeLid) conn.storeLid = {};
      conn.storeLid[primary] = alt;
      conn.storeLid[alt] = primary;
   }
   const name = (typeof m.pushName === 'string' && m.pushName.trim()) || '';

   // Define conn property
   Object.defineProperty(m, 'conn', {
      enumerable: false,
      writable: true,
      value: conn
   });

   // Handle protocol message
   let protocolMessageKey;
   if (m.message) {
      if (m.mtype === 'protocolMessage' && m.msg?.key) {
         protocolMessageKey = m.msg.key;
         if (protocolMessageKey === 'status@broadcast') protocolMessageKey.remoteJid = m.chat;
         if (!protocolMessageKey.participant || protocolMessageKey.participant === 'status_me') 
            protocolMessageKey.participant = m.sender;
         protocolMessageKey.fromMe = conn.decodeJid(protocolMessageKey.participant) === conn.decodeJid(conn.user?.id);
         if (!protocolMessageKey.fromMe && protocolMessageKey.remoteJid === conn.decodeJid(conn.user?.id)) 
            protocolMessageKey.remoteJid = m.sender;
      }
      if (m.quoted && !m.quoted.mediaMessage) delete m.quoted.download;
   }
   if (!m.mediaMessage) delete m.download;

   try {
      if (protocolMessageKey && m.mtype === 'protocolMessage') 
         conn.ev.emit('message.delete', protocolMessageKey);
   } catch (e) {
      console.error(e);
   }

   let _id = undefined;
   let _chat = undefined;
   let _isGroup = undefined;
   let _sender = undefined;
   let _fromMe = undefined;
   let _mtype = undefined;
   let _msg = undefined;
   let _mediaMessage = undefined;
   let _quoted = undefined;
   let _cachedText = undefined;
   let _mentionedJid = undefined;

   return Object.defineProperties(m, {
      id: {
         get() {
            if (_id !== undefined) return _id;
            _id = m.key?.id;
            return _id;
         }
      },
      isBaileys: {
         get() {
            return isBaileysId(m.id);
         }
      },
      chat: {
         get() {
            if (_chat !== undefined) return _chat;
            const senderKeyDistributionMessage = m.message?.senderKeyDistributionMessage?.groupId;
            _chat = (m.key?.remoteJid ||
               (senderKeyDistributionMessage && senderKeyDistributionMessage !== 'status@broadcast') ||
               '').decodeJid();
            return _chat;
         },
         enumerable: true
      },
      isGroup: {
         get() {
            if (_isGroup !== undefined) return _isGroup;
            _isGroup = m.chat.endsWith('@g.us');
            return _isGroup;
         },
         enumerable: true
      },
      sender: {
         get() {
            if (_sender !== undefined) return _sender;
            _sender = conn?.getLid(m.key?.participant || m.key?.participantAlt ||
               m.key?.remoteJid || m.key?.remoteJidAlt || '');
            return _sender;
         },
         enumerable: true
      },
      fromMe: {
         get() {
            if (_fromMe !== undefined) return _fromMe;
            _fromMe = Boolean(m.key?.fromMe || areJidsSameUser((conn?.user?.lid || conn?.user?.id || '').decodeJid(), m.sender));
            return _fromMe;
         },
         enumerable: true
      },
      mtype: {
         get() {
            if (_mtype !== undefined) return _mtype;
            if (!m.message) {
               _mtype = '';
               return _mtype;
            }
            const type = Object.keys(m.message);
            _mtype = (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(type[0]) && type[0]) ||
               (type.length >= 3 && type[1] !== 'messageContextInfo' && type[1]) ||
               type[type.length - 1];
            return _mtype;
         },
         enumerable: true
      },
      msg: {
         get() {
            if (_msg !== undefined) return _msg;
            if (!m.message) {
               _msg = null;
               return null;
            }
            _msg = parseMessage(m.message[m.mtype]);
            return _msg;
         }
      },
      mediaMessage: {
         get() {
            if (_mediaMessage !== undefined) return _mediaMessage;
            if (!m.message) {
               _mediaMessage = null;
               return null;
            }
            const Message = ((m.msg?.url || m.msg?.directPath) ?
               { ...m.message } : extractMessageContent(m.message)) || null;
            if (!Message) {
               _mediaMessage = null;
               return null;
            }
            const mtype = Object.keys(Message)[0];
            _mediaMessage = MEDIA_TYPE_SET.has(mtype) ? Message : null;
            return _mediaMessage;
         },
         enumerable: true
      },
      messages: {
         get() {
            return m.message ? m.message : null;
         },
         enumerable: true
      },
      mediaType: {
         get() {
            let message;
            if (!(message = m.mediaMessage)) return null;
            return Object.keys(message)[0];
         },
         enumerable: true
      },
      _text: {
         value: null,
         writable: true
      },
      text: {
         get() {
            if (typeof m._text === "string") return m._text;
            if (_cachedText !== undefined) return _cachedText;

            const msg = m.msg;
            let extractedText = "";

            if (m.mtype === 'conversation') {
               extractedText = m.message.conversation;
            } else if (m.mtype === 'extendedTextMessage') {
               extractedText = m.message.extendedTextMessage?.text;
            } else if (m.mtype === 'templateButtonReplyMessage') {
               extractedText = m.message.templateButtonReplyMessage?.selectedId || '';
            } else if (m.mtype === 'interactiveResponseMessage') {
               const response = m.message.interactiveResponseMessage;
               if (response?.nativeFlowResponseMessage?.paramsJson) {
                  try {
                     const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson);
                     extractedText = params.id || '';
                  } catch (e) {
                     console.error("Error parsing interactive response JSON:", e);
                  }
               } else if (response?.listResponseMessage?.singleSelectReply?.selectedRowId) {
                  extractedText = response.listResponseMessage.singleSelectReply.selectedRowId;
               }
            } else if (m.mtype === 'buttonsResponseMessage') {
               extractedText = m.message.buttonsResponseMessage?.selectedButtonId || '';
            } else if (m.mtype === 'listResponseMessage') {
               extractedText = m.message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
            }

            const text = extractedText || (typeof msg === "string" ? msg : msg?.text) ||
               msg?.caption || msg?.contentText || "";

            _cachedText = (typeof text === "string" ? text :
               text?.selectedDisplayText || text?.hydratedTemplate?.hydratedContentText || text) || "";
            return _cachedText;
         },
         set(str) {
            _cachedText = undefined;
            return (m._text = str);
         },
         enumerable: true
      },
      mentionedJid: {
         get() {
            if (_mentionedJid !== undefined) return _mentionedJid;
            let raw = m.msg?.contextInfo?.mentionedJid || [];
            let raws = raw.length > 0 ? raw : m.text ? conn.parseMention(m.text) : [];
            _mentionedJid = raws.map(Jid => conn.getLid(Jid));
            return _mentionedJid;
         },
         enumerable: true
      },
      name: {
         get() {
            return name;
         },
         enumerable: true
      },
      quoted: {
         get() {
            if (_quoted !== undefined) return _quoted;
            const qthis = this;
            const msg = qthis.msg;
            const contextInfo = msg?.contextInfo;
            const quoted = parseMessage(contextInfo?.quotedMessage);
            if (!msg || !contextInfo || !quoted) {
               _quoted = null;
               return null;
            }

            const type = Object.keys(quoted)[0];
            let q = quoted[type];
            const qSender = conn?.getLid(contextInfo.participant || "");
            const text = typeof q === "string" ? q : q?.text;
            const baseObj = typeof q === "string" ? { text: q } : (q && typeof q === 'object' ? { ...q } : {});

            let _qMediaMessage = undefined;
            let _qMentionedJid = undefined;

            _quoted = Object.defineProperties(
               baseObj,
               {
                  mtype: {
                     get() { return type; },
                     enumerable: true
                  },
                  mediaMessage: {
                     get() {
                        if (_qMediaMessage !== undefined) return _qMediaMessage;
                        const Message = ((q?.url || q?.directPath) ?
                           { ...quoted } : extractMessageContent(quoted)) || null;
                        if (!Message) {
                           _qMediaMessage = null;
                           return null;
                        }
                        const mtype = Object.keys(Message)[0];
                        _qMediaMessage = MEDIA_TYPE_SET.has(mtype) ? Message : null;
                        return _qMediaMessage;
                     },
                     enumerable: true
                  },
                  mediaType: {
                     get() {
                        let message;
                        if (!(message = this.mediaMessage)) return null;
                        return Object.keys(message)[0];
                     },
                     enumerable: true
                  },
                  id: {
                     get() { return contextInfo.stanzaId; },
                     enumerable: true
                  },
                  chat: {
                     get() { return conn.getJid(contextInfo.remoteJid || qthis.chat); },
                     enumerable: true
                  },
                  isBaileys: {
                     get() {
                        return isBaileysId(contextInfo.stanzaId);
                     },
                     enumerable: true
                  },
                  sender: {
                     get() {
                        const raw = contextInfo.participant || (!qthis.isGroup ? qthis.chat : "");
                        return conn?.getLid(raw) || raw;
                     },
                     enumerable: true
                  },
                  fromMe: {
                     get() {
                        return areJidsSameUser(this.sender, (conn?.user?.lid || conn?.user?.id || '').decodeJid());
                     },
                     enumerable: true
                  },
                  text: {
                     get() {
                        return text || this.caption || this.contentText ||
                           this.selectedDisplayText || '';
                     },
                     enumerable: true
                  },
                  mentionedJid: {
                     get() {
                        if (_qMentionedJid !== undefined) return _qMentionedJid;
                        let raw = q?.contextInfo?.mentionedJid || qthis.getQuotedObj?.()?.mentionedJid || [];
                        _qMentionedJid = raw.map(jid => conn.getLid(jid));
                        return _qMentionedJid;
                     },
                     enumerable: true
                  },
                  name: {
                     get() {
                        return conn.chats?.[qSender]?.name || conn.chats?.[qSender]?.verifiedName || qSender.split('@')[0]; 
                     },
                     enumerable: true
                  },
                  vM: {
                     get() {
                        return proto.WebMessageInfo.create({
                           key: {
                              remoteJid: this.chat,
                              fromMe: this.fromMe,
                              id: this.id,
                              ...(this.sender ? { participant: this.sender } : {})
                           },
                           message: quoted,
                           ...(qthis.isGroup && this.sender ? { participant: this.sender } : {})
                        });
                     }
                  },
                  fakeObj: {
                     get() { return this.vM; }
                  },
                  download: {
                     value(saveToFile = false) {
                        const mtype = this.mediaType;
                        const mediaRoot = this.mediaMessage;
                        if (!mtype || !mediaRoot || !mediaRoot[mtype]) {
                           throw new Error('Media tidak ditemukan di dalam pesan yang di-reply.');
                        }
                        return conn.downloadM(mediaRoot[mtype], mtype.replace(/message/i, ""), saveToFile, this.vM || this);
                     },
                     enumerable: true,
                     configurable: true
                  },
                  reply: {
                     value(text, chatId, options) {
                        return conn?.reply(chatId ? chatId : this.chat, text, this.vM, options);
                     },
                     enumerable: true
                  },
                  copy: {
                     value() {
                        const M = proto.WebMessageInfo;
                        return smsg(conn, M.create(M.toObject(this.vM)));
                     },
                     enumerable: true
                  },
                  forward: {
                     value(jid, force = false, options) {
                        return conn?.sendMessage(jid, {
                           forward: this.vM,
                           force,
                           ...options
                        }, { ...options });
                     },
                     enumerable: true
                  },
                  copyNForward: {
                     value(jid, forceForward = false, options) {
                        return conn?.copyNForward(jid, this.vM, forceForward, options);
                     },
                     enumerable: true
                  },
                  cMod: {
                     value(jid, text = '', sender = this.sender, options = {}) {
                        return conn?.cMod(jid, this.vM, text, sender, options);
                     },
                     enumerable: true
                  },
                  delete: {
                     value() {
                        return conn?.sendMessage(this.chat, { delete: this.vM.key });
                     },
                     enumerable: true
                  }
               }
            );
            return _quoted;
         },
         enumerable: true
      },
      download: {
         value(saveToFile = false) {
            const mtype = this.mediaType;
            const mediaRoot = this.mediaMessage;
            if (!mtype || !mediaRoot || !mediaRoot[mtype]) {
               throw new Error('Tidak ada media yang bisa diunduh dari pesan ini.');
            }
            return conn?.downloadM(mediaRoot[mtype], mtype.replace(/message/i, ''), saveToFile, this.vM || this);
         },
         enumerable: true,
         configurable: true
      },
      reply: {
         value(text, chatId, options) {
            return conn.reply(chatId ? chatId : this.chat, text, this, options);
         }
      },
      react: {
         value(emoji) {
            return conn.sendMessage(m.chat, {
               react: {
                  text: emoji,
                  key: m.key
               }
            });
         },
         enumerable: true
      },
      edit: {
         value(text, key) {
            return conn.sendMessage(this.chat, { text, edit: key || this.key });
         },
         enumerable: true
      },
      copy: {
         value() {
            const M = proto.WebMessageInfo;
            return smsg(conn, M.create(M.toObject(this)));
         },
         enumerable: true
      },
      forward: {
         value(jid, force = false, options = {}) {
            return conn?.sendMessage(jid, {
               forward: this,
               force,
               ...options
            }, { ...options });
         },
         enumerable: true
      },
      copyNForward: {
         value(jid, forceForward = false, options = {}) {
            return conn?.copyNForward(jid, this, forceForward, options);
         },
         enumerable: true
      },
      cMod: {
         value(jid, text = '', sender = this.sender, options = {}) {
            return conn?.cMod(jid, this, text, sender, options);
         },
         enumerable: true
      },
      getQuotedObj: {
         value() {
            if (!this.quoted?.id) return null;
            const q = proto.WebMessageInfo.create(conn?.loadMessage(this.quoted.id) || this.quoted.vM);
            return smsg(conn, q);
         },
         enumerable: true
      },
      getQuotedMessage: {
         get() {
            return this.getQuotedObj;
         }
      },
      delete: {
         value() {
            return conn?.sendMessage(this.chat, { delete: this.key });
         },
         enumerable: true
      },
      device: {
         get() {
            const device = getDevice(m.key?.id);
            const platform = os.platform();
            const isUnknownDevice = device === 'unknown' && platform;
            const res = device ? (isUnknownDevice ?
               (platform === 'android' ? 'Android Device' :
                  ['win32', 'darwin', 'linux'].includes(platform) ? 'Desktop' : 'Unknown Device')
               : device) : 'Unknown Device';
            return res;
         },
         enumerable: true
      },
      isBot: {
         get() {
            const idBot = m.key?.id;
            return ["3EB0"].some(k => idBot.includes(k) && m.sender !== conn?.user.jid);
         },
         enumerable: true
      }
   });
}

export function protoType() {
   Buffer.prototype.toArrayBuffer = function toArrayBufferV2() {
      const ab = new ArrayBuffer(this.length);
      const view = new Uint8Array(ab);
      for (let i = 0; i < this.length; ++i) {
         view[i] = this[i];
      }
      return ab;
   };

   Buffer.prototype.toArrayBufferV2 = function toArrayBuffer() {
      return this.buffer.slice(this.byteOffset, this.byteOffset + this.byteLength);
   };

   ArrayBuffer.prototype.toBuffer = function toBuffer() {
      return Buffer.from(new Uint8Array(this));
   };

   Uint8Array.prototype.getFileType =
      ArrayBuffer.prototype.getFileType =
      Buffer.prototype.getFileType =
         async function getFileType() {
            return await fileTypeFromBuffer(this);
         };

   String.prototype.isNumber = Number.prototype.isNumber = isNumber;

   String.prototype.capitalize = function capitalize() {
      return this.charAt(0).toUpperCase() + this.slice(1, this.length);
   };

   String.prototype.capitalizeV2 = function capitalizeV2() {
      const str = this.split(" ");
      return str.map(v => v.capitalize()).join(" ");
   };

   Number.prototype.toTimeString = function toTimeString() {
      const seconds = Math.floor((this / 1000) % 60);
      const minutes = Math.floor((this / (60 * 1000)) % 60);
      const hours = Math.floor((this / (60 * 60 * 1000)) % 24);
      const days = Math.floor(this / (24 * 60 * 60 * 1000));
      return ((days ? `${days} day(s) ` : "") + 
         (hours ? `${hours} hour(s) ` : "") + 
         (minutes ? `${minutes} minute(s) ` : "") + 
         (seconds ? `${seconds} second(s)` : "")).trim();
   };
   
   Number.prototype.getRandom = String.prototype.getRandom = Array.prototype.getRandom = getRandom;

   String.prototype.decodeJid = function decodeJid() {
      if (/:\d+@/gi.test(this)) {
         const decode = jidDecode(this) || {};
         return ((decode.user && decode.server && decode.user + "@" + decode.server) || this).trim();
      } else return this.trim();
   };
}

function getRandom() {
   if (Array.isArray(this) || this instanceof String) 
      return this[Math.floor(Math.random() * this.length)];
   return Math.floor(Math.random() * this);
}

const toBuffer = async (s) => {
   if (s && typeof s.getReader === 'function') {
      const reader = s.getReader();
      const chunks = [];
      for (;;) {
         const { value, done } = await reader.read();
         if (done) break;
         if (value) chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
   }
   if (s && typeof s[Symbol.asyncIterator] === 'function') {
      const chunks = [];
      for await (const chunk of s) {
         chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks);
   }
   if (Buffer.isBuffer(s)) return s;
   if (s instanceof ArrayBuffer) return Buffer.from(s);
   throw new Error('Unsupported stream type or invalid buffer');
};

async function generateProfilePicture(mediaUpload, mode = 'crop') {
   let bufferOrFilePath;
   if (Buffer.isBuffer(mediaUpload)) bufferOrFilePath = mediaUpload;
   else if (typeof mediaUpload === "string") {
      if (/^https?:\/\//i.test(mediaUpload)) {
         const res = await fetch(mediaUpload);
         bufferOrFilePath = Buffer.from(await res.arrayBuffer());
      } else {
         bufferOrFilePath = fs.readFileSync(mediaUpload);
      }
   }
   else if (mediaUpload && typeof mediaUpload === "object" && "url" in mediaUpload) {
      const res = await fetch(mediaUpload.url.toString());
      bufferOrFilePath = Buffer.from(await res.arrayBuffer());
   }
   else if (mediaUpload && typeof mediaUpload === "object" && "stream" in mediaUpload) {
      bufferOrFilePath = await toBuffer(mediaUpload.stream);
   }
   else {
      throw new Error('Unsupported media format for profile picture');
   }
   
   return await processProfilePicture(bufferOrFilePath, mode);
};

function nullish(args) {
   return !(args !== null && args !== undefined);
};

export function toPlainObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (Buffer.isBuffer(obj) ||
        obj instanceof Array ||
        obj instanceof Date ||
        obj instanceof RegExp ||
        obj instanceof Error) {
        return obj;
    }
    
    const plain = {};
    
    try {
        const allKeys = [
            ...Object.keys(obj),
            ...Object.getOwnPropertyNames(obj)
        ];
        
        const uniqueKeys = [...new Set(allKeys)];
        
        for (const key of uniqueKeys) {
            try {
                const descriptor = Object.getOwnPropertyDescriptor(obj, key);
                
                if (!descriptor.enumerable && !descriptor.get) continue;
                
                if (descriptor.get) {
                    try {
                        const value = obj[key];
                        plain[key] = value;
                    } catch (e) {
                        continue;
                    }
                } else if (descriptor.value !== undefined) {
                    plain[key] = descriptor.value;
                }
            } catch (e) {
                continue;
            }
        }
    } catch (e) {
        console.error('[toPlainObject Error]:', e.message);
        return obj;
    }
    
    return plain;
}