import geminiBardUnstable from '../function/gemini-bard-unstable.js';
import { format } from 'util'; // Untuk formatting error

const MAX_HISTORY_INSTRUCTIONS = 10; // Batasan history instruksi untuk menjaga ukuran session ID

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    // WARNING KERAS: Plugin ini menggunakan API TIDAK RESMI Google Bard.
    // Fungsionalitasnya sangat rentan rusak kapan saja tanpa pemberitahuan.
    // Tidak direkomendasikan untuk penggunaan produksi.
    
    // Ambil session ID dari database user
    let user = global.db.data.users[m.sender];
    if (!user) {
        global.db.data.users[m.sender] = {};
        user = global.db.data.users[m.sender];
    }
    
    // Default instruction
    let defaultInstruction = "Kamu adalah Shiroko, asisten AI yang ramah dan ceria. Selalu jawab dengan gaya yang friendly dan gunakan emoji.";

    // Cek apakah user mengirim instruction baru
    let newInstruction = '';
    let messageToAI = text;

    if (text.startsWith('!setinst ')) { // Contoh command untuk set instruction
        newInstruction = text.substring(9).trim();
        m.reply(`*INSTRUKSI DISETEL*\n\nInstruksi baru: *${newInstruction}*`);
        user.bardInstruction = newInstruction; // Simpan ke DB
        user.bardSessionId = null; // Reset session agar instruction baru diterapkan
        return;
    } else if (text.startsWith('!resetinst')) {
        m.reply(`*INSTRUKSI DIRESET*\n\nInstruksi pribadi dihapus. Kembali ke default.`);
        delete user.bardInstruction;
        user.bardSessionId = null; // Reset session
        return;
    } else if (text.startsWith('!clear')) {
        m.reply('*RIWAYAT DIHAPUS*\n\nRiwayat obrolan sama Bard udah dihapus. Mulai dari awal lagi ya!*');
        user.bardSessionId = null; // Hapus session ID
        return;
    } else if (text.startsWith('!showinst')) {
        let currentInst = user.bardInstruction || defaultInstruction;
        m.reply(`*INSTRUKSI SAYA:*\n\n\`\`\`${currentInst}\`\`\``);
        return;
    }

    let currentInstruction = user.bardInstruction || defaultInstruction;
    
    if (!text && !m.quoted?.text) {
        return m.reply(
            `*AI Bard (Unstable) - Eksperimental*\n\n` +
            `⚠️ *PERINGATAN:* Fitur ini pakai API internal yang tidak stabil dan bisa error kapan saja.\n\n` +
            `*Cara Pakai:*\n` +
            `• \`${usedPrefix + command}\` *pertanyaan kamu*\n` +
            `• Reply pesan dengan \`${usedPrefix + command}\`\n\n` +
            `*Command Tambahan:*\n` +
            `• \`${usedPrefix + command} !setinst <instruction>\` - Set persona atau instruksi khusus.\n` +
            `• \`${usedPrefix + command} !resetinst\` - Reset instruksi pribadi.\n` +
            `• \`${usedPrefix + command} !showinst\` - Lihat instruksi saat ini.\n` +
            `• \`${usedPrefix + command} !clear\` - Hapus riwayat obrolan.`
        );
    }
    
    if (m.quoted?.text && !text) {
        messageToAI = m.quoted.text;
    } else if (m.quoted?.text && text) {
        // Gabungkan konteks dari quoted dan teks baru
        messageToAI = `Konteks: "${m.quoted.text}"\nPesan baru: "${text}"`;
    }
    
    // Karena API ini cuma teks, kalau ada media di-quoted, kita abaikan atau peringatkan
    if (m.quoted?.media && !m.quoted.text) {
        return m.reply('*Bard (Unstable) tidak mendukung input media (gambar/video).* Silakan kirim teks saja.');
    }


    let loadingMsg = await m.reply('*⏳ Berpikir... (Bard Unstable)*');

    try {
        const response = await geminiBardUnstable({
            message: messageToAI,
            instruction: currentInstruction,
            sessionId: user.bardSessionId // Ambil session ID dari DB
        });

        // Simpan session ID baru ke database user
        user.bardSessionId = response.sessionId;
        
        // Hapus pesan loading
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }
        
        await conn.reply(m.chat, `*Bard (Unstable) says:*\n\n${response.text}`, m);

    } catch (e) {
        console.error('[PLUGIN_AI_BARD] Error:', e);
        // Hapus pesan loading
        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }
        
        // Reset session ID kalau ada error, mungkin session-nya udah expired
        user.bardSessionId = null; 
        m.reply(`*❌ Bard (Unstable) Error:*\n${format(e.message)}\n\n_Sesi mungkin sudah expired, atau API internal Google berubah._`);
    }
};

handler.help = ['bard *[pertanyaan]*', 'bard !setinst *[instruction]*', 'bard !resetinst', 'bard !showinst', 'bard !clear'];
handler.tags = ['ai'];
handler.command = /^(bard|bardai)$/i;
handler.limit = false; // Karena ini eksperimental, mungkin tidak perlu limit ketat
handler.private = false; // Bisa dipakai di grup atau pribadi

export default handler;