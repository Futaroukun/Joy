/*
 * @Author      : Joy Bot
 * @Feature     : WhatsApp Group Events Handler
 * @Description : Menangani event peserta grup (welcome/leave/promote/demote),
 *                perubahan metadata grup (subject/desc/icon/settings), serta resolve identitas LID/PN.
 */

import { jidNormalizedUser } from '@whiskeysockets/baileys';

const lidCache = new Map();
const LID_CACHE_TTL = 24 * 60 * 60 * 1000;
const MAX_LID_CACHE = 10000;

export function cleanLID(jid) {
    if (!jid) return null;
    return jidNormalizedUser(jid);
}

export async function ensureLID(conn, jid) {
    if (!jid) return null;
    if (jid.endsWith('@lid')) return jid;
    
    const cached = lidCache.get(jid);
    if (cached && cached.lid && cached.timestamp > Date.now() - LID_CACHE_TTL) {
        return cached.lid;
    }
    
    try {
        const internalLID = conn?.getLid ? conn.getLid(jid) : null;
        if (internalLID && internalLID.endsWith('@lid')) {
            if (lidCache.size >= MAX_LID_CACHE) lidCache.clear();
            lidCache.set(jid, { lid: internalLID, timestamp: Date.now() });
            return internalLID;
        }
        
        if (jid.endsWith('@s.whatsapp.net') && conn?.getLidPN) {
            conn.getLidPN(jid).then(serverLID => {
                if (serverLID && serverLID.endsWith('@lid')) {
                    if (!conn.storeLid) conn.storeLid = {};
                    conn.storeLid[jid] = serverLID;
                    if (lidCache.size >= MAX_LID_CACHE) lidCache.clear();
                    lidCache.set(jid, { lid: serverLID, timestamp: Date.now() });
                }
            }).catch(() => {});
        }
        
        return jid;
    } catch (_) {
        return jid;
    }
}

export function resolveDisplayPhone(conn, targetJid) {
    if (!targetJid) return 'unknown';
    if (targetJid.endsWith('@s.whatsapp.net')) return targetJid.split('@')[0].split(':')[0];
    if (conn?.storeNumber?.[targetJid]) return conn.storeNumber[targetJid].replace(/[^0-9]/g, '');
    if (conn?.storeLid?.[targetJid]) return conn.storeLid[targetJid].replace('@s.whatsapp.net', '').replace(/[^0-9]/g, '');
    return targetJid.split('@')[0].split(':')[0];
}

export function formatDuration(seconds) {
    if (isNaN(seconds) || seconds === 0) return 'Nonaktif';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    
    const parts = [];
    if (d > 0) parts.push(`${d} hari`);
    if (h > 0) parts.push(`${h} jam`);
    if (m > 0) parts.push(`${m} menit`);
    
    return parts.length > 0 ? parts.join(', ') : 'kurang dari semenit';
}

export async function participantsUpdate({ id, participants, action }) {
    try {
        if (id) {
            this._groupMetaCache?.delete(id);
            if (this.chats?.[id]) delete this.chats[id].metadata;
        }
        if (this.isHandlerInit) return;
        const chat = global.db?.data?.chats?.[id] || {};

        let message;
        switch (action) {
            case "add":
            case "remove":
                if (chat?.sambutan) {
                    const groupMetadata = (await this.groupMetadata(id).catch(() => null)) || (this.chats?.[id] || {})?.metadata || {};
                    for (const user of participants) {
                        const participantId = user?.id || user;
                        if (!participantId) continue;
                        
                        const jid = participantId.toString().decodeJid();
                        const lid = await ensureLID(this, jid);
                        const displayPhone = resolveDisplayPhone(this, jid) || resolveDisplayPhone(this, lid);

                        let pp;
                        try {
                            pp = { url: await this.profilePictureUrl(lid, "image") };
                        } catch (_) {
                            try {
                                pp = { url: await this.profilePictureUrl(jid, "image") };
                            } catch (_) {
                                pp = null;
                            }
                        }

                        message = (
                            action === "add"
                                ? (chat.sWelcome || this.sWelcome || "Selamat Datang @user di @subject")
                                      .replace("@subject", await this.getName(id))
                                      .replace("@desc", groupMetadata?.desc ? String.fromCharCode(8206).repeat(4001) + groupMetadata.desc : "")
                                : chat.sBye || this.sBye || "Selamat Tinggal @user"
                        ).replace("@user", "@" + displayPhone);

                        const userMentions = [...new Set([jid, lid].filter(Boolean))];

                        if (pp) {
                            try {
                                await this.sendMessage(
                                    id,
                                    {
                                        image: pp,
                                        caption: message,
                                        mimetype: "image/jpeg",
                                        contextInfo: {
                                            mentionedJid: userMentions
                                        }
                                    },
                                    { quoted: null }
                                );
                                continue;
                            } catch (_) {}
                        }

                        await this.sendMessage(
                            id,
                            {
                                text: message,
                                contextInfo: {
                                    mentionedJid: userMentions
                                }
                            },
                            { quoted: null }
                        );
                    }
                }
                break;

            case "promote":
            case "demote":
                if (chat?.detect) {
                    for (const user of participants) {
                        const participantId = user?.id || user;
                        if (!participantId) continue;
                        
                        const jid = participantId.toString().decodeJid();
                        const lid = await ensureLID(this, jid);
                        const displayPhone = resolveDisplayPhone(this, jid) || resolveDisplayPhone(this, lid);
                        
                        message = (
                            action === "promote" 
                                ? (chat.sPromote || this.sPromote || "Selamat @user telah menjadi Admin") 
                                : (chat.sDemote || this.sDemote || "@user telah diberhentikan sebagai Admin")
                        ).replace("@user", "@" + displayPhone);

                        const userMentions = [...new Set([jid, lid].filter(Boolean))];

                        await this.sendMessage(
                            id,
                            {
                                text: message,
                                contextInfo: {
                                    mentionedJid: userMentions
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

export async function groupsUpdate(groupsUpdate) {
    try {
        if (!groupsUpdate) return;

        for (const groupUpdate of groupsUpdate) {
            const id = groupUpdate?.id;
            if (!id) continue;
            this._groupMetaCache?.delete(id);
            if (this.chats?.[id]) delete this.chats[id].metadata;

            const chat = global.db?.data?.chats?.[id];
            if (!chat?.detect) continue;
            const author = groupUpdate?.author;
            if (!author) continue;

            const authorJid = author.decodeJid();
            const authorLid = await ensureLID(this, authorJid);
            const authorPhone = resolveDisplayPhone(this, authorJid) || resolveDisplayPhone(this, authorLid);
            const mentions = [...new Set([authorJid, authorLid].filter(Boolean))];
            
            let message = '';
            
            if (groupUpdate.subject) {
                message = `*INFO GRUP DIUBAH*\n\n*JUDUL GRUP* diganti oleh *@${authorPhone}*\n\n*Judul Baru:*\n${groupUpdate.subject}`;
            }
            else if (groupUpdate.desc) {
                message = `*INFO GRUP DIUBAH*\n\n*DESKRIPSI GRUP* diganti oleh *@${authorPhone}*`;
            }
            else if (groupUpdate.inviteCode) {
                const newLink = await this.groupInviteCode(id).catch(() => '');
                message = `*INFO GRUP DIUBAH*\n\n*LINK GRUP* direset oleh *@${authorPhone}*${newLink ? `\n\n*Link Baru:*\nhttps://chat.whatsapp.com/${newLink}` : ''}`;
            }
            else if ('announcement' in groupUpdate) {
                const action = groupUpdate.announcement ? 'DITUTUP' : 'DIBUKA';
                const detail = groupUpdate.announcement ? 'Hanya admin yang dapat mengirim pesan.' : 'Semua member dapat mengirim pesan.';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*GRUP TELAH ${action}* oleh *@${authorPhone}*.\n\n${detail}`;
            }
            else if ('restrict' in groupUpdate) {
                const action = groupUpdate.restrict ? 'DIBATASI HANYA UNTUK ADMIN' : 'DIBUKA UNTUK SEMUA MEMBER';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*IZIN EDIT INFO GRUP* sekarang *${action}*.\n\nDiubah oleh *@${authorPhone}*.`;
            }
            else if ('ephemeral' in groupUpdate) {
                const duration = groupUpdate.ephemeral;
                const action = duration > 0 ? `DIAKTIFKAN dengan durasi *${formatDuration(duration)}*` : 'DINONAKTIFKAN';
                message = `*PENGATURAN GRUP DIUBAH*\n\n*PESAN SEMENTARA* telah *${action}*.\n\nDiubah oleh *@${authorPhone}*.`;
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
