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

let handler = async (m, { text }) => {
    let user = global.db.data.users[m.sender];
    if (!user) return;
    
    user.afk = true;
    user.afkTime = Date.now();
    user.afkReason = text || 'Gak ada alasan';
    
    let afkMsg = `*OKE SEKARANG KAMU AFK*\n\n*Nama:* ${m.name}\n*Alasan:* ${user.afkReason}\n\nNanti kalau kamu kirim pesan lagi, status AFK kamu otomatis dimatiin.`;
    
    m.reply(afkMsg);
}

handler.help = ['afk *alasan*'];
handler.tags = ['group'];
handler.command = /^afk$/i;
handler.group = true;

export default handler;