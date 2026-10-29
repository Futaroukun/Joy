/*
  - @Author: Rafli
  - @Feature: Qwen Ai
  - @Description: Ai qwen yang memiliki berbagai macam model
*/

import { qwen } from '../function/ai/qwen.js';
import tmpManager from '../function/core/safe-tmp.js';

const searchKeywords = /\b(siapa(?:kah)?|kapan(?:kah)?|dimana(?:kah)?|mana(?:kah)?|berita|terbaru|cuaca|hari ini|harga|skor|vs|cari|google|info|sejarah|biografi|peristiwa|who|when|where|news|weather|price|search|find)\b/i;
const thinkingKeywords = /\b((?:mem)?buat(?:kan|lah)?|(?:mem)?bantu(?:kan|lah)?|(?:men)?tulis(?:kan|lah)?|(?:meng)?hitung(?:lah)?|(?:men)?jelaskan(?:lah)?|perbedaan(?:nya)?|persamaan(?:nya)?|coding|code|program|error|bug|analisis|pecahkan|solusi|mengapa|bagaimana|calculate|solve|explain|why|how|diff|create|compare|analyze|help)\b/i;


export function classifySmartMode(text) {
    const cleanText = text.toLowerCase().trim();
    
    const hasSearch = searchKeywords.test(cleanText);
    const hasThinking = thinkingKeywords.test(cleanText) || cleanText.length > 60;
    
    return {
        thinkingEnabled: hasThinking,
        searchEnabled: hasSearch
    };
}

const QWEN_EMAIL    = process.env.QWEN_EMAIL || '';
const QWEN_PASSWORD = process.env.QWEN_PASSWORD || '';
const SUPPORTED_TYPES = ['imageMessage', 'videoMessage', 'documentMessage'];

function getDefaultModel() {
    return qwen.MODELS?.[0] || 'qwen3.8-max';
}

function getUserModel(senderLID) {
    const saved = global.db?.data?.users?.[senderLID]?.qwenModel;
    if (saved && qwen.MODELS?.includes(saved)) return saved;
    return getDefaultModel();
}

function setUserModel(senderLID, model) {
    if (!global.db?.data?.users?.[senderLID]) return;
    global.db.data.users[senderLID].qwenModel = model;
    global.saveData('users', senderLID);
}

function getUserChatId(senderLID) {
    return global.db?.data?.users?.[senderLID]?.qwenChatId || null;
}

function setUserChatId(senderLID, chatId) {
    if (!global.db?.data?.users?.[senderLID]) return;
    global.db.data.users[senderLID].qwenChatId = chatId || null;
    global.saveData('users', senderLID);
}

function getUserParentId(senderLID) {
    return global.db?.data?.users?.[senderLID]?.qwenParentId || null;
}

function setUserParentId(senderLID, parentId) {
    if (!global.db?.data?.users?.[senderLID]) return;
    global.db.data.users[senderLID].qwenParentId = parentId || null;
    global.saveData('users', senderLID);
}

const sessions = new Map();
const TOKEN_TTL = 23 * 60 * 60 * 1000;

async function getOrCreateSession(senderLID) {
    let session = sessions.get(senderLID);
    const now   = Date.now();

    if (session?.token && (now - session.loginAt) > TOKEN_TTL) {
        session.token = null;
    }

    if (!session?.token) {
        const auth = await qwen.login(QWEN_EMAIL, QWEN_PASSWORD);
        if (!auth) throw new Error('Gagal login ke Qwen AI. Periksa email/password di config plugin.');
        session = { token: auth.token, loginAt: now };
        sessions.set(senderLID, session);
    }

    let chatId = getUserChatId(senderLID);
    if (!chatId) {
        chatId = await qwen.createSession(session.token);
        if (!chatId) throw new Error('Gagal membuat sesi chat Qwen. Coba lagi nanti.');
        setUserChatId(senderLID, chatId);
    }

    return { ...session, chatId };
}

function parseFlags(text) {
    const flagMap = [
        { pattern: /^-ts\s+|^-st\s+/, thinking: true,  search: true  },
        { pattern: /^-t\s+/,           thinking: true,  search: false },
        { pattern: /^-s\s+/,           thinking: false, search: true  },
        { pattern: /^-off\s+/,         thinking: false, search: false },
    ];

    for (const { pattern, thinking, search } of flagMap) {
        if (pattern.test(text)) {
            return { thinkingEnabled: thinking, searchEnabled: search, prompt: text.replace(pattern, '').trim() };
        }
    }

    return { thinkingEnabled: true, searchEnabled: true, prompt: text.trim() };
}

async function editMsg(conn, key, text) {
    try {
        await conn.sendMessage(key.remoteJid, { text, edit: key });
    } catch {}
}

function cleanResponse(text) {
    if (!text) return '';
    return text
        .replace(/^#{1,6}\s+(.+)$/gm, '**$1**')
        .replace(/\[\[\d+\]\]/g, '')
        .replace(/\[(\d+)\]/g, '')
        .replace(/^\s*\*\s+/gm, '• ')
        .replace(/(?<!\*)\*\*\*(?!\*)/g, '_**')
        .replace(/(?:\*\*|__)(.*?)(?:\*\*|__)/g, (match, p1) => {
            let content = p1.trim();
            if (!content) return '';
            content = content.replace(/(?<!\*)\*(?!\*)/g, '_');
            const leadingEmojiMatch = content.match(/^([\p{Extended_Pictographic}\u200d\u200e\u200f\ufe0f\s]+)/u);
            let leadingEmojis = "";
            if (leadingEmojiMatch) {
                const matched = leadingEmojiMatch[1];
                if (matched.trim() === content) {
                    return matched;
                }
                leadingEmojis = matched;
                content = content.slice(leadingEmojis.length);
            }
            const trailingEmojiMatch = content.match(/([\p{Extended_Pictographic}\u200d\u200e\u200f\ufe0f\s]+)$/u);
            let trailingEmojis = "";
            if (trailingEmojiMatch) {
                const matched = trailingEmojiMatch[1];
                if (matched.trim() !== content) {
                    trailingEmojis = matched;
                    content = content.slice(0, content.length - trailingEmojis.length);
                }
            }
            let result = "";
            if (leadingEmojis) {
                result += leadingEmojis;
                if (!leadingEmojis.endsWith(" ")) result += " ";
            }
            result += `*${content.trim()}*`;
            if (trailingEmojis) {
                if (!trailingEmojis.startsWith(" ")) result += " ";
                result += trailingEmojis;
            }
            return result;
        })
        .replace(/  +/g, ' ')
        .trim();
}

let handler = async (m, { conn, text, usedPrefix, command, args }) => {
    const senderLID = conn.getLid ? (conn.getLid(m.sender) || m.sender) : m.sender;

    const firstArg = args[0]?.toLowerCase();

    if (command === 'qwen' && (firstArg === 'on' || firstArg === 'off')) {
        if (!global.db.data.chats) global.db.data.chats = {};
        if (!global.db.data.chats[m.chat]) {
            global.db.data.chats[m.chat] = { isQwenOn: false, qwenSessionMode: 'smart' };
        }
        const chat = global.db.data.chats[m.chat];

        if (firstArg === 'on') {
            const modeArg = args[1]?.toLowerCase() || '-smart';
            let mode = 'smart';
            if (modeArg === '-default') mode = 'default';
            else if (modeArg === '-search') mode = 'search';
            else if (modeArg === '-off') mode = 'off';
            else if (modeArg === '-smart') mode = 'smart';

            chat.isQwenOn = true;
            chat.qwenSessionMode = mode;
            global.saveData('chats', m.chat);

            return m.reply(
                `*[ SESI QWEN AI DIAKTIFKAN ]*\n` +
                `────────────────────────────\n` +
                `Sekarang Qwen AI akan merespon otomatis semua chat masuk di room ini.\n\n` +
                `*Mode Sesi:* \`${mode}\` (Thinking & Search: ${mode === 'smart' ? 'Dinamis (Smart)' : mode === 'default' ? 'ON' : mode === 'search' ? 'Search Only' : 'OFF'})\n` +
                `*Gunakan:* \`${usedPrefix}qwen off\` untuk mematikan sesi.`
            );
        } else {
            if (!chat.isQwenOn) return m.reply('_Sesi Qwen AI memang sedang tidak aktif._');
            chat.isQwenOn = false;
            chat.qwenSessionMode = null;
            global.saveData('chats', m.chat);

            return m.reply(
                `*[ SESI QWEN AI DIMATIKAN ]*\n` +
                `────────────────────────────\n` +
                `Sesi chat dinonaktifkan. Qwen tidak akan merespon otomatis lagi.`
            );
        }
    }

    // ── RESET ──────────────────────────────────────────────────────────────────
    if (/^qwenreset$/i.test(command)) {
        const chatId  = getUserChatId(senderLID);
        const session = sessions.get(senderLID);

        if (!chatId) return m.reply('_Tidak ada sesi aktif untuk direset._');

        if (session?.token) qwen.deleteSession(session.token, chatId).catch(() => {});
        setUserChatId(senderLID, null);
        setUserParentId(senderLID, null);

        return m.reply(
            `[ Sesi Qwen Direset ]\n` +
            `────────────────────────────\n` +
            `Percakapan lama telah dihapus. Kirim pesan baru untuk memulai sesi segar.\n\n` +
            `Model aktif: \`${getUserModel(senderLID)}\``
        );
    }

    // ── GANTI MODEL ────────────────────────────────────────────────────────────
    if (/^qwenmodel$/i.test(command)) {
        const modelArg = args[0]?.trim();
        const current  = getUserModel(senderLID);

        if (!modelArg) {
            const list = qwen.MODELS
                .map((name, i) => `${i + 1}. \`${name}\`${name === current ? ' [Aktif]' : ''}`)
                .join('\n');

            return m.reply(
                `[ Model Qwen AI ]\n` +
                `────────────────────────────\n` +
                `Model aktif: \`${current}\`\n\n` +
                `Daftar Model:\n${list}\n\n` +
                `Cara ganti (pakai nomor):\n` +
                `\`${usedPrefix}qwenmodel 1\`\n\n` +
                `Atau pakai nama lengkap:\n` +
                `\`${usedPrefix}qwenmodel qwen3.8-max\`\n\n` +
                `Pilihan tersimpan secara permanen.`
            );
        }

        const byNumber = /^\d+$/.test(modelArg) ? qwen.MODELS[parseInt(modelArg, 10) - 1] : null;
        const valid    = byNumber || qwen.MODELS.find(name => name.toLowerCase() === modelArg.toLowerCase());

        if (!valid) {
            return m.reply(
                `[ Model Tidak Ditemukan ]\n` +
                `────────────────────────────\n` +
                `Model tidak ditemukan dalam daftar. Gunakan nomor atau nama model yang sesuai.\n\n` +
                `Ketik \`${usedPrefix}qwenmodel\` untuk melihat daftar model.`
            );
        }

        if (valid === current) return m.reply(`_Model \`${valid}\` sudah aktif sejak tadi._`);

        setUserModel(senderLID, valid);
        return m.reply(
            `[ Model Berhasil Diganti ]\n` +
            `────────────────────────────\n` +
            `Sebelumnya: \`${current}\`\n` +
            `Sekarang  : \`${valid}\` _(no. ${qwen.MODELS.indexOf(valid) + 1})_\n\n` +
            `Tersimpan secara permanen.`
        );
    }

    const hasMedia = SUPPORTED_TYPES.includes(m.mtype) || (m.quoted && (m.quoted.url || m.quoted.directPath || SUPPORTED_TYPES.includes(m.quoted.mediaType || m.quoted.mtype)));
    if (!text && hasMedia) {
        text = 'analisis gambar/berkas ini';
    }

    // ── HELP ───────────────────────────────────────────────────────────────────
    if (!text && !hasMedia) {
        const current = getUserModel(senderLID);
        return m.reply(
            `*QWEN AI ASSISTANT*\n` +
            `────────────────────────────\n` +
            `Model Aktif: *${current}*\n\n` +
            `*Penggunaan:*\n` +
            `Ketik \`${usedPrefix}qwen\` [pertanyaan]\n` +
            `_Atau reply gambar/file dengan teks perintah._\n\n` +
            `*Bendera (Flags):*\n` +
            `• \`-t\`   : Mode Berpikir (Thinking Only)\n` +
            `• \`-s\`   : Mode Pencarian (Search Only)\n` +
            `• \`-off\` : Mode Cepat (Tanpa Thinking/Search)\n` +
            `_Default: Keduanya aktif (Thinking + Search)_\n\n` +
            `*Sesi Interaktif (Interactive Session):*\n` +
            `• \`${usedPrefix}qwen on\`       : Aktifkan sesi otomatis (default mode smart)\n` +
            `• \`${usedPrefix}qwen on -smart\`: Sesi dengan mode smart (Thinking & Search dinamis)\n` +
            `• \`${usedPrefix}qwen on -default\`: Sesi dengan thinking & search selalu ON\n` +
            `• \`${usedPrefix}qwen on -search\`: Sesi dengan pencarian saja (thinking off)\n` +
            `• \`${usedPrefix}qwen on -off\`   : Sesi mode cepat (thinking & search off)\n` +
            `• \`${usedPrefix}qwen off\`      : Matikan sesi otomatis\n` +
            `_Ketika sesi aktif, semua chat di room ini direspon otomatis oleh Qwen._\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix}qwen apa itu black hole?\`\n` +
            `• \`${usedPrefix}qwen -s berita AI terbaru\`\n` +
            `• \`${usedPrefix}qwen -off hasil dari 15 x 24\`\n\n` +
            `*Kontrol:*\n` +
            `• \`${usedPrefix}qwenreset\` : Reset sesi chat\n` +
            `• \`${usedPrefix}qwenmodel\` : Ganti model AI\n` +
            `────────────────────────────`
        );
    }

    // ── PARSE FLAGS ────────────────────────────────────────────────────────────
    const { thinkingEnabled: msgThinking, searchEnabled: msgSearch, prompt } = parseFlags(text);
    let thinkingEnabled = msgThinking;
    let searchEnabled = msgSearch;

    const chat = global.db.data?.chats?.[m.chat];
    if (chat?.isQwenOn) {
        const hasFlag = /^(?:-ts|-st|-t|-s|-off)\s+/.test(text.trim());
        if (!hasFlag) {
            if (chat.qwenSessionMode === 'search') {
                thinkingEnabled = false;
                searchEnabled = true;
            } else if (chat.qwenSessionMode === 'off') {
                thinkingEnabled = false;
                searchEnabled = false;
            } else if (chat.qwenSessionMode === 'default') {
                thinkingEnabled = true;
                searchEnabled = true;
            } else {
                // Default/Smart mode
                const smartRes = classifySmartMode(prompt || text);
                thinkingEnabled = smartRes.thinkingEnabled;
                searchEnabled = smartRes.searchEnabled;
            }
        }
    }

    if (!prompt) {
        return m.reply(`Tulis pertanyaan setelah flag!\n\nContoh: \`${usedPrefix}qwen -t apa itu quantum computing?\``);
    }

    // ── DETEKSI MEDIA ──────────────────────────────────────────────────────
    let uploadedFile = null;
    let mediaSource  = null;
    let sourceMtype  = null;

    // Cek pesan langsung dulu
    if (m.mediaMessage) {
        const mtype = m.mediaType;
        if (SUPPORTED_TYPES.includes(mtype)) {
            mediaSource = m;
            sourceMtype = mtype;
        }
    }

    let quotedMsg = m.quoted;

    // Jika tidak ada media di pesan langsung, cek quoted/reply
    if (!mediaSource && quotedMsg) {
        
        // Cek jika objek quoted memiliki url/directPath langsung (terutama hasil bongkar viewOnce/ephemeral)
        if (quotedMsg.url || quotedMsg.directPath) {
            const mime = quotedMsg.mimetype || '';
            let resolvedMtype = null;
            
            if (mime.startsWith('image/')) {
                resolvedMtype = 'imageMessage';
            } else if (mime.startsWith('video/')) {
                resolvedMtype = 'videoMessage';
            } else {
                resolvedMtype = 'documentMessage';
            }
            
            if (SUPPORTED_TYPES.includes(resolvedMtype)) {
                mediaSource = quotedMsg;
                sourceMtype = resolvedMtype;
            }
        } else {
            // Fallback jika tidak dibongkar, cek mediaType atau mtype
            const qMtype = quotedMsg.mediaType || quotedMsg.mtype;
            if (SUPPORTED_TYPES.includes(qMtype)) {
                mediaSource = quotedMsg;
                sourceMtype = qMtype;
            }
        }
    }

    let loadingText = '';
    if (mediaSource) {
        loadingText = 
            `_QWEN AI: Menganalisis berkas..._\n` +
            `────────────────────────────\n` +
            `Model: \`${getUserModel(senderLID)}\`\n` +
            `Fitur: Thinking (${thinkingEnabled ? 'Aktif' : 'Nonaktif'}) | Search (${searchEnabled ? 'Aktif' : 'Nonaktif'})\n` +
            `────────────────────────────`;
    } else {
        loadingText = 
            `_QWEN AI: Memproses permintaan..._\n` +
            `────────────────────────────\n` +
            `Model: \`${getUserModel(senderLID)}\`\n` +
            `Fitur: Thinking (${thinkingEnabled ? 'Aktif' : 'Nonaktif'}) | Search (${searchEnabled ? 'Aktif' : 'Nonaktif'})\n` +
            `────────────────────────────`;
    }

    const isSession = command === 'qwensession';
    let loadingMsg = null;
    if (isSession) {
        await conn.sendPresenceUpdate('composing', m.chat);
    } else {
        loadingMsg = await m.reply(loadingText);
    }

    let tmpFilePath = null;

    try {
        const session      = await getOrCreateSession(senderLID);
        const currentModel = getUserModel(senderLID);

        // ── DOWNLOAD & UPLOAD MEDIA ────────────────────────────────────────────
        if (mediaSource) {
            // Tentukan ekstensi
            let ext = 'bin';
            if (sourceMtype === 'imageMessage')    ext = 'jpg';
            else if (sourceMtype === 'videoMessage') ext = 'mp4';
            else {
                const rawMime = mediaSource.mimetype || mediaSource.msg?.mimetype || '';
                ext = rawMime.split('/')[1]?.split(';')[0] || 'bin';
            }
            // Download dengan fallback untuk quoted msg
            let buffer = null;
            try {
                // 1. Coba download menggunakan method .download() bawaan mediaSource
                if (mediaSource.download && typeof mediaSource.download === 'function') {
                    try {
                        buffer = await mediaSource.download(false);
                    } catch (dlErr) {
                    }
                }
                
                // 2. Fallback menggunakan conn.downloadM langsung ke objek medianya
                if (!buffer && conn.downloadM) {
                    const dlType = sourceMtype.replace(/Message$/i, '').toLowerCase();
                    const mediaObj = (mediaSource.url || mediaSource.directPath) ? mediaSource : 
                                     (mediaSource.mediaMessage?.[sourceMtype] || mediaSource.msg?.[sourceMtype] || mediaSource.msg || mediaSource);
                                     
                    if (mediaObj && (mediaObj.url || mediaObj.directPath)) {
                        buffer = await conn.downloadM(mediaObj, dlType || 'image', false);
                    }
                }
            } catch (dlErr) {
            }
            
            if (!buffer || buffer.length === 0) {
                const isQuoted = !!m.quoted;
                throw new Error(
                    isQuoted 
                        ? 'Gagal mendownload media dari pesan yang di-reply. Pastikan gambar masih tersedia.'
                        : 'Gagal mendownload media. Coba kirim gambar langsung.'
                );
            }

            tmpFilePath  = await tmpManager.writeBuffer(buffer, `.${ext}`);
            uploadedFile = await qwen.upload(session.token, tmpFilePath);

            if (!uploadedFile) throw new Error('Gagal mengupload file ke Qwen AI. Coba lagi nanti.');
        }

        // ── PROSES CHAT ────────────────────────────────────────────────────────
        const parentIdToSend = getUserParentId(senderLID);
        let result = await qwen.chat(session.token, session.chatId, prompt, {
            stream         : false,
            model          : currentModel,
            thinkingEnabled,
            searchEnabled,
            parentId       : parentIdToSend,
            ...(uploadedFile && { file: uploadedFile })
        });

        // Jika respons kosong/error, kemungkinan chatId/token kadaluarsa. Coba buat sesi baru & retry sekali.
        if (!result || result.status === 'error' || !result.response) {
            const oldSession = sessions.get(senderLID);
            if (oldSession) oldSession.token = null;
            setUserChatId(senderLID, null);
            setUserParentId(senderLID, null);

            const newSession = await getOrCreateSession(senderLID);
            const newModel   = getUserModel(senderLID);

            result = await qwen.chat(newSession.token, newSession.chatId, prompt, {
                stream         : false,
                model          : newModel,
                thinkingEnabled,
                searchEnabled,
                parentId       : null,
                ...(uploadedFile && { file: uploadedFile })
            });
        }

        if (loadingMsg?.key) {
            conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }

        if (!result || result.status === 'error' || !result.response) {
            throw new Error(result?.message || 'Tidak ada respons dari Qwen AI setelah dicoba ulang.');
        }

        if (result.responseId) {
            setUserParentId(senderLID, result.responseId);
        }

        // ── FORMAT RESPONS ─────────────────────────────────────────────────────
        let responseText = '';

        if (thinkingEnabled && result.thinking) {
            const lines   = result.thinking.split('\n').filter(l => l.trim().length > 10);
            const sliced  = lines.slice(0, 2);
            const preview = sliced.map((l, i) => {
                const line   = l.trim().substring(0, 80);
                const isLast = i === sliced.length - 1;
                return `_${line}${isLast && lines.length > 2 ? '...' : ''}_`;
            }).join('\n');
            responseText += `🧠 *Penalaran (Thinking)*\n${preview}\n\n`;
        }

        if (searchEnabled && result.search_results?.length > 0) {
            responseText += `*Sumber:*\n`;
            result.search_results.slice(0, 3).forEach((r, i) => {
                const title = (r.title || r.url || `Sumber ${i + 1}`).substring(0, 60);
                responseText += `${i + 1}. ${title}\n`;
            });
            responseText += '\n';
        }

        responseText += cleanResponse(result.response || 'Tidak ada respons.');

        await conn.sendMessage(m.chat, { text: responseText }, { quoted: m });

    } catch (error) {
        console.error(`[QWEN ERROR] ${error.message}`);
        if (loadingMsg?.key) {
            conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
        }

        // Reset auth jika token expired atau terdeteksi blokir/anti-bot
        if (/401|unauthorized|token|invalid|captcha|anti-bot|blokir|html/i.test(error.message)) {
            const session = sessions.get(senderLID);
            if (session) session.token = null;
            setUserChatId(senderLID, null);
            setUserParentId(senderLID, null);
        }

        await m.reply(
            `[ Gagal Memproses Permintaan ]\n` +
            `────────────────────────────\n` +
            `Error: ${error.message}\n\n` +
            `Coba lagi atau reset sesi dengan \`${usedPrefix}qwenreset\``
        );

    } finally {
        if (tmpFilePath) {
            try { tmpManager.deleteFile(tmpFilePath); } catch {}
        }
    }
};

handler.help = ['qwen *pertanyaan*'];
handler.tags    = ['ai'];
handler.command = /^(qwen|qwenreset|qwenmodel)$/i;
handler.limit   = false;
handler.requiredFiles = ['function/ai/qwen.js'];

export default handler;