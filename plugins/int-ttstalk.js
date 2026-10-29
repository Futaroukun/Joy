/*
- @Author: Rafli
- @Feature: TikTok User Stalker
- @Description: Cari info profil TikTok via TikMatrix scraper.
*/

import axios from 'axios'
import * as cheerio from 'cheerio'
import * as https from 'https'

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
})

async function tiktokStalk(username) {
    const { data: html } = await axios.get(
        `https://user.tikmatrix.com/?username=${encodeURIComponent(username)}`,
        {
            httpsAgent,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
            },
            timeout: 15000
        }
    )

    const $ = cheerio.load(html)

    const userName = $('.user-name').text().trim()
    if (!userName) throw new Error('USER_NOT_FOUND')

    const avatar = $('.user-avatar').attr('src') || null

    const handle = $('.user-handle').text().trim()

    const metaItems = []
    $('.meta-item').each((_, el) => {
        const spans = $(el).find('span')
        if (spans.length >= 2) {
            metaItems.push($(spans[1]).text().trim())
        }
    })
    const region   = metaItems[0] || 'N/A'
    const language = metaItems[1] || 'N/A'

    const bio     = $('.user-bio p').text().trim() || 'N/A'
    const bioLink = $('.bio-link').text().trim() || 'N/A'

    const stats = {}
    $('.stat-card').each((_, el) => {
        const number = $(el).find('.stat-number').text().trim()
        const label  = $(el).find('.stat-label').text().trim()
        stats[label] = number
    })

    const details = {}
    $('.detail-item').each((_, el) => {
        const label = $(el).find('.detail-label').text().trim().replace(':', '')
        let valueElement = $(el).find('.detail-value')
        let value = ''
        if (valueElement.length > 0) {
            value = valueElement.clone().children().remove().end().text().trim()
        } else {
            value = $(el).contents().last().text().trim()
        }
        details[label] = value
    })

    return {
        name: userName,
        handle,
        avatar,
        region,
        language,
        bio,
        bioLink,
        stats,
        details
    }
}

function formatDate(dateString) {
    if (!dateString || dateString === 'N/A') return 'N/A'
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return dateString.split(',')[0];
    }
}

let handler = async (m, { conn, args, command, usedPrefix }) => {
    if (!args[0]) {
        return m.reply(
            `*TIKTOK STALKER*\n\n` +
            `Cari info profil TikTok siapapun.\n\n` +
            `*Penggunaan:* \`${usedPrefix + command} <username>\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} tiktok\`\n` +
            `\`${usedPrefix + command} @rafli_editz2\``
        )
    }
    const username = args[0].replace(/^@/, '').trim()
    if (!username) return m.reply('Username tidak valid.')

    await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    let loadingMsg
    try {
        loadingMsg = await m.reply(`_Mencari data @${username}..._`)

        const res = await tiktokStalk(username)

        const followers = res.stats['👥 Followers'] || '0'
        const following = res.stats['Following'] || '0'
        const hearts = res.stats['❤️ Hearts'] || '0'
        const friends = res.stats['👫 Friends'] || '0'
        const createdRaw = res.details['Account Created']?.trim()              || 'N/A'
        const created = formatDate(createdRaw)

        let caption =
            `*TIKTOK STALKER*\n\n` +
            `*Nama:* ${res.name}\n` +
            `*Username:* ${res.handle}\n` +
            `*Region:* ${res.region}\n\n` +
            `*Bio:*\n${res.bio}\n` +
            (res.bioLink !== 'N/A' && res.bioLink !== '' ? `*Link:* ${res.bioLink}\n` : '') +
            `\n*Statistik:*\n` +
            `Followers: ${followers}\n` +
            `Following: ${following}\n` +
            `Suka: ${hearts}\n` +
            `Teman: ${friends}\n` +
            `Dibuat: ${created}\n` +
            `https://tiktok.com/${res.handle}`

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})        }

        if (res.avatar) {
            await conn.sendMessage(m.chat, {
                image  : { url: res.avatar },
                caption: caption
            }, { quoted: m })
        } else {
            await m.reply(caption)
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } })

    } catch (e) {
        console.error('[TTSTALK]', e.message)

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
        }

        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } })

        if (e.message === 'USER_NOT_FOUND') {
            return m.reply(
                `*User tidak ditemukan.*\n\n` +
                `Username *@${username}* tidak ada di TikTok atau belum pernah terindeks.\n\n` +
                `Pastikan username sudah benar.`
            )
        }

        m.reply(`*Gagal mengambil data.*\n\n${e.message}`)
    }
}

handler.help    = ['ttstalk *username*']
handler.tags    = ['internet']
handler.command = /^(ttstalk|tiktokstalk)$/i

export default handler