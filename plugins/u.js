import { jidNormalizedUser } from '@whiskeysockets/baileys'

// Fungsi helper buat mastiin kita dapet JID & LID
async function getIdentifiers(conn, target) {
    if (!target) return { jid: null, lid: null };

    if (target.endsWith('@lid')) {
        const lid = target;
        // Coba dapetin JID dari LID
        const jid = await conn.getLidPN(lid);
        return { jid: jid || null, lid };
    } else if (target.endsWith('@s.whatsapp.net')) {
        const jid = target;
        // Coba dapetin LID dari JID
        const lid = await conn.getLid(jid);
        return { jid, lid: lid.endsWith('@lid') ? lid : null };
    }
    // Kalo bukan format standar, coba parse sebagai nomor telepon
    const number = target.replace(/[^0-9]/g, '');
    if (number.length > 5) {
        const jid = `${number}@s.whatsapp.net`;
        const lid = await conn.getLid(jid);
        return { jid, lid: lid.endsWith('@lid') ? lid : null };
    }
    
    return { jid: null, lid: null };
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // 1. Ambil target dari teks, pisahkan dengan spasi jika ada banyak
    const textTargets = text ? text.split(/\s+/).filter(v => v) : [];

    // 2. Ambil target dari mention dan reply
    const mentionedTargets = m.mentionedJid || [];
    const quotedTarget = m.quoted ? [m.quoted.sender] : [];

    // 3. Gabungin semua jadi satu dan hapus duplikat
    const targets = [...new Set([...textTargets, ...mentionedTargets, ...quotedTarget])];

    // Kalo gaada target, kasih tau cara pakenya
    if (targets.length === 0) {
        return m.reply(
`*RESET DATA USER*

Fitur ini akan menghapus data user dari database secara permanen.

*Cara Penggunaan:*
1. Reply pesan user, lalu ketik:
   *${usedPrefix + command}*

2. Mention user (bisa lebih dari satu):
   *${usedPrefix + command} @user1 @user2*
   
3. Ketik JID atau LID user:
   *${usedPrefix + command} 628xxxx@s.whatsapp.net*
   *${usedPrefix + command} 12345@lid*

*Peringatan:*
Tindakan ini tidak dapat diurungkan. Semua data (level, exp, limit, dll) akan hilang.`
        );
    }

    let deletedCount = 0;
    let failedUsers = [];
    let successUsers = [];

    // Loop setiap user yang jadi target
    for (let target of targets) {
        let userDeleted = false;
        try {
            // PENTING: Dapatkan JID dan LID dari target
            const { jid, lid } = await getIdentifiers(conn, target);
            
            // Hapus data JID (kalau ada)
            if (jid && global.db.data.users[jid]) {
                delete global.db.data.users[jid];
                userDeleted = true;
            }

            // Hapus data LID (kalau ada)
            if (lid && global.db.data.users[lid]) {
                delete global.db.data.users[lid];
                userDeleted = true;
            }

            if (userDeleted) {
                deletedCount++;
                // Normalisasi ke LID untuk di-mention jika ada, kalo gaada pake jid
                const identifierToMention = lid || jid;
                successUsers.push(identifierToMention);
            } else {
                failedUsers.push(target); // Push original target kalo gagal
            }

        } catch (e) {
            console.error(`Gagal reset data untuk ${target}:`, e);
            failedUsers.push(target);
        }
    }

    // Siapin pesan balasan
    let replyText = '';

    if (deletedCount > 0) {
        replyText += `*RESET BERHASIL*\n\nBerhasil menghapus *${deletedCount}* user dari database:\n`;
        replyText += successUsers.map(u => `• @${u.split('@')[0]}`).join('\n');
    }

    if (failedUsers.length > 0) {
        if (replyText) replyText += '\n\n';
        replyText += `*RESET GAGAL*\n\nUser berikut tidak ditemukan di database atau terjadi error:\n`;
        replyText += failedUsers.map(u => `• @${u.split('@')[0]}`).join('\n');
    }

    // Kirim balasan dengan mention semua target
    await conn.reply(m.chat, replyText.trim(), m, {
        mentions: [...successUsers, ...failedUsers]
    });
};

handler.help = ['resetuser @user|jid|lid'];
handler.tags = ['owner'];
handler.command = /^(resetuser|deluser|dbreset)$/i;
handler.owner = true;

export default handler;