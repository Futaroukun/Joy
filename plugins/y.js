import { sendButtons } from '../function/button.js';

let handler = async (m, { conn, usedPrefix, command }) => {
    await m.reply('Mengirim tombol demo "Call to Action: Copy"...');

    // Definisikan tombol CTA Copy
    // 'name': 'cta_copy' adalah tipe tombol.
    // 'display_text': Teks yang muncul pada tombol.
    // 'copy_code': Teks yang akan disalin ke clipboard saat tombol diklik.
    const buttons = [
        {
            name: 'cta_copy',
            buttonParamsJson: JSON.stringify({
                display_text: 'Salin Kode Token',
                copy_code: 'JOY-BOT-TOKEN-RAFLI-TEST-123'
            })
        }
    ];

    // Definisikan data pesan yang akan dikirim
    const buttonMessageData = {
        text: '*DEMO FITUR CTA COPY*',
        footer: 'Klik tombol di bawah ini untuk menyalin kode ke clipboard Anda.',
        buttons: buttons
    };

    // Kirim pesan dengan tombol menggunakan fungsi sendButtons
    try {
        await sendButtons(conn, m.chat, buttonMessageData, { quoted: m });
    } catch (e) {
        console.error('[CTA-COPY-TEST] Error:', e);
        m.reply(`Gagal mengirim tombol CTA.\n\n*Error:* ${e.message}`);
    }
};

// Konfigurasi handler
handler.help = ['cta'];
handler.tags = ['owner'];
handler.command = /^(cta|ctacopy|ctatest)$/i;
handler.owner = true; // Hanya owner yang bisa akses

// Ekspor handler agar bisa di-load oleh sistem
export default handler;