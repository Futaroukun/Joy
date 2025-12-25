function msToTime(duration) {
    let seconds = Math.floor((duration / 1000) % 60),
        minutes = Math.floor((duration / (1000 * 60)) % 60),
        hours = Math.floor((duration / (1000 * 60 * 60)) % 24),
        days = Math.floor(duration / (1000 * 60 * 60 * 24));

    let timeString = [];
    if (days > 0) timeString.push(`${days} hari`);
    if (hours > 0) timeString.push(`${hours} jam`);
    if (minutes > 0) timeString.push(`${minutes} menit`);
    if (seconds > 0) timeString.push(`${seconds} detik`);
    
    return timeString.length > 0 ? timeString.join(', ') : 'bentar doang';
}

export async function before(m) {
    if (!m.sender) return true;

    let user = global.db.data.users[m.sender];
    
    if (user && user.afk && !m.isBaileys) {
        const afkTime = user.afkTime;
        
        user.afk = false;
        user.afkTime = -1;
        user.afkReason = '';
        
        await m.reply(
            `*KAMU SUDAH ONLINE LAGI*\n\n` +
            `Status AFK dimatiin karena kamu kirim pesan. Tadi kamu afk selama *${msToTime(Date.now() - afkTime)}*.`
        );
    }

    let mentionedJids = m.mentionedJid?.length ? m.mentionedJid : (m.quoted ? [m.quoted.sender] : []);

    if (mentionedJids.length > 0) {
        for (let jid of mentionedJids) {
            if (!jid) continue;
            
            const mentionedUser = global.db.data.users[jid];
            
            if (mentionedUser && mentionedUser.afk) {
                await m.reply(
                    `*ORANGNYA LAGI AFK*\n\n` +
                    `Jangan ganggu @${jid.split('@')[0]} dulu ya, dia lagi gak aktif.\n\n` +
                    `*Alasan:* ${mentionedUser.afkReason}\n` +
                    `Dari ${msToTime(Date.now() - mentionedUser.afkTime)} yang lalu`, 
                    null, 
                    { mentions: [jid] }
                );
            }
        }
    }

    return true; 
}