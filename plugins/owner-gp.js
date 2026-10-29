/*
 * @Author      : Rafli
 * @Feature     : Get Plugin Source
 * @Description : Mengambil isi kode source plugin dengan tombol salin cepat.
 * @Version     : 2.1 (No Decorational Emoji & Clean Copy Button)
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'

let handler = async (m, { conn, usedPrefix, command, text }) => {
    const pluginsDir = join(process.cwd(), 'plugins')
    const files      = readdirSync(pluginsDir).filter(f => f.endsWith('.js')).sort()
    const names      = files.map(f => f.replace('.js', ''))

    if (!text) {
        return m.reply(
            `*GET PLUGIN SOURCE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `*Format:* \`${usedPrefix + command} <nama|nomor>\`\n\n` +
            `*Daftar Plugin (${names.length} File):*\n` +
            names.map((name, i) => `${i + 1}. ${name}`).join('\n') +
            `\n━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    const num = parseInt(text, 10)
    let target = null

    if (!isNaN(num) && num > 0 && num <= names.length) {
        target = names[num - 1]
    } else {
        const cleanInput = text.trim().toLowerCase().replace(/\.js$/i, '')
        const found = names.find(n => n.toLowerCase() === cleanInput)
        if (found) target = found
    }

    if (!target) {
        return m.reply(
            `Plugin *"${text}"* tidak ditemukan.\n` +
            `Ketik \`${usedPrefix + command}\` tanpa argumen untuk melihat daftar plugin.`
        )
    }

    const targetFilePath = join(pluginsDir, `${target}.js`)
    if (!existsSync(targetFilePath)) {
        return m.reply(`File \`plugins/${target}.js\` tidak ditemukan di server.`)
    }

    try {
        const code = readFileSync(targetFilePath, 'utf8').trim()
        if (!code) return m.reply(`File *${target}.js* kosong.`)

        try {
            await conn.sendButton(m.chat, {
                body: code,
                footer: `Plugin: ${target}.js (${code.split('\n').length} baris)`,
                buttons: [{
                    name: 'cta_copy',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Salin Kode',
                        copy_code: code
                    })
                }]
            }, { quoted: m })
        } catch (_) {
            await m.reply(code)
        }

    } catch (e) {
        console.error('[GET PLUGIN ERROR]', e)
        m.reply(`*Gagal membaca plugin:*\n_${e.message}_`)
    }
}

handler.help = ['gp *nama|nomor*']
handler.tags    = ['owner']
handler.command = /^(gp|getplugin)$/i
handler.owner   = true

export default handler