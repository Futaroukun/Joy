import cp, { exec as _exec } from 'child_process'
import { promisify } from 'util'
import { readdirSync } from 'fs'
import { sendButtons } from '../function/button.js' // <-- DITAMBAHKAN

const exec = promisify(_exec).bind(cp)

let handler = async (m, { conn, usedPrefix, command, text }) => {
    try {
        const pluginsDir = './plugins'
        const pluginFiles = readdirSync(pluginsDir)
            .filter(file => file.endsWith('.js'))
            .sort() 
        
        const pluginNames = pluginFiles.map(file => file.replace('.js', ''))

        if (!text) {
            let response = '*GET PLUGIN - PILIH PLUGIN*\n\n'
            response += 'Gunakan nomor atau nama plugin untuk mengambil kodenya.\n\n'
            response += `*Format:*\n${usedPrefix + command} <nomor> | ${usedPrefix + command} <nama_plugin>\n\n`
            response += '*Daftar Plugin:*\n'
            response += pluginNames.map((name, i) => `${i + 1}. ${name}`).join('\n')
            return m.reply(response)
        }

        let targetPlugin = null
        const inputAsNumber = parseInt(text)

        if (!isNaN(inputAsNumber) && inputAsNumber > 0 && inputAsNumber <= pluginNames.length) {
            targetPlugin = pluginNames[inputAsNumber - 1]
        } 
        else if (pluginNames.includes(text)) {
            targetPlugin = text
        }

        if (!targetPlugin) {
            return m.reply(`*Plugin Tidak Ditemukan.*\n\nInput "${text}" tidak valid. Gunakan *.gp* tanpa argumen untuk melihat daftar plugin yang tersedia.`)
        }

        let result
        try {
            result = await exec(`cat plugins/${targetPlugin}.js`)
        } catch (execError) {
            console.error('Execution error:', execError)
            return m.reply(`*GAGAL MEMBACA FILE PLUGIN*\n\n*Kesalahan:* ${execError.message}`)
        }

        const { stdout, stderr } = result

        if (stderr && stderr.trim()) {
            console.error('Stderr:', stderr)
            return m.reply(`*PERINGATAN SISTEM*\n\n${stderr}`)
        }

        if (stdout && stdout.trim()) {
            const output = stdout.trim()
            
            // --- BAGIAN YANG DIUBAH ---
            // Mengganti m.reply biasa dengan sendButtons
            const buttonPayload = {
                text: output,
                footer: `Klik tombol di bawah untuk menyalin kode plugin.`,
                buttons: [
                    {
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: 'Salin Kode',
                            copy_code: output
                        })
                    }
                ]
            };
            
            await sendButtons(conn, m.chat, buttonPayload, { quoted: m });
            // --- AKHIR BAGIAN YANG DIUBAH ---

        } else {
            return m.reply(`*GAGAL MEMPROSES*\n\nFile *plugins/${targetPlugin}.js* ditemukan namun isinya kosong atau tidak dapat dibaca.`)
        }

    } catch (error) {
        console.error('Handler error:', error)
        return m.reply(`*TERJADI KESALAHAN SISTEM*\n\n*Detail:* ${error.message}`)
    }
}

handler.help = ['gp *<nama_plugin|nomor>*']
handler.tags = ['owner']
handler.command = /^(gp|getplugin)$/i
handler.owner = true

export default handler