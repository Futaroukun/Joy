/**
- Handler untuk mengirim kontak owner.
- Mengambil data dari global.info di settings.js
 */
let handler = async (m, { conn, usedPrefix, command }) => {

    // 1. Ambil data dari global settings
    const ownerName = global.info?.namaowner || 'Owner';
    const ownerNumber = global.info?.nomorowner;
    const botName = global.info?.namabot || 'Joy Bot';

    // 2. Validasi jika nomor owner tidak ada
    if (!ownerNumber) {
        return m.reply('Kontak owner belum diatur di `settings.js`.\nSilakan hubungi developer.');
    }

    // 3. Buat string vCard (Virtual Contact File)
    // waid digunakan oleh WhatsApp untuk identifikasi nomor.
    const vcard = `BEGIN:VCARD\n` +
                  `VERSION:3.0\n` +
                  `FN:${ownerName}\n` + // Full Name
                  `ORG:Owner of ${botName}\n` + // Organization
                  `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:+${ownerNumber}\n` + // WhatsApp ID & Phone Number
                  `END:VCARD`;

    // 4. Siapkan payload pesan kontak untuk Baileys
    const contactMessage = {
        contacts: {
            displayName: ownerName,
            contacts: [{ vcard: vcard }]
        }
    };

    // 5. Kirim pesan kontak
    await conn.sendMessage(m.chat, contactMessage, { quoted: m });

    // 6. Kirim pesan teks tambahan sebagai follow-up
    await conn.reply(m.chat, `Itu kontak Owner ku, *${ownerName}*. Jika ada keperluan penting, silakan hubungi.`, m);
};

// Metadata untuk handler
handler.help = ['owner'];
handler.tags = ['main'];
handler.command = /^(owner|creator)$/i; // Command bisa .owner atau .creator

// Ekspor handler agar bisa di-load oleh sistem
export default handler;