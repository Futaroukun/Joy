let handler = async (m, { conn, usedPrefix, command }) => {

    const ownerName = global.info?.namaowner || 'Administrator';
    const ownerNumber = global.info?.nomorowner;
    const botName = global.info?.namabot || 'Joy Bot';

    if (!ownerNumber) {
        return m.reply('*SISTEM ERROR*\n\nData kontak owner gak ketemu di konfigurasi.');
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

    await conn.reply(m.chat, `*INFORMASI KONTAK*\n\nNih kartu kontak resmi *${ownerName}*. Chat seperlunya aja ya, jangan spam apalagi cuma nanya hal gak jelas.`, m);
};

handler.help = ['owner'];
handler.tags = ['info'];
handler.command = /^(owner|creator)$/i;

export default handler;