/*
- @Author: Rafli
- @Feature: Donasi
- @Description: Kirim info donasi beserta QRIS.
*/

import { readFileSync } from 'fs'
import { join } from 'path'

let handler = async (m, { conn }) => {
    const qris = readFileSync(join('src', 'qris.jpg'))

    const caption =
        `*${global.info?.namabot || 'Joy Bot'} sepenuhnya gratis.*\n` +
        `Tidak ada biaya langganan, tidak ada fitur berbayar.\n` +
        `Semua orang bisa pakai tanpa terkecuali.\n\n` +
        `Bot ini hidup dari waktu, tenaga, dan biaya server\n` +
        `yang ditanggung sendiri oleh developernya.\n\n` +
        `Kalau kamu merasa bot ini membantu dan ingin\n` +
        `berkontribusi agar tetap berjalan, donasi sekecil\n` +
        `apapun benar-benar sangat berarti.\n` +
        `Bahkan seribu rupiah pun sudah lebih dari cukup\n` +
        `untuk membuktikan bahwa usaha ini diapresiasi.\n\n` +
        `*Cara donasi:*\n` +
        `QRIS — Scan gambar di atas\n` +
        `Dana — \`083854551575\` (Rafli Setiawan)\n` +
        `Saweria — saweria.co/YourFavv\n\n` +
        `Terima kasih sudah menggunakan bot ini.\n` +
        `Dukunganmu yang membuat kami terus semangat. 🙏`

    await conn.sendMessage(m.chat, {
        image  : qris,
        caption: caption
    }, { quoted: m })
}

handler.help    = ['donasi']
handler.tags    = ['info']
handler.command = /^(donasi|donate|support)$/i

export default handler