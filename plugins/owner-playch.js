import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { spawn, spawnSync } from 'child_process'
import axios from 'axios'
import yts from 'yt-search'
import ytmusic from '../function/scrapers/ytmusic.js'
import { toPTT } from '../function/media/converter.js'
import { getAudioWaveform } from '@whiskeysockets/baileys'

global.newsletterCache = global.newsletterCache || {}

async function getNewsletterJid(conn, target) {
    if (target.endsWith('@newsletter')) return target
    const match = target.match(/(?:https?:\/\/)?(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9]+)/i)
    const code = match ? match[1] : target
    
    if (global.newsletterCache[code]) return global.newsletterCache[code]
    
    const res = await conn.newsletterMetadata('invite', code)
    if (res?.id) {
        global.newsletterCache[code] = res.id
        return res.id
    }
    throw new Error('Channel tidak ditemukan atau tidak dapat diakses.')
}

// ── SaveTube scraper ──────────────────────────────────────────────────────────

class SaveTube {
    constructor() {
        this.ky = 'C5D58EF67A7584E4A29F6C35BBC4EB12'
        this.re = /(?:youtu\.be\/|(?:www\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i
        this.ax = axios.create({
            headers: {
                'content-type': 'application/json',
                'origin'      : 'https://yt.savetube.me',
                'user-agent'  : 'Mozilla/5.0 (Android 15; Mobile; SM-F958; rv:130.0) Gecko/130.0 Firefox/130.0'
            },
            timeout: 15000
        })
    }

    async decrypt(enc) {
        if (!enc) throw new Error('Data enkripsi SaveTube kosong.')
        const sr  = Buffer.from(enc, 'base64')
        const ky  = Buffer.from(this.ky, 'hex')
        const iv  = sr.slice(0, 16)
        const dc  = crypto.createDecipheriv('aes-128-cbc', ky, iv)
        const res = Buffer.concat([dc.update(sr.slice(16)), dc.final()])
        return JSON.parse(res.toString())
    }

    async getCdn() {
        try {
            const res = await this.ax.get('https://media.savetube.vip/api/random-cdn')
            if (res.data?.cdn) return res.data.cdn
        } catch (_) {}
        return 'cdn403.savetube.vip'
    }

    async download(url) {
        const match = url.match(this.re)
        const id = match ? match[1] : null
        if (!id) throw new Error('ID YouTube tidak ditemukan.')

        const cdn = await this.getCdn()
        const infoRes = await this.ax.post(`https://${cdn}/v2/info`, {
            url: `https://www.youtube.com/watch?v=${id}`
        })

        if (!infoRes.data?.data) {
            throw new Error(infoRes.data?.message || 'Gagal memproses info video dari SaveTube.')
        }

        const dec = await this.decrypt(infoRes.data.data)
        const dlRes = await this.ax.post(`https://${cdn}/download`, {
            id,
            downloadType: 'audio',
            quality     : '128',
            key         : dec.key
        })

        const downloadUrl = dlRes.data?.data?.downloadUrl
        if (!downloadUrl) throw new Error('Download URL SaveTube tidak ditemukan.')

        const audioRes = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 45000,
            headers: {
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        })

        const buffer = Buffer.from(audioRes.data)
        if (
            buffer.length < 20000 ||
            buffer.slice(0, 50).toString().includes('<html') ||
            buffer.slice(0, 50).toString().includes('<!DOCTYPE')
        ) {
            throw new Error('Hasil buffer SaveTube bukan file audio valid.')
        }

        return {
            title    : dec.title || 'Unknown',
            thumbnail: dec.thumbnail || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
            duration : dec.durationLabel || '',
            buffer
        }
    }
}

// ── yt-dlp local fallback ─────────────────────────────────────────────────────

let _ytDlpPath = undefined
function getYtDlpPath() {
    if (_ytDlpPath !== undefined) return _ytDlpPath
    const candidates = [
        'yt-dlp',
        path.join(process.cwd(), 'yt-dlp'),
        path.join(process.cwd(), 'bin', 'yt-dlp'),
        path.join(process.cwd(), 'node_modules', '.bin', 'yt-dlp')
    ]
    for (const bin of candidates) {
        try {
            const res = spawnSync(bin, ['--version'], { stdio: 'ignore', timeout: 2000 })
            if (!res.error && res.status === 0) {
                _ytDlpPath = bin
                return _ytDlpPath
            }
        } catch (_) {}
    }
    _ytDlpPath = null
    return null
}

function isYtDlpAvailable() {
    return !!getYtDlpPath()
}

function downloadViaYtDlp(url) {
    const bin = getYtDlpPath()
    if (!bin) {
        return Promise.reject(new Error('yt-dlp binary tidak ditemukan di server.'))
    }
    return new Promise((resolve, reject) => {
        const tmpDir = path.join(process.cwd(), 'tmp')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
        const tmpFile = path.join(tmpDir, `playch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)

        const proc = spawn(bin, [
            '-f', 'ba/b',
            '-x',
            '--audio-format', 'mp3',
            '--no-playlist',
            '--no-warnings',
            '-q',
            '-o', `${tmpFile}.%(ext)s`,
            url
        ], { stdio: 'ignore' })

        const timer = setTimeout(() => {
            try { proc.kill('SIGKILL'); } catch (_) {}
            reject(new Error('yt-dlp proses timeout (melebihi 60 detik).'))
        }, 60000)

        proc.on('close', code => {
            clearTimeout(timer)
            const finalPath = `${tmpFile}.mp3`
            if (code === 0 && fs.existsSync(finalPath)) {
                try {
                    const buf = fs.readFileSync(finalPath)
                    fs.unlinkSync(finalPath)
                    if (buf.length >= 10000) return resolve(buf)
                } catch (e) {
                    return reject(e)
                }
            }
            if (fs.existsSync(finalPath)) {
                try { fs.unlinkSync(finalPath); } catch (_) {}
            }
            reject(new Error(`yt-dlp gagal (code ${code})`))
        })

        proc.on('error', err => {
            clearTimeout(timer)
            reject(err)
        })
    })
}

function isValidAudioBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 10000) return false;
    const headerStr = buf.slice(0, 200).toString('utf-8').toLowerCase();
    if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('<?xml')) {
        return false;
    }
    const isId3 = buf.slice(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    const isM4a = buf.slice(4, 8).toString('ascii') === 'ftyp';
    const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
    const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const isRiff = buf.slice(0, 4).toString('ascii') === 'RIFF';

    return isId3 || isMp3Sync || isM4a || isOgg || isWebm || isRiff;
}

const savetube = new SaveTube()

async function fetchAudioBuffer(videoUrl, videoId = null) {
    let lastErr = null

    // 1. YouTube Music Direct / Innertube VisionOS (Direct Buffer)
    try {
        const ytm = await ytmusic.download(videoId || videoUrl, { buffer: true })
        if (ytm?.buffer && isValidAudioBuffer(ytm.buffer)) {
            return ytm.buffer
        }
    } catch (err) {
        lastErr = err
        console.warn('[PLAYCH] YouTube Music direct buffer gagal, mencoba transcode MP3:', err.message)
    }

    // 1b. YouTube Music Direct (MP3 Transcode)
    try {
        const ytm = await ytmusic.download(videoId || videoUrl, { whatsapp: true, format: 'mp3' })
        if (ytm?.buffer && isValidAudioBuffer(ytm.buffer)) {
            return ytm.buffer
        }
    } catch (err) {
        lastErr = err
        console.warn('[PLAYCH] YouTube Music MP3 stream error:', err.message)
    }

    // 2. yt-dlp fallback (jika binary terpasang di hosting/container)
    if (isYtDlpAvailable()) {
        try {
            const dlBuf = await downloadViaYtDlp(videoUrl)
            if (isValidAudioBuffer(dlBuf)) {
                return dlBuf
            }
        } catch (err) {
            console.warn('[PLAYCH] yt-dlp fallback error:', err.message)
        }
    }

    // 3. SaveTube fallback
    try {
        const dl = await savetube.download(videoUrl)
        if (isValidAudioBuffer(dl.buffer)) {
            return dl.buffer
        }
    } catch (err) {
        console.warn('[PLAYCH] SaveTube error:', err.message)
    }

    throw lastErr || new Error('Gagal mengunduh file audio dari YouTube.')
}

function formatViews(n) {
    if (!n) return "0"
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"
    return n.toString()
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Format input: .playch <judul/link> | <channel_link_atau_jid> (optional)
    if (!text) return m.reply(
        `*YOUTUBE PLAY TO CHANNEL*\n\n` +
        `Puterin lagu dari YouTube langsung kirim ke Channel (VN/PTT).\n\n` +
        `*Cara Pakai:* \`${usedPrefix + command} <judul/link> [| channel_override]\`\n\n` +
        `*Contoh:*\n` +
        `- \`${usedPrefix + command} starboy\` (Kirim ke channel default global.lch)\n` +
        `- \`${usedPrefix + command} https://youtube.com/watch?v=fBnqChaU-ck\`\n` +
        `- \`${usedPrefix + command} starboy | https://whatsapp.com/channel/xxxx\` (Kirim ke channel spesifik)`
    )

    let query = text
    let target = global.lch

    if (text.includes('|')) {
        let parts = text.split('|')
        query = parts[0].trim()
        target = parts[1].trim()
    }

    if (!target) {
        return m.reply('Channel default tidak diatur di settings.js (global.lch) dan tidak ada parameter channel override yang diberikan.')
    }

    const loadingMsg = await m.reply('_Mencari lagu di YouTube..._')

    try {
        let video = null
        const ytIdRegex = /(?:youtu\.be\/|(?:www\.|music\.)?youtube\.com\/(?:.*[?&]v=|shorts\/|embed\/|v\/))([a-zA-Z0-9_-]{11})/i
        const match = query.match(ytIdRegex)

        if (match) {
            const videoId = match[1]
            try {
                video = await yts({ videoId })
            } catch (_) {}
            if (!video) {
                video = {
                    title: 'YouTube Audio',
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    videoId,
                    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    duration: { timestamp: '—' },
                    views: 0,
                    author: { name: 'YouTube' }
                }
            }
        } else {
            const res = await yts(query)
            video = res.all?.find(v =>
                v.type === 'video' &&
                v.videoId &&
                !v.url?.includes('/shorts/') &&
                (v.seconds || 0) < 1800
            )
            if (!video) throw new Error('Lagu tidak ditemukan.')
        }

        await conn.sendMessage(m.chat, {
            text: `_⬇️ Mengunduh audio..._\n\n*${video.title}*`,
            edit: loadingMsg.key
        }).catch(() => {})

        const channelJid = await getNewsletterJid(conn, target)
        const buffer = await fetchAudioBuffer(video.url, video.videoId)

        await conn.sendMessage(m.chat, {
            text: `_Mengonversi ke Voice Note & Mengirim ke Channel..._`,
            edit: loadingMsg.key
        }).catch(() => {})

        // Konversi ke format PTT (ogg opus)
        const result = await toPTT(buffer, 'mp3')

        // Generate waveform
        let waveform
        try {
            waveform = await getAudioWaveform(result.data)
        } catch (werr) {
            console.warn('[WAVEFORM] Gagal generate waveform:', werr.message)
        }

        // Kirim ke Channel
        await conn.sendMessage(channelJid, {
            audio: result.data,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true,
            waveform
        })

        // Hapus file temp jika ada
        if (result && typeof result.delete === 'function') {
            await result.delete()
        }

        const title = video.title || 'YouTube Audio'
        const viewsStr = formatViews(video.views)

        await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})

        m.reply(
            `*Berhasil Mengirim Voice Note ke Channel!*\n\n` +
            `*Judul:* ${title}\n` +
            `*Durasi:* ${video.duration?.timestamp ?? '—'}\n` +
            `👤 *Channel YT:* ${video.author?.name || 'Unknown'}\n` +
            `👀 *Views:* ${viewsStr}\n` +
            `📢 *Tujuan:* ${channelJid}`
        )

    } catch (err) {
        console.error('[PLAYCH]', err)
        await conn.sendMessage(m.chat, {
            text: `*Gagal memutar lagu ke channel.*\n\n${err.message}`,
            edit: loadingMsg?.key
        }).catch(() => m.reply(`*Gagal:* ${err.message}`))
    }
}

handler.help    = ['playch *judul/link*']
handler.tags    = ['owner']
handler.command = /^(playch)$/i
handler.owner   = true
handler.rowner  = true

export default handler