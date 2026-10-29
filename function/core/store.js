import chalk from "chalk";

function bind(conn) {
    if (!conn.chats) conn.chats = {};
    
    function ensureLID(jid) {
        if (!jid) return null;
        if (jid.endsWith('@lid')) return jid;
        
        try {
            const cached = conn.getLid(jid);
            return cached;
        } catch (e) {
            return conn.getLid(jid);
        }
    }
    
    async function updateNameToDb(contacts) {
        if (!contacts) return;
        try {
            contacts = contacts.contacts || contacts;
            for (const contact of contacts) {
                const originalId = conn.decodeJid(contact.id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                const id = ensureLID(originalId);
                
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { ...contact, id };
                
                conn.chats[id] = {
                    ...chats,
                    ...({
                        ...contact,
                        id,
                        ...(id.endsWith("@g.us")
                            ? {
                                  subject: contact.subject || contact.name || chats.subject || ""
                              }
                            : {
                                  name: contact.notify || contact.name || chats.name || chats.notify || ""
                              })
                    } || {})
                };
            }
        } catch (e) {}
    }
    
    conn.ev.on("contacts.upsert", updateNameToDb);
    conn.ev.on("groups.update", updateNameToDb);
    conn.ev.on("contacts.set", updateNameToDb);
    
    conn.ev.on("lid-mapping.update", (update) => {
        for (const { lid, pn } of update) {
            if (lid && pn) {
                if (!conn.storeLid) conn.storeLid = {};
                conn.storeLid[pn] = lid;
                conn.storeLid[lid] = pn;
            }
        }
    });
    
    conn.ev.on("chats.set", async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                const originalId = conn.decodeJid(id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                id = ensureLID(originalId);
                
                const isGroup = id.endsWith("@g.us");
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { id };
                chats.isChats = !readOnly;
                
                if (name) chats[isGroup ? "subject" : "name"] = name;
                
                if (isGroup && !chats.metadata) {
                    chats.subject = name || "Unknown Group";
                }
            }
        } catch (e) {}
    });
    
    conn.ev.on(
        "group-participants.update",
        async function updateParticipantsToDb({ id, participants, action }) {
            if (!id) return;
            
            const originalId = conn.decodeJid(id);
            if (originalId === "status@broadcast") return;
            
            id = ensureLID(originalId);
            
            if (!(id in conn.chats)) conn.chats[id] = { id };
            let chats = conn.chats[id];
            chats.isChats = true;
            
            if (!chats.metadata) {
                const groupMetadata = await conn.groupMetadata(id).catch(_ => null);
                if (groupMetadata) {
                    chats.subject = groupMetadata.subject;
                    chats.metadata = groupMetadata;
                }
            }
        }
    );

    conn.ev.on("groups.update", async function groupUpdatePushToDb(groupsUpdates) {
        try {
            for (const update of groupsUpdates) {
                const originalId = conn.decodeJid(update.id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                const id = ensureLID(originalId);
                
                const isGroup = id.endsWith("@g.us");
                if (!isGroup) continue;
                
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { id };
                chats.isChats = true;
                
                if (!chats.metadata) {
                    const metadata = await conn.groupMetadata(id).catch(_ => null);
                    if (metadata) chats.metadata = metadata;
                }
                
                if (update.subject || chats.metadata?.subject) {
                    chats.subject = update.subject || chats.metadata.subject;
                }
            }
        } catch (e) {}
    });
    
    conn.ev.on("chats.upsert", async function chatsUpsertPushToDb(chatsUpsert) {
        try {
          if (!Array.isArray(chatsUpsert)) chatsUpsert = [chatsUpsert];
          
          for (const chat of chatsUpsert) {
            const { id, name } = chat;
            if (!id || id === "status@broadcast") continue;
            
            const lid = ensureLID(id);
            
            conn.chats[lid] = {
              ...(conn.chats[lid] || {}),
              ...chat,
              id: lid,
              isChats: true
            };
            
            const isGroup = lid.endsWith("@g.us");
            if (isGroup) conn.insertAllGroup().catch(() => {});
          }
        } catch (e) {}
    });
    
    conn.ev.on("presence.update", async function presenceUpdatePushToDb({ id, presences }) {
        try {
            const sender = Object.keys(presences)[0] || id;
            
            const originalSender = conn.decodeJid(sender);
            const _sender = ensureLID(originalSender);
            
            const presence = presences[sender]["lastKnownPresence"] || "composing";
            let chats = conn.chats[_sender];
            if (!chats) chats = conn.chats[_sender] = { id: _sender };
            chats.presences = presence;
            
            if (id.endsWith("@g.us")) {
                const groupId = ensureLID(id);
                let chats = conn.chats[groupId];
                
                if (!chats && !conn.isHandlerInit) {
                    const metadata = await conn.groupMetadata(groupId).catch(_ => null);
                    if (metadata) {
                        chats = conn.chats[groupId] = {
                            id: groupId,
                            subject: metadata.subject,
                            metadata,
                            isChats: true
                        };
                    }
                }
            }
        } catch (e) {}
    });
    
    conn.ev.on('messages.upsert', ({ messages }) => {
      try {
        for (const msg of messages) {
          if (!msg.key || msg.key.remoteJid === 'status@broadcast') continue

          const participant = msg.key.participant || msg.key.remoteJid
          if (!participant) continue

          const decoded = conn.decodeJid(participant)
          const lid     = ensureLID(decoded)
          if (!lid) continue

          if (!conn.chats[lid]) conn.chats[lid] = { id: lid }

          if (msg.pushName && !/@/.test(msg.pushName) && msg.pushName.trim().length >= 1) {
            conn.chats[lid].name = msg.pushName.trim()
          }

          try {
            let phoneNum = null

            const fromGetNumber = conn.getNumber(lid)
            if (fromGetNumber && !fromGetNumber.endsWith('@lid') &&fromGetNumber.replace(/[^0-9]/g, '').length > 5) {
              phoneNum = fromGetNumber.replace(/[^0-9]/g, '')
            }

            if (!phoneNum) {
              for (const chat of Object.values(conn.chats)) {
                const participants = chat.metadata?.participants || []
                const found = participants.find(p => p.id === lid || p.lid === lid)
                if (found?.phoneNumber) {
                  const n = found.phoneNumber.replace(/[^0-9]/g, '')
                  if (n.length > 5) { phoneNum = n; break }
                }
              }
            }

            if (!phoneNum && conn.storeNumber?.[lid]) {
              const n = conn.storeNumber[lid].replace(/[^0-9]/g, '')
              if (n.length > 5) phoneNum = n
            }

            if (phoneNum) {
              const sJid = `${phoneNum}@s.whatsapp.net`

              if (!conn.chats[sJid]) conn.chats[sJid] = { id: sJid }

              if (msg.pushName && !/@/.test(msg.pushName) && msg.pushName.trim().length >= 1) {
                conn.chats[sJid].name = msg.pushName.trim()
              }

              if (!conn.storeLid)   conn.storeLid   = {}
              if (!conn.storeNumber) conn.storeNumber = {}

              conn.storeLid[sJid]  = lid
              conn.storeNumber[lid] = phoneNum
            }
          } catch (e) {}

          const quotedParticipant =
            msg.message?.extendedTextMessage?.contextInfo?.participant ||
            msg.message?.imageMessage?.contextInfo?.participant        ||
            msg.message?.videoMessage?.contextInfo?.participant        ||
            msg.message?.audioMessage?.contextInfo?.participant        ||
            msg.message?.documentMessage?.contextInfo?.participant     ||
            msg.message?.stickerMessage?.contextInfo?.participant

          if (quotedParticipant) {
            try {
              const qDecoded = conn.decodeJid(quotedParticipant)
              const qLid     = ensureLID(qDecoded)
              if (qLid && !conn.chats[qLid]) {
                conn.chats[qLid] = { id: qLid }
              }
            } catch {}
          }
        }
      } catch (e) {}
    })
    }

export default {
    bind
};