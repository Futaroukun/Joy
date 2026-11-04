/*
- @Author: Rafli
- @Feature: TikTok User Stalker
- @Description: Cari info profil TikTok via Nexray API & Direct Web Fallback.
*/

async function tiktokStalk(username) {
    const cleanUser = username.replace(/^@/, '').trim()
    
    // 1. Primary Engine: Nexray Stalker API
    try {
        const res = await fetch(`https://api.nexray.web.id/api/stalker/tiktok?username=${encodeURIComponent(cleanUser)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            signal: AbortSignal.timeout(15000)
        })
        if (res.ok) {
            const json = await res.json()
            if (json.status && json.result) {
                const r = json.result
                return {
                    name: r.name || r.username,
                    handle: '@' + (r.username || cleanUser),
                    avatar: r.avatar || null,
                    region: r.region || 'N/A',
                    bio: r.bio || 'Tidak ada bio.',
                    verified: r.verified === 'Verified' || r.verified === true,
                    stats: {
                        followers: r.stats?.followers || String(r.stats?.raw_followers || 0),
                        following: r.stats?.following || String(r.stats?.raw_following || 0),
                        likes: r.stats?.likes || String(r.stats?.raw_likes || 0),
                        videos: r.stats?.videos || String(r.stats?.raw_videos || 0),
                        friends: r.stats?.friend || '0'
                    },
                    created: r.create_time ? new Date(r.create_time * 1000).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : 'N/A'
                }
            }
        }
    } catch (_) {}

    // 2. Fallback: Direct Web Scraper
    try {
        const res = await fetch(`https://www.tiktok.com/@${cleanUser}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(15000)
        })
        const html = await res.text()
        const jsonMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/)
        if (jsonMatch) {
            const data = JSON.parse(jsonMatch[1])
            const userInfo = data.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo
            if (userInfo?.user) {
                const u = userInfo.user
                const s = userInfo.stats || {}
                return {
                    name: u.nickname || u.uniqueId,
                    handle: '@' + u.uniqueId,
                    avatar: u.avatarLarger || u.avatarThumb || null,
                    region: u.region || 'N/A',
                    bio: u.signature || 'Tidak ada bio.',
                    verified: Boolean(u.verified),
                    stats: {
                        followers: Number(s.followerCount || 0).toLocaleString('id-ID'),
                        following: Number(s.followingCount || 0).toLocaleString('id-ID'),
                        likes: Number(s.heartCount || 0).toLocaleString('id-ID'),
                        videos: Number(s.videoCount || 0).toLocaleString('id-ID'),
                        friends: '0'
                    },
                    created: 'N/A'
                }
            }
        }
    } catch (_) {}

    throw new Error('USER_NOT_FOUND')
}

let handler = async (m, { conn, args, command, usedPrefix }) => {
    if (!args[0]) {
        return m.reply(
            `*TIKTOK STALKER*\n\n` +
            `Cari info profil TikTok siapapun.\n\n` +
            `*Penggunaan:* \`${usedPrefix + command} <username>\`\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command} tiktok\`\n` +
            `\`${usedPrefix + command} @khaby.lame\``
        )
    }
    const username = args[0].replace(/^@/, '').trim()
    if (!username) return m.reply('Username tidak valid.')

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {})

    let loadingMsg = null
    try {
        loadingMsg = await m.reply(`_Mencari data @${username}..._`)

        const res = await tiktokStalk(username)

        let caption =
            `╭── ✦ *TIKTOK STALKER* ✦\n` +
            `• *Nama:* ${res.name} ${res.verified ? '✓' : ''}\n` +
            `• *Username:* ${res.handle}\n` +
            `• *Region:* ${res.region}\n` +
            `• *Dibuat:* ${res.created}\n\n` +
            `• *Bio:*\n  _${res.bio}_\n\n` +
            `╭── ✦ *STATISTIK* ✦\n` +
            `• *Followers:* ${res.stats.followers}\n` +
            `• *Following:* ${res.stats.following}\n` +
            `• *Total Likes:* ${res.stats.likes}\n` +
            `• *Video:* ${res.stats.videos}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n` +
            `https://tiktok.com/${res.handle}`

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
        }

        if (res.avatar) {
            await conn.sendMessage(m.chat, {
                image: { url: res.avatar },
                caption: caption
            }, { quoted: m })
        } else {
            await m.reply(caption)
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (e) {
        console.error('[TTSTALK]', e.message)

        if (loadingMsg?.key) {
            await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
        }

        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})

        if (e.message === 'USER_NOT_FOUND') {
            return m.reply(
                `*User tidak ditemukan.*\n\n` +
                `Username *@${username}* tidak ditemukan di TikTok atau akun bersifat privat.`
            )
        }

        m.reply(`*Gagal mengambil data.*\n\n${e.message}`)
    }
}

handler.help    = ['ttstalk *username*']
handler.tags    = ['internet']
handler.command = /^(ttstalk|tiktokstalk)$/i

export default handler
