import { sendInteractiveMessage } from '../function/button.js';

let handler = async (m, { conn, usedPrefix, command }) => {
    await m.reply('Mengirim demo tombol "Single Select"...');

    // Definisikan tombol 'single_select'
    // 'name': 'single_select' adalah tipe tombol.
    // 'title': Judul yang muncul di header daftar pilihan.
    // 'sections': Grup dari pilihan. Harus berupa array.
    // 'rows': Pilihan yang bisa diklik user.
    // 'id': Perintah yang akan dikirim kembali saat user memilih opsi.
    const selectButton = {
        name: 'single_select',
        buttonParamsJson: JSON.stringify({
            title: 'PILIH FITUR UJI COBA', // Judul utama daftar
            sections: [
                {
                    title: 'Daftar Perintah', // Judul seksi
                    rows: [
                        {
                            title: 'Tampilkan Menu Lengkap',
                            description: 'Melihat semua daftar perintah yang tersedia.',
                            id: '.menu all' // Perintah yang akan dieksekusi
                        },
                        {
                            title: 'Tes Tombol Salin (CTA)',
                            description: 'Menjalankan demo tombol "Copy to Clipboard".',
                            id: '.cta' // Perintah yang akan dieksekusi
                        }
                    ]
                }
            ]
        })
    };

    // Definisikan data pesan interaktif yang akan dikirim
    const payload = {
        text: 'Ini adalah demo untuk tombol interaktif tipe "Single Select".\n\nSilakan pilih salah satu opsi di bawah ini.',
        footer: '© Joy Bot by Rafli',
        interactiveButtons: [selectButton] // Masukkan tombol yang sudah dibuat
    };

    // Kirim pesan dengan tombol menggunakan fungsi sendInteractiveMessage
    try {
        await sendInteractiveMessage(conn, m.chat, payload, { quoted: m });
    } catch (e) {
        console.error('[SELECT-TEST] Error:', e);
        m.reply(`Gagal mengirim tombol select.\n\n*Error:* ${e.message}`);
    }
};

// Konfigurasi handler
handler.help = ['bt'];
handler.tags = ['owner'];
handler.command = /^(bt|buttontest|selecttest)$/i;
handler.owner = true; // Hanya owner yang bisa akses

export default handler;