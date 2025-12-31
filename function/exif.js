import { readFileSync, existsSync } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import webpmux from 'node-webpmux'
const { Image } = webpmux
import tmpManager from './safe-tmp.js'

/**
 * Validasi Buffer
 */
const isValidBuffer = (buffer) => {
    return Buffer.isBuffer(buffer) && buffer.length > 0
}

/**
 * Konversi gambar ke format WebP menggunakan FFMPEG dan safe-tmp.
 */
async function imageToWebp(media) {
    if (!isValidBuffer(media)) throw new Error('Input media gambar kosong/tidak valid')

    let tmpFileIn = null
    let tmpFileOut = null

    try {
        // Tulis file input
        tmpFileIn = await tmpManager.writeBuffer(media, '.jpg')
        
        // Buat nama file output
        tmpFileOut = tmpFileIn.replace(/\.jpg$/, '.webp')

        await new Promise((resolve, reject) => {
            ffmpeg(tmpFileIn)
                .on("error", reject)
                .on("end", () => resolve(true))
                .addOutputOptions([
                    "-vcodec", "libwebp",
                    "-vf",
                    "scale='min(512,iw)':'min(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1",
                    "-q:v", "80" 
                ])
                .toFormat("webp")
                .save(tmpFileOut)
        })

        // VALIDASI HASIL KONVERSI
        // Kita gunakan tmpManager untuk membaca agar aman (ada validasi 0 byte di sana)
        if (!existsSync(tmpFileOut)) throw new Error('FFmpeg gagal: File output WebP tidak terbentuk')
        
        const buff = readFileSync(tmpFileOut)
        if (!isValidBuffer(buff)) throw new Error('FFmpeg gagal: Hasil konversi 0 byte')
        
        return buff

    } finally {
        // Cleanup file sementara
        if (tmpFileIn) tmpManager.deleteFile(tmpFileIn)
        if (tmpFileOut) tmpManager.deleteFile(tmpFileOut)
    }
}

/**
 * Konversi video ke format WebP (stiker animasi).
 */
async function videoToWebp(media) {
    if (!isValidBuffer(media)) throw new Error('Input media video kosong/tidak valid')

    let tmpFileIn = null
    let tmpFileOut = null

    try {
        tmpFileIn = await tmpManager.writeBuffer(media, '.mp4')
        tmpFileOut = tmpFileIn.replace(/\.mp4$/, '.webp')

        await new Promise((resolve, reject) => {
            ffmpeg(tmpFileIn)
                .on("error", reject)
                .on("end", () => resolve(true))
                .addOutputOptions([
                    "-vcodec", "libwebp",
                    "-vf",
                    // Config Video: Scale 320, FPS 15, Max 8 Detik, Quality 25
                    "scale=320:320:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=320:320:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1,fps=15",
                    "-loop", "0",
                    "-ss", "00:00:00",
                    "-t", "00:00:08", 
                    "-preset", "default",
                    "-an",
                    "-vsync", "0",
                    "-q:v", "25",
                    "-lossless", "0",
                    "-compression_level", "6"
                ])
                .toFormat("webp")
                .save(tmpFileOut)
        })

        if (!existsSync(tmpFileOut)) throw new Error('FFmpeg Video gagal: File output tidak terbentuk')
        
        const buff = readFileSync(tmpFileOut)
        if (!isValidBuffer(buff)) throw new Error('FFmpeg Video gagal: Hasil konversi 0 byte')
        
        return buff

    } finally {
        if (tmpFileIn) tmpManager.deleteFile(tmpFileIn)
        if (tmpFileOut) tmpManager.deleteFile(tmpFileOut)
    }
}

/**
 * Fungsi Inti Write Exif
 */
async function writeExif(media, metadata) {
    if (!isValidBuffer(media)) return media // Kembalikan apa adanya jika input kosong

    let tmpFileOut = null
    try {
        const img = new Image()
        
        const json = {
            "sticker-pack-id": metadata.packId || "https://github.com/XM4ZE",
            "sticker-pack-name": metadata.packname || 'Sticker',
            "sticker-pack-publisher": metadata.author || 'Bot',
            "emojis": metadata.categories || [""]
        }
        
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
        const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
        const exif = Buffer.concat([exifAttr, jsonBuff])
        exif.writeUIntLE(jsonBuff.length, 14, 4)
        
        await img.load(media)
        img.exif = exif
        
        // Simpan ke file temp baru
        // Kita gunakan trik writeBuffer kosong untuk dapat path unik
        // Lalu replace namanya jadi .webp
        const dummyPath = await tmpManager.writeBuffer(Buffer.from('dummy'), '.tmp')
        tmpFileOut = dummyPath.replace('.tmp', '.webp')
        
        // Hapus dummy file karena kita cuma butuh path/namanya saja
        tmpManager.deleteFile(dummyPath)
        
        await img.save(tmpFileOut)
        
        if (!existsSync(tmpFileOut)) return media
        
        const buff = readFileSync(tmpFileOut)
        if (!isValidBuffer(buff)) return media
        
        return buff
        
    } catch (e) {
        console.error('Error writing EXIF:', e.message)
        return media 
    } finally {
        if (tmpFileOut) tmpManager.deleteFile(tmpFileOut)
    }
}

/**
 * Public function untuk stiker gambar.
 */
async function writeExifImg(media, metadata) {
    try {
        const webp = await imageToWebp(media)
        return await writeExif(webp, metadata)
    } catch (e) {
        console.error('Gagal convert image stiker:', e.message)
        // Jika gagal konversi, throw error biar user tau
        throw e
    }
}

/**
 * Public function untuk stiker video.
 */
async function writeExifVid(media, metadata) {
    try {
        const webp = await videoToWebp(media)
        
        // Limit 950KB sebelum tambah EXIF
        if (webp.length > 950000) {
            return webp
        }
        
        const stickerWithExif = await writeExif(webp, metadata)

        // Limit 1MB setelah tambah EXIF
        if (stickerWithExif.length >= 1000000) {
            return webp
        }
        
        return stickerWithExif
    } catch (e) {
        console.error('Gagal convert video stiker:', e.message)
        throw e
    }
}

export { imageToWebp, videoToWebp, writeExifImg, writeExifVid }