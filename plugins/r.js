import AIEditor from '../function/ai.js'; // Pastikan path ini benar!

const ai = new AIEditor();

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m;
    let mime = (q.msg || q).mimetype || '';

    // 1. Validasi Gambar
    if (!mime || !mime.startsWith('image/')) {
        return m.reply(`📸 *Silakan reply/kirim gambar untuk diedit!*`);
    }

    // 2. Validasi Prompt
    if (!text) {
        return m.reply(
            `📝 *Masukkan instruksi edit!*\n\n` +
            `*Contoh:*\n` +
            `• ${usedPrefix + command} ubah rambut jadi merah\n` +
            `• ${usedPrefix + command} tambahkan kacamata hitam`
        );
    }

    m.reply('⏳ _Sedang memproses dengan Nano Banana AI..._');

    try {
        let media = await q.download();
        
        // [FIX] Default Model: Nano Banana
        let model = 'nano_banana'; 
        let prompt = text;
        
        // Fitur Opsional: Cek jika user ingin pakai model lain (misal: "flux ...")
        const models = ai.getAvailableModels();
        const firstWord = text.split(' ')[0].toLowerCase();
        
        if (models.includes(firstWord)) {
            model = firstWord;
            prompt = text.split(' ').slice(1).join(' ');
            
            if (!prompt.trim()) return m.reply(`📝 *Prompt instruksi tidak boleh kosong!*`);
        }
        
        // 3. Eksekusi AI
        const result = await ai.ImageAIEditor(media, model, {
            size: "4K", 
            aspect_ratio: "match_input_image", 
            go_fast: true, 
            prompt: prompt.trim(), 
            output_quality: 100, 
            disable_safety_checker: true
        });

        // 4. Kirim Hasil
        if (result && result.results && result.results.output) {
            await conn.sendMessage(m.chat, {
                image: { url: result.results.output },
                caption: `✅ *Edit Selesai!*\n\n📝 Prompt: ${prompt}\n🤖 Model: ${model}`
            }, { quoted: m });
        } else {
            m.reply('❌ *Gagal mendapatkan hasil.* Coba ganti prompt atau gambar.');
        }

    } catch (e) {
        console.error('❌ Error AI Editor:', e);
        m.reply(`❌ *Terjadi Error:*\n${e.message}`);
    }
};

handler.help = ['editimg <instruksi>'];
handler.tags = ['ai', 'image'];
handler.command = /^(editimg|imgedit|aiedit|editai)$/i;

export default handler;