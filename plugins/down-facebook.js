/*
- @Author: Rafli
- @Feature: Facebook Downloader
- @Description: Download video Facebook via Cuki API, prioritas HD fallback SD.
*/

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*FACEBOOK DOWNLOADER*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Unduh video Reels & Post Facebook kualitas HD/SD.\n\n` +
        `*Cara Pakai:*\n` +
        `› \`${usedPrefix + command} <url facebook>\`\n\n` +
        `*Contoh:*\n` +
        `› \`${usedPrefix + command} https://www.facebook.com/share/r/xxx\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
    )

    if (!text.includes('facebook.com') && !text.includes('fb.com') && !text.includes('fb.watch')) {
        return m.reply('URL harus berasal dari Facebook.')
    }

    const loadingMsg = await m.reply('_Mengunduh video Facebook..._')

    try {
        const apikey = global.api?.cuki || 'cuki-x'
        const apiRes = await fetch(
            `https://api.cuki.biz.id/api/downloader/aio?apikey=${apikey}&url=${encodeURIComponent(text)}`
        )
        if (!apiRes.ok) throw new Error(`API error (HTTP ${apiRes.status})`)

        const json = await apiRes.json()
        if (!json.success || !json.data?.medias?.length) throw new Error('Gagal mendapatkan link video.')

        const medias = json.data.medias.filter(v => v.type === 'video')
        if (!medias.length) throw new Error('Tidak ada media video ditemukan.')

        const picked = medias.find(v => v.quality === 'HD') || medias[0]
        const { data } = json

        const captionText = 
            `*FACEBOOK VIDEO*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${data.title ? `• Judul: ${data.title}\n` : ''}` +
            `${data.author ? `• Author: ${data.author}\n` : ''}` +
            `• Kualitas: ${picked.quality}\n` +
            `• Sumber: Facebook\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> _Powered by Joy Multi-Device_`

        // Gunakan conn.sendFile (metode lebih stabil dengan fallback buffer)
        await conn.sendFile(m.chat, picked.url, 'fb.mp4', captionText, m)

        // Hapus loading SETELAH berhasil kirim
        await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})

    } catch (err) {
        console.error('[FBDL ERROR]:', err)
        
        // Kirim pesan error baru tanpa edit (karena mungkin loadingMsg bermasalah)
        await m.reply(`*GAGAL DOWNLOAD*\n\n*Error:* ${err.message}\n\nCoba lagi nanti.`)
        
        // Hapus loading jika masih ada
        await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
    }
}

handler.help    = ['facebook *url*']
handler.tags    = ['downloader']
handler.command = /^(facebook|fb|fbdl)$/i
handler.limit   = false

export default handler