import AIEditor from '../function/ai-img.js'

const ai = new AIEditor()

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || ''

    if (!mime || !mime.startsWith('image/')) {
        return m.reply('*Kirim atau reply gambar yang mau kamu edit.*')
    }

    if (!text) {
        return m.reply(
            `*MASUKIN INSTRUKSI EDITNYA*\n\n` +
            `Contoh:\n` +
            `• \`${usedPrefix + command}\` *ubah rambut jadi merah*\n` +
            `• \`${usedPrefix + command}\` *tambahin kacamata hitam*`
        )
    }

    m.reply('*Bentar ya, lagi diproses pake Nano Banana AI...*')

    try {
        let media = await q.download()
        
        let model = 'nano_banana' 
        let prompt = text
        
        const models = ai.getAvailableModels()
        const firstWord = text.split(' ')[0].toLowerCase()
        
        if (models.includes(firstWord)) {
            model = firstWord
            prompt = text.split(' ').slice(1).join(' ')
            
            if (!prompt.trim()) return m.reply('*Instruksi editnya gak boleh kosong.*')
        }
        
        const result = await ai.ImageAIEditor(media, model, {
            size: "4K", 
            aspect_ratio: "match_input_image", 
            go_fast: true, 
            prompt: prompt.trim(), 
            output_quality: 100, 
            disable_safety_checker: true
        })

        if (result && result.results && result.results.output) {
            await conn.sendMessage(m.chat, {
                image: { url: result.results.output },
                caption: `*EDIT SELESAI*\n\nPrompt: *${prompt}*\nModel: *${model}*`
            }, { quoted: m })
        } else {
            m.reply('*Gagal dapet hasil editnya. Coba ganti instruksi atau gambarnya.*')
        }

    } catch (e) {
        console.error(e)
        m.reply(`*Terjadi masalah:* ${e.message}`)
    }
}

handler.help = ['editimg *instruksi*']
handler.tags = ['ai', 'image']
handler.command = /^(editimg|imgedit|aiedit|editai)$/i

export default handler