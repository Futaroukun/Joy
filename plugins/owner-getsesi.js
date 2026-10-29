/*
- @Author: Rafli
- @Feature: Backup Creds
- @Description: Kirim file creds.json ke owner via WhatsApp. Jika di grup, otomatis kirim ke DM owner.
*/

import fs from 'fs'
import { join } from 'path'

let handler = async (m, { conn }) => {
    const credsPath = join(process.cwd(), 'sessions', 'creds.json')

    if (!fs.existsSync(credsPath)) {
        return m.reply('File creds.json tidak ditemukan. Pastikan bot sudah pernah login.')
    }

    try {
        const fileBuffer = fs.readFileSync(credsPath)
        const stats      = fs.statSync(credsPath)
        const sizeKB     = (stats.size / 1024).toFixed(2)
        const modified   = new Date(stats.mtime).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })

        const caption =
            `*BACKUP CREDS*\n\n` +
            `*File:* creds.json\n` +
            `*Size:* ${sizeKB} KB\n` +
            `*Update:* ${modified}\n\n` +
            `_Jangan share file ini ke siapapun._`

        const doc = { document: fileBuffer, mimetype: 'application/json', fileName: 'creds.json', caption }

        if (m.isGroup) {
            const ownerNumber = global.info?.nomorowner
            if (!ownerNumber) return m.reply('Nomor owner tidak ditemukan di `global.info.nomorowner`.')

            const ownerJid = `${ownerNumber.replace(/\D/g, '')}@s.whatsapp.net`
            await conn.sendMessage(ownerJid, doc)
            await m.reply('File creds.json sudah dikirim ke DM owner.')
        } else {
            await conn.sendMessage(m.chat, doc, { quoted: m })
        }

    } catch (e) {
        console.error('[CREDS]', e)
        m.reply(`Gagal mengirim file.\n\n${e.message}`)
    }
}

handler.help    = ['getcreds']
handler.tags    = ['owner']
handler.command = /^(getcreds|creds)$/i
handler.rowner  = true

export default handler