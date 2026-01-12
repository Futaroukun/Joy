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
import { parsePhoneNumber } from "awesome-phonenumber";
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
   prepareWAMessageMedia
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
      // Cache untuk metadata grup
      _groupMetaCache: {
         value: new Map(),
         writable: true,
         configurable: true
      },
      
      decodeJid: {
         value(jid) {
            if (!jid || typeof jid !== "string") return (jid !== null && jid) || null;
            return jid.decodeJid();
         }
      },
      
      getNumber: {
         value(sender) {
            if (!conn.storeNumber) conn.storeNumber = {};
            if (!sender || typeof sender !== "string") return "";
            if (sender.endsWith("@s.whatsapp.net")) return sender.split("@")[0];
      
            if (conn.storeNumber[sender]) return conn.storeNumber[sender];
            for (let chat of Object.values(conn.chats)) {
               if (!chat.metadata?.participants) continue;
               const user = chat.metadata.participants.find(p => p.id === sender);
               if (user?.phoneNumber) return conn.storeNumber[sender] = (user.phoneNumber).split("@")[0];
            }
            return sender;
         }
      },
      
      getLid: {
         value(sender) {
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
         }
      },
      
      getLidPN: {
         async value(sender) {
            if (!sender || typeof sender !== "string") return "";
            if (sender.endsWith("@s.whatsapp.net")) {
               const lid = await conn.signalRepository?.lidMapping?.getLIDForPN?.(sender);
               return lid?.decodeJid();
            } else if (sender.endsWith("@lid")) {
               const Jid = await conn.signalRepository?.lidMapping?.getPNForLID?.(sender);
               return Jid?.decodeJid();
            } else return sender;
         }
      },
      
      // === FITUR BARU: waitEvent ===
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
                              fromMe: areJidsSameUser((conn?.user.lid).decodeJid(), remoteJid),
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
                     sender = conn.decodeJid((message.key?.fromMe && (conn?.user.lid).decodeJid()) || 
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
                  
                  const fromMe = message.key.fromMe || areJidsSameUser(sender || chat, (conn?.user.lid).decodeJid());
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
                  console.error(e);
               }
            }
         }
      },
      
      // gatau buatan Rafli
      getAndVerifyUsername: {
         async value(jid) {
            if (!jid) return 'Unknown';
            const cleanJid = jid.decodeJid();
            let name = await this.getName(cleanJid);
            const isNameJustJid = /@s\.whatsapp\.net|@lid$/.test(name);
            const userInDb = global.db?.data?.users[cleanJid];
            const isDbNameJustJid = userInDb && /@s\.whatsapp\.net|@lid$/.test(userInDb.name);
            if (isNameJustJid || (userInDb && isDbNameJustJid)) {
               try {
                  const profile = await this.getProfileInfo(cleanJid);
                  if (profile.pushname && profile.pushname.trim() !== '') {
                     name = profile.pushname;
                  }
               } catch (e) {
                  console.log(`[getAndVerifyUsername] Gagal fetch profile untuk ${cleanJid}`);
               }
            }
            if (userInDb && userInDb.name !== name && !/@s\.whatsapp\.net|@lid$/.test(name)) {
               console.log(`[DB-HEAL] Updating name for ${cleanJid}: "${userInDb.name}" -> "${name}"`);
               userInDb.name = name;
            }
            if (/@s\.whatsapp\.net|@lid$/.test(name)) {
               return name.split('@')[0];
            }
            return name;
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
               ? await (res = await fetch(PATH)).buffer()
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
      
      // === FITUR BARU: sendAlbum ===
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
         
         // FALLBACK: Send dengan buffer langsung
         m = await conn.sendMessage(jid, {
            ...message,
            [mtype]: file
         }, { ...opt, ...options });
      } finally {
         // CLEANUP
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
      
      reply: {
         async value(jid, text = '', quoted, options) {
            return Buffer.isBuffer(text)
               ? conn.sendFile(jid, text, "file", "", quoted, false, options)
               : conn.sendMessage(
                    jid,
                    {
                       ...options,
                       text,
                       contextInfo: {
                          mentionedJid: conn.parseMention(text)
                       },
                       ...options
                    },
                    { quoted, ...options }
                 );
         }
      },
      
      // === FITUR BARU: sendPoll ===
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
         value(jid, message, text = '', sender = (conn?.user.lid).decodeJid(), options = {}) {
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
            copy.key.fromMe = areJidsSameUser(sender, (conn?.user.lid).decodeJid()) || false;
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
               userJid: (conn?.user.lid).decodeJid()
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
         value(jid, text = '', fakeJid = (conn?.user.lid).decodeJid(), fakeText = '', fakeGroupJid, options) {
            return conn.reply(jid, text, {
               key: {
                  fromMe: areJidsSameUser(fakeJid, (conn?.user.lid).decodeJid()),
                  participant: fakeJid,
                  ...(fakeGroupJid ? { remoteJid: fakeGroupJid } : {})
               },
               message: { conversation: fakeText },
               ...options
            });
         }
      },
      
      downloadM: {
   /**
    * Download media message
    * @param {Object} m - The message object containing media
    * @param {String} type - The type of media to download (e.g., 'image', 'video', 'audio', 'document')
    * @param {fs.PathLike | fs.promises.FileHandle} saveToFile - Path to save the downloaded file (optional)
    * @returns {Promise<fs.PathLike | fs.promises.FileHandle | Buffer>} - Returns path to file or buffer
    */
   async value(m, type, saveToFile) {
      try {
         // Validate input
         if (!m || !(m.url || m.directPath)) {
            throw new Error('Invalid message or media not found.');
         }
         
         // Download content from message (Baileys returns an async iterable or a Web ReadableStream depending on env)
         // Workaround: some Baileys versions choke on 'sticker' type with Node PassThrough. Use 'image' for webp stickers.
         const dlType = type === 'sticker' ? 'image' : type;
         let stream;
         try {
            stream = await downloadContentFromMessage(m, dlType);
         } catch (e) {
            // Fallback: if environment complains about ReadableStream vs PassThrough, temporarily patch fromWeb
            if (/readableStream/i.test(String(e?.message)) && /PassThrough/i.test(String(e?.message))) {
               const nodeStream = await import('stream');
               const origFromWeb = nodeStream.Readable.fromWeb?.bind(nodeStream.Readable);
               if (origFromWeb) {
                  try {
                     nodeStream.Readable.fromWeb = function(rs, opts) {
                        // If it's not a WHATWG ReadableStream (no getReader), just return rs as-is
                        if (rs && typeof rs.getReader !== 'function') return rs;
                        return origFromWeb(rs, opts);
                     };
                     stream = await downloadContentFromMessage(m, dlType);
                  } finally {
                     // Restore original to avoid side effects
                     nodeStream.Readable.fromWeb = origFromWeb;
                  }
               } else {
                  throw e;
               }
            } else {
               throw e;
            }
         }
         
         // Normalize any stream-like (AsyncIterable, Node Readable, or Web ReadableStream) to Buffer
         const toBuffer = async (s) => {
            // Web ReadableStream (WHATWG)
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
            // Async iterable (Node Readable or async generator)
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
         
         // If saveToFile is provided, save the buffer to file
         if (saveToFile) {
            const fileType = await fileTypeFromBuffer(buffer);
            const filename = saveToFile || `downloaded_media.${fileType?.ext || 'bin'}`;
            await fs.promises.writeFile(filename, buffer);
            return filename; // Return file path
         }
         
         return buffer; // Return the buffer if not saving to a file
      } catch (err) {
         console.error('Error downloading media message:', err);
         throw new Error('Failed to download media: ' + err.message);
      }
   },
   enumerable: true
},
      
      parseMention: {
         value(text = "") {
            const regex = /@?(\d{5,20})(?:@s\.whatsapp\.net)?/g;
            const mentions = [];
            let match;

            while ((match = regex.exec(text)) !== null) {
               const raw = match[1];
               const pn = parsePhoneNumber(`+${raw}`);

               if (pn.valid) {
                  mentions.push(conn.getLid(`${raw}@s.whatsapp.net`));
               } else if (raw.length >= 13 && !raw.startsWith("1203")) {
                  mentions.push(`${raw}@lid`);
               }
            }

            return [...new Set(mentions)];
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
         value: async function (jid = "", withoutContact = false) {
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

            const v = jid === "12066409886@s.whatsapp.net"
               ? { jid, vname: "WhatsApp" }
               : self
               ? conn.user
               : conn.chats[jid] || {};

            const name = v.name || v.vname || v.notify || v.verifiedName || v.subject;
            return withoutContact ? "" : name || jid;
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
            value(jid, participant = (conn?.user.lid).decodeJid(), messageID) {
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
 * Serialize Message dengan dukungan interactive message
 */
export async function smsg(conn, m, hasParent) {
   if (!m) return m;

   m = proto.WebMessageInfo.create(m);
   const messageId = generateMessageIDV2().slice(0, 4);
   const MediaType = [
      "audioMessage", "bcallMessage", "botInvokeMessage", "buttonsMessage",
      "buttonsResponseMessage", "contactMessage", "conversation", "contactsArrayMessage",
      "documentMessage", "documentWithCaptionMessage", "editedMessage", "ephemeralMessage",
      "extendedTextMessage", "groupInviteMessage", "groupMentionedMessage", "imageMessage",
      "interactiveMessage", "interactiveResponseMessage", "invoiceMessage", "listMessage",
      "listResponseMessage", "liveLocationMessage", "locationMessage", "lottieStickerMessage",
      "messageHistoryBundle", "newsletterAdminInviteMessage", "orderMessage",
      "pollCreationMessage", "pollCreationMessageV2", "pollCreationMessageV3",
      "pollUpdateMessage", "productMessage", "protocolMessage", "ptvMessage",
      "reactionMessage", "requestPaymentMessage", "scheduledCallCreationMessage",
      "scheduledCallEditMessage", "sendPaymentMessage", "senderKeyDistributionMessage",
      "stickerMessage", "templateButtonReplyMessage", "templateMessage", "videoMessage",
      "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension"
   ];

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
            return m.key?.fromMe || areJidsSameUser((conn?.user.lid).decodeJid(), m.sender) || false;
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
            return m.message[m.mtype];
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
            const quoted = contextInfo?.quotedMessage;
            if (!msg || !contextInfo || !quoted) return null;

            const type = Object.keys(quoted)[0];
            let q = quoted[type];
            const text = typeof q === "string" ? q : q.text;

            // PERBAIKAN #1: Definisikan properti media untuk objek quoted
            return Object.defineProperties(
               JSON.parse(JSON.stringify(typeof q === "string" ? { text: q } : q)),
               {
                  mtype: {
                     get() { return type; },
                     enumerable: true
                  },
                  mediaMessage: { // DITAMBAHKAN
                     get() {
                        const Message = ((q.url || q.directPath) ?
                           { ...quoted } : extractMessageContent(quoted)) || null;
                        if (!Message) return null;
                        const mtype = Object.keys(Message)[0];
                        return MediaType.includes(mtype) ? Message : null;
                     },
                     enumerable: true
                  },
                  mediaType: { // DITAMBAHKAN
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
                     get() { return contextInfo.remoteJid || qthis.chat; },
                     enumerable: true
                  },
                  sender: {
                     get() { return conn?.getLid(contextInfo.participant || ""); },
                     enumerable: true
                  },
                  fromMe: {
                     get() {
                        return areJidsSameUser(this.sender, (conn?.user.lid).decodeJid());
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
                  // PERBAIKAN #2: Gunakan konteks `this` untuk download, bukan `m`
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
                  }
               }
            );
         },
         enumerable: true
      },
      // PERBAIKAN #3: Perbaiki `self.conn` menjadi `conn` dan pesan error
      download: {
          value(saveToFile = false) {
              const mtype = this.mediaType;
              const mediaRoot = this.mediaMessage;
              if (!mtype || !mediaRoot || !mediaRoot[mtype]) {
                  throw new Error('Tidak ada media yang bisa diunduh dari pesan ini.');
              }
              // Ganti self.conn menjadi conn
              return conn?.downloadM(mediaRoot[mtype], mtype.replace(/message/i, ''), saveToFile);
          },
          enumerable: true,
          configurable: true,
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