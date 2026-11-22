import cron from 'node-cron'
import moment from 'moment-timezone'
import chalk from 'chalk'

let absenCron = null

export function buildAbsenRecap(session, { now = Date.now() } = {}) {
    if (!session) return '› Belum ada data absen.'
    const isOpen = Boolean(session.open && (!session.closeAt || now < session.closeAt))
    const statusText = isOpen ? '*DIBUKA*' : '*DITUTUP*'
    const dateText = moment(session.startedAt || now).tz('Asia/Jakarta').format('DD/MM/YYYY')

    let text = `╭── ✦ *ABSEN: ${session.title || 'Absen'}* ✦\n`
    text += `• Status: ${statusText}\n`
    text += `• Tanggal: ${dateText}\n`
    if (session.closeAt) {
        const closeTime = moment(session.closeAt).tz('Asia/Jakarta').format('HH:mm')
        text += `• Tutup: *${closeTime} WIB*\n`
    }
    const total = Array.isArray(session.list) ? session.list.length : 0
    text += `• Total Hadir: *${total}*\n\n`

    if (Array.isArray(session.list) && session.list.length > 0) {
        const listText = session.list.map((item, idx) => {
            const timeStr = moment(item.time).tz('Asia/Jakarta').format('HH:mm')
            return `${idx + 1}. ${item.name} (${timeStr})`
        }).join('\n')
        text += `${listText}\n`
    } else {
        text += `› Belum ada yang absen.\n`
    }
    text += `╰━━━━━━━━━━━━━━━━━━━━━━━`
    return text
}

export function initAbsenScheduler(connGetter) {
    if (absenCron) {
        absenCron.stop()
        absenCron = null
    }

    absenCron = cron.schedule('* * * * *', async () => {
        try {
            const conn = typeof connGetter === 'function' ? connGetter() : connGetter
            if (!conn?.user?.id || !global.db?.data?.chats) return

            const now = Date.now()
            const chats = global.db.data.chats

            for (const [jid, chat] of Object.entries(chats)) {
                if (!jid.endsWith('@g.us') || !chat?.absen) continue

                const session = chat.absen
                if (session.open && session.closeAt && now >= session.closeAt) {
                    try {
                        session.open = false
                        global.saveData?.('chats', jid)

                        const recap = buildAbsenRecap(session, { now })
                        const text = `Absen otomatis ditutup.\n\n${recap}`
                        await conn.sendMessage(jid, { text })
                        await new Promise(res => setTimeout(res, 500))
                    } catch (err) {
                        console.error(chalk.red(`[ABSEN CLOSE ERROR] ${jid}:`), err?.message || err)
                    }
                }
            }
        } catch (e) {
            console.error(chalk.red('[ABSEN CRON ERROR]:'), e?.message || e)
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    })
}

export function stopAbsenScheduler() {
    if (absenCron) {
        absenCron.stop()
        absenCron = null
    }
}
