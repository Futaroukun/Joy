import { AVAILABLE_MODELS, DEFAULT_MODEL, chatAI } from '../function/ai/deepchat.js'

const userSessions = new Map()
const SESSION_TIMEOUT = 60 * 60 * 1000

if (global._deepchatInterval) clearInterval(global._deepchatInterval)
global._deepchatInterval = setInterval(() => {
    const now = Date.now()
    for (const [uid, sess] of userSessions.entries()) {
        if (now - sess.lastActive > SESSION_TIMEOUT) {
            userSessions.delete(uid)
        }
    }
}, 30 * 60 * 1000)
global._deepchatInterval.unref?.()

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

    if (subCommand === 'reset' || rawInput.toLowerCase() === 'reset') {
        session.history = []
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        return m.reply(
            `╭── ✦ *RESET OBROLAN* ✦\n` +
            `• Riwayat obrolan berhasil dibersihkan.\n` +
            `• Model aktif: *${session.model.name}*\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (subCommand === 'model' || subCommand === 'models') {
        const target = args.slice(1).join(' ').trim().toLowerCase()

        if (!target) {
            const listText = AVAILABLE_MODELS.map(m => {
                const isSelected = m.modelId === session.model.modelId ? ' *(Aktif)*' : ''
                return `• *${m.id}.* ${m.name} [${m.latency}]${isSelected}\n  › Alias: \`${m.alias}\``
            }).join('\n')

            return m.reply(
                `╭── ✦ *DAFTAR MODEL DEEPCHAT* ✦\n` +
                `• Model aktif saat ini: *${session.model.name}* [${session.model.latency}]\n\n` +
                `${listText}\n\n` +
                `› *Cara ubah:* \`${usedPrefix + command} model <nomor/alias>\`\n` +
                `› *Contoh:* \`${usedPrefix + command} model 2\` atau \`${usedPrefix + command} model deepseek-v3\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        const found = AVAILABLE_MODELS.find(m =>
            m.id === target ||
            m.alias.toLowerCase() === target ||
            m.modelId.toLowerCase() === target ||
            m.name.toLowerCase().includes(target)
        )

        if (!found) {
            return m.reply(
                `╭── ✦ *MODEL TIDAK DITEMUKAN* ✦\n` +
                `• Pilihan "${target}" tidak terdaftar.\n` +
                `• Ketik \`${usedPrefix + command} model\` untuk melihat nomor dan alias yang valid.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        session.model = found
        session.history = []
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
            `• *Tanya AI:*\n` +
            `  › \`${usedPrefix + command} <pertanyaan>\`\n\n` +
            `• *Analisis Gambar:*\n` +
            `  › Kirim/reply gambar dengan caption \`${usedPrefix + command} <pertanyaan>\`\n\n` +
            `• *Ganti Model:*\n` +
            `  › \`${usedPrefix + command} model <nomor/alias>\`\n\n` +
            `• *Reset Percakapan:*\n` +
            `  › \`${usedPrefix + command} reset\`\n` +
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
            conversationHistory: session.history.slice(-8),
            imageBuffer,
            imageMime,
            systemPrompt: 'Kamu adalah asisten AI cerdas di WhatsApp. Berikan jawaban yang informatif, akurat, ringkas, dan langsung pada inti tanpa pengantar basa-basi.'
        })

        if (!res || !res.reply) {
            throw new Error('AI tidak memberikan respon.')
        }

        session.history.push({ role: 'user', content: query })
        session.history.push({ role: 'assistant', content: res.reply })

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
            `• Model: *${session.model.name}*\n` +
            `• Error: ${err.message || 'Terjadi kesalahan sistem.'}\n` +
            `• Solusi: Coba lagi atau ganti model lain dengan \`${usedPrefix + command} model 1\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }
}

handler.help = ['deepchat *teks*', 'dc *teks*']
handler.tags = ['ai']
handler.command = /^(deepchat|dc)$/i
handler.limit = false

export default handler
