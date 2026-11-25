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
import { fileURLToPath } from 'node:url'
import { writeExifImg, writeExif } from '../function/media/exif.js'

const DEFAULT_STICKER = fileURLToPath(new URL('../src/thumbnail.jpg', import.meta.url))
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

const mediaDomainInfo = (key) =>
    ld(74, Buffer.concat([
        Buffer.from([0x08, 0x01]),
        ld(2, key)
    ]))

const relayRawPayload = (conn, jid, payload) => {
    const task = relayQueue.then(async () => {
        const originalEncode = proto.Message.encode
        proto.Message.encode = function (msg, w) {
            const out = originalEncode.call(this, msg, w)
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

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const q = m.quoted
    const qMime = (q?.msg || q)?.mimetype || ''
    const isAudio = q && (q.mtype === 'audioMessage' || /^audio\//i.test(qMime))

    if (!isAudio) {
        return m.reply(
            `*AUDIO STICKER*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `Buat stiker WhatsApp yang memutar audio.\n\n` +
            `*Cara Pakai:*\n` +
            `› Reply pesan audio/VN lalu ketik \`${usedPrefix + command}\`\n` +
            `› Opsional: sertakan URL gambar \`${usedPrefix + command} <url_gambar>\`\n` +
            `› Atau kirim gambar/stiker dengan caption \`${usedPrefix + command}\` sambil reply audio\n` +
            `━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } })

    try {
        const rawAudio = await q.download()
        if (!rawAudio) throw new Error('Gagal mengunduh audio yang di-reply.')

        const audioInput = Buffer.from(rawAudio)
        const opus = audioInput.subarray(0, 4).toString('ascii') === 'OggS'
            ? { buf: audioInput, mimetype: 'audio/ogg; codecs=opus' }
            : await toOpus(audioInput)

        const exifMeta = {
            packname: global.info?.namabot || 'Joy Bot',
            author: global.info?.namaowner || 'Rafli'
        }

        let stickerBuf
        const msgMime = (m.msg || m)?.mimetype || ''
        if (m.mtype === 'stickerMessage' || /webp/.test(msgMime)) {
            const rawSticker = await m.download()
            stickerBuf = await writeExif(rawSticker, exifMeta)
        } else if (m.mtype === 'imageMessage' || /^image\//i.test(msgMime)) {
            const rawImg = await m.download()
            stickerBuf = await writeExifImg(rawImg, exifMeta)
        } else {
            const imgUrl = /^https?:\/\/\S+/i.test(text?.trim() || '') ? text.trim() : null
            const srcBuf = await toBuf(imgUrl || DEFAULT_STICKER)
            stickerBuf = await writeExifImg(srcBuf, exifMeta)
        }

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
            ).finish()),
            ld(17, mediaDomainInfo(a.mediaKey))
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
            ).finish()),
            ld(17, Buffer.concat([
                mediaDomainInfo(s.mediaKey),
                ld(82, varint(13001))
            ]))
        ])

        const futureProofBody = ld(
            1,
            ld(26, Buffer.concat([
                stickerBase,
                ld(26, audioBytes)
            ]))
        )

        const payload = proto.Message.create({
            messageContextInfo: {
                messageSecret: randomBytes(32)
            }
        })
        payload[RAW] = [[134, futureProofBody]]

        await relayRawPayload(conn, m.chat, payload)
        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
    } catch (error) {
        console.error('[AUDIOSTICKER]', error)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal membuat audio stiker.*\n\n${error.message}`)
    }
}

handler.help = ['audiosticker *(reply audio)*']
handler.tags = ['sticker']
handler.command = /^(audiosticker|saudio|stikeraudio|stickeraudio)$/i

export default handler
