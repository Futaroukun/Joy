let handler = async (m, { conn, usedPrefix, command }) => {

    const ownerName = global.info?.namaowner || 'Administrator';
    const ownerNumber = global.info?.nomorowner;
    const botName = global.info?.namabot || 'Joy Bot';

    if (!ownerNumber) {
        return m.reply('*SISTEM ERROR*\n\nData kontak pengembang tidak ditemukan dalam konfigurasi server.');
    }

    const vcard = `BEGIN:VCARD\n` +
                  `VERSION:3.0\n` +
                  `FN:${ownerName}\n` +
                  `ORG:Official Owner of ${botName}\n` +
                  `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` +
                  `END:VCARD`;

    const contactMessage = {
        contacts: {
            displayName: ownerName,
            contacts: [{ vcard: vcard }]
        }
    };

    await conn.sendMessage(m.chat, contactMessage, { quoted: m });

    await conn.reply(m.chat, `*INFORMASI KONTAK*\n\nTerlampir adalah kartu kontak resmi *${ownerName}*. Harap hubungi hanya untuk kepentingan mendesak atau pelaporan kendala sistem.`, m);
};

handler.help = ['owner'];
handler.tags = ['info'];
handler.command = /^(owner|creator)$/i;

export default handler;