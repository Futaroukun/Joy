import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import pkg from 'node-webpmux'
const { Image } = pkg
import path from 'path'
import { join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function imageToWebp(media) {
    const tmpFileOut = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const tmpFileIn = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.jpg`)

    writeFileSync(tmpFileIn, media)

    await new Promise((resolve, reject) => {
        ffmpeg(tmpFileIn)
            .on("error", reject)
            .on("end", () => resolve(true))
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf",
                // UPGRADE IMAGE:
                // 1. Scale 512:512 (Resolusi Max WA)
                "scale=512:512:flags=lanczos:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000,setsar=1",
                // 2. Quality 80 (Sangat Jernih)
                "-q:v", "80" 
            ])
            .toFormat("webp")
            .save(tmpFileOut)
    })

    const buff = readFileSync(tmpFileOut)
    try {
        if(existsSync(tmpFileOut)) unlinkSync(tmpFileOut)
        if(existsSync(tmpFileIn)) unlinkSync(tmpFileIn)
    } catch (e) {}
    return buff
}

async function videoToWebp(media) {
    const tmpFileOut = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const tmpFileIn = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.mp4`)

    writeFileSync(tmpFileIn, media)

    await new Promise((resolve, reject) => {
        ffmpeg(tmpFileIn)
            .on("error", reject)
            .on("end", () => resolve(true))
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf",
                // SETTINGAN VIDEO TETAP (Supaya tidak error/kegedean file):
                // Scale 320, FPS 15, Max 8 Detik
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

    const buff = readFileSync(tmpFileOut)
    try {
        if(existsSync(tmpFileOut)) unlinkSync(tmpFileOut)
        if(existsSync(tmpFileIn)) unlinkSync(tmpFileIn)
    } catch (e) {}
    return buff
}

async function writeExifImg(media, metadata) {
    let wMedia = await imageToWebp(media)
    const tmpFileOut = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const img = new Image()
    
    const json = { 
        "sticker-pack-id": "https://github.com/XM4ZE", 
        "sticker-pack-name": metadata.packname || 'Sticker', 
        "sticker-pack-publisher": metadata.author || 'Bot', 
        "emojis": metadata.categories ? metadata.categories : [""] 
    }
    
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    
    await img.load(wMedia)
    img.exif = exif
    await img.save(tmpFileOut)
    
    const buff = readFileSync(tmpFileOut)
    try {
        if(existsSync(tmpFileOut)) unlinkSync(tmpFileOut)
    } catch (e) {}
    return buff
}

async function writeExifVid(media, metadata) {
    let wMedia = await videoToWebp(media)
    
    if (wMedia.length > 950000) { 
        return wMedia 
    }

    const tmpFileOut = join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`)
    const img = new Image()
    
    const json = { 
        "sticker-pack-id": "https://github.com/Futaroukun", 
        "sticker-pack-name": metadata.packname || 'Sticker', 
        "sticker-pack-publisher": metadata.author || 'Bot', 
        "emojis": metadata.categories ? metadata.categories : [""] 
    }
    
    const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00])
    const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8")
    const exif = Buffer.concat([exifAttr, jsonBuff])
    exif.writeUIntLE(jsonBuff.length, 14, 4)
    
    try {
        await img.load(wMedia)
        img.exif = exif
        await img.save(tmpFileOut)
        
        const buff = readFileSync(tmpFileOut)
        try { if(existsSync(tmpFileOut)) unlinkSync(tmpFileOut) } catch (e) {}
        
        if (buff.length >= 1000000) return wMedia;
        
        return buff
    } catch (e) {
        return wMedia 
    }
}

export { imageToWebp, videoToWebp, writeExifImg, writeExifVid }