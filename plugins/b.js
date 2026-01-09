/**
  * Fitur Polling WhatsApp
  * Menggunakan logika relayMessage pollCreationMessage
**/

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // 1. Validasi Input: Harus ada judul dan pemisah '|'
    if (!text || !text.includes('|')) {
        return m.reply(
            `*FORMAT POLLING*\n\n` +
            `Gunakan tanda | untuk memisahkan Judul dan Pilihan.\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} Makan apa siang ini? | Nasi Padang | Mie Ayam | Bakso\``
        )
    }

    // 2. Memecah text menjadi Judul dan Array Opsi
    let [name, ...opts] = text.split('|')

    // 3. Bersihkan spasi berlebih dan filter opsi kosong
    let options = opts.map(v => v.trim()).filter(v => v)

    // 4. Validasi minimal opsi (WhatsApp butuh minimal 2 pilihan)
    if (options.length < 2) {
        return m.reply("Minimal harus ada 2 pilihan opsi untuk membuat polling.")
    }

    m.reply(`_Sedang membuat polling: "${name.trim()}"..._`)

    try {
        // --- LOGIKA DARI KODE SENDPOLL KAMU ---
        const pollMessage = {
            name: name.trim(),
            options: options.map(btn => ({
                optionName: btn
            })),
            selectableOptionsCount: 1 // Sesuai kode kamu (User cuma bisa pilih 1 jawaban)
        }

        await conn.relayMessage(m.chat, { 
            pollCreationMessage: pollMessage 
        }, { quoted: m })

    } catch (e) {
        console.error(e)
        m.reply("Gagal membuat polling. Pastikan bot sudah jadi admin jika di grup (opsional) atau update library Baileys.")
    }
}

handler.help = ['poll <judul|opsi1|opsi2>']
handler.tags = ['group', 'tools']
handler.command = /^(poll|voting|vote)$/i

export default handler