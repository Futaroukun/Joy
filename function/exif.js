import ffmpeg from 'fluent-ffmpeg'
import webp from 'node-webpmux'
import tmpManager from './safe-tmp.js'
import { fileTypeFromBuffer } from 'file-type'

/**
- Konversi gambar (JPEG/PNG) ke WebP dengan padding dan scaling
 */
async function imageToWebp(mediaBuffer) {
   if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
      throw new Error('Invalid media buffer provided to imageToWebp')
   }
   
   let tmpInput = null
   let tmpOutput = null
   
   try {
      tmpInput = await tmpManager.writeBuffer(mediaBuffer, '.jpg')
      tmpOutput = tmpInput.replace('.jpg', '.webp')
      
      await new Promise((resolve, reject) => {
         ffmpeg(tmpInput)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
               '-vcodec', 'libwebp',
               '-sws_flags', 'lanczos', // <-- Peningkatan dari kode baru (kualitas scaling)
               '-vf', "scale=512:512:force_original_aspect_ratio=decrease,format=rgba,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0.0",
               '-lossless', '0',
               '-quality', '80' // <-- Ambil dari kode lama, penting buat kualitas
            ])
            .toFormat('webp')
            .save(tmpOutput)
      })
      
      const result = tmpManager.readFile(tmpOutput)
      tmpManager.deleteFile(tmpInput)
      tmpManager.deleteFile(tmpOutput)
      
      return result
      
   } catch (error) {
      if (tmpInput) tmpManager.deleteFile(tmpInput)
      if (tmpOutput) tmpManager.deleteFile(tmpOutput)
      throw new Error(`Image to WebP conversion failed: ${error.message}`)
   }
}

/**
- Konversi video (MP4) ke WebP animasi
 */
async function videoToWebp(mediaBuffer) {
   if (!mediaBuffer || !Buffer.isBuffer(mediaBuffer) || mediaBuffer.length === 0) {
      throw new Error('Invalid media buffer provided to videoToWebp')
   }
   
   let tmpInput = null
   let tmpOutput = null
   
   try {
      tmpInput = await tmpManager.writeBuffer(mediaBuffer, '.mp4')
      tmpOutput = tmpInput.replace('.mp4', '.webp')
      
      await new Promise((resolve, reject) => {
         ffmpeg(tmpInput)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
               '-vcodec', 'libwebp',
               '-vf',
               "scale='min(320,iw)':min(320,ih):force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
               '-loop', '0',
               '-ss', '00:00:00',
               '-t', '00:00:05',
               '-preset', 'default',
               '-an',
               '-vsync', '0'
          ])
            .toFormat('webp')
            .save(tmpOutput)
      })
      
      const result = tmpManager.readFile(tmpOutput)
      tmpManager.deleteFile(tmpInput)
      tmpManager.deleteFile(tmpOutput)
      
      return result
      
   } catch (error) {
      if (tmpInput) tmpManager.deleteFile(tmpInput)
      if (tmpOutput) tmpManager.deleteFile(tmpOutput)
      throw new Error(`Video to WebP conversion failed: ${error.message}`)
   }
}

/**
- Core function untuk menulis EXIF ke media WebP
- Menggabungkan logika efisien dari kode baru dengan file manager yang aman
 */
async function writeExif(media, metadata) {
   // Cek mimetype dari media buffer, bukan dari object 'media'
   const { mime } = await fileTypeFromBuffer(media) || { mime: 'application/octet-stream' };
   
   // Logika efisien dari kode baru: konversi jika perlu
   let webpBuffer = /webp/.test(mime) ?
      media :
      /image/.test(mime) ?
      await imageToWebp(media) :
      /video/.test(mime) ?
      await videoToWebp(media) :
      Buffer.alloc(0);
   
   if (!webpBuffer || webpBuffer.length === 0) {
      throw new Error('Media conversion to WebP failed or resulted in an empty buffer.')
   }
   
   if (!metadata || Object.keys(metadata).length === 0) {
      return webpBuffer // Return WebP tanpa EXIF jika metadata kosong
   }
   
   const img = new webp.Image()
   const json = {
      'sticker-pack-id': metadata.packId || `JoyBot-${Date.now()}`,
      'sticker-pack-name': metadata.packname || '', // Disesuaikan dengan pemanggilan di simple.js
      'sticker-pack-publisher': metadata.author || '', // Disesuaikan dengan pemanggilan di simple.js
      'android-app-store-link': metadata.androidApp || 'https://github.com/Futaroukun/Joy',
      'ios-app-store-link': metadata.iOSApp || 'https://github.com/Futaroukun/Joy',
      'emojis': metadata.categories || [''],
      'is-avatar-sticker': metadata.isAvatar || 0,
   }
   
   const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
   const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
   const exif = Buffer.concat([exifAttr, jsonBuff]);
   exif.writeUIntLE(jsonBuff.length, 14, 4);
   
   await img.load(webpBuffer)
   img.exif = exif
   
   return await img.save(null)
}

/**
- Wrapper untuk stiker gambar, menjaga kompatibilitas dengan simple.js
 */
async function writeExifImg(media, metadata) {
   return await writeExif(media, metadata);
}

/**
- Wrapper untuk stiker video, menjaga kompatibilitas dengan simple.js
 */
async function writeExifVid(media, metadata) {
   return await writeExif(media, metadata);
}

export { imageToWebp, videoToWebp, writeExifImg, writeExifVid }