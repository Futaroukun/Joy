let handler = async (m, { conn, usedPrefix, command }) => {
    // 1. Definisikan Isi List (Sections)
    const sections = [
        {
            title: "📂 Menu Utama",
            rows: [
                {
                    header: "Info Bot",
                    title: "Status Bot",
                    description: "Cek kesehatan sistem bot",
                    id: ".ping"
                },
                {
                    header: "Pemilik",
                    title: "Owner Contact",
                    description: "Hubungi pembuat bot",
                    id: ".owner"
                }
            ]
        },
        {
            title: "🌟 Fitur Lain",
            rows: [
                {
                    title: "Sewa Bot",
                    description: "Info harga sewa",
                    id: ".sewa"
                },
                {
                    title: "Donasi",
                    description: "Dukung bot ini",
                    id: ".donasi"
                }
            ]
        }
    ]

    // 2. Susun Tombol List (Single Select)
    // Ingat: Di fungsi sendButton kamu, tombol harus format Native Flow
    const buttons = [
        {
            name: "single_select",
            buttonParamsJson: JSON.stringify({
                title: "KLIK DISINI", // Tulisan di tombol hijau
                sections: sections
            })
        }
    ]

    // 3. Susun Konten Pesan
    const content = {
        header: "LIST MENU TEST",
        body: "Ini adalah contoh tampilan *List Message* menggunakan fungsi `conn.sendButton`.\nSilakan pilih menu di bawah ini:",
        footer: "Powered by Baileys",
        buttons: buttons // Masukkan tombol list tadi ke sini
    }

    // 4. Kirim
    try {
        await m.reply('⏳ Mengirim List Message...')
        await conn.sendButton(m.chat, content, { quoted: m })
    } catch (e) {
        console.error(e)
        m.reply('❌ Gagal: ' + e)
    }
}

handler.help = ['testlistonly']
handler.tags = ['owner']
handler.command = /^(testlistonly|teslist|listonly)$/i

export default handler