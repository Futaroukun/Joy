let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`*CARA ORDER*\n\nKetik: \`${usedPrefix + command}\` *nama_item | catatan*\n\nContoh:\n\`${usedPrefix + command}\] *Diamond ML 100dm | ID: 123456 (2020)*`)

    let [item, note] = text.split('|').map(v => v.trim())
    note = note || '-'

    const ownerNumber = global.owner[0] 
    const ownerJid = ownerNumber + '@s.whatsapp.net' 

    let reportText = `*PESANAN BARU MASUK*\n\n`
    reportText += `*Pembeli:* @${m.sender.split('@')[0]}\n`
    reportText += `*Item:* ${item}\n`
    reportText += `*Catatan:* ${note}\n\n`
    reportText += `*OPSI KONFIRMASI:*\n`
    reportText += `Balas pesan ini pake:\n`
    reportText += `*terima* - Proses & Kirim Kontak.\n`
    reportText += `*tolak* - Tolak order.`

    try {
        let msgToOwner = await conn.sendMessage(ownerJid, { 
            text: reportText, 
            mentions: [m.sender],
            contextInfo: {
                externalAdReply: {
                    title: "NEW ORDER RECEIVED",
                    body: `Item: ${item}`,
                    thumbnailUrl: "https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg",
                    sourceUrl: `https://wa.me/${m.sender.split('@')[0]}`,
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        })

        conn.orderSession = conn.orderSession || {}
        conn.orderSession[msgToOwner.key.id] = {
            stage: 'confirm',
            customer: m.sender,
            item: item,
            note: note,
            orderDate: new Date(),
            timeout: setTimeout(() => {
                if (conn.orderSession && conn.orderSession[msgToOwner.key.id]) {
                    delete conn.orderSession[msgToOwner.key.id]
                }
            }, 86400000)
        }

        m.reply(`*ORDER DITERIMA SISTEM*\n\nPesanan *${item}* udah diterusin ke admin. Tunggu konfirmasi selanjutnya ya!`)

    } catch (e) {
        console.error(e)
        m.reply('*Gagal ngirim laporan ke owner.*')
    }
}

handler.before = async (m, { conn }) => {
    conn.orderSession = conn.orderSession || {}
    
    if (!m.quoted || !m.quoted.id) return false 
    if (!conn.orderSession[m.quoted.id]) return false 

    const session = conn.orderSession[m.quoted.id]
    const txt = (m.text || '').toLowerCase()

    if (session.stage === 'confirm') {
        if (['terima', 'acc', 'proses', 'y'].includes(txt)) {
            clearTimeout(session.timeout)
            delete conn.orderSession[m.quoted.id]

            try {
                await conn.sendMessage(session.customer, { 
                    text: `*PESANAN DIKONFIRMASI*\n\nHalo kak, pesanan *${session.item}* lagi diproses admin. Ditunggu chat selanjutnya ya!`
                })

                await m.reply(`*SUKSES*\nOrder diterima. Notifikasi udah dikirim ke pembeli.`)

                const customerJid = await conn.getLidPN(session.customer);
                if (!customerJid) throw new Error('Gagal dapet nomor WA pembeli.')
                
                const pNumber = customerJid.split('@')[0]
                const pName = "Pembeli " + session.item.substr(0, 10)
                
                const vcard = 'BEGIN:VCARD\n' 
                    + 'VERSION:3.0\n' 
                    + `FN:${pName}\n` 
                    + `TEL;type=CELL;type=VOICE;waid=${pNumber}:${pNumber}\n` 
                    + 'END:VCARD'

                await conn.sendMessage(m.chat, { 
                    contacts: { 
                        displayName: pName, 
                        contacts: [{ vcard }] 
                    }
                }, { quoted: m })

            } catch (e) {
                console.log('Gagal kirim kontak/pesan', e)
            }
            return true
        }

        else if (['tolak', 'cancel', 'n'].includes(txt)) {
            clearTimeout(session.timeout)
            delete conn.orderSession[m.quoted.id]

            let msgAskReason = await m.reply(
                `*MENOLAK ORDER*\n\n` +
                `Balas pesan ini pake alasannya.\n` +
                `Contoh: *Stok abis kak*`
            )

            conn.orderSession[msgAskReason.key.id] = {
                ...session, 
                stage: 'reason', 
                timeout: setTimeout(() => {
                    if (conn.orderSession[msgAskReason.key.id]) {
                        delete conn.orderSession[msgAskReason.key.id]
                    }
                }, 300000)
            }
            return true
        }
    }

    else if (session.stage === 'reason') {
        clearTimeout(session.timeout)
        delete conn.orderSession[m.quoted.id]

        let alasan = m.text || 'Gak disebutin.'

        try {
            await conn.sendMessage(session.customer, { 
                text: `*PESANAN DITOLAK*\n\n` +
                      `Item: ${session.item}\n` +
                      `Status: Dibatalkan admin\n` +
                      `Alasan: *${alasan}*\n\n` +
                      `Maaf ya kak atas ketidaknyamanannya.`
            })
            await m.reply(`*BERHASIL*\nNotifikasi penolakan udah dikirim. Sesi ditutup.`)
        } catch (e) {
            console.log('Gagal kirim pesan tolak')
        }
        return true
    }

    return false
}

handler.help = ['order *item*']
handler.tags = ['store']
handler.command = /^(order|beli)$/i

export default handler