/*
 * @Author: Rafli
 * @Feature: Info Kontak Owner & Developer
 * @Description: Mengirim kartu kontak resmi WhatsApp (vCard) serta informasi detail kontak,
 *               sosial media, dan saluran resmi pemilik/developer bot Joy.
 */

let handler = async (m, { conn, args, usedPrefix }) => {
    // Jika ada sub-perintah add/del/list, arahkan ke modul manajemen owner
    if (args && args[0] && /^(add|del|rem|remove|list)$/i.test(args[0])) {
        return m.reply(
            `*PEMBERITAHUAN*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Untuk mengelola daftar owner bot, silakan gunakan perintah:\n` +
            `• \`${usedPrefix}addowner <@user/nomor>\`\n` +
            `• \`${usedPrefix}delowner <@user/nomor>\`\n` +
            `• \`${usedPrefix}listowner\``
        );
    }

    const name = global.info?.namaowner || 'Rafli';
    const number = (global.info?.nomorowner || global.developer?.[0] || '6283854551575').replace(/[^0-9]/g, '');
    const botName = global.info?.namabot || 'Joy';
    const botNumber = (global.info?.nomorbot || conn.user?.jid || '').replace(/[^0-9]/g, '');

    // Cek daftar owner tambahan (di luar developer utama dan nomor bot)
    const extraOwners = [];
    if (Array.isArray(global.owner)) {
        for (const o of global.owner) {
            const cleanO = (Array.isArray(o) ? o[0] : o).toString().replace(/[^0-9]/g, '');
            if (cleanO && cleanO !== number && cleanO !== botNumber && !extraOwners.includes(cleanO)) {
                extraOwners.push(cleanO);
            }
        }
    }
    if (global.db?.data?.owners && typeof global.db.data.owners === 'object') {
        for (const [key, val] of Object.entries(global.db.data.owners)) {
            const pn = (val?.pn || key).toString().replace(/[^0-9]/g, '');
            if (pn && pn.length < 15 && pn !== number && pn !== botNumber && !extraOwners.includes(pn)) {
                extraOwners.push(pn);
            }
        }
    }

    // Susun vCard resmi
    const vcard = `BEGIN:VCARD\n`
                + `VERSION:3.0\n`
                + `FN:${name}\n`
                + `ORG:Official ${botName} Development\n`
                + `TITLE:Owner & Lead Developer\n`
                + `TEL;type=CELL;type=VOICE;waid=${number}:+${number}\n`
                + (global.lwa ? `URL;type=WhatsApp:${global.lwa}\n` : '')
                + (global.lgh ? `URL;type=GitHub:${global.lgh}\n` : '')
                + (global.lig ? `URL;type=Instagram:${global.lig}\n` : '')
                + `END:VCARD`;

    // Susun caption informasi kontak
    let caption = `╭── ✦ *KONTAK OWNER & DEVELOPER* ✦\n`
                + `• Nama: ${name}\n`
                + `• Peran: Developer Utama & Creator\n`
                + `• WhatsApp: +${number}\n`
                + `• Chat WA: ${global.lwa || `https://wa.me/${number}`}\n`;

    if (extraOwners.length > 0) {
        caption += `• Owner Tambahan: ${extraOwners.map(o => `+${o}`).join(', ')}\n`;
    }

    if (global.lgh) caption += `• GitHub: ${global.lgh}\n`;
    if (global.lig) caption += `• Instagram: ${global.lig}\n`;
    if (global.lch) caption += `• Saluran WA: ${global.lch}\n`;
    if (global.lgc) caption += `• Grup Resmi: ${global.lgc}\n`;

    caption += `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
            + `> _Silakan hubungi owner untuk urusan penting, pelaporan bug, atau kerja sama._\n`
            + `> _Dilarang melakukan spam chat atau spam call._`;

    // 1. Kirim kartu kontak WhatsApp (vCard)
    await conn.sendMessage(m.chat, {
        contacts: {
            displayName: name,
            contacts: [{ vcard }]
        }
    }, { quoted: m });

    // 2. Kirim rincian teks info kontak & tautan sosial media
    const thumbObj = Buffer.isBuffer(global.thum)
        ? { thumbnail: global.thum }
        : (global.thum ? { thumbnailUrl: global.thum } : {});

    await conn.sendMessage(m.chat, {
        text: caption,
        contextInfo: {
            externalAdReply: {
                title: `${botName} • Owner Contact Info`,
                body: `Developer: ${name} (+${number})`,
                ...thumbObj,
                sourceUrl: global.lwa || `https://wa.me/${number}`,
                mediaType: 1,
                renderLargerThumbnail: true
            }
        }
    }, { quoted: m });

    // React functional emoji
    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
};

handler.help    = ['owner'];
handler.tags    = ['info'];
handler.command = /^(owner|creator|developer|dev|kontakowner)$/i;

export default handler;