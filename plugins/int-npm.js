/*
- @Author: Rafli
- @Feature: NPM Search
- @Description: Cari package di NPM registry.
*/

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*NPM SEARCH*\n\n` +
        `Cari package di NPM registry.\n\n` +
        `*Cara Pakai:* \`${usedPrefix + command} <nama package>\`\n\n` +
        `*Contoh:*\n` +
        `\`${usedPrefix + command} axios\``
    )

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    try {
        const res = await fetch(`https://registry.npmjs.com/-/v1/search?text=${encodeURIComponent(text)}&size=8`)
        const data = await res.json()

        if (!data.objects?.length) {
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
            return m.reply(`Package *${text}* tidak ditemukan.`)
        }

        let msg = `*NPM SEARCH*\n\n`
        msg += `*Query:* ${text}\n`
        msg += `*Ditemukan:* ${data.total} package\n\n`

        data.objects.forEach((item, i) => {
            const pkg   = item.package
            const score = Math.round((item.score?.final || 0) * 100)
            const update = item.updated ? new Date(item.updated).toLocaleDateString('id-ID', {
              day: '2-digit', month: 'long', year: 'numeric'
            }
            ) : '-'

            msg += `*${i + 1}. ${pkg.name}*\n`
            if (pkg.description) {
                msg += `${pkg.description.slice(0, 50)}${pkg.description.length > 50 ? '...' : ''}\n\n`
            }
            if (pkg.publisher?.username) msg += `*Author:* ${pkg.publisher.username}\n`
            msg += `*Version:* ${pkg.version}\n`
            msg += `*Update:* ${update}\n`
            msg += `*Download:* ${item.downloads.monthly}\n`
            msg += `${pkg.links.npm}\n`
            
            if (i < data.objects.length - 1) msg += `\n`
        })

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })
        await conn.sendMessage(m.chat, { text: msg }, { quoted: m })

    } catch (err) {
        console.error('[NPM]', err)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })
        m.reply(`*Gagal mencari package.*\n\n*Error:* ${err.message}`)
    }
}

handler.help    = ['npm *package*']
handler.tags    = ['internet']
handler.command = /^(npm|npmsearch|npmjs)$/i

export default handler