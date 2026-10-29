import { promises as fsPromises } from 'fs'
import { spawn } from 'child_process'
import tmpManager from '../core/safe-tmp.js'
import { mediaTaskLimit } from '../core/queue.js'

const AUDIO_CODEC = 'libmp3lame'
const VIDEO_CODEC = 'libx264'
const OPUS_CODEC = 'libopus'
const GIF_CODEC = 'fps=15,scale=512:-1:flags=lanczos'

/**
 * Core FFmpeg executor dengan validasi ketat
 */
async function ffmpeg(buffer, args, ext, ext2) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Invalid input: buffer tidak valid')
    }

    if (buffer.length === 0) {
        throw new Error('Invalid input: buffer kosong (0 byte)')
    }

    if (buffer.length < 100) {
        throw new Error('Invalid input: buffer terlalu kecil, kemungkinan corrupt')
    }

    return mediaTaskLimit(async () => {
        let tmpInput = null
        let tmpOutput = null

        try {
            console.log(`[FFMPEG] Input buffer size: ${buffer.length} bytes`)
            tmpInput = await tmpManager.writeBuffer(buffer, `.${ext}`)
            console.log(`[FFMPEG] Input file created: ${tmpInput}`)

            tmpOutput = tmpInput.replace(new RegExp(`\\.${ext}$`), `_out.${ext2}`)

            console.log(`[FFMPEG] Running: ffmpeg -i ${tmpInput} ${args.join(' ')} ${tmpOutput}`)

            await new Promise((resolve, reject) => {
                const ffmpegProcess = spawn('ffmpeg', [
                    '-y',
                    '-i', tmpInput,
                    ...args,
                    tmpOutput
                ])

                let stderr = ''
                const timeoutMs = 60_000
                const timer = setTimeout(() => {
                    try {
                        ffmpegProcess.kill('SIGKILL')
                    } catch (_) {}
                    reject(new Error(`FFmpeg timed out after ${timeoutMs / 1000}s`))
                }, timeoutMs)

                ffmpegProcess.stderr.on('data', (data) => {
                    stderr += data.toString()
                })

                ffmpegProcess.on('error', (error) => {
                    clearTimeout(timer)
                    reject(new Error(`FFmpeg spawn error: ${error.message}`))
                })

                ffmpegProcess.on('close', (code) => {
                    clearTimeout(timer)
                    if (code !== 0) {
                        console.error('[FFMPEG ERROR]', stderr)
                        reject(new Error(`FFmpeg exit code ${code}`))
                    } else {
                        resolve()
                    }
                })
            })

            const result = await fsPromises.readFile(tmpOutput)

            if (!result || result.length === 0) {
                throw new Error('Output file corrupt: 0 byte')
            }

            if (result.length < 100) {
                throw new Error('Output file terlalu kecil, kemungkinan corrupt')
            }

            console.log(`[FFMPEG] Success: ${result.length} bytes`)

            return {
                data: result,
                filename: tmpOutput,
                delete: async () => {
                    tmpManager.deleteFile(tmpOutput)
                    tmpManager.deleteFile(tmpInput)
                }
            }

        } catch (error) {
            if (tmpInput) tmpManager.deleteFile(tmpInput)
            if (tmpOutput) tmpManager.deleteFile(tmpOutput)

            throw new Error(`FFmpeg conversion failed: ${error.message}`)
        }
    })
}

/**
 * Convert to Ultra HD MP3 Audio (320kbps / 48kHz Stereo)
 */
async function toAudio(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', AUDIO_CODEC,
        '-b:a', '320k',
        '-q:a', '0',
        '-ar', '48000',
        '-ac', '2',
        '-f', 'mp3',
    ], ext, 'mp3')
}

/**
 * Convert to WhatsApp Compatible Audio (AAC 128k / 44.1kHz Stereo M4A with faststart)
 */
async function toAudioM4A(buffer, ext = 'mp3') {
    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length < 50000) {
        throw new Error('Buffer audio tidak valid atau terlalu kecil');
    }
    const head = buffer.slice(0, 200).toString('utf-8').toLowerCase();
    if (head.includes('<!doctype') || head.includes('<html') || head.includes('<?xml')) {
        throw new Error('Buffer adalah dokumen HTML/XML, bukan audio valid');
    }
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-movflags', '+faststart'
    ], ext, 'm4a')
}

/**
 * Convert to Ultra HD PTT (Voice Note 128kbps / 48kHz Opus)
 */
async function toPTT(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', OPUS_CODEC,
        '-b:a', '128k',
        '-vbr', 'on',
        '-compression_level', '10',
        '-application', 'audio',
        '-ar', '48000',
        '-ac', '1',
        '-cutoff', '24000',
        '-avoid_negative_ts', 'make_zero',
        '-map_metadata', '-1',
    ], ext, 'ogg')
}

/**
 * Convert to GIF
 */
async function toGif(buffer, ext) {
    return ffmpeg(buffer, [
        '-vf', GIF_CODEC,
        '-loop', '0',
        '-fs', '256k',
        '-c:v', 'gif',
    ], ext, 'gif')
}

/**
 * Convert to Video
 */
async function toVideo(buffer, ext) {
    return ffmpeg(buffer, [
        '-c:v', VIDEO_CODEC,
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-crf', '32',
        '-preset', 'veryfast',
    ], ext, 'mp4')
}

export {
    toAudio,
    toAudioM4A,
    toPTT,
    toVideo,
    toGif,
    ffmpeg
}