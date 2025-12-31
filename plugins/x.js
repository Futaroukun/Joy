import chatgpt from '../function/gpt.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const availableModels = ['gpt-4o-mini', 'gpt-3.5-turbo', 'gpt-4.1-mini', 'gpt-4.1-nano', 'gpt-5-mini', 'gpt-5-nano'];

    if (!text) {
        return m.reply(
            `*CHATGPT ASSISTANT*\n\n` +
            `Gua bakal nanya ke ChatGPT buat lu.\n\n` +
            `*Cara Pakai:*\n` +
            `${usedPrefix + command} <pertanyaan> [--model <nama_model>]\n\n` +
            `*Contoh:*\n` +
            `${usedPrefix + command} jelaskan tentang black hole\n` +
            `${usedPrefix + command} resep rendang terenak --model gpt-4o-mini\n\n` +
            `*Model Tersedia:*\n` +
            availableModels.map(model => `- ${model}`).join('\n')
        );
    }

    let question = text;
    let model = 'gpt-4o-mini'; 

    const modelMatch = (text + '').match(/--model\s+([a-zA-Z0-9.\-]+)/i);
    if (modelMatch) {
        let selectedModel = modelMatch[1].trim().toLowerCase();
        if (availableModels.includes(selectedModel)) {
            model = selectedModel;
            question = (text + '').replace(/--model\s+([a-zA-Z0-9.\-]+)/i, '').trim();
        } else {
            return m.reply(`*MODEL TIDAK VALID*\n\nModel "${selectedModel}" gak ada di daftar. Cek lagi ya.`);
        }
    }

    if (!question) {
        return m.reply(`*PERTANYAAN KOSONG*\n\nLu belum masukin pertanyaan setelah nentuin model.`);
    }

    let loadingMsg = null;
    try {
        loadingMsg = await m.reply(`*Sabar, lagi nanya ke ChatGPT (${model})...*`);

        const result = await chatgpt(question, { model });
        
        if (!result) throw new Error('Respon dari API kosong atau tidak valid.');

        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }

        await conn.sendMessage(m.chat, {
            text: '' + result,
            contextInfo: {
                externalAdReply: {
                    title: `ChatGPT - ${model}`,
                    body: question.slice(0, 50) + '...',
                    thumbnailUrl: 'https://qu.ax/GyhG.jpg',
                    sourceUrl: 'https://minitoolai.com/chatGPT/',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m });

    } catch (error) {
        console.error('ChatGPT Plugin Error:', error);
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }); } catch {}
        }
        m.reply(`*GAGAL DAPAT RESPON*\n\n*Error:* ${error.message}\n\nCoba ganti model atau tanya lagi nanti.`);
    }
}

handler.help = ['gpt <pertanyaan> [--model <model>]'];
handler.tags = ['ai'];
handler.command = /^(gpt|chatgpt)$/i;
handler.limit = false;

export default handler;