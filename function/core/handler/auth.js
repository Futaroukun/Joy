import { initUserSchema, syncUserAge, initChatSchema, initSettingSchema } from '../schema.js';
export { initUserSchema, syncUserAge, initChatSchema, initSettingSchema };

let devSetCache = null;
let devListKey = '';

export function getDevSet() {
    const list = (global.developer || []).concat(global.info?.nomorowner ? [global.info.nomorowner] : []);
    const key = list.join('|');
    if (devSetCache && devListKey === key) return devSetCache;
    devListKey = key;
    devSetCache = new Set(list.map(o => o.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '')));
    return devSetCache;
}

let ownerSetCache = null;
let ownerListKey = '';

export function getStaticOwnerSet() {
    const list = global.owner || [];
    const key = list.join('|');
    if (ownerSetCache && ownerListKey === key) return ownerSetCache;
    ownerListKey = key;
    ownerSetCache = new Set(list.map(o => o.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '')));
    return ownerSetCache;
}

export function resolveSenderPermissions({
    m = {},
    senderRaw = '',
    senderPn = null,
    senderLid = null,
    userDb = {},
    cleanDevSet = getDevSet(),
    cleanStaticOwnersSet = getStaticOwnerSet(),
    ownersDb = global.db?.data?.owners || {}
} = {}) {
    const raw = senderRaw || (m.sender ? m.sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, '') : '');

    const isROwner = !!(m.fromMe ||
               (senderPn && cleanDevSet.has(senderPn)) ||
               (raw && cleanDevSet.has(raw)) ||
               (senderLid && cleanDevSet.has(senderLid.split('@')[0])));

    const isDynamicOwner = !!(
        (senderPn && ownersDb[senderPn]) ||
        (senderLid && ownersDb[senderLid]) ||
        (raw && ownersDb[raw]) ||
        (m.sender && ownersDb[m.sender]) ||
        (senderLid && ownersDb[senderLid.split('@')[0]])
    );

    const isOwner = isROwner ||
              !!m.fromMe ||
              (senderPn && cleanStaticOwnersSet.has(senderPn)) ||
              (raw && cleanStaticOwnersSet.has(raw)) ||
              (senderLid && cleanStaticOwnersSet.has(senderLid.split('@')[0])) ||
              isDynamicOwner ||
              false;

    const isPremium = isROwner || isOwner || userDb?.premium === true;

    return { isROwner: !!isROwner, isOwner: !!isOwner, isPremium: !!isPremium };
}

export function resolveParticipantAdmin(participants = [], senderLID, botLid) {
    const user = Array.isArray(participants) ? participants.find(u => u.id === senderLID) : {};
    const bot = Array.isArray(participants) ? participants.find(u => u.id === botLid) : {};

    const isRAdmin = user?.admin === "superadmin" || false;
    const isAdmin = isRAdmin || user?.admin === "admin" || false;
    const isBotAdmin = bot?.admin || false;

    return { user, bot, isRAdmin, isAdmin, isBotAdmin };
}

export async function resolveSenderAuth(conn, m, senderLID, botLid) {
    let isROwner = false;
    let isOwner = false;
    let isPremium = false;
    let userDb = {};
    let senderPn = null;
    let senderLid = null;

    try {
        if (global.db.data == null) await global.loadDatabase();

        if (!senderLID.endsWith('@g.us')) {
            const resolvedName = typeof conn.getAndVerifyUsername === 'function' 
                ? conn.getAndVerifyUsername(senderLID, m) 
                : (m.pushName || '');
            global.db.data.users[senderLID] = initUserSchema(global.db.data.users[senderLID], resolvedName);
        }

        userDb = global.db.data.users[senderLID] || {};
        syncUserAge(userDb);

        // ── Resolve Sender Phone Number & LID Real-Time ──
        const senderRaw = m.sender.split('@')[0].split(':')[0].replace(/[^0-9]/g, "");

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

        // ── Cek Permissions (isROwner, isOwner, isPremium) ──
        const cleanDevSet = getDevSet();
        const cleanStaticOwnersSet = getStaticOwnerSet();
        const ownersDb = global.db?.data?.owners || {};

        const perms = resolveSenderPermissions({
            m,
            senderRaw,
            senderPn,
            senderLid,
            userDb,
            cleanDevSet,
            cleanStaticOwnersSet,
            ownersDb
        });
        isROwner = perms.isROwner;
        isOwner = perms.isOwner;
        isPremium = perms.isPremium;

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

    return {
        userDb,
        senderPn,
        senderLid,
        isROwner,
        isOwner,
        isPremium
    };
}

export async function resolveGroupContext(conn, m, {
    senderLID,
    botLid,
    isCommand,
    hasCustomPrefix,
    chatData,
    isOwner,
    isPremium
}) {
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
    const { user, bot, isRAdmin, isAdmin, isBotAdmin } = resolveParticipantAdmin(participants, senderLID, botLid);

    const isRegister = global.db.data?.users[senderLID]?.register === true;
    const isBannned = global.db.data?.users[senderLID]?.banned === true;
    const isMuted = m.isGroup && global.db.data?.chats[m.chat]?.mute === true;
    const isSewa = m.isGroup && global.db.data?.chats[m.chat]?.sewa === true;
    const chatMode = global.db.data?.settings[botLid]?.chatMode;

    let shouldHalt = false;
    if ((chatMode === "owneronly" || chatMode === "self" || global.opts["owneronly"] || global.opts["self"]) && !isOwner) shouldHalt = true;
    if ((chatMode === "pconly" || global.opts["pconly"]) && !isPremium && !isOwner && m.isGroup) shouldHalt = true;
    if ((chatMode === "gconly" || global.opts["gconly"]) && !isPremium && !isOwner && !m.isGroup) shouldHalt = true;
    if ((chatMode === "sewaonly" || global.opts["sewaonly"]) && !isPremium && !isOwner && !isSewa && m.isGroup) shouldHalt = true;

    return {
        groupMetadata,
        participants,
        user,
        bot,
        isRAdmin,
        isAdmin,
        isBotAdmin,
        isRegister,
        isBannned,
        isMuted,
        isSewa,
        chatMode,
        shouldHalt
    };
}
