import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { randomBytes } from 'crypto'
import ffmpeg from 'fluent-ffmpeg'
import pkg from 'node-webpmux'
const { Image } = pkg
import { join } from 'path'

// Fungsi untuk membuat nama file sementara yang unik
const tmpFile = (ext) => join(tmpdir(), `${randomBytes(6).readUIntLE(0, 6).toString(36)}${ext}`)

// === FUNGSI KONVERSI GAMBAR STATIS (Diperbaiki) ===
async function imageToWebp(media) {
    const tmpFileIn = tmpFile('.jpg')
    const tmpFileOut = tmpFile('.webp')

    writeFileSync(tmpFileIn, media)

    await new Promise((resolve, reject) => {
        ffmpeg(tmpFileIn)
            .on("error", reject)
            .on("end", () => resolve(true))
            .on('stderr', stderrLine => console.log('[FFMPEG IMG]', stderrLine)) // Logging buat debug
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf", "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,format=rgba,pad=512:512:-1:-1:color=white@0.0"
            ])
            .toFormat("webp")
            .save(tmpFileOut);
    });

    const buff = readFileSync(tmpFileOut)
    unlinkSync(tmpFileOut)
    unlinkSync(tmpFileIn)
    return buff
}

// === FUNGSI KONVERSI VIDEO/GIF (Sudah Oke, Dirapihin Sedikit) ===
async function videoToWebp(media) {
    const tmpFileIn = tmpFile('.mp4')
    const tmpFileOut = tmpFile('.webp')

    writeFileSync(tmpFileIn, media)

    await new Promise((resolve, reject) => {
        ffmpeg(tmpFileIn)
            .on("error", reject)
            .on("end", () => resolve(true))
            .on('stderr', stderrLine => console.log('[FFMPEG VID]', stderrLine)) // Logging buat debug
            .addOutputOptions([
                "-vcodec", "libwebp",
                "-vf", "scale='min(512,iw)':min'(512,ih)':force_original_aspect_ratio=decrease,fps=15,pad=512:512:-1:-1:color=white@0.0",
                "-loop", "0",
                "-ss", "00:00:00",
                "-t", "00:00:06", // Max 6 detik
                "-preset", "default",
                "-an",
                "-vsync", "0"
            ])
            .toFormat("webp")
            .save(tmpFileOut);
    });

    const buff = readFileSync(tmpFileOut)
    unlinkSync(tmpFileOut)
    unlinkSync(tmpFileIn)
    return buff
}

// === FUNGSI METADATA (Tidak Perlu Diubah) ===
async function writeExif(media, metadata, isVideo = false) {
    let wMedia = isVideo ? await videoToWebp(media) : await imageToWebp(media);
    const tmpFileIn = tmpFile('.webp');
    const tmpFileOut = tmpFile('.webp');
    writeFileSync(tmpFileIn, wMedia);

    if (metadata.packname || metadata.author) {
        const img = new Image();
        const json = {
            "sticker-pack-id": metadata.packId || `https://github.com/Futaroukun/Joy`,
            "sticker-pack-name": metadata.packname,
            "sticker-pack-publisher": metadata.author,
            "emojis": metadata.categories ? metadata.categories : [""]
        };
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuff = Buffer.from(JSON.stringify(json), "utf-8");
        const exif = Buffer.concat([exifAttr, jsonBuff]);
        exif.writeUIntLE(jsonBuff.length, 14, 4);
        await img.load(tmpFileIn);
        unlinkSync(tmpFileIn);
        img.exif = exif;
        await img.save(tmpFileOut);
        return readFileSync(tmpFileOut);
    }

    return readFileSync(tmpFileIn);
}

// Gabungin fungsi exif biar lebih simpel di file lain
async function writeExifImg(media, metadata) {
    const webpBuffer = await writeExif(media, metadata, false);
    const tmpFileOut = tmpFile('.webp');
    writeFileSync(tmpFileOut, webpBuffer);
    return tmpFileOut;
}

async function writeExifVid(media, metadata) {
    const webpBuffer = await writeExif(media, metadata, true);
    const tmpFileOut = tmpFile('.webp');
    writeFileSync(tmpFileOut, webpBuffer);
    return tmpFileOut;
}


export { imageToWebp, videoToWebp, writeExifImg, writeExifVid }