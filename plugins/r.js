let handler = async (m, { conn, usedPrefix, command, text, isOwner }) => {
    // Validasi owner dengan berbagai metode
    const ownerNumbers = global.owner || [];
    const userNumber = m.sender.replace(/\D/g, '');
    
    // Cek apakah user adalah owner
    const checkOwner = isOwner || 
                      ownerNumbers.some(([number]) => number.replace(/\D/g, '') === userNumber) ||
                      ownerNumbers.some(number => (typeof number === 'string' ? number : number[0]).replace(/\D/g, '') === userNumber);

    if (!checkOwner) {
        return m.reply('*❌ AKSES DITOLAK*\n\nFitur ini hanya untuk owner bot.');
    }

    try {
        const users = global.db.data.users;
        
        // Command: .cleandb
        if (command === 'cleandb') {
            let deleted = 0;
            let report = [];

            for (let jid in users) {
                let shouldDelete = false;
                let reason = '';

                // Filter: Hapus semua user dengan JID @s.whatsapp.net
                if (jid.includes('@s.whatsapp.net')) {
                    shouldDelete = true;
                    reason = 'JID WhatsApp (@s.whatsapp.net)';
                }

                // Hapus jika memenuhi kriteria
                if (shouldDelete) {
                    report.push(`• ${jid.split('@')[0]} - ${reason}`);
                    delete users[jid];
                    deleted++;
                }
            }

            if (deleted === 0) {
                return m.reply('*✅ DATABASE BERSIH*\n\nTidak ada user yang perlu dihapus.');
            }

            let message = `*🗑️ DATABASE CLEANED*\n\n`;
            message += `Total dihapus: *${deleted} user*\n\n`;
            message += `*Detail:*\n${report.slice(0, 20).join('\n')}`;
            
            if (report.length > 20) {
                message += `\n\n_...dan ${report.length - 20} lainnya_`;
            }

            return m.reply(message);
        }

        // Command: .deluser <jid/nomor>
        if (command === 'deluser') {
            if (!text) {
                return m.reply(`*📝 CARA PAKAI*\n\nKirim: ${usedPrefix}deluser <nomor/jid>\n\nContoh:\n${usedPrefix}deluser 628xxx\n${usedPrefix}deluser 628xxx@s.whatsapp.net`);
            }

            // Format JID
            let targetJid = text.replace(/[^0-9]/g, '');
            if (!text.includes('@')) {
                targetJid = targetJid + '@s.whatsapp.net';
            } else {
                targetJid = text;
            }

            // Cek apakah user ada
            if (!users[targetJid]) {
                return m.reply('*❌ USER TIDAK DITEMUKAN*\n\nUser tersebut tidak ada di database.');
            }

            const userName = users[targetJid].name || 'Tanpa Nama';
            delete users[targetJid];

            return m.reply(`*✅ USER DIHAPUS*\n\nUser berhasil dihapus dari database!\n\n*Detail:*\n• JID: ${targetJid}\n• Nama: ${userName}`);
        }

        // Command: .listinvaliduser
        if (command === 'listinvaliduser') {
            let invalidUsers = [];

            for (let jid in users) {
                if (jid.includes('@s.whatsapp.net')) {
                    invalidUsers.push({
                        jid: jid,
                        name: users[jid].name || 'N/A',
                        reason: 'JID WhatsApp'
                    });
                }
            }

            if (invalidUsers.length === 0) {
                return m.reply('*✅ DATABASE BERSIH*\n\nTidak ada user invalid.');
            }

            let message = `*📋 DAFTAR USER INVALID*\n\n`;
            message += `Total: *${invalidUsers.length} user*\n\n`;
            
            invalidUsers.slice(0, 30).forEach((user, i) => {
                message += `${i + 1}. ${user.jid.split('@')[0]}\n`;
                message += `   Nama: ${user.name}\n`;
                message += `   Alasan: ${user.reason}\n\n`;
            });

            if (invalidUsers.length > 30) {
                message += `_...dan ${invalidUsers.length - 30} lainnya_\n\n`;
            }

            message += `\n💡 Gunakan *.cleandb* untuk hapus semua user invalid.`;

            return m.reply(message);
        }

    } catch (error) {
        console.error('Error di handler database:', error);
        return m.reply('*❌ TERJADI KESALAHAN*\n\nGagal memproses database.');
    }
};

handler.help = ['cleandb', 'deluser', 'listinvaliduser'];
handler.tags = ['owner'];
handler.command = /^(cleandb|deluser|listinvaliduser)$/i;
handler.owner = true;

export default handler;