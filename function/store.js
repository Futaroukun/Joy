/**
 * Store.js dengan dukungan LID penuh
 * @param {import("baileys").WASocket | import("baileys").WALegacySocket}
 */
function bind(conn) {
    if (!conn.chats) conn.chats = {};
    
    /**
     * Konversi JID ke LID dengan fallback
     */
    async function ensureLID(jid) {
        if (!jid) return null;
        if (jid.endsWith('@lid')) return jid;
        
        try {
            // Coba dari cache
            const cached = conn.getLid(jid);
            if (cached && cached.endsWith('@lid')) return cached;
            
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
            
            return conn.getLid(jid);
        } catch (e) {
            return conn.getLid(jid);
        }
    }
    
    /**
     * updateNameToDb - FIXED dengan LID
     * @param {import("baileys").Contact[]|{contacts:import("baileys").Contact[]}} contacts
     * @returns
     */
    async function updateNameToDb(contacts) {
        if (!contacts) return;
        try {
            contacts = contacts.contacts || contacts;
            for (const contact of contacts) {
                // PERBAIKAN: Konversi ID ke LID dulu
                const originalId = conn.decodeJid(contact.id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                // WAJIB konversi ke LID
                const id = await ensureLID(originalId);
                
                // Log hanya jika ada konversi JID -> LID
                if (originalId !== id && !originalId.endsWith('@lid')) {
                    console.log(`[STORE] Contact: ${originalId} -> ${id}`);
                }
                
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
        } catch (e) {
            console.error('Error updateNameToDb:', e);
        }
    }
    
    conn.ev.on("contacts.upsert", updateNameToDb);
    conn.ev.on("groups.update", updateNameToDb);
    conn.ev.on("contacts.set", updateNameToDb);
    
    conn.ev.on("chats.set", async ({ chats }) => {
        try {
            for (let { id, name, readOnly } of chats) {
                // PERBAIKAN: Konversi ke LID
                const originalId = conn.decodeJid(id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                id = await ensureLID(originalId);
                
                // Log hanya jika ada konversi
                if (originalId !== id && !originalId.endsWith('@lid')) {
                    console.log(`[STORE] Chat set: ${originalId} -> ${id}`);
                }
                
                const isGroup = id.endsWith("@g.us");
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { id };
                chats.isChats = !readOnly;
                
                if (name) chats[isGroup ? "subject" : "name"] = name;
                
                if (isGroup) {
                    const metadata = await conn.groupMetadata(id).catch(_ => null);
                    if (name || metadata?.subject) chats.subject = name || metadata.subject;
                    if (!metadata) continue;
                    chats.metadata = metadata;
                }
            }
        } catch (e) {
            console.error('Error chats.set:', e);
        }
    });
    
    conn.ev.on(
        "group-participants.update",
        async function updateParticipantsToDb({ id, participants, action }) {
            if (!id) return;
            
            // PERBAIKAN: Konversi group ID ke LID jika perlu
            const originalId = conn.decodeJid(id);
            if (originalId === "status@broadcast") return;
            
            id = await ensureLID(originalId);
            
            // Log hanya jika ada konversi
            if (originalId !== id && !originalId.endsWith('@lid')) {
                console.log(`[STORE] Group participants: ${originalId} -> ${id}`);
            }
            
            if (!(id in conn.chats)) conn.chats[id] = { id };
            let chats = conn.chats[id];
            chats.isChats = true;
            
            const groupMetadata = await conn.groupMetadata(id).catch(_ => null);
            if (!groupMetadata) return;
            
            chats.subject = groupMetadata.subject;
            chats.metadata = groupMetadata;
        }
    );

    conn.ev.on("groups.update", async function groupUpdatePushToDb(groupsUpdates) {
        try {
            for (const update of groupsUpdates) {
                // PERBAIKAN: Konversi ke LID
                const originalId = conn.decodeJid(update.id);
                if (!originalId || originalId === "status@broadcast") continue;
                
                const id = await ensureLID(originalId);
                
                // Log hanya jika ada konversi
                if (originalId !== id && !originalId.endsWith('@lid')) {
                    console.log(`[STORE] Group update: ${originalId} -> ${id}`);
                }
                
                const isGroup = id.endsWith("@g.us");
                if (!isGroup) continue;
                
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { id };
                chats.isChats = true;
                
                const metadata = await conn.groupMetadata(id).catch(_ => null);
                if (metadata) chats.metadata = metadata;
                if (update.subject || metadata?.subject) chats.subject = update.subject || metadata.subject;
            }
        } catch (e) {
            console.error('Error groups.update:', e);
        }
    });
    
    conn.ev.on("chats.upsert", async function chatsUpsertPushToDb(chatsUpsert) {
        try {
            const { id, name } = chatsUpsert;
            
            // PERBAIKAN: Konversi ke LID
            const originalId = id;
            if (!originalId || originalId === "status@broadcast") return;
            
            const lid = await ensureLID(originalId);
            
            // Log hanya jika ada konversi
            if (originalId !== lid && !originalId.endsWith('@lid')) {
                console.log(`[STORE] Chat upsert: ${originalId} -> ${lid}`);
            }
            
            conn.chats[lid] = {
                ...(conn.chats[lid] || {}),
                ...chatsUpsert,
                id: lid, // PENTING: Override ID dengan LID
                isChats: true
            };
            
            const isGroup = lid.endsWith("@g.us");
            if (isGroup) conn.insertAllGroup();
        } catch (e) {
            console.error('Error chats.upsert:', e);
        }
    });
    
    conn.ev.on("presence.update", async function presenceUpdatePushToDb({ id, presences }) {
        try {
            const sender = Object.keys(presences)[0] || id;
            
            // PERBAIKAN: Konversi sender ke LID
            const originalSender = conn.decodeJid(sender);
            const _sender = await ensureLID(originalSender);
            
            // Log hanya jika ada konversi
            if (originalSender !== _sender && !originalSender.endsWith('@lid')) {
                console.log(`[STORE] Presence: ${originalSender} -> ${_sender}`);
            }
            
            const presence = presences[sender]["lastKnownPresence"] || "composing";
            let chats = conn.chats[_sender];
            if (!chats) chats = conn.chats[_sender] = { id: _sender };
            chats.presences = presence;
            
            if (id.endsWith("@g.us")) {
                // PERBAIKAN: Konversi group ID juga
                const groupId = await ensureLID(id);
                let chats = conn.chats[groupId];
                if (!chats) {
                    const metadata = await conn.groupMetadata(groupId).catch(_ => null);
                    if (metadata)
                        chats = conn.chats[groupId] = {
                            id: groupId,
                            subject: metadata.subject,
                            metadata,
                            isChats: true
                        };
                }
            }
        } catch (e) {
            console.error('Error presence.update:', e);
        }
    });
}

export default {
    bind
};