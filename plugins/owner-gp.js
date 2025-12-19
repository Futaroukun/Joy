import cp, { exec as _exec } from 'child_process'
import { promisify } from 'util'
import { readdirSync } from 'fs'

const exec = promisify(_exec).bind(cp)

let handler = async (m, {
    conn,
    usedPrefix,
    command,
    text
}) => {
    try {
        let featuresFiles = readdirSync('./plugins').filter(file => file.endsWith('.js'))
        let featureNames = featuresFiles.map(v => v.replace('.js', ''))
        
        if (!text) {
            return m.reply(
                '*NAMA PLUGIN DIPERLUKAN*\n\n' +
                '*Format penggunaan:*\n' +
                '*' + usedPrefix + command + ' <nama_plugin>*\n\n' +
                '*Daftar Plugin yang tersedia:*\n' +
                featureNames.map(v => ' • ' + v).join('\n')
            )
        }
        
        if (!featureNames.includes(text)) {
            return m.reply(
                '*PLUGIN TIDAK DITEMUKAN*\n\n' +
                '*Daftar plugin yang tersedia:*\n' +
                featureNames.map(v => ' • ' + v).join('\n')
            )
        }
        
        let result
        try {
            result = await exec(`cat plugins/${text}.js`)
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
            
            // Mengirimkan kode plugin secara langsung
            return m.reply(output)
        } else {
            return m.reply(`*GAGAL MEMPROSES*\n\nFile *plugins/${text}.js* ditemukan namun isinya kosong atau tidak dapat dibaca.`)
        }
        
    } catch (error) {
        console.error('Handler error:', error)
        return m.reply(`*TERJADI KESALAHAN SISTEM*\n\n*Detail:* ${error.message}`)
    }
}

handler.help = ['gp <nama_plugin>']
handler.tags = ['owner']
handler.command = /^(gp|getplugin)$/i
handler.owner = true

export default handler