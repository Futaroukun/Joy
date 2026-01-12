// Sesuaikan path ini dengan lokasi file button.js kamu
import { sendInteractiveMessage } from '../function/button.js' 

let handler = async (m, { conn, usedPrefix, command }) => {
    
    // 1. Definisikan Sections (Isi List)
    const sections = [
        {
            title: "🔥 Menu Populer",
            rows: [
                {
                    header: "Ping",
                    title: "Cek Kecepatan",
                    description: "Test respon bot",
                    id: ".ping"
                },
                {
                    header: "Owner",
                    title: "Kontak Pemilik",
                    description: "Chat owner bot",
                    id: ".owner"
                }
            ]
        },
        {
            title: "📂 Kategori Lain",
            rows: [
                {
                    title: "Menu RPG",
                    description: "Main game RPG",
                    id: ".menurpg"
                }
            ]
        }
    ]

    // 2. Siapkan Parameter Tombol (JSON String)
    const listParams = JSON.stringify({
        title: "KLIK DISINI", // Tulisan di tombol hijau
        sections: sections
    })

    // 3. Susun Payload sesuai format helper function/button.js
    const content = {
        text: "Halo! Ini test menggunakan Helper Button.",
        footer: "Powered by Baileys Helper",
        title: "TEST LIST MESSAGE",
        
        // Perhatikan bagian ini:
        interactiveButtons: [
            {
                name: "single_select", // Wajib nama ini untuk List
                buttonParamsJson: listParams
            }
        ]
    }

    try {
        await m.reply('⏳ Mengirim List Message via Helper...')
        
        // 4. Panggil Fungsi Helper
        await sendInteractiveMessage(conn, m.chat, content, { 
            quoted: m 
        })
        
    } catch (e) {
        console.error(e)
        m.reply('❌ Gagal mengirim: ' + e.message)
    }
}

handler.help = ['testhelper']
handler.tags = ['owner']
handler.command = /^(testhelper|teshelper)$/i

export default handler