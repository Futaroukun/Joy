/*
  - @Author: Joy / DeepChat Engine
  - @Feature: Multi-Model AI Assistant (DeepChat)
  - @Description: Asisten AI multi-model dengan latensi rendah, model switchable, obrolan bersambung, dan vision multimodal.
*/

import { AVAILABLE_MODELS, DEFAULT_MODEL, chatAI } from '../function/ai/deepchat.js'

// Cache percakapan & model preference per user: userId -> { model, history, lastActive }
const userSessions = new Map()
const SESSION_TIMEOUT = 60 * 60 * 1000 // 1 Jam

// Auto-sweep sesi expired setiap 30 menit
setInterval(() => {
    const now = Date.now()
    for (const [uid, sess] of userSessions.entries()) {
        if (now - sess.lastActive > SESSION_TIMEOUT) {
            userSessions.delete(uid)
        }
    }
}, 30 * 60 * 1000).unref?.()

function getUserSession(userId) {
    const now = Date.now()
    let sess = userSessions.get(userId)
    if (!sess) {
        sess = {
            model: DEFAULT_MODEL,
            history: [],
            lastActive: now
        }
        userSessions.set(userId, sess)
    } else {
        sess.lastActive = now
    }
    return sess
}

const handler = async (m, { conn, text, usedPrefix, command, args }) => {
    const userId = m.sender
    const session = getUserSession(userId)
    const rawInput = (text || '').trim()
    const subCommand = (args[0] || '').toLowerCase()

    // ── 1. Reset Percakapan (.dc reset) ──────────────────────────────────────────
    if (subCommand === 'reset' || rawInput.toLowerCase() === 'reset') {
        session.history = []
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(
            `╭── ✦ *RESET OBROLAN* ✦\n` +
            `• Riwayat percakapan DeepChat berhasil dikosongkan.\n` +
            `• Model aktif: *${session.model.name}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 2. Cek / Ubah Model (.dc model [nomor/nama]) ─────────────────────────────
    if (subCommand === 'model' || subCommand === 'models') {
        const target = args.slice(1).join(' ').trim().toLowerCase()

        // Jika hanya ketik `.dc model` tanpa argumen: Tampilkan menu model
        if (!target) {
            const listText = AVAILABLE_MODELS.map(m => {
                const isSelected = m.modelId === session.model.modelId ? ' *(Aktif)*' : ''
                return `• *${m.id}.* ${m.name} [${m.latency}]${isSelected}\n  › Alias: \`${m.alias}\``
            }).join('\n')

            return m.reply(
                `╭── ✦ *DAFTAR MODEL DEEPCHAT* ✦\n` +
                `• Model saat ini: *${session.model.name}* [${session.model.latency}]\n\n` +
                `${listText}\n\n` +
                `› *Cara ubah:* Ketik \`${usedPrefix + command} model <nomor/alias>\`\n` +
                `› *Contoh:* \`${usedPrefix + command} model 2\` atau \`${usedPrefix + command} model deepseek-v3\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        // Cari model berdasarkan ID (nomor), alias, atau sebagian nama
        const found = AVAILABLE_MODELS.find(m =>
            m.id === target ||
            m.alias.toLowerCase() === target ||
            m.modelId.toLowerCase() === target ||
            m.name.toLowerCase().includes(target)
        )

        if (!found) {
            return m.reply(
                `╭── ✦ *MODEL TIDAK DITEMUKAN* ✦\n` +
                `• Pilihan "${target}" tidak valid.\n` +
                `• Ketik \`${usedPrefix + command} model\` untuk melihat daftar nomor & alias yang tersedia.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        session.model = found
        session.history = [] // Reset riwayat obrolan saat ganti arsitektur model
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(
            `╭── ✦ *MODEL DIPERBARUI* ✦\n` +
            `• Model aktif: *${found.name}*\n` +
            `• Provider: *${found.providerId}*\n` +
            `• Estimasi Latensi: *${found.latency}*\n` +
            `• Riwayat sesi baru telah dimulai.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 3. Ambil Pesan & Media Gambar (Jika ada) ─────────────────────────────────
    const q = m.quoted ? m.quoted : m
    const mime = (q.msg || q).mimetype || q.mediaType || ''
    const isImage = /image/.test(mime)

    let query = rawInput
    if (!query && m.quoted?.text) {
        query = m.quoted.text.trim()
    }

    if (!query && !isImage) {
        return m.reply(
            `╭── ✦ *PANDUAN DEEPCHAT AI* ✦\n` +
            `• Model Aktif: *${session.model.name}* [${session.model.latency}]\n\n` +
            `• *Tanya AI:* \`${usedPrefix + command} <pertanyaan>\`\n` +
            `• *Analisis Gambar:* Kirim/reply gambar dengan caption \`${usedPrefix + command} <pertanyaan>\`\n` +
            `• *Ganti Model:* \`${usedPrefix + command} model\`\n` +
            `• *Reset Sesi:* \`${usedPrefix + command} reset\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (!query && isImage) {
        query = 'Deskripsikan gambar ini secara detail.'
    }

    let imageBuffer = null
    let imageMime = 'image/jpeg'

    if (isImage) {
        try {
            imageBuffer = await q.download()
            imageMime = mime || 'image/jpeg'
        } catch (e) {
            console.error('[DeepChat Media Download Error]', e)
        }
    }

    await conn.sendPresenceUpdate('composing', m.chat)
    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const currentModel = session.model
        const res = await chatAI(query, {
            providerId: currentModel.providerId,
            modelId: currentModel.modelId,
            conversationHistory: session.history.slice(-8), // Ambil 8 percakapan terakhir
            imageBuffer,
            imageMime,
            systemPrompt: 'Kamu adalah asisten AI cerdas di WhatsApp. Berikan jawaban yang informatif, akurat, terstruktur, dan gunakan bahasa yang mudah dimengerti.'
        })

        if (!res || !res.reply) {
            throw new Error('AI tidak memberikan respon.')
        }

        // Simpan ke riwayat obrolan (hanya teks)
        session.history.push({ role: 'user', content: query })
        session.history.push({ role: 'assistant', content: res.reply })

        // Batasi panjang histori memori (maksimal 12 pesan terakhir per user)
        if (session.history.length > 12) {
            session.history = session.history.slice(-12)
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(res.reply)

    } catch (err) {
        console.error('[DeepChat Error]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        return m.reply(
            `╭── ✦ *GAGAL MEMPROSES* ✦\n` +
            `• *Model:* ${session.model.name}\n` +
            `• *Error:* ${err.message || 'Terjadi gangguan koneksi.'}\n` +
            `• Ganti ke model cepat lain: \`${usedPrefix + command} model 1\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }
}

handler.help = ['deepchat *teks*', 'dc *teks*']
handler.tags = ['ai']
handler.command = /^(deepchat|dc)$/i
handler.limit = false

export default handler
