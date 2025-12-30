import fs from 'fs'
import path from 'path'
import syntaxError from 'syntax-error'

let handler = async (m, { conn, usedPrefix, command }) => {
    await m.reply('*Memulai pemindaian semua plugin...*\n\nIni mungkin butuh beberapa saat tergantung jumlah plugin.')

    const pluginsDir = path.join(process.cwd(), 'plugins')
    let files
    try {
        files = fs.readdirSync(pluginsDir).filter(file => file.endsWith('.js'))
    } catch (e) {
        return m.reply(`*Gagal Membaca Direktori Plugin*\n\nError: ${e.message}`)
    }

    let errorCount = 0
    let successCount = 0
    let results = []
    let errorDetails = []

    for (const file of files) {
        const filePath = path.join(pluginsDir, file)
        try {
            const code = fs.readFileSync(filePath, 'utf8')
            const error = syntaxError(code, file, {
                sourceType: 'module',
                allowAwaitOutsideFunction: true
            })

            if (error) {
                errorCount++
                results.push(`❌ *${file}*`)
                errorDetails.push(`*File:* ${file}\n\`\`\`${error}\`\`\``)
            } else {
                successCount++
                // Kita gak perlu nampilin semua yang sukses biar gak spam
                // results.push(`✅ *${file}*`) 
            }
        } catch (e) {
            errorCount++
            results.push(`❌ *${file}* (Gagal baca file)`)
            errorDetails.push(`*File:* ${file}\n\`\`\`${e.message}\`\`\``)
        }
    }

    let replyText = `*HASIL PEMERIKSAAN PLUGIN*\n\n`
    replyText += `*Ringkasan:*\n`
    replyText += `✅ Plugin Tanpa Error: *${successCount}*\n`
    replyText += `❌ Plugin Bermasalah: *${errorCount}*\n`
    replyText += `📁 Total Plugin: *${files.length}*\n\n`

    if (errorCount > 0) {
        replyText += `==============================\n`
        replyText += `*DETAIL ERROR DITEMUKAN:*\n\n`
        replyText += errorDetails.join('\n\n')
    } else {
        replyText += `*Keren! Semua plugin lolos pengecekan syntax.*`
    }
    
    await conn.reply(m.chat, replyText.trim(), m)
}

handler.help = ['cekplugin']
handler.tags = ['owner']
handler.command = /^(cekplugin|checkplugin|plugintest)$/i
handler.owner = true

export default handler