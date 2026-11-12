import { jidNormalizedUser } from '@whiskeysockets/baileys';

async function resolvePhoneNumber(conn, id) {
    if (!id) return null;
    let str = typeof id === 'object' ? (id.pn || id.lid || id.jid || '') : id.toString().trim();
    if (!str) return null;

    if (str.endsWith('@s.whatsapp.net')) {
        let raw = str.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
        if (raw.startsWith('0')) raw = '62' + raw.slice(1);
        return raw;
    }

    let clean = str.replace(/[^0-9]/g, '');
    if (!clean) return null;

    const isLid = str.endsWith('@lid') || clean.length >= 15;
    if (!isLid) {
        if (clean.startsWith('0')) clean = '62' + clean.slice(1);
        return clean;
    }

    const lidJid = str.endsWith('@lid') ? str : `${clean}@lid`;

    if (conn?.storeLid) {
        const mapped = conn.storeLid[lidJid] || conn.storeLid[clean];
        if (mapped && typeof mapped === 'string' && mapped.endsWith('@s.whatsapp.net')) {
            let res = mapped.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (res.startsWith('0')) res = '62' + res.slice(1);
            return res;
        }
    }

    try {
        const pnJid = await conn?.signalRepository?.lidMapping?.getPNForLID?.(lidJid);
        if (pnJid && typeof pnJid === 'string' && pnJid.endsWith('@s.whatsapp.net')) {
            let res = pnJid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (res.startsWith('0')) res = '62' + res.slice(1);
            return res;
        }
    } catch (_) {}

    if (typeof conn?.getJid === 'function') {
        const jid = conn.getJid(lidJid);
        if (jid && typeof jid === 'string' && jid.endsWith('@s.whatsapp.net')) {
            let res = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
            if (res.startsWith('0')) res = '62' + res.slice(1);
            return res;
        }
    }

    const record = global.db?.data?.owners?.[lidJid] || global.db?.data?.owners?.[clean] || global.db?.data?.owners?.[str];
    if (record && typeof record === 'object' && record.pn) {
        let recPn = record.pn.toString().replace(/[^0-9]/g, '');
        if (recPn.length < 15) {
            if (recPn.startsWith('0')) recPn = '62' + recPn.slice(1);
            return recPn;
        }
    }

    const userObj = global.db?.data?.users?.[lidJid] || global.db?.data?.users?.[clean];
    if (userObj && userObj.phoneNumber) {
        let userPn = userObj.phoneNumber.toString().replace(/[^0-9]/g, '');
        if (userPn.length < 15) {
            if (userPn.startsWith('0')) userPn = '62' + userPn.slice(1);
            return userPn;
        }
    }

    return null;
}

async function safeGetName(conn, jid) {
    if (!jid || typeof conn?.getName !== 'function') return '';
    try {
        let res = conn.getName(jid);
        if (res && typeof res.then === 'function') {
            res = await res;
        }
        return (typeof res === 'string') ? res : '';
    } catch (_) {
        return '';
    }
}

async function resolveAuthorityInfo(conn, id, defaultRole = '') {
    const rawStr = typeof id === 'object' ? (id.pn || id.lid || id.jid || '') : id.toString().trim();
    const clean = rawStr.replace(/[^0-9]/g, '');
    const pn = await resolvePhoneNumber(conn, id);

    let jid = pn ? `${pn}@s.whatsapp.net` : (rawStr.includes('@') ? rawStr : (clean.length >= 15 ? `${clean}@lid` : `${clean}@s.whatsapp.net`));
    let lid = (rawStr.endsWith('@lid') || clean.length >= 15)
        ? (rawStr.endsWith('@lid') ? rawStr : `${clean}@lid`)
        : (conn?.storeLid?.[jid] || conn?.storeLid?.[pn] || null);

    let name = '';
    if (lid && global.db?.data?.users?.[lid]?.name) {
        name = global.db.data.users[lid].name;
    } else if (global.db?.data?.users?.[jid]?.name) {
        name = global.db.data.users[jid].name;
    } else {
        name = await safeGetName(conn, jid);
    }

    if (name && (name.match(/^\+?[0-9\s-]+$/) || name.includes('@'))) {
        name = '';
    }

    return {
        raw: rawStr,
        clean,
        pn,
        jid,
        lid,
        name: name || ''
    };
}

const handler = async (m, { conn, text, args, usedPrefix, command, isROwner }) => {
    let cmd = (command || '').toLowerCase();
    let sub = (args[0] || '').toLowerCase();

    if (cmd === 'addowner') sub = 'add';
    if (cmd === 'delowner' || cmd === 'remowner') sub = 'del';
    if (cmd === 'listowner') sub = 'list';

    if (!isROwner && (!sub || sub === 'list')) {
        const name = global.info?.namaowner || 'Owner';
        const number = (global.info?.nomorowner || global.developer?.[0] || '6283854551575').replace(/[^0-9]/g, '');
        const botName = global.info?.namabot || 'Joy';

        let vcard = `BEGIN:VCARD\n`
                  + `VERSION:3.0\n`
                  + `FN:${name}\n`
                  + `ORG:Official ${botName} Development\n` 
                  + `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n`
                  + `END:VCARD`;

        return conn.sendMessage(m.chat, {
            contacts: {
                displayName: name,
                contacts: [{ vcard }]
            }
        }, { quoted: m });
    }

    if (!isROwner) {
        return global.dFail('rowner', m, conn);
    }

    if (!global.db.data.owners) {
        global.db.data.owners = {};
    }

    if (sub === 'help') {
        return m.reply(
            `*PANDUAN MANAJEMEN OWNER *\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `• *Tambah Owner:*\n` +
            `  \`${usedPrefix + command} add @user\` atau \`${usedPrefix + command} add <nomor>\`\n\n` +
            `• *Hapus Owner:*\n` +
            `  \`${usedPrefix + command} del @user\` atau \`${usedPrefix + command} del <nomor>\`\n\n` +
            `• *Daftar Otoritas:*\n` +
            `  \`${usedPrefix + command} list\`\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (sub === 'list' || !sub) {
        const devs = (global.developer || []).concat(global.info?.nomorowner ? [global.info.nomorowner] : []);
        const rawDevs = Array.from(new Set(devs.map(d => d.toString().trim())));

        const resolvedDevs = [];
        const seenDevKeys = new Set();
        for (const d of rawDevs) {
            const info = await resolveAuthorityInfo(conn, d, 'Developer');
            const key = info.pn || info.clean;
            if (!seenDevKeys.has(key)) {
                seenDevKeys.add(key);
                if (!info.name && (info.pn === (global.info?.nomorowner || '').replace(/[^0-9]/g, ''))) {
                    info.name = global.info?.namaowner || 'Developer';
                }
                resolvedDevs.push(info);
            }
        }

        const staticOwners = (global.owner || []).map(o => o.toString().trim());
        const candidateOwners = new Set(staticOwners);

        const dynamicEntries = Object.entries(global.db?.data?.owners || {});
        for (const [key, val] of dynamicEntries) {
            if (val && typeof val === 'object') {
                if (val.pn) candidateOwners.add(val.pn.toString().trim());
                if (val.lid) candidateOwners.add(val.lid.toString().trim());
            } else {
                candidateOwners.add(key.toString().trim());
            }
        }

        const resolvedOwners = [];
        const seenOwnerKeys = new Set();
        const devKeys = new Set(resolvedDevs.map(d => d.pn || d.clean));

        for (const o of candidateOwners) {
            const info = await resolveAuthorityInfo(conn, o, 'Owner');
            const key = info.pn || info.clean;
            if (devKeys.has(key) || seenOwnerKeys.has(key)) continue;
            seenOwnerKeys.add(key);
            resolvedOwners.push(info);
        }

        let txt = `╭───「 *DAFTAR OTORITAS BOT* 」───\n`;
        txt += `│\n`;
        txt += `│ *DEVELOPER UTAMA:*\n`;
        resolvedDevs.forEach(d => {
            if (d.pn) {
                txt += `│  › @${d.pn}\n`;
            } else {
                txt += `│  › ${d.name || `@${d.jid.split('@')[0]}`}\n`;
            }
        });
        txt += `│\n`;
        txt += `│ 🛡️ *OWNER TAMBAHAN:*\n`;
        if (resolvedOwners.length === 0) {
            txt += `│  _Tidak ada owner tambahan._\n`;
        } else {
            resolvedOwners.forEach(o => {
                if (o.pn) {
                    txt += `│  › @${o.pn}\n`;
                } else {
                    txt += `│  › ${o.name || `@${o.jid.split('@')[0]}`}\n`;
                }
            });
        }
        txt += `╰───────────────────────────────\n`;
        txt += `> *Gunakan:* \`${usedPrefix}owner add @user\` atau \`${usedPrefix}owner del @user\``;

        const allMentions = [...resolvedDevs, ...resolvedOwners].map(x => x.jid);
        return conn.sendMessage(m.chat, { text: txt, mentions: allMentions }, { quoted: m });
    }

    let target = null;
    if (m.mentionedJid && m.mentionedJid[0]) {
        target = m.mentionedJid[0];
    } else if (m.quoted && m.quoted.sender) {
        target = m.quoted.sender;
    } else if (args[1]) {
        let raw = args[1].replace(/[^0-9]/g, '');
        if (raw.startsWith('0')) raw = '62' + raw.slice(1);
        if (raw.length >= 7) {
            target = `${raw}@s.whatsapp.net`;
        }
    } else if (cmd === 'addowner' || cmd === 'delowner' || cmd === 'remowner') {
        if (args[0]) {
            let raw = args[0].replace(/[^0-9]/g, '');
            if (raw.startsWith('0')) raw = '62' + raw.slice(1);
            if (raw.length >= 7) target = `${raw}@s.whatsapp.net`;
        }
    }

    if (!target) {
        return m.reply(
            `*PENGGUNA TIDAK DITEMUKAN*\n\n` +
            `Contoh Penggunaan:\n` +
            `• \`${usedPrefix}owner add @user\`\n` +
            `• \`${usedPrefix}owner add 081234567890\`\n` +
            `• \`${usedPrefix}owner del @user\`\n` +
            `• \`${usedPrefix}owner list\``
        );
    }

    const targetPn = await resolvePhoneNumber(conn, target);
    const cleanTarget = target.replace(/[^0-9]/g, '');

    let targetLID = target.endsWith('@lid') ? target : null;
    if (!targetLID) {
        if (conn.storeLid?.[target]) targetLID = conn.storeLid[target];
        else if (targetPn && conn.storeLid?.[targetPn]) targetLID = conn.storeLid[targetPn];
    }
    if (!targetLID && cleanTarget.length >= 15) {
        targetLID = `${cleanTarget}@lid`;
    }

    const effectivePn = targetPn || (cleanTarget.length < 15 ? cleanTarget : null);
    const mentionJid = effectivePn ? `${effectivePn}@s.whatsapp.net` : (targetLID || target);
    const tagDisplay = effectivePn ? `@${effectivePn}` : ((await safeGetName(conn, mentionJid)) || `@${cleanTarget}`);

    if (sub === 'add') {
        const isAlreadyDev = (global.developer || []).some(d => {
            const cleanD = d.toString().replace(/[^0-9]/g, '');
            return (effectivePn && cleanD === effectivePn) || (targetLID && cleanD === targetLID.replace(/[^0-9]/g, ''));
        });
        if (isAlreadyDev) {
            return m.reply(`*${tagDisplay}* sudah merupakan *Developer Utama*.`);
        }

        const isAlreadyOwner = (global.owner || []).some(o => {
            const cleanO = o.toString().replace(/[^0-9]/g, '');
            return (effectivePn && cleanO === effectivePn) || (targetLID && cleanO === targetLID.replace(/[^0-9]/g, ''));
        }) || (effectivePn && global.db.data.owners[effectivePn]) || (targetLID && global.db.data.owners[targetLID]);

        if (isAlreadyOwner) {
            return m.reply(`*${tagDisplay}* sudah terdaftar sebagai Owner.`);
        }

        const newOwnerData = {
            pn: effectivePn || null,
            lid: targetLID || null,
            addedAt: Date.now(),
            addedBy: m.sender
        };

        if (effectivePn) {
            global.db.data.owners[effectivePn] = newOwnerData;
            global.saveData('owners', effectivePn);
        }
        if (targetLID && targetLID !== effectivePn) {
            global.db.data.owners[targetLID] = newOwnerData;
            global.saveData('owners', targetLID);
        }

        if (targetLID && global.db.data.users[targetLID]) {
            global.db.data.users[targetLID].limit = Infinity;
            global.saveData('users', targetLID);
        }
        if (effectivePn && global.db.data.users[`${effectivePn}@s.whatsapp.net`]) {
            global.db.data.users[`${effectivePn}@s.whatsapp.net`].limit = Infinity;
            global.saveData('users', `${effectivePn}@s.whatsapp.net`);
        }

        return conn.sendMessage(m.chat, {
            text: `Berhasil menambahkan *${tagDisplay}* sebagai *Owner Bot*.\n\n_User kini memiliki akses manajemen dasar bot._`,
            mentions: [mentionJid]
        }, { quoted: m });
    }

    if (sub === 'del' || sub === 'rem' || sub === 'remove') {
        const isDev = (global.developer || []).some(d => {
            const cleanD = d.toString().replace(/[^0-9]/g, '');
            return (effectivePn && cleanD === effectivePn) || (targetLID && cleanD === targetLID.replace(/[^0-9]/g, ''));
        });
        if (isDev) {
            return m.reply(`Tidak dapat menghapus *Developer Utama* dari daftar.`);
        }

        let found = false;
        if (effectivePn && global.db.data.owners[effectivePn]) {
            delete global.db.data.owners[effectivePn];
            global.saveData('owners', effectivePn);
            found = true;
        }
        if (targetLID && global.db.data.owners[targetLID]) {
            delete global.db.data.owners[targetLID];
            global.saveData('owners', targetLID);
            found = true;
        }
        const rawKey = cleanTarget;
        if (rawKey && global.db.data.owners[rawKey]) {
            delete global.db.data.owners[rawKey];
            global.saveData('owners', rawKey);
            found = true;
        }

        if (!found) {
            return m.reply(`*${tagDisplay}* tidak ditemukan di daftar Owner tambahan.`);
        }

        return conn.sendMessage(m.chat, {
            text: `Berhasil mencabut status Owner dari *${tagDisplay}*.`,
            mentions: [mentionJid]
        }, { quoted: m });
    }

    return m.reply(`Subcommand tidak valid. Gunakan: \`${usedPrefix}owner add/del/list\``);
};

handler.help = ['addowner *add/del/list*']
handler.tags    = ['owner']
handler.command = /^(addowner|delowner|listowner)$/i
handler.owner   = true

export default handler

