import moment from 'moment-timezone'

let handler = async (m, { conn }) => {
    try {
        const meta = await conn.groupMetadata(m.chat)
        
        let pp
        try {
            pp = await conn.profilePictureUrl(meta.id, 'image')
        } catch (e) {
            pp = 'https://api.cloudsky.biz.id/file?key=kurumi-bot/1767587846103.jpg'
        }

        const formatTime = (unixTimestamp) => {
            if (!unixTimestamp) return '-'
            return moment(unixTimestamp * 1000).tz('Asia/Jakarta').format('DD/MM/YYYY HH:mm:ss')
        }

        const getGroupAge = (creationTime) => {
            if (!creationTime) return ''
            const created = moment(creationTime * 1000)
            const diff = moment.duration(moment().diff(created))
            const years = diff.years() > 0 ? `${diff.years()} Tahun ` : ''
            const months = diff.months() > 0 ? `${diff.months()} Bulan ` : ''
            const days = diff.days() > 0 ? `${diff.days()} Hari` : ''
            return `(${years}${months}${days})`.trim()
        }

        const getJid = (pn, id) => pn || id || ''
        
        const ownerJid = getJid(meta.ownerPn, meta.owner)
        const nameSetterJid = getJid(meta.subjectOwnerPn, meta.subjectOwner)
        const descSetterJid = getJid(meta.descOwnerPn, meta.descOwner)
        
        const participants = meta.participants || []
        const superAdmin = participants.find(p => p.admin === 'superadmin')
        const admins = participants.filter(p => p.admin === 'admin')
        
        const isRestrict = meta.restrict ? 'Hanya Admin' : 'Semua Peserta'
        const isAnnounce = meta.announce ? 'Ditutup (Admin)' : 'Terbuka (Semua)'
        const isApproval = meta.joinApprovalMode ? 'Butuh Persetujuan' : 'Langsung Masuk'
        const isCommunity = meta.isCommunity ? 'Ya' : 'Tidak'

        let ephe
        if (meta.ephemeralDuration === 86400) {
            ephe = '24 Jam'
        } else if (meta.ephemeralDuration === 604800) {
            ephe = '7 Hari'
        } else if (meta.ephemeralDuration === 7776000) {
            ephe = '90 Hari'
        } else if (meta.ephemeralDuration > 0) {
            ephe = `${Math.floor(meta.ephemeralDuration / 86400)} Hari`
        } else {
            ephe = 'Mati'
        }

        let txt = `*GROUP METADATA INSPECTOR*\n`
        txt += `━━━━━━━━━━━━━━━━━━━━━━━\n\n`
        
        txt += `*INFORMASI DASAR*\n`
        txt += `• Nama: ${meta.subject}\n`
        txt += `• ID: ${meta.id}\n`
        txt += `• Member: ${meta.size} Peserta\n`
        txt += `• Dibuat: ${formatTime(meta.creation)}\n`
        txt += `• Umur: ${getGroupAge(meta.creation)}\n`
        txt += `• Pemilik: @${ownerJid.split('@')[0]}\n\n`

        txt += `*STATUS PENGATURAN*\n`
        txt += `• Edit Info Grup: ${isRestrict}\n`
        txt += `• Kirim Pesan: ${isAnnounce}\n`
        txt += `• Approval Join: ${isApproval}\n`
        txt += `• Pesan Sementara: ${ephe}\n`
        txt += `• Komunitas: ${isCommunity}\n\n`

        txt += `*RIWAYAT PERUBAHAN*\n`
        txt += `• Nama Diganti Oleh: @${nameSetterJid.split('@')[0]}\n`
        txt += `  └ Waktu: ${formatTime(meta.subjectTime)}\n`
        txt += `• Deskripsi Diganti Oleh: ${descSetterJid ? '@' + descSetterJid.split('@')[0] : '-'}\n`
        txt += `  └ Waktu: ${formatTime(meta.descTime)}\n\n`

        txt += `*STRUKTUR ADMIN (${admins.length + (superAdmin ? 1 : 0)})*\n`
        if (superAdmin) {
            let saId = superAdmin.phoneNumber || superAdmin.id
            txt += `• Super Admin: @${saId.split('@')[0]}\n`
        }
        
        const maxAdminsShow = 15
        admins.slice(0, maxAdminsShow).forEach(a => {
            let aId = a.phoneNumber || a.id
            txt += `• @${aId.split('@')[0]}\n`
        })
        if (admins.length > maxAdminsShow) {
            txt += `...dan ${admins.length - maxAdminsShow} admin lainnya.\n`
        }
        
        txt += `\n*DESKRIPSI GRUP:*\n`
        txt += `━━━━━━━━━━━━━━━━━━━━━━━\n`
        txt += `${meta.desc || 'Gak ada deskripsi.'}`

        const mentions = [
            ownerJid, 
            nameSetterJid, 
            descSetterJid, 
            (superAdmin?.phoneNumber || superAdmin?.id),
            ...admins.map(a => a.phoneNumber || a.id)
        ].filter(v => v)

        await conn.sendMessage(m.chat, {
            text: txt,
            contextInfo: {
                mentionedJid: [...new Set(mentions)],
                externalAdReply: {
                    title: meta.subject,
                    body: `Dibuat: ${formatTime(meta.creation)} | Member: ${meta.size}`,
                    thumbnailUrl: pp,
                    sourceUrl: null,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (e) {
        console.error(e)
        m.reply('*Gagal ambil metadata. Pastiin bot jadi admin atau coba lagi.*')
    }
}

handler.help = ['inspect']
handler.tags = ['group']
handler.command = /^(inspect|gdetail|groupdetail|cekid)$/i
handler.group = true

export default handler