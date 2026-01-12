import axios from 'axios'

let handler = async (m, { conn }) => {
    await m.reply('⏳ Tunggu sebentar, sedang mengambil data gempa dari BMKG...')

    try {
        // Langsung tembak ke endpoint Auto Gempa (Terkini)
        const { data } = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        })

        // Validasi struktur data
        if (!data || !data.Infogempa || !data.Infogempa.gempa) {
            throw new Error('Data gempa tidak ditemukan atau struktur berubah')
        }

        const gempa = data.Infogempa.gempa
        
        const { 
            Tanggal, Jam, Magnitude, Kedalaman, Wilayah, 
            Lintang, Bujur, Potensi, Dirasakan, Shakemap 
        } = gempa

        // Buat Caption
        const caption = `
🌍 *INFO GEMPA TERKINI* 🌍
Sumber: _BMKG (Badan Meteorologi, Klimatologi, dan Geofisika)_

📅 *Tanggal:* ${Tanggal}
🕐 *Waktu:* ${Jam}
💥 *Magnitudo:* ${Magnitude}
🌊 *Kedalaman:* ${Kedalaman}
📍 *Koordinat:* ${Lintang}, ${Bujur}
🏠 *Wilayah:* ${Wilayah}

⚠️ *Potensi:* ${Potensi}
${Dirasakan ? `📡 *Dirasakan:* ${Dirasakan}\n` : ''}
⚠️ _Harap tetap tenang dan pantau informasi resmi._
`.trim()

        // Kirim Pesan (Metode Baru: Langsung URL)
        if (Shakemap) {
            await conn.sendMessage(m.chat, { 
                image: { url: `https://data.bmkg.go.id/DataMKG/TEWS/${Shakemap}` }, 
                caption: caption 
            }, { quoted: m })
        } else {
            await m.reply(caption)
        }

    } catch (e) {
        console.error('Error handler gempa:', e)
        m.reply('❌ Gagal mengambil data gempa. Pastikan server BMKG sedang online.')
    }
}

handler.help = ['gempa']
handler.tags = ['tools']
handler.command = /^(gempa|infogempa|bmkg)$/i

export default handler