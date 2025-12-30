import { writeExifImg, writeExifVid } from '../function/exif.js'
import fs from 'fs'

let handler = async (m, { conn, command, usedPrefix }) => {
    try {
        let q = m.quoted ? m.quoted : m
        let mime = (q.msg || q).mimetype || ''
        
        // Validasi tipe file
        if (!mime || !/image|video/.test(mime)) {
            return m.reply(`Kirim atau reply gambar/video dengan caption *${usedPrefix + command}*`)
        }

        // Validasi Durasi Video DI AWAL (Sebelum download)
        // Agar hemat kuota server, kita tolak duluan kalau > 8 detik
        if (/video/.test(mime)) {
            if ((q.msg || q).seconds > 8) {
                return m.reply('⚠️ *Durasi Terlalu Panjang!*\n\nMaksimal durasi video untuk stiker adalah *8 detik*.\nSilakan potong video Anda terlebih dahulu.')
            }
        }

        let media = await q.download()
        if (!media) throw new Error('Gagal mengunduh media.')

        // --- TEKS WAIT YANG DIPERBAIKI ---
        m.reply('_⏳ Sedang membuat stiker, mohon tunggu sebentar..._')
        // ---------------------------------

        let stiker
        let options = {
            packname: global.info.namabot || 'Sticker Bot',
            author: global.info.namaowner || 'Created By Bot'
        }

        try {
            if (/image/.test(mime)) {
                stiker = await writeExifImg(media, options)
            } else if (/video/.test(mime)) {
                stiker = await writeExifVid(media, options)
            }
        } catch (e) {
            console.error('[EXIF ERROR]', e)
            stiker = media
        }

        if (stiker) {
            // Cek ukuran file hasil konversi
            if (stiker.length > 1000000) {
                 let sizeInMB = (stiker.length / 1000000).toFixed(2);
                 return m.reply(`⚠️ *Gagal Mengirim Stiker*\n\nUkuran file hasil: *${sizeInMB} MB* (Batas WhatsApp: 1 MB).\nVideo terlalu kompleks atau terlalu banyak warna.`)
            }
            await conn.sendMessage(m.chat, { sticker: stiker }, { quoted: m })
        } else {
            throw new Error('Gagal membuat stiker.')
        }

    } catch (e) {
        console.error(e)
        m.reply('*Terjadi kesalahan:*\n' + e.message)
    }
}

handler.help = ['stiker']
handler.tags = ['sticker']
handler.command = /^(s|stiker|sticker)$/i

export default handler