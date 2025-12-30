import ffmpeg from 'fluent-ffmpeg'
import pkg from 'node-webpmux'
import tmpManager from './safe-tmp.js'

const { Image } = pkg

async function imageToWebp(media) {
    if (!media || !Buffer.isBuffer(media)) {
        throw new Error('Invalid media: bukan Buffer')
    }

    if (media.length === 0) {
        throw new Error('Invalid media: buffer kosong')
    }

    let tmpInput = null
    let tmpOutput = null

    try {
        console.log(`[IMG2WEBP] Input: ${media.length} bytes`)
        tmpInput = await tmpManager.writeBuffer(media, '.jpg')
        tmpOutput = tmpInput.replace('.jpg', '.webp')

        await new Promise((resolve, reject) => {
            ffmpeg(tmpInput)
                .on('error', reject)
                .on('end', resolve)
                .addOutputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=white@0.0",
                    '-lossless', '0',
                    '-quality', '80',
                    '-preset', 'default'
                ])
                .toFormat('webp')
                .save(tmpOutput)
        })

        const result = tmpManager.readFile(tmpOutput)

        if (!result || result.length === 0) {
            throw new Error('Output corrupt')
        }

        console.log(`[IMG2WEBP] Success: ${result.length} bytes`)

        tmpManager.deleteFile(tmpInput)
        tmpManager.deleteFile(tmpOutput)

        return result

    } catch (error) {
        if (tmpInput) tmpManager.deleteFile(tmpInput)
        if (tmpOutput) tmpManager.deleteFile(tmpOutput)
        throw new Error(`Image to WebP failed: ${error.message}`)
    }
}

async function videoToWebp(media) {
    if (!media || !Buffer.isBuffer(media)) {
        throw new Error('Invalid media: bukan Buffer')
    }

    if (media.length === 0) {
        throw new Error('Invalid media: buffer kosong')
    }

    let tmpInput = null
    let tmpOutput = null

    try {
        console.log(`[VID2WEBP] Input: ${media.length} bytes`)
        tmpInput = await tmpManager.writeBuffer(media, '.mp4')
        tmpOutput = tmpInput.replace('.mp4', '.webp')

        await new Promise((resolve, reject) => {
            ffmpeg(tmpInput)
                .on('error', reject)
                .on('end', resolve)
                .addOutputOptions([
                    '-vcodec', 'libwebp',
                    '-vf', "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
                    '-loop', '0',
                    '-ss', '00:00:00',
                    '-t', '00:00:06',
                    '-preset', 'default',
                    '-an',
                    '-vsync', '0',
                    '-quality', '75'
                ])
                .toFormat('webp')
                .save(tmpOutput)
        })

        const result = tmpManager.readFile(tmpOutput)

        if (!result || result.length === 0) {
            throw new Error('Output corrupt')
        }

        console.log(`[VID2WEBP] Success: ${result.length} bytes`)

        tmpManager.deleteFile(tmpInput)
        tmpManager.deleteFile(tmpOutput)

        return result

    } catch (error) {
        if (tmpInput) tmpManager.deleteFile(tmpInput)
        if (tmpOutput) tmpManager.deleteFile(tmpOutput)
        throw new Error(`Video to WebP failed: ${error.message}`)
    }
}

async function writeExif(media, metadata, isVideo = false) {
    let wMedia = isVideo ? await videoToWebp(media) : await imageToWebp(media)

    if (!wMedia || wMedia.length === 0) {
        throw new Error('WebP conversion failed')
    }

    let tmpInput = null
    let tmpOutput = null

    try {
        tmpInput = await tmpManager.writeBuffer(wMedia, '.webp')
        tmpOutput = tmpInput.replace('.webp', '_exif.webp')

        if (metadata.packname || metadata.author) {
            const img = new Image()
            const json = {
                'sticker-pack-id': metadata.packId || 'https://github.com/Futaroukun/Joy',
                'sticker-pack-name': metadata.packname,
                'sticker-pack-publisher': metadata.author,
                'emojis': metadata.categories || ['']
            }

            const exifAttr = Buffer.from([
                0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
                0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00
            ])

            const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8')
            const exif = Buffer.concat([exifAttr, jsonBuff])
            exif.writeUIntLE(jsonBuff.length, 14, 4)

            await img.load(tmpInput)
            img.exif = exif
            await img.save(tmpOutput)

            const result = tmpManager.readFile(tmpOutput)

            tmpManager.deleteFile(tmpInput)
            tmpManager.deleteFile(tmpOutput)

            return result
        }

        const result = tmpManager.readFile(tmpInput)
        tmpManager.deleteFile(tmpInput)
        return result

    } catch (error) {
        if (tmpInput) tmpManager.deleteFile(tmpInput)
        if (tmpOutput) tmpManager.deleteFile(tmpOutput)
        throw new Error(`Write EXIF failed: ${error.message}`)
    }
}

async function writeExifImg(media, metadata) {
    const webpBuffer = await writeExif(media, metadata, false)
    return webpBuffer
}

async function writeExifVid(media, metadata) {
    const webpBuffer = await writeExif(media, metadata, true)
    return webpBuffer
}

export { imageToWebp, videoToWebp, writeExifImg, writeExifVid }