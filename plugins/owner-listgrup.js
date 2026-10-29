/*
 * @Author      : Rafli
 * @Feature     : Group Manager & Inspector
 * @Description : Menampilkan daftar grup yang diikuti bot dengan statistik, pencarian kata kunci, interactive single select list, dan kartu detail grup.
 * @Version     : 2.1 (No Decorational Emoji)
 */

import moment from 'moment-timezone'
import { jidNormalizedUser } from '@whiskeysockets/baileys'

function cleanLID(jid) {
    if (!jid) return null
    const decoded = jidNormalizedUser(jid)
    if (decoded.includes(':') && decoded.endsWith('@lid')) {
        const parts = decoded.split(':')
        return `${parts[0]}@lid`
    }
    return decoded
}

function formatTime(unixTimestamp, withTime = false) {
    if (!unixTimestamp) return '-'
    const ms = unixTimestamp > 10000000000 ? unixTimestamp : unixTimestamp * 1000
    const fmt = withTime ? 'DD/MM/YYYY [pukul] HH:mm [WIB]' : 'DD/MM/YYYY'
    return moment(ms).tz('Asia/Jakarta').format(fmt)
}

function getGroupAge(creationTime) {
    if (!creationTime) return ''
    const ms = creationTime > 10000000000 ? creationTime : creationTime * 1000
    const created = moment(ms).tz('Asia/Jakarta')
    const diff = moment.duration(moment().diff(created))

    const years = diff.years()
    const months = diff.months()
    const days = diff.days()

    const parts = []
    if (years > 0) parts.push(`${years} Thn`)
    if (months > 0) parts.push(`${months} Bln`)
    if (days > 0) parts.push(`${days} Hari`)

    return parts.length > 0 ? `(${parts.join(' ')})` : ''
}

function isBotInParticipantAdmin(participant, botLid, botPhoneJid, botRawPn) {
    if (!participant) return false
    const pId = participant.id ? jidNormalizedUser(participant.id) : ''
    const pPn = participant.phoneNumber ? jidNormalizedUser(participant.phoneNumber) : ''

    const isMe = pId === botLid ||
                 pId === botPhoneJid ||
                 pId.startsWith(botRawPn) ||
                 pPn === botPhoneJid ||
                 pPn.startsWith(botRawPn)

    return isMe && !!participant.admin
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    try {
        const allGroupsMap = await conn.groupFetchAllParticipating()
        const allGroups = Object.values(allGroupsMap || {})

        if (allGroups.length === 0) {
            return m.reply('Bot belum bergabung ke dalam grup manapun.')
        }

        const groups = allGroups.sort((a, b) => (b.creation || 0) - (a.creation || 0))

        const rawBotId = conn.user?.id || ''
        const rawBotLid = conn.user?.lid || ''
        const botLid = cleanLID(rawBotLid || rawBotId)
        const botRawPn = rawBotId.split('@')[0].split(':')[0].replace(/[^0-9]/g, '')
        const botPhoneJid = `${botRawPn}@s.whatsapp.net`

        const query = (text || '').trim()

        if (query && !isNaN(query)) {
            const idx = parseInt(query, 10) - 1
            if (idx >= 0 && idx < groups.length) {
                return await showGroupDetail(m, conn, groups[idx], botLid, botPhoneJid, botRawPn, usedPrefix)
            } else {
                return m.reply(`*Nomor grup tidak valid.*\nGunakan nomor urut antara 1 s/d ${groups.length}.`)
            }
        }

        if (query) {
            const cleanQ = query.toLowerCase()
            const matches = groups.filter(g =>
                g.subject?.toLowerCase().includes(cleanQ) ||
                g.id?.toLowerCase().includes(cleanQ)
            )

            if (matches.length === 1) {
                return await showGroupDetail(m, conn, matches[0], botLid, botPhoneJid, botRawPn, usedPrefix)
            } else if (matches.length > 1) {
                return await renderGroupList(m, conn, matches, usedPrefix, command, botLid, botPhoneJid, botRawPn, `Hasil Pencarian "${query}"`)
            } else {
                return m.reply(`Tidak ditemukan grup dengan kata kunci *"${query}"*.\n\n_Ketik \`${usedPrefix + command}\` untuk melihat seluruh grup._`)
            }
        }

        return await renderGroupList(m, conn, groups, usedPrefix, command, botLid, botPhoneJid, botRawPn)

    } catch (e) {
        console.error('[LISTGROUP ERROR]', e)
        return m.reply(`*Gagal mengambil daftar grup:*\n_${e.message || 'Terjadi kesalahan sistem.'}_`)
    }
}

async function renderGroupList(m, conn, groups, usedPrefix, command, botLid, botPhoneJid, botRawPn, customTitle = null) {
    let adminCount = 0
    let memberCount = 0
    const totalMembers = groups.reduce((sum, g) => sum + (g.participants?.length || 0), 0)

    const rows = []
    groups.forEach((g, idx) => {
        const isBotAdmin = g.participants?.some(p => isBotInParticipantAdmin(p, botLid, botPhoneJid, botRawPn))
        if (isBotAdmin) adminCount++
        else memberCount++

        const badge = isBotAdmin ? 'ADMIN' : 'MEMBER'
        const memberLen = g.participants?.length || 0
        const dateStr = formatTime(g.creation)

        rows.push({
            header: `${idx + 1}. [${badge}]`,
            title: `${g.subject || 'Tanpa Nama'}`,
            description: `${memberLen} Anggota • Dibuat: ${dateStr}`,
            id: `${usedPrefix}listgrup ${idx + 1}`
        })
    })

    const titleText = customTitle || 'DAFTAR GRUP BOT'
    const avgMembers = groups.length > 0 ? Math.round(totalMembers / groups.length) : 0

    const statsText =
        `*${titleText}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
        `*STATISTIK BOT:*\n` +
        `• Total Grup: *${groups.length}*\n` +
        `• Role Admin: *${adminCount}* grup\n` +
        `• Role Member: *${memberCount}* grup\n` +
        `• Total Member: *${totalMembers.toLocaleString('id-ID')}* akun\n` +
        `• Rata-rata: *${avgMembers}* member/grup\n\n` +
        `_Pilih salah satu grup dari menu interaktif di bawah untuk melihat detail lengkap dan link grup._`

    const listSections = [
        {
            title: `Daftar Grup (${groups.length} Grup)`,
            rows: rows.slice(0, 50)
        }
    ]

    try {
        return await conn.sendButton(m.chat, {
            body: statsText,
            footer: `${global.info?.namabot || 'Joy'} • Total ${groups.length} Grup`,
            buttons: [
                {
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: 'PILIH GRUP',
                        sections: listSections
                    })
                }
            ]
        }, { quoted: m })
    } catch (_) {
        let txt = `*${titleText}*\n━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        txt += `*STATISTIK BOT:*\n`
        txt += `• Total Grup: ${groups.length}\n`
        txt += `• Role Admin: ${adminCount} | Role Member: ${memberCount}\n`
        txt += `• Total Member: ${totalMembers.toLocaleString('id-ID')} akun\n\n`
        txt += `*DAFTAR GRUP:*\n\n`

        groups.forEach((group, index) => {
            const isBotAdmin = group.participants?.some(p => isBotInParticipantAdmin(p, botLid, botPhoneJid, botRawPn))
            const badge = isBotAdmin ? '[ADMIN]' : '[MEMBER]'
            txt += `*${index + 1}.* ${badge} *${group.subject}*\n`
            txt += `   └ ${group.participants?.length || 0} Member | Dibuat: ${formatTime(group.creation)}\n`
        })

        txt += `\n━━━━━━━━━━━━━━━━━━━━━━━\n`
        txt += `_Ketik \`${usedPrefix + command} <nomor>\` untuk melihat detail grup._`

        return m.reply(txt.trim())
    }
}

async function showGroupDetail(m, conn, group, botLid, botPhoneJid, botRawPn, usedPrefix) {
    try {
        const meta = await conn.groupMetadata(group.id).catch(() => group)
        const participants = meta.participants || []

        let botRole = 'Member Biasa'
        const botPart = participants.find(p => isBotInParticipantAdmin(p, botLid, botPhoneJid, botRawPn))
        const isBotAdmin = !!botPart

        if (botPart?.admin === 'superadmin') botRole = 'Super Admin (Owner Grup)'
        else if (botPart?.admin === 'admin') botRole = 'Admin Grup'

        const superAdmin = participants.find(p => p.admin === 'superadmin')
        const admins = participants.filter(p => p.admin === 'admin')
        const totalAdmins = admins.length + (superAdmin ? 1 : 0)

        const chatData = global.db?.data?.chats?.[meta.id] || {}

        let ephemeralText = 'Nonaktif'
        if (meta.ephemeralDuration && meta.ephemeralDuration > 0) {
            const dur = meta.ephemeralDuration
            if (dur === 86400) ephemeralText = '24 Jam'
            else if (dur === 604800) ephemeralText = '7 Hari'
            else if (dur === 7776000) ephemeralText = '90 Hari'
            else ephemeralText = `${Math.floor(dur / 86400)} Hari`
        }

        const activeFeatures = []
        if (chatData.mute) activeFeatures.push('Mute')
        if (chatData.antilink) activeFeatures.push('Antilink')
        if (chatData.antidelete) activeFeatures.push('Antidelete')
        if (chatData.antivirtex) activeFeatures.push('Antivirtex')
        if (chatData.autogempa) activeFeatures.push('Auto Gempa')
        if (chatData.sambutan) activeFeatures.push('Welcome')
        if (chatData.detect) activeFeatures.push('Detect')
        if (chatData.jualan) activeFeatures.push('Store')
        if (chatData.sewa) activeFeatures.push('Sewa')

        let inviteUrl = null
        if (isBotAdmin) {
            try {
                const code = await conn.groupInviteCode(meta.id)
                if (code) inviteUrl = `https://chat.whatsapp.com/${code}`
            } catch (_) {}
        }

        let avatarBuffer = null
        try {
            const ppUrl = await conn.profilePictureUrl(meta.id, 'image')
            if (ppUrl) {
                const imgRes = await fetch(ppUrl)
                if (imgRes.ok) {
                    avatarBuffer = Buffer.from(await imgRes.arrayBuffer())
                }
            }
        } catch (_) {}

        const ownerJid = meta.owner || superAdmin?.id || null
        const ownerMention = ownerJid ? `@${ownerJid.split('@')[0].split(':')[0]}` : 'Tidak diketahui'

        let detailText =
            `*DETAIL GRUP: ${meta.subject?.toUpperCase() || 'GRUP'}*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
            `*INFORMASI DASAR:*\n` +
            `• *Nama Grup:* ${meta.subject || 'Tanpa Nama'}\n` +
            `• *ID Grup:* \`${meta.id}\`\n` +
            `• *Total Member:* ${meta.participants?.length || 0} akun\n` +
            `• *Total Admin:* ${totalAdmins} orang\n` +
            `• *Owner Grup:* ${ownerMention}\n` +
            `• *Dibuat Pada:* ${formatTime(meta.creation, true)}\n` +
            `• *Usia Grup:* ${getGroupAge(meta.creation) || '-'}\n\n` +
            `*STATUS BOT DI GRUP:*\n` +
            `• *Peran Bot:* ${botRole}\n` +
            `• *Fitur Aktif:* ${activeFeatures.length > 0 ? activeFeatures.join(', ') : 'Default'}\n\n` +
            `*PENGATURAN GRUP:*\n` +
            `• *Edit Info:* ${meta.restrict ? 'Hanya Admin' : 'Semua Member'}\n` +
            `• *Kirim Pesan:* ${meta.announce ? 'Hanya Admin' : 'Semua Member'}\n` +
            `• *Pesan Sementara:* ${ephemeralText}\n` +
            `• *Persetujuan Masuk:* ${meta.joinApprovalMode ? 'Aktif' : 'Nonaktif'}\n` +
            `• *Komunitas:* ${meta.isCommunity ? 'Ya' : 'Tidak'}\n`

        if (inviteUrl) {
            detailText += `• *Link Undangan:* ${inviteUrl}\n`
        }

        if (meta.desc) {
            const cleanDesc = meta.desc.trim().substring(0, 300)
            detailText += `\n*Deskripsi Grup:*\n${cleanDesc}${meta.desc.length > 300 ? '...' : ''}\n`
        }

        detailText += `━━━━━━━━━━━━━━━━━━━━━━━`

        const mentions = ownerJid ? [ownerJid] : []

        const buttons = [
            {
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Salin ID Grup',
                    copy_code: meta.id
                })
            }
        ]

        if (inviteUrl) {
            buttons.push({
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Buka Link Grup',
                    url: inviteUrl,
                    merchant_url: inviteUrl
                })
            })
            buttons.push({
                name: 'cta_copy',
                buttonParamsJson: JSON.stringify({
                    display_text: 'Salin Link Invite',
                    copy_code: inviteUrl
                })
            })
        }

        try {
            if (avatarBuffer) {
                return await conn.sendButton(m.chat, {
                    image: avatarBuffer,
                    body: detailText,
                    footer: `${global.info?.namabot || 'Joy'} • Group Detail`,
                    buttons
                }, { quoted: m, mentions })
            } else {
                return await conn.sendButton(m.chat, {
                    body: detailText,
                    footer: `${global.info?.namabot || 'Joy'} • Group Detail`,
                    buttons
                }, { quoted: m, mentions })
            }
        } catch (_) {
            if (avatarBuffer) {
                return await conn.sendMessage(m.chat, {
                    image: avatarBuffer,
                    caption: detailText,
                    mentions
                }, { quoted: m })
            } else {
                return await conn.reply(m.chat, detailText, m, { mentions })
            }
        }

    } catch (err) {
        console.error('[GROUP DETAIL ERROR]', err)
        return m.reply(`*Gagal mengambil detail grup:*\n_${err.message}_`)
    }
}

handler.help    = ['listgrup'];
handler.tags    = ['owner'];
handler.command = /^(list(grup|gc|groups?)|groups?list)$/i;
handler.owner   = true;

export default handler;