import { proto } from '@whiskeysockets/baileys'
import {
    randomBytes,
    createCipheriv,
    createHmac,
    createHash,
    hkdfSync
} from 'node:crypto'
import { writeFile, unlink, readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeExifImg, writeExifVid, writeExif } from '../function/media/exif.js'

const HKDF_INFO = {
    audio: 'WhatsApp Audio Keys',
    sticker: 'WhatsApp Image Keys'
}
const RAW = Symbol('rawFields')

let relayQueue = Promise.resolve()

const varint = (n) => {
    const out = []
    while (n > 127) {
        out.push((n % 128) | 128)
        n = Math.floor(n / 128)
    }
    out.push(n)
    return Buffer.from(out)
}

const ld = (field, body) =>
    Buffer.concat([varint(field * 8 + 2), varint(body.length), body])

const toBuf = async (src) => {
    if (Buffer.isBuffer(src)) return src
    if (/^https?:\/\//i.test(src)) {
        const res = await fetch(src)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return Buffer.from(await res.arrayBuffer())
    }
    return readFile(src)
}

const runFFmpeg = (args, input) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    const out = []
    let err = ''

    proc.stdout.on('data', (d) => out.push(d))
    proc.stderr.on('data', (d) => { err += d })
    proc.on('error', reject)
    proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(err.slice(-500) || `FFmpeg exited with code ${code}`))
        resolve(Buffer.concat(out))
    })

    proc.stdin.on('error', () => {})
    proc.stdin.end(input)
})

const toOpus = async (input) => {
    const buf = await runFFmpeg([
        '-v', 'error',
        '-i', 'pipe:0',
        '-vn',
        '-map_metadata', '-1',
        '-c:a', 'libopus',
        '-b:a', '64k',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
        'pipe:1'
    ], input)

    return {
        buf,
        mimetype: 'audio/ogg; codecs=opus'
    }
}

const parseWebp = (b) => {
    if (
        b.length < 30 ||
        b.toString('ascii', 0, 4) !== 'RIFF' ||
        b.toString('ascii', 8, 12) !== 'WEBP'
    ) throw new Error('Invalid WebP')

    const chunk = b.toString('ascii', 12, 16)

    if (chunk === 'VP8 ') {
        return {
            width: b.readUInt16LE(26) & 0x3fff,
            height: b.readUInt16LE(28) & 0x3fff,
            isAnimated: false
        }
    }

    if (chunk === 'VP8L') {
        return {
            width: 1 + (b[21] | ((b[22] & 0x3f) << 8)),
            height: 1 + ((b[22] >> 6) | (b[23] << 2) | ((b[24] & 0x0f) << 10)),
            isAnimated: false
        }
    }

    if (chunk === 'VP8X') {
        return {
            width: 1 + b.readUIntLE(24, 3),
            height: 1 + b.readUIntLE(27, 3),
            isAnimated: (b[20] & 2) !== 0
        }
    }

    throw new Error('Unsupported WebP chunk')
}

const uploadEncrypted = async (conn, plain, kind) => {
    const mediaKey = randomBytes(32)
    const k = Buffer.from(
        hkdfSync('sha256', mediaKey, Buffer.alloc(32), HKDF_INFO[kind], 112)
    )

    const iv = k.subarray(0, 16)
    const cipher = createCipheriv('aes-256-cbc', k.subarray(16, 48), iv)
    const enc = Buffer.concat([cipher.update(plain), cipher.final()])

    const mac = createHmac('sha256', k.subarray(48, 80))
        .update(iv)
        .update(enc)
        .digest()
        .subarray(0, 10)

    const file = Buffer.concat([enc, mac])
    const fileEncSha256 = createHash('sha256').update(file).digest()
    const tmp = join(tmpdir(), `as-${kind}-${randomBytes(8).toString('hex')}.enc`)

    await writeFile(tmp, file)

    try {
        const res = await conn.waUploadToServer(tmp, {
            fileEncSha256B64: fileEncSha256.toString('base64'),
            mediaType: kind
        })

        if (!res?.directPath) {
            throw new Error(`${kind} upload returned no directPath`)
        }

        return {
            url: res.mediaUrl || `https://mmg.whatsapp.net${res.directPath}`,
            directPath: res.directPath,
            mediaKey,
            fileEncSha256,
            fileSha256: createHash('sha256').update(plain).digest(),
            fileLength: plain.length,
            mediaKeyTimestamp: Math.floor(Date.now() / 1000)
        }
    } finally {
        unlink(tmp).catch(() => {})
    }
}

const relayRawPayload = (conn, jid, payload) => {
    const task = relayQueue.then(async () => {
        const originalEncode = proto.Message.encode
        proto.Message.encode = function (msg, w) {
            const out = originalEncode.call(this, msg?.[RAW]
                ? { ...msg, stickerMessage: undefined }
                : msg, w)
            if (msg && msg[RAW]) {
                for (const [f, body] of msg[RAW]) {
                    out.uint32(f * 8 + 2).bytes(body)
                }
            }
            return out
        }
        try {
            return await conn.relayMessage(jid, payload, {})
        } finally {
            proto.Message.encode = originalEncode
        }
    })
    relayQueue = task.catch(() => {})
    return task
}

const mediaType = (m) => {
    const mime = (m?.msg || m)?.mimetype || ''
    if (m?.mtype === 'audioMessage' || /^audio\//i.test(mime)) return 'audio'
    if (m?.mtype === 'stickerMessage' || /webp/i.test(mime)) return 'sticker'
    if (m?.mtype === 'imageMessage' || /^image\//i.test(mime)) return 'image'
    if (m?.mtype === 'videoMessage' || /^video\//i.test(mime)) return 'video'
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const sessions = conn.audioStickerSessions ||= new Map()
    const key = `${m.chat}:${m.sender}`
    const now = Date.now()
    for (const [id, session] of sessions) {
        if (session.expires <= now) sessions.delete(id)
    }
    const session = sessions.get(key) || { expires: now + 180000 }
    try {
        for (const media of [m.quoted, m]) {
            const type = mediaType(media)
            if (!type) continue
            const buf = await media.download()
            if (!buf?.length) throw new Error('Media kosong atau gagal diunduh.')
            if (type === 'audio') session.audio = Buffer.from(buf)
            else session.visual = { type, buf: Buffer.from(buf) }
        }
        if (!session.visual && /^https?:\/\/\S+$/i.test(text?.trim() || '')) {
            session.visual = { type: 'image', buf: await toBuf(text.trim()) }
        }
    } catch (error) {
        return m.reply(`Gagal mengambil media: ${error.message}`)
    }
    if (!session.audio || !session.visual) {
        if (session.audio || session.visual) {
            sessions.set(key, session)
            return m.reply(session.visual
                ? 'Foto/video disimpan. Kirim audio/VN dalam 3 menit. Ketik batal untuk membatalkan.'
                : 'Audio disimpan. Kirim foto/video/stiker dalam 3 menit. Ketik batal untuk membatalkan.')
        }
        return m.reply(`Reply foto/video/stiker atau audio dengan ${usedPrefix + command}, lalu kirim media pasangannya.`)
    }
    sessions.delete(key)

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const audioInput = session.audio
        const opus = audioInput.subarray(0, 4).toString('ascii') === 'OggS'
            ? { buf: audioInput, mimetype: 'audio/ogg; codecs=opus' }
            : await toOpus(audioInput)

        const exifMeta = {
            packname: global.info?.namabot || 'Joy Bot',
            author: global.info?.namaowner || 'Rafli'
        }

        const { type, buf } = session.visual
        const stickerBuf = type === 'sticker'
            ? await writeExif(buf, exifMeta)
            : type === 'video'
                ? await writeExifVid(buf, exifMeta)
                : await writeExifImg(buf, exifMeta)

        const webp = parseWebp(stickerBuf)
        const [a, s] = await Promise.all([
            uploadEncrypted(conn, opus.buf, 'audio'),
            uploadEncrypted(conn, stickerBuf, 'sticker')
        ])

        const audioBytes = Buffer.concat([
            Buffer.from(proto.Message.AudioMessage.encode(
                proto.Message.AudioMessage.create({
                    url: a.url,
                    mimetype: opus.mimetype,
                    fileSha256: a.fileSha256,
                    fileEncSha256: a.fileEncSha256,
                    fileLength: a.fileLength,
                    mediaKey: a.mediaKey,
                    directPath: a.directPath,
                    mediaKeyTimestamp: a.mediaKeyTimestamp
                })
            ).finish())
        ])

        const stickerBase = Buffer.concat([
            Buffer.from(proto.Message.StickerMessage.encode(
                proto.Message.StickerMessage.create({
                    url: s.url,
                    fileSha256: s.fileSha256,
                    fileEncSha256: s.fileEncSha256,
                    mediaKey: s.mediaKey,
                    mimetype: 'image/webp',
                    height: webp.height,
                    width: webp.width,
                    directPath: s.directPath,
                    fileLength: s.fileLength,
                    mediaKeyTimestamp: s.mediaKeyTimestamp,
                    isAnimated: webp.isAnimated,
                    stickerSentTs: Date.now()
                })
            ).finish())
        ])

        const stickerBytes = Buffer.concat([stickerBase, ld(26, audioBytes)])
        const payload = proto.Message.create({
            stickerMessage: proto.Message.StickerMessage.decode(stickerBase),
            messageContextInfo: {
                messageSecret: randomBytes(32)
            }
        })
        // Keep the sticker visible to relayMessage; append audio unsupported by older schemas.
        payload[RAW] = [[26, stickerBytes]]

        await relayRawPayload(conn, m.chat, payload)
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (error) {
        console.error('[AUDIOSTICKER]', error)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal membuat audio stiker.*\n\n${error.message}`)
    }
}

handler.before = async (m, { conn, usedPrefix, command }) => {
    const key = `${m.chat}:${m.sender}`
    const sessions = conn.audioStickerSessions
    const session = sessions?.get(key)
    if (!session) return
    if (session.expires <= Date.now()) {
        sessions.delete(key)
        return
    }
    if (/^(?:[.!/#]\s*)?batal$/i.test(m.text?.trim() || '')) {
        sessions.delete(key)
        await m.reply('Sesi audio stiker dibatalkan.')
        return
    }
    if (/^(audiosticker|saudio|stikeraudio|stickeraudio)$/i.test(command || '')) return
    if (!mediaType(m) || m.fromMe) return
    await handler(m, { conn, text: '', usedPrefix: usedPrefix || '.', command: 'saudio' })
}

handler.help = ['audiosticker *(reply audio)*']
handler.tags = ['sticker']
handler.command = /^(audiosticker|saudio|stikeraudio|stickeraudio)$/i

export default handler
