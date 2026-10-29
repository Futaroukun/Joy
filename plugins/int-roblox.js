/*
 * @Author      : Rafli
 * @Feature     : Roblox Intelligence & Profile Inspector
 * @Description : Pelacak profil pengguna Roblox resmi (3D Avatar HD, status online, statistik sosial, dan biodata) tanpa dependensi pihak ketiga.
 */

import fetch from 'node-fetch'
import moment from 'moment-timezone'
import { sendButtons } from '../function/media/button.js'

/**
 * Mengambil data pengguna Roblox dari API resmi Roblox
 */
async function fetchRobloxUser(target) {
    let userId = null
    let queryName = null

    const clean = target.trim()
    const urlMatch = clean.match(/roblox\.com\/users\/(\d+)/i)

    if (urlMatch) {
        userId = urlMatch[1]
    } else if (/^\d+$/.test(clean)) {
        userId = clean
    } else {
        queryName = clean.replace(/^@/, '')
        const userRes = await fetch('https://users.roblox.com/v1/usernames/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usernames: [queryName], excludeBannedUsers: false }),
            timeout: 8000
        })

        if (!userRes.ok) throw new Error(`Gagal mencari username (HTTP ${userRes.status})`)
        const userData = await userRes.json()

        if (userData.data?.length > 0) {
            userId = userData.data[0].id
        }
    }

    if (!userId) {
        throw new Error(`Pengguna Roblox "${target}" tidak ditemukan. Pastikan username atau ID sudah benar.`)
    }

    // Ambil data secara paralel langsung dari endpoint resmi Roblox
    const [infoRes, thumbRes, headshotRes, friendsRes, followersRes, followingsRes, presRes, wearingRes] = await Promise.allSettled([
        fetch(`https://users.roblox.com/v1/users/${userId}`, { timeout: 8000 }).then(r => r.json()),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar?userIds=${userId}&size=720x720&format=Png&isCircular=false`, { timeout: 8000 }).then(r => r.json()),
        fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=420x420&format=Png&isCircular=false`, { timeout: 8000 }).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/friends/count`, { timeout: 8000 }).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followers/count`, { timeout: 8000 }).then(r => r.json()),
        fetch(`https://friends.roblox.com/v1/users/${userId}/followings/count`, { timeout: 8000 }).then(r => r.json()),
        fetch('https://presence.roblox.com/v1/presence/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userIds: [userId] }),
            timeout: 8000
        }).then(r => r.json()),
        fetch(`https://avatar.roblox.com/v1/users/${userId}/currently-wearing`, { timeout: 8000 }).then(r => r.json())
    ])

    const info = infoRes.status === 'fulfilled' ? infoRes.value : {}
    if (!info.id) throw new Error('Data profil pengguna tidak dapat dimuat dari server Roblox.')

    const thumbUrl = thumbRes.status === 'fulfilled' ? thumbRes.value?.data?.[0]?.imageUrl : null
    const headshotUrl = headshotRes.status === 'fulfilled' ? headshotRes.value?.data?.[0]?.imageUrl : null
    const friendsCount = friendsRes.status === 'fulfilled' ? (friendsRes.value?.count ?? 0) : 0
    const followersCount = followersRes.status === 'fulfilled' ? (followersRes.value?.count ?? 0) : 0
    const followingsCount = followingsRes.status === 'fulfilled' ? (followingsRes.value?.count ?? 0) : 0
    const presData = presRes.status === 'fulfilled' ? presRes.value?.userPresences?.[0] : null
    const wearingCount = wearingRes.status === 'fulfilled' ? (wearingRes.value?.assetIds?.length ?? 0) : 0

    let presenceStatus = 'Offline'
    if (presData) {
        if (presData.userPresenceType === 1) presenceStatus = 'Online (Website / App)'
        else if (presData.userPresenceType === 2) presenceStatus = `Sedang Bermain Game ${presData.lastLocation ? `(${presData.lastLocation})` : ''}`
        else if (presData.userPresenceType === 3) presenceStatus = 'Di Roblox Studio (Membuat Game)'
    }

    return {
        userId: info.id,
        username: info.name,
        displayName: info.displayName || info.name,
        description: info.description ? info.description.trim() : '',
        created: info.created,
        isBanned: info.isBanned === true,
        hasVerifiedBadge: info.hasVerifiedBadge === true,
        friendsCount,
        followersCount,
        followingsCount,
        presenceStatus,
        wearingCount,
        thumbUrl,
        headshotUrl,
        profileUrl: `https://www.roblox.com/users/${info.id}/profile`
    }
}

let handler = async (m, { conn, text, usedPrefix, command, args }) => {
    if (!text?.trim()) {
        return m.reply(
            `*ROBLOX PROFILE STALKER*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `Cari informasi lengkap akun Roblox, status online, statistik teman, dan render 3D avatar.\n\n` +
            `*Format Penggunaan:*\n` +
            `• \`${usedPrefix + command} <username/id/link>\`\n` +
            `• \`${usedPrefix + command} avatar <username/id>\` (Render Full Body HD)\n` +
            `• \`${usedPrefix + command} headshot <username/id>\` (Foto Headshot)\n\n` +
            `*Contoh:*\n` +
            `• \`${usedPrefix + command} Builderman\`\n` +
            `• \`${usedPrefix + command} 156\`\n` +
            `• \`${usedPrefix + command} avatar Roblox\``
        )
    }

    await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } }).catch(() => {})

    try {
        const sub = (args[0] || '').toLowerCase()
        let mode = 'full'
        let target = text.trim()

        if (sub === 'avatar' || sub === 'full' || sub === 'skin') {
            mode = 'avatar'
            target = args.slice(1).join(' ').trim()
        } else if (sub === 'headshot' || sub === 'head' || sub === 'pp') {
            mode = 'headshot'
            target = args.slice(1).join(' ').trim()
        }

        if (!target) {
            return m.reply(`Masukkan username atau ID Roblox.\nContoh: \`${usedPrefix + command} ${sub} Builderman\``)
        }

        const data = await fetchRobloxUser(target)

        // Mode: Avatar 3D HD Only
        if (mode === 'avatar') {
            const imgUrl = data.thumbUrl || data.headshotUrl
            if (!imgUrl) return m.reply('Gambar avatar tidak tersedia.')
            const caption =
                `*ROBLOX AVATAR RENDER (3D)*\n\n` +
                `• *Username:* @${data.username} (${data.displayName})\n` +
                `• *User ID:* ${data.userId}\n` +
                `• *Aksesoris:* ${data.wearingCount} Item\n` +
                `• *Profil:* ${data.profileUrl}`

            await conn.sendMessage(m.chat, {
                image: { url: imgUrl },
                caption: caption.trim()
            }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return
        }

        // Mode: Headshot Only
        if (mode === 'headshot') {
            const imgUrl = data.headshotUrl || data.thumbUrl
            if (!imgUrl) return m.reply('Foto headshot tidak tersedia.')
            const caption =
                `*ROBLOX AVATAR HEADSHOT*\n\n` +
                `• *Username:* @${data.username} (${data.displayName})\n` +
                `• *User ID:* ${data.userId}\n` +
                `• *Profil:* ${data.profileUrl}`

            await conn.sendMessage(m.chat, {
                image: { url: imgUrl },
                caption: caption.trim()
            }, { quoted: m })
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
            return
        }

        // Mode: Full Profile Stalker
        let joinDate = '-'
        let accountAge = '-'
        if (data.created) {
            moment.locale('id')
            const mDate = moment(data.created).tz('Asia/Jakarta')
            joinDate = mDate.format('DD MMMM YYYY')
            accountAge = moment(data.created).fromNow()
        }

        let caption =
            `*ROBLOX USER PROFILE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `╭── ✦ *INFO PENGGUNA* ✦\n` +
            `│ • Display Name: ${data.displayName}\n` +
            `│ • Username: @${data.username}\n` +
            `│ • User ID: ${data.userId}\n` +
            `│ • Status Akun: ${data.isBanned ? 'Banned (Diblokir)' : 'Aktif'}\n` +
            `│ • Verified Badge: ${data.hasVerifiedBadge ? 'Ya (Terverifikasi)' : 'Tidak'}\n` +
            `│ • Bergabung: ${joinDate}\n` +
            `│ • Umur Akun: ${accountAge}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `╭── ✦ *AKTIVITAS & SOSIAL* ✦\n` +
            `│ • Status Online: ${data.presenceStatus}\n` +
            `│ • Teman: ${data.friendsCount.toLocaleString('id-ID')} Teman\n` +
            `│ • Pengikut: ${data.followersCount.toLocaleString('id-ID')} Pengikut\n` +
            `│ • Mengikuti: ${data.followingsCount.toLocaleString('id-ID')} Pengguna\n` +
            `│ • Aksesoris Dipakai: ${data.wearingCount} Item\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`

        if (data.description) {
            caption +=
                `╭── ✦ *BIOGRAFI / TENTANG* ✦\n` +
                `│ ${data.description.replace(/\n+/g, '\n│ ')}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        }

        caption += `• *URL Profil:* ${data.profileUrl}`

        const buttons = [
            {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Buka Profil Roblox',
                    url: data.profileUrl
                })
            },
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Salin User ID',
                    copy_code: String(data.userId)
                })
            }
        ]

        const imgUrl = data.thumbUrl || data.headshotUrl

        if (imgUrl) {
            try {
                await conn.sendMessage(m.chat, {
                    image: { url: imgUrl },
                    caption: caption.trim()
                }, { quoted: m })
                await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})
                return
            } catch (err) {
                console.warn('[ROBLOX] Gagal kirim gambar:', err.message)
            }
        }

        try {
            await sendButtons(conn, m.chat, {
                text: caption.trim(),
                footer: 'Joy Roblox Stalker',
                buttons
            }, { quoted: m })
        } catch {
            await m.reply(caption.trim())
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {})

    } catch (e) {
        console.error('[ROBLOX ERROR]', e)
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {})
        m.reply(`*Gagal memuat profil Roblox:*\n${e.message}`)
    }
}

handler.help = ['roblox *username/id/link*']
handler.tags    = ['internet']
handler.command = /^(roblox|rblx|stalkroblox)$/i

export default handler