import store from "./store.js";
import fs from "fs";
import os from "os";
import path from "path";
import util from "util";
import chalk from "chalk";
import * as Jimp from "jimp";
import fetch from "node-fetch";
import crypto from "crypto";

import { format } from "util";
import { fileTypeFromBuffer } from "file-type";
import PhoneNumber from 'awesome-phonenumber';
import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";
import { toAudio } from "./converter.js";
import { imageToWebp, videoToWebp, writeExifImg, writeExifVid } from "./exif.js";
import tmpManager from './safe-tmp.js'
import { randomBytes } from "crypto";

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

const tmpFile = (ext = "") => path.join(process.cwd(), 'tmp', `${Date.now()}${ext}`);
const _isStatusJid = (id) => !id || id === "status@broadcast";
const _isGroupJid = (id = "") => id && id.endsWith("@g.us");

/**
 * Fungsi membuat socket ke baileys dengan fitur lengkap
 */
export function makeWASocket(connectionOptions, options = {}) {
   let conn = _makeWASocket(connectionOptions);
   
   // Override sendMessage untuk auto-mention
   const OrigMsg = conn.sendMessage.bind(conn);
   
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
      
      sendMessage: {
         value(jid, content, options = {}) {
            const text = content?.text || content?.caption || '';
            return OrigMsg(jid, {
               ...content,
               mentions: content.mentions || conn.parseMention(text)
            }, {
               ...options,
               useCachedGroupMetadata: options.useCachedGroupMetadata || true
            });
         }
      },
      
      decodeJid: {
         value(jid) {
            if (!jid || typeof jid !== "string") return (jid !== null && jid) || null;
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
               sender = conn.decodeJid(sender);
               if (!sender) return null;
               
               if (!conn.isLid) conn.isLid = new Map();
               if (conn.isLid.has(sender)) return conn.isLid.get(sender);
               if (!sender?.endsWith('@lid')) return sender;

               for (const chat of Object.values(conn.chats || {})) {
                  if (!chat?.metadata?.participants) continue;
                  const user = chat.metadata.participants.find(p => 
                     p.lid === sender || p.id === sender
                  );
                  if (user) {
                     const jid = user?.phoneNumber || user?.jid || user?.id;
                     conn.isLid.set(sender, jid);
                     return jid;
                  }
               }
               return sender;
            } catch (e) {
               console.error('[getJid Error]:', e.message);
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
               if (sender.endsWith("@s.whatsapp.net")) return sender.split("@")[0];
         
               if (conn.storeNumber[sender]) return conn.storeNumber[sender];
               for (let chat of Object.values(conn.chats || {})) {
                  if (!chat.metadata?.participants) continue;
                  const user = chat.metadata.participants.find(p => p.id === sender);
                  if (user?.phoneNumber) return conn.storeNumber[sender] = (user.phoneNumber).split("@")[0];
               }
               return sender;
            } catch (e) {
               console.error('[getNumber Error]:', e.message);
               return sender || "";
            }
         }
      },
      
      getLid: {
         value(sender) {
            try {
               if (!conn.storeLid) conn.storeLid = {};
               if (!sender || typeof sender !== "string") return "";
               const decoded = jidNormalizedUser(sender);
               if (decoded.endsWith("@lid")) return decoded;
               if (decoded && typeof decoded == "string") {
                  if (conn.storeLid[decoded]) return conn.storeLid[decoded];
                  for (let chat of Object.values(conn.chats || {})) {
                     const participants = chat.metadata?.participants;
                     if (!participants) continue;
                     const user = participants.find(p => p.phoneNumber === decoded);
                     if (user?.id) return (conn.storeLid[user.phoneNumber] = jidNormalizedUser(user.id));
                  }
               }
               return decoded;
            } catch (e) {
               console.error('[getLid Error]:', e.message);
               return sender || "";
            }
         }
      },
      
      getLidPN: {
         async value(sender) {
            try {
               if (!sender || typeof sender !== "string") return "";
               if (sender.endsWith("@s.whatsapp.net")) {
                  const lid = await conn.signalRepository?.lidMapping?.getLIDForPN?.(sender);
                  return lid?.decodeJid();
               } else if (sender.endsWith("@lid")) {
                  const Jid = await conn.signalRepository?.lidMapping?.getPNForLID?.(sender);
                  return Jid?.decodeJid();
               } else return sender;
            } catch (e) {
               console.error('[getLidPN Error]:', e.message);
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
         async value(jid, m) {
            try {
               if (!jid) return 'Unknown';
               const cleanJid = jid.decodeJid();
               let name = null;
               const chatData = conn.chats[cleanJid];
               if (chatData?.name && !/@s\.whatsapp\.net|@lid$/.test(chatData.name)) {
                  name = chatData.name;
               }
               if (!name) {
                  name = m.name || m.verifiedBizName || m.pushName || await conn.getName(cleanJid);
               }
               
               const isNameJustJid = /@s\.whatsapp\.net|@lid$/.test(name);
               const userInDb = global.db?.data?.users?.[cleanJid];
               const isDbNameJustJid = userInDb && /@s\.whatsapp\.net|@lid$/.test(userInDb.name);
               
               if (isNameJustJid || (userInDb && isDbNameJustJid)) {
                  try {
                     const businessProfile = await conn.getBusinessProfile(cleanJid).catch(() => null);
                     if (businessProfile?.vname && businessProfile.vname.trim() !== '') {
                        name = businessProfile.vname;
                     } else {
                        const profile = await conn.profilePictureUrl(cleanJid, 'image').catch(() => null);
                        if (profile) {
                           const contactInfo = conn.contacts?.[cleanJid];
                           if (contactInfo?.name && !/@s\.whatsapp\.net|@lid$/.test(contactInfo.name)) {
                              name = contactInfo.name;
                           }
                        }
                     }
                  } catch (e) {
                     console.log(`[getAndVerifyUsername] Gagal fetch profile untuk ${cleanJid}`);
                  }
               }
               
               if (userInDb && userInDb.name !== name && !/@s\.whatsapp\.net|@lid$/.test(name)) {
                  console.log(chalk.yellow(`[DB-HEAL] Updating name for ${cleanJid.split('@')[0]}: "${userInDb.name}" -> "${name}"`));
                  userInDb.name = name;
               }
               if (/@s\.whatsapp\.net|@lid$/.test(name)) {
                  const parts = name.split('@')[0];
                  if (parts.length > 10) {
                     return parts.slice(-10);
                  }
                  return parts || 'Unknown';
               }
               return name || 'Unknown';
            } catch (e) {
               console.error('[getAndVerifyUsername Error]:', e.message);
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
               ? (res = Buffer.from(await (await fetch(PATH)).arrayBuffer()))
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
               userJid: this.user.jid,
               upload: this.waUploadToServer
            });

            await this.relayMessage(album.key.remoteJid, album.message, {
               messageId: album.key.id
            });

            for (let content of items) {
               const img = await generateWAMessage(album.key.remoteJid, content, {
                  ...(options.quoted ? { quoted: options.quoted } : {}),
                  ...(options.mentions ? { mentions: options.mentions } : {}),
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
               await new Promise(resolve => setTimeout(resolve, delay));
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
               ? await (await fetch(path)).buffer()
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
               ? await (await fetch(path)).buffer()
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
TEL;type=CELL;type=VOICE;waid=${number}:${PhoneNumber('+' + number).getNumber('international')}${
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
            const { data } = await conn.getFile(path);
            return conn.sendMessage(jid, {
               text: text,
               contextInfo: {
                  externalAdReply: {
                     title: options.title || global.namebot,
                     body: options.body || '',
                     thumbnail: data,
                     mediaType: 1,
                     renderLargerThumbnail: options.large || true,
                     thumbnailUrl: options.source || global.source,
                     sourceUrl: options.source || global.source
                  }
               }
            }, { quoted: m });
         }
      },
      
      sendPoll: {
         async value(jid, name = '', optiPoll, options) {
            if (!Array.isArray(optiPoll[0]) && typeof optiPoll[0] === 'string') optiPoll = [optiPoll];
            if (!options) options = {};
            
            const pollMessage = {
               name: name,
               options: optiPoll.map(btn => ({
                  optionName: (btn[0] !== null && btn[0]) || ''
               })),
               selectableOptionsCount: 1
            };
            return conn.relayMessage(jid, { pollCreationMessage: pollMessage }, { ...options });
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
         async value(m, type, saveToFile) {
            try {
               if (!m || !(m.url || m.directPath)) {
                  throw new Error('Invalid message or media not found.');
               }
               
               const dlType = type === 'sticker' ? 'image' : type;
               let stream;
               try {
                  stream = await downloadContentFromMessage(m, dlType);
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
                           stream = await downloadContentFromMessage(m, dlType);
                        } finally {
                           nodeStream.Readable.fromWeb = origFromWeb;
                        }
                     } else {
                        throw e;
                     }
                  } else {
                     throw e;
                  }
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
                  throw new Error('Unsupported stream type from downloadContentFromMessage');
               };
               
               const buffer = await toBuffer(stream);
               
               if (saveToFile) {
                  const fileType = await fileTypeFromBuffer(buffer);
                  const filename = saveToFile || `downloaded_media.${fileType?.ext || 'bin'}`;
                  await fs.promises.writeFile(filename, buffer);
                  return filename;
               }
               
               return buffer;
            } catch (err) {
               console.error('Error downloading media message:', err);
               throw new Error('Failed to download media: ' + err.message);
            }
         },
         enumerable: true
      },
      
      parseMention: {
         value(text = "") {
            try {
               const regex = /@?(\d{5,20})(?:@s\.whatsapp\.net)?/g;
               const mentions = [];
               let match;

               while ((match = regex.exec(text)) !== null) {
                  const raw = match[1];
                  if (!raw) continue;
                  
                  const pn = PhoneNumber(`+${raw}`);

                  if (pn.valid) {
                     mentions.push(conn.getLid(`${raw}@s.whatsapp.net`));
                  } else if (raw.length >= 13 && !raw.startsWith("1203")) {
                     mentions.push(`${raw}@lid`);
                  }
               }

               return [...new Set(mentions)];
            } catch (e) {
               console.error('[parseMention Error]:', e.message);
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
            if (isGroup) metadata = await conn.groupMetadata(id);
            let chat = {
               ...(conn.contacts[id] || {}),
               id,
               ...(isGroup ? { subject: metadata.subject, desc: metadata.desc } : { name })
            };
            conn.contacts[id] = chat;
            conn.chats[id] = chat;
         }
      },
      
      getName: {
         value: async function(jid = "", withoutContact = false) {
            try {
               if (!jid) return "";
               jid = conn.decodeJid(jid);
               withoutContact = conn.withoutContact || withoutContact;
         
               if (_isGroupJid(jid)) {
                  const chat = conn.chats[jid];
                  if (chat?.subject) return chat.subject;
            
                  const cached = conn._groupMetaCache.get(jid);
                  if (cached) return cached.subject;
            
                  try {
                     const md = await conn.groupMetadata(jid);
                     if (md) {
                        conn._groupMetaCache.set(jid, md);
                        return md.subject || chat?.name || jid;
                     }
                  } catch {
                     return chat?.name || jid;
                  }
               }
         
               const self = conn.user?.lid && areJidsSameUser ?
                  areJidsSameUser(jid, conn.user.lid) : false;
         
               const v = jid === "0@s.whatsapp.net" ?
                  { jid, vname: "WhatsApp" } :
                  self ?
                  conn.user :
                  conn.chats[jid] || {};
         
               let name = v.name || v.vname || v.notify || v.verifiedName || v.subject;
      
               if (!name || /@s\.whatsapp\.net|@lid$/.test(name)) {
                  const jidParts = jid.split('@')[0];
                  if (jidParts.length > 10) {
                     name = jidParts.slice(-10);
                  } else {
                     name = jidParts;
                  }
               }
         
               return withoutContact ? "" : (name || jid.split('@')[0]);
            } catch (e) {
               console.error('[getName Error]:', e.message);
               return jid?.split('@')[0] || "";
            }
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
         async value(jid, content) {
            const { img } = await generateProfilePicture(content);
            return conn.query({
               tag: "iq",
               attrs: { to: jidNormalizedUser(jid), type: "set", xmlns: "w:profile:picture" },
               content: [{ tag: "picture", attrs: { type: "image" }, content: img }]
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

/**
 * Serialize Message dengan dukungan interactive message
 */
export async function smsg(conn, m, hasParent) {
   if (!m) return m;

   m = proto.WebMessageInfo.create(m);
   m.message = parseMessage(m.message);
   
   const messageId = generateMessageIDV2().slice(0, 4);
   const MediaType = [
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
   ];

   // Define conn property
   Object.defineProperty(m, 'conn', {
      enumerable: false,
      writable: true,
      value: conn
   });

   // Handle protocol message
   let protocolMessageKey;
   if (m.message) {
      if (m.mtype == 'protocolMessage' && m.msg.key) {
         protocolMessageKey = m.msg.key;
         if (protocolMessageKey == 'status@broadcast') protocolMessageKey.remoteJid = m.chat;
         if (!protocolMessageKey.participant || protocolMessageKey.participant == 'status_me') 
            protocolMessageKey.participant = m.sender;
         protocolMessageKey.fromMe = conn.decodeJid(protocolMessageKey.participant) === conn.decodeJid(conn.user.id);
         if (!protocolMessageKey.fromMe && protocolMessageKey.remoteJid === conn.decodeJid(conn.user.id)) 
            protocolMessageKey.remoteJid = m.sender;
      }
      if (m.quoted) if (!m.quoted.mediaMessage) delete m.quoted.download;
   }
   if (!m.mediaMessage) delete m.download;

   try {
      if (protocolMessageKey && m.mtype == 'protocolMessage') 
         conn.ev.emit('message.delete', protocolMessageKey);
   } catch (e) {
      console.error(e);
   }

   return Object.defineProperties(m, {
      id: {
         get() {
            return m.key.id;
         }
      },
      isBaileys: {
         get() {
            return (m.id?.startsWith(messageId) && m.id?.length === 22) || false;
         }
      },
      chat: {
         get() {
            const senderKeyDistributionMessage = m.message?.senderKeyDistributionMessage?.groupId;
            return (m.key?.remoteJid ||
               (senderKeyDistributionMessage && senderKeyDistributionMessage !== 'status@broadcast') ||
               '').decodeJid();
         },
         enumerable: true
      },
      isGroup: {
         get() {
            return m.chat.endsWith('@g.us');
         },
         enumerable: true
      },
      sender: {
         get() {
            return conn?.getLid(m.key.participant || m.key.participantAlt ||
               m.key.remoteJid || m.key.remoteJidAlt || '');
         },
         enumerable: true
      },
      fromMe: {
         get() {
            return m.key?.fromMe || areJidsSameUser((conn?.user?.lid || conn?.user?.id || '').decodeJid(), m.sender) || false;
         },
         enumerable: true
      },
      mtype: {
         get() {
            if (!m.message) return '';
            const type = Object.keys(m.message);
            return (!['senderKeyDistributionMessage', 'messageContextInfo'].includes(type[0]) && type[0]) ||
               (type.length >= 3 && type[1] !== 'messageContextInfo' && type[1]) ||
               type[type.length - 1];
         },
         enumerable: true
      },
      msg: {
         get() {
            if (!m.message) return null;
            return parseMessage(m.message[m.mtype]);
         }
      },
      mediaMessage: {
         get() {
            if (!m.message) return null;
            const Message = ((m.msg?.url || m.msg?.directPath) ?
               { ...m.message } : extractMessageContent(m.message)) || null;
            if (!Message) return null;
            const mtype = Object.keys(Message)[0];
            return MediaType.includes(mtype) ? Message : null;
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
            const msg = m.msg;
            let extractedText = "";

            if (m.mtype === 'conversation') {
               extractedText = m.message.conversation;
            } else if (m.mtype === 'extendedTextMessage') {
               extractedText = m.message.extendedTextMessage.text;
            } else if (m.mtype === 'templateButtonReplyMessage') {
               extractedText = m.message.templateButtonReplyMessage.selectedId || '';
            } else if (m.mtype === 'interactiveResponseMessage') {
               const response = m.message.interactiveResponseMessage;
               if (response.nativeFlowResponseMessage?.paramsJson) {
                  try {
                     const params = JSON.parse(response.nativeFlowResponseMessage.paramsJson);
                     extractedText = params.id || '';
                  } catch (e) {
                     console.error("Error parsing interactive response JSON:", e);
                  }
               } else if (response.listResponseMessage?.singleSelectReply?.selectedRowId) {
                  extractedText = response.listResponseMessage.singleSelectReply.selectedRowId;
               }
            } else if (m.mtype === 'buttonsResponseMessage') {
               extractedText = m.message.buttonsResponseMessage.selectedButtonId || '';
            } else if (m.mtype === 'listResponseMessage') {
               extractedText = m.message.listResponseMessage.singleSelectReply?.selectedRowId || '';
            }

            const text = extractedText || (typeof msg === "string" ? msg : msg?.text) ||
               msg?.caption || msg?.contentText || "";

            return typeof m._text === "string" ? m._text : "" ||
               (typeof text === "string" ? text :
                  text?.selectedDisplayText || text?.hydratedTemplate?.hydratedContentText || text) || "";
         },
         set(str) {
            return (m._text = str);
         },
         enumerable: true
      },
      mentionedJid: {
         get() {
            let raw = m.msg?.contextInfo?.mentionedJid || [];
            let raws = raw.length > 0 ? raw : m.text ? conn.parseMention(m.text) : [];
            return raws.map(Jid => conn.getLid(Jid));
         },
         enumerable: true
      },
      name: {
         get() {
            return (typeof m.pushName === 'string' && m.pushName.trim()) || conn?.getName(m.sender);
         },
         enumerable: true
      },
      quoted: {
         get() {
            const qthis = this;
            const msg = qthis.msg;
            const contextInfo = msg?.contextInfo;
            const quoted = parseMessage(contextInfo?.quotedMessage);
            if (!msg || !contextInfo || !quoted) return null;

            const type = Object.keys(quoted)[0];
            let q = quoted[type];
            const text = typeof q === "string" ? q : q.text;

            return Object.defineProperties(
               JSON.parse(JSON.stringify(typeof q === "string" ? { text: q } : q)),
               {
                  mtype: {
                     get() { return type; },
                     enumerable: true
                  },
                  mediaMessage: {
                     get() {
                        const Message = ((q.url || q.directPath) ?
                           { ...quoted } : extractMessageContent(quoted)) || null;
                        if (!Message) return null;
                        const mtype = Object.keys(Message)[0];
                        return MediaType.includes(mtype) ? Message : null;
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
                        const id = this.id;
                        return /^3A|2A.{18}$/.test(id) ? false : /^(.{21}|.{32})$/.test(id) ? false : true;
                     },
                     enumerable: true
                  },
                  sender: {
                     get() { return conn?.getLid(contextInfo.participant || ""); },
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
                        let raw = q.contextInfo?.mentionedJid || qthis.getQuotedObj?.()?.mentionedJid || [];
                        return raw.map(jid => conn.getLid(jid));
                     },
                     enumerable: true
                  },
                  name: {
                     get() {
                        const sender = this.sender;
                        return sender ? conn?.getName(sender) : null;
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
                              participant: this.sender
                           },
                           message: quoted,
                           ...(qthis.isGroup ? { participant: this.sender } : {})
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
                        return conn.downloadM(mediaRoot[mtype], mtype.replace(/message/i, ""), saveToFile);
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
            return conn?.downloadM(mediaRoot[mtype], mtype.replace(/message/i, ''), saveToFile);
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

async function generateProfilePicture(mediaUpload) {
   let bufferOrFilePath;
   if (Buffer.isBuffer(mediaUpload)) bufferOrFilePath = mediaUpload;
   else if ("url" in mediaUpload) bufferOrFilePath = mediaUpload.url.toString();
   else bufferOrFilePath = await toBuffer(mediaUpload.stream);
   
   const { read, MIME_JPEG, AUTO } = await Promise.resolve().then(async () => (await import("jimp")).default);
   const jimp = await read(bufferOrFilePath);
   const min = jimp.getWidth();
   const max = jimp.getHeight();
   const cropped = jimp.crop(0, 0, min, max);
   
   return {
      img: await cropped.quality(100).scaleToFit(720, 720, AUTO).getBufferAsync(MIME_JPEG)
   };
}

function nullish(args) {
   return !(args !== null && args !== undefined);
}