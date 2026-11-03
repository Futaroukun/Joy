/*
  - @Author: Joy / Rafli
  - @Feature: DeepSeek AI (Official Keccak PoW & Auto-Relogin)
  - @Description: Asisten AI DeepSeek dengan percakapan bersambung, penalaran mendalam (DeepThink / Reasoner), pencarian web, dan auto-relogin.
*/

import defaultClient, { DeepSeek } from '../function/ai/deepseek.js'

// Cache session per pengguna: userId -> { session, lastActive }
const userSessions = new Map()
const SESSION_TIMEOUT = 60 * 60 * 1000 // 1 Jam

setInterval(() => {
    const now = Date.now()
    for (const [uid, sess] of userSessions.entries()) {
        if (now - sess.lastActive > SESSION_TIMEOUT) {
            userSessions.delete(uid)
        }
    }
}, 30 * 60 * 1000).unref?.()

async function getSession(userId) {
    const now = Date.now()
    let cached = userSessions.get(userId)

    if (cached && (now - cached.lastActive) < SESSION_TIMEOUT) {
        cached.lastActive = now
        return cached.session
    }

    const session = await defaultClient.create()
    userSessions.set(userId, { session, lastActive: now })
    return session
}

const handler = async (m, { conn, text, usedPrefix, command, args }) => {
    const userId = m.sender
    const cmd = command.toLowerCase()

    // ── Reset Sesi Percakapan ──────────────────────────────────────────────────
    if (cmd === 'deepseekreset' || cmd === 'dsreset' || text?.toLowerCase().trim() === 'reset') {
        userSessions.delete(userId)
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(
            `╭── ✦ *SESI DIRESET* ✦\n` +
            `• Sesi percakapan DeepSeek berhasil dihapus.\n` +
            `• Kirim pesan baru untuk memulai topik baru.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── Panduan Penggunaan / Help ──────────────────────────────────────────────
    if (!text && !m.quoted?.text) {
        return m.reply(
            `╭── ✦ *DEEPSEEK AI* ✦\n` +
            `Asisten AI DeepSeek dengan penalaran mendalam (DeepThink R1), percakapan kontekstual, dan pencarian web.\n\n` +
            `*Cara Penggunaan:*\n` +
            `• \`${usedPrefix + command} <pertanyaan>\`\n` +
            `  › Chat standar bersambung.\n\n` +
            `• \`${usedPrefix + command} -think <pertanyaan>\` (atau \`-r\`)\n` +
            `  › Mengaktifkan penalaran mendalam (DeepThink).\n\n` +
            `• \`${usedPrefix + command} -s <pertanyaan>\` (atau \`-search\`)\n` +
            `  › Mengaktifkan pencarian web real-time.\n\n` +
            `• \`${usedPrefix + command} reset\`\n` +
            `  › Menghapus memori sesi percakapan.\n\n` +
            `*Contoh Perintah:*\n` +
            `• \`${usedPrefix + command} buatkan kode sorting di rust\`\n` +
            `• \`${usedPrefix + command} -think buktikan rumus luas lingkaran\`\n` +
            `• \`${usedPrefix + command} -s berita terkini teknologi AI\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    let query = text ? text.trim() : (m.quoted?.text || '').trim()
    let thinking_enabled = false
    let search_enabled = false

    // Deteksi bendera pemikiran mendalam (-think atau -r)
    if (/^-(think|r)\s+/i.test(query)) {
        thinking_enabled = true
        query = query.replace(/^-(think|r)\s+/i, '').trim()
    }

    // Deteksi bendera pencarian web (-s atau -search)
    if (/^-(s|search)\s+/i.test(query)) {
        search_enabled = true
        query = query.replace(/^-(s|search)\s+/i, '').trim()
    }

    if (!query) {
        return m.reply(`Masukkan pertanyaan setelah perintah.\n\n*Contoh:* \`${usedPrefix + command} jelaskan mekanika kuantum\``)
    }

    await conn.sendPresenceUpdate('composing', m.chat)
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const session = await getSession(userId)
        const res = await session.chat({
            prompt: query,
            thinking_enabled,
            search_enabled
        })

        if (!res || (!res.message && !res.thoughts)) {
            throw new Error('DeepSeek tidak mengembalikan respon.')
        }

        let out = ''
        if (res.thoughts) {
            out += `╭── ✦ *THINKING PROCESS* ✦\n${res.thoughts.trim()}\n╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        out += res.message || '(Tidak ada respon teks)'

        // Tambahkan referensi pencarian jika ada
        if (res.search_results && res.search_results.length > 0) {
            const sources = res.search_results.slice(0, 5).map((s, idx) => {
                return `• *${idx + 1}.* ${s.title || s.url}\n  › ${s.url}`
            }).join('\n')
            out += `\n\n╭── ✦ *SUMBER REFERENSI* ✦\n${sources}\n╰━━━━━━━━━━━━━━━━━━━━━━━`
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(out)

    } catch (err) {
        console.error('[DeepSeek Plugin Error]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(
            `╭── ✦ *GAGAL MEMPROSES* ✦\n` +
            `• *Error:* ${err.message || 'Terjadi kesalahan sistem.'}\n` +
            `• Ketik \`${usedPrefix + command} reset\` jika ingin memulai ulang sesi.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }
}

handler.help = ['deepseek *teks*', 'deepseek -think *teks*']
handler.tags    = ['ai']
handler.command = /^(deepseek|ds|deepseekreset|dsreset)$/i
handler.limit   = false

export default handler
