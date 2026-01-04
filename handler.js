import "./settings.js";
import { smsg } from "./function/simple.js";
import { storeMessage, handleMessageRevocation } from "./function/antidelete.js";
import { handleCall as antiCallHandler } from "./function/anticall.js";
import { fileURLToPath } from "url";
import path from "path";
import { format } from "util";
import { unwatchFile, watchFile, readFileSync } from "fs";
import chalk from "chalk";
import { jidNormalizedUser } from '@whiskeysockets/baileys';

const isNumber = x => typeof x === "number" && !isNaN(x);
const printMessages = (await import("./function/print.js")).default;

// ===== CLEAN LID =====
function cleanLID(jid) {
    if (!jid) return null;
    
    const decoded = jidNormalizedUser(jid);
    
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':');
        const mainId = parts[0];
        return `${mainId}@lid`;
    }
    
    return decoded;
}

// ===== FUNGSI HELPER UNTUK KONVERSI LID =====
/**
 * Konversi JID ke LID dengan fallback
 * @param {Object} conn - Connection object
 * @param {String} jid - JID yang akan dikonversi
 * @returns {Promise<String>} - LID hasil konversi
 */
async function ensureLID(conn, jid) {
    if (!jid) return null;
    
    // Jika sudah LID, return langsung
    if (jid.endsWith('@lid')) return jid;
    
    try {
        // Coba ambil dari cache
        const cachedLID = conn.getLid(jid);
        if (cachedLID && cachedLID.endsWith('@lid')) {
            return cachedLID;
        }
        
        // Coba fetch dari server
        if (jid.endsWith('@s.whatsapp.net')) {
            const serverLID = await conn.getLidPN(jid);
            if (serverLID && serverLID.endsWith('@lid')) {
                // Update cache
                if (!conn.storeLid) conn.storeLid = {};
                conn.storeLid[jid] = serverLID;
                return serverLID;
            }
        }
        
        // Fallback ke fungsi bawaan
        return conn.getLid(jid);
    } catch (error) {
        console.error(`Error converting ${jid} to LID:`, error.message);
        return conn.getLid(jid);
    }
}

/**
 * Migrasi data user dari JID ke LID
 * @param {Object} db - Database object
 * @param {String} oldJid - JID lama
 * @param {String} newLid - LID baru
 */
function migrateUserData(db, oldJid, newLid) {
    if (!db.data.users[oldJid]) return false;
    
    // Ambil data JID lama
    const oldData = db.data.users[oldJid];
    
    // Ambil data LID yang mungkin sudah ada
    const existingLidData = db.data.users[newLid] || {};
    
    // Gabungkan data: data dari JID lama menimpa data LID yang ada
    db.data.users[newLid] = {
        ...existingLidData,
        ...oldData
    };
    
    // Hapus data JID lama untuk membersihkan database
    delete db.data.users[oldJid];
    
    const phone = oldJid.split('@')[0];
    const lidNum = newLid.split('@')[0].slice(-8);
    console.log(chalk.green(`[MIGRATE] SUCCESS: ${phone} -> ...${lidNum}. Data merged.`));
    return true;
}

// Function Anti Call
export async function handleCall(json) {
    await antiCallHandler.call(this, json)
}

export async function handler(chatUpdate) {
    if (!chatUpdate) return;

    if (!chatUpdate.messages || !Array.isArray(chatUpdate.messages)) return;
    
    try {
        await this.pushMessage(chatUpdate.messages);
    } catch (e) {
        console.error('Error pushing messages:', e);
    }

    let m = chatUpdate.messages[chatUpdate.messages.length - 1];
    if (!m) return;

    try {
        m = (await smsg(this, m)) || m;
        
        if (m.mtype === 'protocolMessage' && m.msg.type === 0) {
            console.log(chalk.white.bold(" [SISTEM]") + " " + chalk.red.bold(`ANTI-DELETE: Pesan tipe REVOKE terdeteksi di ${m.chat}`));
            await handleMessageRevocation(this, m);
            return;
        }
        
        if (m.sender.endsWith("@broadcast") || m.sender.endsWith("@newsletter")) return;
        
        // ===== KONVERSI SENDER KE LID =====
        const senderLID = await ensureLID(this, m.sender);
        
        // Log HANYA jika ada konversi JID -> LID (bukan LID -> LID)
        if (m.sender !== senderLID && !m.sender.endsWith('@lid')) {
            console.log(chalk.blue(`[LID] ${m.sender} -> ${senderLID}`));
        }
        
        // Anti Delete
        await storeMessage(m, this);
        
        // Handle mentions
        if (m?.msg?.contextInfo?.mentionedJid?.length) {
            if (!conn.storeMentions) conn.storeMentions = {};
            const jidMentions = await Promise.all(
                m.msg.contextInfo.mentionedJid.map(jid => ensureLID(this, jid))
            );
            conn.storeMentions[m.id] = [...new Set(jidMentions)];
        }
        
        // Fetch LID jika belum ada
        if (conn.storeLid && Object.keys(conn.storeLid).length == 0) {
            try {
                const data = await conn.groupFetchAllParticipating();
                for (let group of Object.values(data)) {
                    if (!group) continue;
                    for (let p of group.participants) {
                        if (!p || !p.id || !p.phoneNumber) continue;
                        conn.storeLid[p.phoneNumber] = p.id;
                    }
                }
                console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold("FETCHING LID SUKSES!")}`);
            } catch (e) {
                console.error('Error fetching LID:', e);
            }
        }
        
        if (m.isBaileys) return;
        
        const botLid = cleanLID(this?.user?.lid);
        
        let isROwner = false;
        let isOwner = false;
        let isPremium = false;
        let decodedOwnLid = [];
        let userDb = {};
        
        // ===== LOAD DATABASE DENGAN LID =====
        try {
            if (global.db.data == null) await global.loadDatabase();
            
            // ===== MIGRASI OTOMATIS DARI JID KE LID =====
            if (m.sender !== senderLID && global.db.data.users[m.sender]) {
                migrateUserData(global.db, m.sender, senderLID);
            }
            
            if (!senderLID.endsWith('@g.us')) {
            // Gunakan LID untuk akses database
            let user = global.db.data.users[senderLID];
            if (typeof user !== "object") global.db.data.users[senderLID] = {};
            const resolvedName = await conn.getAndVerifyUsername(senderLID); 
            
            if (user) {
                if (!user.name || typeof user.name === 'object') {
                    user.name = resolvedName;
                }
                if (!isNumber(user.age)) user.age = -1;
                if (!isNumber(user.level)) user.level = 0;
                if (!isNumber(user.exp)) user.exp = 0;
                if (!isNumber(user.limit)) user.limit = 10;

                if (!("afk" in user)) user.afk = false;
                if (!("afkReason" in user)) user.afkReason = "";
                if (!("register" in user)) user.register = false;
                if (!("premium" in user)) user.premium = false;
                if (!("banned" in user)) user.banned = false;

                if (!isNumber(user.afkTime)) user.afkTime = -1;
                if (!isNumber(user.regTime)) user.regTime = -1;
                if (!isNumber(user.premiumDate)) user.premiumDate = -1;
                if (!isNumber(user.bannedDate)) user.bannedDate = -1;
            } else {
                global.db.data.users[senderLID] = {
                    name: resolvedName,
                    age: -1,
                    level: 0,
                    exp: 0,
                    limit: 10,
                    afk: false,
                    afkReason: "",
                    register: false,
                    premium: false,
                    banned: false,
                    afkTime: -1,
                    regTime: -1,
                    premiumDate: -1,
                    bannedDate: -1
                };
                
                // Log HANYA untuk user benar-benar baru
                console.log(chalk.green(`[NEW USER] ${senderLID} registered in database`));
                }
            }

            decodedOwnLid = await Promise.all(
                global.owner.map(async o => {
                    const jid = `${o.replace(/[^0-9]/g, "")}@s.whatsapp.net`;
                    return await ensureLID(conn, jid);
                })
            );
            
            userDb = global.db.data.users[senderLID] || {};
            isROwner = ([...decodedOwnLid] || botLid).includes(senderLID);
            isOwner = isROwner || m.fromMe || false;
            isPremium = userDb.premium === true;

            if (isOwner || isPremium) {
                userDb.limit = Infinity;
            }

            if (m.isGroup) {
                let chat = global.db.data.chats[m.chat];
                if (typeof chat !== "object") global.db.data.chats[m.chat] = {};
                if (chat) {
                    if (!("antispam" in chat)) chat.antispam = false;
                    if (!("antilink" in chat)) chat.antilink = false;
                    if (!("antidelete" in chat)) chat.antidelete = false;
                    if (!("antivirtex" in chat)) chat.antivirtex = false;
                    if (!("mute" in chat)) chat.mute = false;
                    if (!("detect" in chat)) chat.detect = true;
                    if (!("sambutan" in chat)) chat.sambutan = true;
                    if (!("sewa" in chat)) chat.sewa = false;
                    if (!("sWelcome" in chat)) chat.sWelcome = "";
                    if (!("sBye" in chat)) chat.sBye = "";
                    if (!("sPromote" in chat)) chat.sPromote = "";
                    if (!("sDemote" in chat)) chat.sDemote = "";
                    if (!isNumber(chat.sewaDate)) chat.sewaDate = -1;
                } else {
                    global.db.data.chats[m.chat] = {
                        antispam: false,
                        antilink: false,
                        antidelete: false,
                        antivirtex: false,
                        mute: false,
                        detect: true,
                        sambutan: true,
                        sewa: false,
                        sWelcome: "",
                        sBye: "",
                        sPromote: "",
                        sDemote: "",
                        sewaDate: -1
                    };
                }
            }

            let setting = global.db.data.settings[botLid];
            if (typeof setting !== "object") global.db.data.settings[botLid] = {};
            if (setting) {
                if (!("chatMode" in setting)) setting.chatMode = "";
                if (!("antispam" in setting)) setting.antispam = true;
                if (!("antiCall" in setting)) setting.antiCall = true;
                if (!("autoread" in setting)) setting.autoread = true;
                if (!("autobackup" in setting)) setting.autobackup = true;
                if (!isNumber(setting.backupDate)) setting.backupDate = -1;
            } else {
                global.db.data.settings[botLid] = {
                    chatMode: "",
                    antispam: true,
                    antiCall: true,
                    autoread: true,
                    autobackup: true,
                    backupDate: -1
                };
            }
        } catch (error) {
            console.log('Database error:', error);
        }

        if (typeof m.text !== "string") m.text = "";
        

        let usedPrefix;
        const groupMetadata = (m.isGroup ? (conn.chats[m.chat] || {}).metadata || (await this.groupMetadata(m.chat).catch(_ => null)) : {}) || {};
        const participants = (m.isGroup ? groupMetadata.participants : []) || [];
        
        // ===== KONVERSI PARTICIPANT IDS KE LID =====
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

        if ((chatMode === "pconly" || opts["pconly"]) && !isPremium && !isOwner && m.isGroup) return;
        if ((chatMode === "gconly" || opts["gconly"]) && !isPremium && !isOwner && !m.isGroup) return;
        if ((chatMode === "sewaonly" || opts["sewaonly"]) && !isPremium && !isOwner && !isSewa && m.isGroup) return;

        const ___dirname = path.join(path.dirname(fileURLToPath(import.meta.url)), "./plugins");
        for (let name in global.plugins) {
            let plugin = global.plugins[name];
            if (!plugin) continue;
            if (plugin?.disable) continue;

            const __filename = path.join(___dirname, name);
            const str2Regex = str => str.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
            let _prefix = plugin.customPrefix ? plugin.customPrefix : global.prefix;
            let match = (
                _prefix instanceof RegExp
                    ? [[_prefix.exec(m.text), _prefix]]
                    : Array.isArray(_prefix)
                    ? _prefix.map(p => {
                          let re = p instanceof RegExp ? p : new RegExp(str2Regex(p));
                          return [re.exec(m.text), re];
                      })
                    : typeof _prefix === "string"
                    ? [[new RegExp(str2Regex(_prefix)).exec(m.text), new RegExp(str2Regex(_prefix))]]
                    : [[[], new RegExp()]]
            ).find(p => p[1]);

            if (typeof plugin.before === "function") {
                try {
                    if (
                        await plugin.before.call(this, m, {
                            match,
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
            
            if (typeof plugin !== "function") continue;
            if ((usedPrefix = (match[0] || "")[0])) {
                let noPrefix = m.text.replace(usedPrefix, "");
                let [command, ...args] = noPrefix
                    .trim()
                    .split(` `)
                    .filter(v => v);
                args = args || [];
                let _args = noPrefix.trim().split(` `).slice(1);
                let text = _args.join(` `);
                command = (command || "").toLowerCase();
                let fail = plugin.fails || global.dFail;
                let isAccept =
                    plugin.command instanceof RegExp
                        ? plugin.command.test(command)
                        : Array.isArray(plugin.command)
                        ? plugin.command.some(cmd => (cmd instanceof RegExp ? cmd.test(command) : cmd === command))
                        : typeof plugin.command === "string"
                        ? plugin.command === command
                        : false;

                if (!isAccept) continue;
                m.plugin = name;

                if (isMuted && (!isROwner || !isAdmin)) return;
                if (isBannned && (!isROwner || !isOwner)) return;

                if (plugin.rowner && plugin.owner && !(isROwner || isOwner)) {
                    global.dFail("owner", m, this);
                    continue;
                }
                if (plugin.rowner && !isROwner) {
                    global.dFail("rowner", m, this);
                    continue;
                }
                if (plugin.owner && !isOwner) {
                    global.dFail("owner", m, this);
                    continue;
                }

                if (plugin.premium && !isPremium) {
                    global.dFail("premium", m, this);
                    continue;
                }

                if (plugin.group && !m.isGroup) {
                    global.dFail("group", m, this);
                    continue;
                } else if (plugin.botAdmin && !isBotAdmin) {
                    global.dFail("botAdmin", m, this);
                    continue;
                } else if (plugin.admin && !isAdmin) {
                    global.dFail("admin", m, this);
                    continue;
                }

                if (plugin.private && m.isGroup) {
                    global.dFail("private", m, this);
                    continue;
                }
                if (plugin.register && !isRegister) {
                    global.dFail("unreg", m, this);
                    continue;
                }
                if (plugin.restrict) {
                    global.dFail("restrict", m, this);
                    continue;
                }

                m.isCommand = true;

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
                    __dirname: ___dirname,
                    __filename
                };
                try {
                    await plugin.call(this, m, extra);
                } catch (e) {
                    console.log('Plugin execution error:', e);
                    const text = format(e);
                    if (e.name) {
                        const own = decodedOwnLid[0];
                        if (own) {
                            let msg = `*『 ERROR MESSAGE 』*\n`;
                            msg += `*📂 PLUGIN :* ${m.plugin}\n`;
                            msg += `*👤 SENDER :* ${senderLID}\n`;
                            msg += `*📄 CHAT :* ${m.chat}\n`;
                            msg += `*📥 COMMAND :* ${usedPrefix + command}\n`;
                            msg += `*🔒 ERROR :*\n${text}`;
                            await conn.reply(own, msg);
                        }
                    }
                } finally {
                    if (typeof plugin.after === "function") {
                        try {
                            await plugin.after.call(this, m, extra);
                        } catch (error) {
                            console.log('Plugin after error:', error);
                        }
                    }
                }
                break;
            }
        }
    } catch (error) {
        console.log('Handler error:', error);
    } finally {
        if (global.autoRead) {
            try {
                await conn.readMessages([m.key]);
            } catch (e) {
                console.error('Error reading messages:', e);
            }
        }
        
        try {
            await printMessages(m, this);
        } catch (e) {
            console.log('Print error:', e);
        }
    }
}

// ===== PARTICIPANTS UPDATE DENGAN LID =====
export async function participantsUpdate({ id, participants, action }) {
    try {
        if (this.isHandlerInit) return;
        let chat = global.db.data?.chats[id] || {};

        let message;
        switch (action) {
            case "add":
            case "remove":
                if (chat?.sambutan) {
                    let groupMetadata = (await this.groupMetadata(id)) || (conn.chats[id] || {})?.metadata || {};
                    for (let user of participants) {
                        // PERBAIKAN: Pastikan participant ID langsung dikonversi ke LID
                        let participantId = user?.id || user;
                        if (!participantId) continue;
                        
                        // Decode dulu
                        let jid = participantId.toString().decodeJid();
                        
                        // WAJIB konversi ke LID untuk SEMUA kasus
                        let lid = await ensureLID(this, jid);
                        
                        // Log hanya jika ada konversi
                        if (jid !== lid && !jid.endsWith('@lid')) {
                            console.log(chalk.blue(`[PARTICIPANTS] ${jid} -> ${lid}`));
                        }

                        let pp;
                        try {
                            pp = { url: await conn.profilePictureUrl(lid, "image") };
                        } catch (e) {
                            pp = { url: await conn.profilePictureUrl(id, "image") };
                        }

                        message = (
                            action === "add"
                                ? (chat.sWelcome || conn.sWelcome || "Selamat Datang @user")
                                      .replace("@subject", await this.getName(id))
                                      .replace("@desc", groupMetadata.desc ? String.fromCharCode(8206).repeat(4001) + groupMetadata?.desc : "")
                                : chat.sBye || conn.sBye || "Selamat Tinggal @user"
                        ).replace("@user", "@" + lid.split("@")[0]);
                        
                        // PENTING: Pastikan user baru langsung masuk database dengan LID
                        if (!global.db.data.users[lid]) {
                            global.db.data.users[lid] = {
                                name: await this.getName(lid),
                                age: -1,
                                level: 0,
                                exp: 0,
                                limit: 10,
                                afk: false,
                                afkReason: "",
                                register: false,
                                premium: false,
                                banned: false,
                                afkTime: -1,
                                regTime: -1,
                                premiumDate: -1,
                                bannedDate: -1
                            };
                            console.log(chalk.green(`[NEW USER] Created DB entry for LID: ${lid}`));
                        }

                        try {
                            await this.sendMessage(
                                id,
                                {
                                    image: pp,
                                    caption: message,
                                    mimetype: "image/jpeg",
                                    contextInfo: {
                                        mentionedJid: [lid]
                                    }
                                },
                                { quoted: null }
                            );
                        } catch (e) {
                            await this.sendMessage(
                                id,
                                {
                                    text: message,
                                    contextInfo: {
                                        mentionedJid: [lid]
                                    }
                                },
                                { quoted: null }
                            );
                        }
                    }
                }
                break;

            case "promote":
            case "demote":
                if (chat?.detect) {
                    for (let user of participants) {
                        // PERBAIKAN: Sama seperti add/remove
                        let participantId = user?.id || user;
                        if (!participantId) continue;
                        
                        let jid = participantId.toString().decodeJid();
                        let lid = await ensureLID(this, jid);
                        
                        // Log hanya jika ada konversi
                        if (jid !== lid && !jid.endsWith('@lid')) {
                            console.log(chalk.blue(`[PROMOTE/DEMOTE] ${jid} -> ${lid}`));
                        }
                        
                        // PENTING: Pastikan user ada di database
                        if (!global.db.data.users[lid]) {
                            global.db.data.users[lid] = {
                                name: await this.getName(lid),
                                age: -1,
                                level: 0,
                                exp: 0,
                                limit: 10,
                                afk: false,
                                afkReason: "",
                                register: false,
                                premium: false,
                                banned: false,
                                afkTime: -1,
                                regTime: -1,
                                premiumDate: -1,
                                bannedDate: -1
                            };
                        }
                        
                        message = (
                            action === "promote" ? chat.sPromote || conn.sPromote || "Selamat @user telah menjadi Admin" : chat.sDemote || conn.sDemote || "@user telah diberhentikan sebagai Admin"
                        ).replace("@user", "@" + lid.split("@")[0]);

                        await this.sendMessage(
                            id,
                            {
                                text: message,
                                contextInfo: {
                                    mentionedJid: [lid]
                                }
                            },
                            { quoted: null }
                        );
                    }
                }
                break;
        }
    } catch (e) {
        console.error('Participants update error:', e);
    }
}

function formatDuration(seconds) {
    if (isNaN(seconds) || seconds === 0) return 'Nonaktif';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    
    let parts = [];
    if (d > 0) parts.push(`${d} hari`);
    if (h > 0) parts.push(`${h} jam`);
    if (m > 0) parts.push(`${m} menit`);
    
    return parts.length > 0 ? parts.join(', ') : 'kurang dari semenit';
}

export async function groupsUpdate(groupsUpdate) {
    try {
        if (!groupsUpdate) return;
        
        for (const groupUpdate of groupsUpdate) {
            const id = groupUpdate.id;
            if (!id) continue;

            const chat = global.db.data?.chats[id];
            if (!chat?.detect) continue;
            const author = groupUpdate?.author;
            if (!author) continue;

            const userLid = await ensureLID(this, author.decodeJid());
            const userName = await this.getName(userLid);
            const mentions = [userLid];
            
            let message = '';
            
            if (groupUpdate.subject) {
                message = `*INFO GRUP DIUBAH*\n\n*JUDUL GRUP* diganti oleh *@${userLid.split('@')[0]}*\n\n*Judul Baru:*\n${groupUpdate.subject}`;
            }
            else if (groupUpdate.desc) {
                message = `*INFO GRUP DIUBAH*\n\n*DESKRIPSI GRUP* diganti oleh *@${userLid.split('@')[0]}*`;
            }
            else if (groupUpdate.inviteCode) {
                const newLink = await this.groupInviteCode(id);
                message = `*INFO GRUP DIUBAH*\n\n*LINK GRUP* direset oleh *@${userLid.split('@')[0]}*\n\n*Link Baru:*\nhttps://chat.whatsapp.com/${newLink}`;
            }
            else if ('announcement' in groupUpdate) {
                const action = groupUpdate.announcement ? 'DITUTUP' : 'DIBUKA';
                const detail = groupUpdate.announcement ? 'Hanya admin yang dapat mengirim pesan.' : 'Semua member dapat mengirim pesan.';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*GRUP TELAH ${action}* oleh *@${userLid.split('@')[0]}*.\n\n${detail}`;
            }
            else if ('restrict' in groupUpdate) {
                const action = groupUpdate.restrict ? 'DIBATASI HANYA UNTUK ADMIN' : 'DIBUKA UNTUK SEMUA MEMBER';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*IZIN EDIT INFO GRUP* sekarang *${action}*.\n\nDiubah oleh *@${userLid.split('@')[0]}*.`;
            }
            else if ('ephemeral' in groupUpdate) {
                const duration = groupUpdate.ephemeral;
                const action = duration > 0 ? `DIAKTIFKAN dengan durasi *${formatDuration(duration)}*` : 'DINONAKTIFKAN';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*PESAN SEMENTARA* telah *${action}*.\n\nDiubah oleh *@${userLid.split('@')[0]}*.`;
            }

            if (message) {
                await this.sendMessage(id, { text: message, mentions });
            }
            
            if (groupUpdate.icon) {
                await this.reply(id, "*Ikon grup telah diganti.*");
            }
        }
    } catch (e) {
        console.error('Groups update error:', e);
    }
}

export async function catchDeleted(message) {
    try {
        if (!message) return;
    } catch (error) {
        console.error('Catch deleted error:', error);
    }
}

global.dFail = (type, m, conn) => {
    let msg = {
        rowner: "*DEVELOVER ONLY*",
        owner: "*OWNER ONLY*",
        premium: "*PREMIUM ONLY*",
        group: "*GROUP CHAT ONLY*",
        private: "*PRIVATE CHAT ONLY*",
        admin: "*ADMIN ONLY*",
        botAdmin: "*BOT ADMIN REQUIRED*",
        sewa: "*PAID GROUP ONLY*",
        unreg: "*YOU ARE NOT REGISTERED YET*",
        restrict: "*RESTRICTED COMMAND*",
        disable: "*DISABLE COMMAND*"
    }[type];
    if (msg) return conn.reply(m.chat, msg, m);
};

let file = fileURLToPath(import.meta.url);
watchFile(file, async () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "handler.js"`)}`);
    global.reloadHandler(true);
});