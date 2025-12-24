import { sendButtons } from '../function/button.js'

    let handler = async (m, { conn, text }) => {
        // ... (logika plugin Anda)

        const buttonData = {
            text: 'Ini adalah pesan dengan tombol',
            footer: '© Joy Bot 2024',
            buttons: [
                { id: '.ping', text: 'Cek Ping' },
                { id: '.speedtest', text: 'Uji Kecepatan' },
                // Button dengan URL
                { 
                    name: 'cta_url', 
                    buttonParamsJson: JSON.stringify({ 
                        display_text: 'Kunjungi GitHub', 
                        url: 'https://github.com/Futaroukun/Joy' 
                    }) 
                }
            ],
            // Anda juga bisa menambahkan media (opsional)
            // image: { url: 'https://link-gambar.com/gambar.jpg' },
            // caption: 'Pesan dengan gambar dan tombol'
        };

        try {
            await sendButtons(conn, m.chat, buttonData, { quoted: m });
        } catch (e) {
            console.error('Gagal mengirim pesan button:', e);
            m.reply('Gagal mengirim pesan interaktif.');
        }
    }

    handler.command = /^(testbutton)$/i
    // ... (properti handler lainnya)
    export default handler;