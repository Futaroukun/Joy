/*
  - @Author: ZennzXD & Rafli
  - @Feature: ChatGPT AI Web (Conduit Engine)
  - @Description: Asisten AI ChatGPT dengan percakapan bersambung, pencarian web (Search Grounding), dan format WhatsApp.
*/

import { ChatGPTClient, formatWA } from '../function/ai/chatgpt.js'

// Cache session instance per user: userId -> { client, lastActive }
const userSessions = new Map()
const SESSION_TIMEOUT = 60 * 60 * 1000 // 1 Jam masa aktif sesi

// Auto-sweep sesi kedaluwarsa setiap 30 menit (hemat RAM)
setInterval(() => {
    const now = Date.now()
    for (const [uid, sess] of userSessions.entries()) {
        if (now - sess.lastActive > SESSION_TIMEOUT) {
            userSessions.delete(uid)
        }
    }
}, 30 * 60 * 1000).unref?.()

function getClient(userId) {
    const now = Date.now()
    let session = userSessions.get(userId)

    if (session && (now - session.lastActive) < SESSION_TIMEOUT) {
        session.lastActive = now
        return session.client
    }

    const client = new ChatGPTClient({
        systemPrompt: 'Kamu adalah asisten AI pintar di WhatsApp. Berikan jawaban yang akurat, informatif, dan ringkas.'
    })
    userSessions.set(userId, { client, lastActive: now })
    return client
}

const handler = async (m, { conn, text, usedPrefix, command, args }) => {
    const userId = m.sender
    const cmd = command.toLowerCase()

    // ── Reset Percakapan ────────────────────────────────────────────────────────
    if (cmd === 'chatgptreset' || cmd === 'gptreset' || text?.toLowerCase().trim() === 'reset') {
        const session = userSessions.get(userId)
        if (session) {
            session.client.newChat()
            userSessions.delete(userId)
        }
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(
            `╭── ✦ *SESI DIRESET* ✦\n` +
            `• Sesi percakapan ChatGPT berhasil dihapus.\n` +
            `• Kirim pesan baru untuk memulai percakapan baru.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── Menu Bantuan / Help ─────────────────────────────────────────────────────
    if (!text && !m.quoted?.text) {
        return m.reply(
            `╭── ✦ *CHATGPT AI ASSISTANT* ✦\n` +
            `Asisten AI ChatGPT dengan model GPT-5 / GPT-4o, percakapan kontekstual, dan pencarian web real-time.\n\n` +
            `*Cara Penggunaan:*\n` +
            `• \`${usedPrefix + command} <pertanyaan>\`\n` +
            `  › Chat biasa & percakapan bersambung.\n\n` +
            `• \`${usedPrefix + command} -s <topik pencarian>\`\n` +
            `  › Pencarian web real-time beserta link sumber.\n\n` +
            `• \`${usedPrefix + command} reset\`\n` +
            `  › Reset memori / sesi percakapan.\n\n` +
            `*Contoh Perintah:*\n` +
            `• \`${usedPrefix + command} jelaskan perbedaan Node.js dan Python\`\n` +
            `• \`${usedPrefix + command} -s berita teknologi hari ini\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    let query = text ? text.trim() : (m.quoted?.text || '').trim()
    let webSearch = false

    // Deteksi bendera pencarian web (-s atau -search) atau kata kunci real-time otomatis
    if (/^-(s|search)\s+/i.test(query)) {
        webSearch = true
        query = query.replace(/^-(s|search)\s+/i, '').trim()
    } else if (/(\b(hari ini|kemarin|terbaru|sekarang|saat ini|berita|skor|pertandingan|cuaca|gempa|harga|jadwal|pemilu|presiden)\b|\b202[5-9]\b)/i.test(query)) {
        webSearch = true
    }

    if (!query) {
        return m.reply(`Masukkan pertanyaan setelah perintah.\n\n*Contoh:* \`${usedPrefix + command} siapa penemu listrik?\``)
    }

    await conn.sendPresenceUpdate('composing', m.chat)
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const client = getClient(userId)
        const res = await client.ask(query, { webSearch })

        if (!res || !res.text) {
            throw new Error('ChatGPT tidak memberikan respon.')
        }

        let responseText = res.text

        // Tambahkan daftar link sumber jika ada dari web search
        if (res.sources && res.sources.length > 0) {
            const sourceList = res.sources.slice(0, 5).map((s, i) => {
                const title = s.title ? s.title.replace(/\s+/g, ' ').trim() : s.domain
                return `• *${i + 1}.* ${title}\n  › ${s.url}`
            }).join('\n')

            responseText += `\n\n╭── ✦ *SUMBER REFERENSI* ✦\n${sourceList}\n╰━━━━━━━━━━━━━━━━━━━━━━━`
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(responseText)

    } catch (err) {
        console.error('[ChatGPT Error]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(
            `╭── ✦ *GAGAL MEMPROSES* ✦\n` +
            `• *Error:* ${err.message || 'Terjadi kesalahan sistem.'}\n` +
            `• Silakan coba lagi atau ketik \`${usedPrefix + command} reset\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }
}

handler.help = ['chatgpt *teks*']
handler.tags    = ['ai']
handler.command = /^(chatgpt|gpt|gptreset)$/i
handler.limit   = false

export default handler
