import { promises as fsPromises } from 'fs'
import { spawn } from 'child_process'
import tmpManager from './safe-tmp.js'

const AUDIO_CODEC = 'libmp3lame'
const VIDEO_CODEC = 'libx264'
const OPUS_CODEC = 'libopus'
const GIF_CODEC = 'fps=15,scale=512:-1:flags=lanczos'

/**
 * Core FFmpeg executor dengan validasi ketat
 */
async function ffmpeg(buffer, args, ext, ext2) {
    // VALIDASI INPUT
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new Error('Invalid input: buffer tidak valid')
    }

    if (buffer.length === 0) {
        throw new Error('Invalid input: buffer kosong (0 byte)')
    }

    if (buffer.length < 100) {
        throw new Error('Invalid input: buffer terlalu kecil, kemungkinan corrupt')
    }

    let tmpInput = null
    let tmpOutput = null

    try {
        // 1. TULIS INPUT FILE dengan validasi
        console.log(`[FFMPEG] Input buffer size: ${buffer.length} bytes`)
        tmpInput = await tmpManager.writeBuffer(buffer, `.${ext}`)
        console.log(`[FFMPEG] Input file created: ${tmpInput}`)

        // 2. GENERATE OUTPUT PATH
        tmpOutput = tmpInput.replace(`.${ext}`, `.${ext2}`)

        // 3. JALANKAN FFMPEG
        console.log(`[FFMPEG] Running: ffmpeg -i ${tmpInput} ${args.join(' ')} ${tmpOutput}`)

        await new Promise((resolve, reject) => {
            const ffmpegProcess = spawn('ffmpeg', [
                '-y',
                '-i', tmpInput,
                ...args,
                tmpOutput
            ])

            let stderr = ''

            // Capture error output
            ffmpegProcess.stderr.on('data', (data) => {
                stderr += data.toString()
            })

            ffmpegProcess.on('error', (error) => {
                reject(new Error(`FFmpeg spawn error: ${error.message}`))
            })

            ffmpegProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error('[FFMPEG ERROR]', stderr)
                    reject(new Error(`FFmpeg exit code ${code}`))
                } else {
                    resolve()
                }
            })
        })

        // 4. VALIDASI OUTPUT FILE
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
        // CLEANUP on error
        if (tmpInput) tmpManager.deleteFile(tmpInput)
        if (tmpOutput) tmpManager.deleteFile(tmpOutput)
        
        throw new Error(`FFmpeg conversion failed: ${error.message}`)
    }
}

/**
 * Convert to MP3 Audio
 */
async function toAudio(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', AUDIO_CODEC,
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-f', 'mp3',
    ], ext, 'mp3')
}

/**
 * Convert to PTT (Voice Note)
 */
async function toPTT(buffer, ext) {
    return ffmpeg(buffer, [
        '-vn',
        '-c:a', OPUS_CODEC,
        '-b:a', '96k',
        '-vbr', 'on',
        '-ar', '48000',
        '-ac', '1',
        '-f', 'ogg',
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
        '-preset', 'slow',
    ], ext, 'mp4')
}

export {
    toAudio,
    toPTT,
    toVideo,
    toGif,
    ffmpeg
}