import { getLevelingInfo, formatNumber, generateProgressBar } from '../lib/leveling.js';
import { areJidsSameUser } from '@whiskeysockets/baileys';

let handler = async (m, { conn, usedPrefix, command, isOwner, isAdmin }) => {
    // 1. Tentukan target user
    // Prioritas: Mention > Reply > Diri sendiri
    let who = m.mentionedJid && m.mentionedJid[0] ? m.mentionedJid[0] : m.quoted ? m.quoted.sender : m.sender;
    
    // Pastikan kita tidak menarget bot itu sendiri secara tidak sengaja
    if (areJidsSameUser(who, conn.user.jid)) {
        who = m.sender;
    }
    
    // 2. Ambil data user dari database
    let user = global.db.data.users[who];
    if (!user) {
        return m.reply(`*USER TIDAK DITEMUKAN*\n\nUser tersebut belum terdaftar di database bot.`);
    }
    
    // 3. Ambil nama user
    const name = await conn.getName(who);
    
    // 4. Manfaatkan fungsi getLevelingInfo dari leveling.js
    const info = getLevelingInfo(user);
    
    // 5. Tentukan status user (Owner, Premium, Banned, dll)
    const ownerLids = global.owner.map(o => {
        const jid = `${o.replace(/[^0-9]/g, '')}@s.whatsapp.net`;
        return conn.getLid(jid);
    });
    
    let status = [];
    if (ownerLids.includes(who)) {
        status.push('Developer');
    }
    if (user.premium) {
        status.push('Premium User')
    }
    
    // 6. Siapkan pesan balasan
    let profileText = `
*USER PROFILE*

*Nama:* ${name}
*Status:* ${status.length > 0 ? status.join(', ') : 'Standard User'}
*Banned:* ${user.banned ? 'Ya' : 'Tidak'}

*LEVEL & RANK*
- Level: *${info.level}*
- Rank: *${info.rank}*
- EXP: *${formatNumber(info.exp)}*
- Limit: *${formatNumber(user.limit)}*

`;
    
    // 7. Tambahkan progress bar atau pesan max level
    if (info.isMaxLevel) {
        profileText += `*STATUS LEVEL*
Selamat! Anda telah mencapai level maksimal (*Level 120*). EXP tidak akan bertambah lagi.`;
    } else {
        const expToNextLevel = info.progress.needed - info.progress.current;
        profileText += `*PROGRESS MENUJU LV. ${info.level + 1}*
${generateProgressBar(info.progress.percentage, 15)}
*${info.progress.percentage}%* (${formatNumber(info.progress.current)} / ${formatNumber(info.progress.needed)})

*Butuh:* *${formatNumber(expToNextLevel)}* EXP lagi untuk level up.

*TIER INFO*
- Tier: *${info.tierInfo.tierName}*
- Multiplier: *${info.tierInfo.tierMultiplier}x* EXP Requirement`;
    }
    
    // 8. Kirim pesan
    await conn.reply(m.chat, profileText.trim(), m, { mentions: [who] });
};

handler.help = ['profile', 'level', 'my'];
handler.tags = ['info'];
handler.command = /^(profile|level|my|me)$/i;

export default handler;