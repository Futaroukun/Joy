/*
 * @Author     : Rafli & Antigravity
 * @Feature    : Auto Open & Close Group Scheduler
 * @Description: Jadwal otomatis buka dan tutup grup WhatsApp harian berdasarkan waktu kustom per-grup.
 */

import cron from 'node-cron'
import moment from 'moment-timezone'
import chalk from 'chalk'

let autoGroupCron = null

export function initAutoGroupScheduler(connGetter) {
    if (autoGroupCron) {
        autoGroupCron.stop()
        autoGroupCron = null
    }

    autoGroupCron = cron.schedule('* * * * *', async () => {
        try {
            const conn = typeof connGetter === 'function' ? connGetter() : connGetter
            if (!conn?.user?.id || !global.db?.data?.chats) return

            const now = moment.tz('Asia/Jakarta')
            const currentTime = now.format('HH:mm')
            const todayDate = now.format('YYYY-MM-DD')

            const chats = global.db.data.chats
            for (const [jid, chat] of Object.entries(chats)) {
                if (!jid.endsWith('@g.us') || !chat?.autoOpenClose) continue

                const openTime = chat.openTime || '06:00'
                const closeTime = chat.closeTime || '21:00'

                // Eksekusi buka grup otomatis
                if (currentTime === openTime && chat.lastAutoAction !== `open_${todayDate}_${openTime}`) {
                    try {
                        await conn.groupSettingUpdate(jid, 'not_announcement')
                        chat.lastAutoAction = `open_${todayDate}_${openTime}`
                        global.saveData?.('chats', jid)

                        const textOpen = `╭── ✦ *JADWAL BUKA GRUP* ✦\n• Waktu: *${openTime} WIB*\n• Status: Grup telah dibuka otomatis sesuai jadwal harian.\n• Semua anggota sekarang dapat mengirim pesan.\n╰━━━━━━━━━━━━━━━━━━━━━━━`
                        await conn.sendMessage(jid, { text: textOpen })
                        await new Promise(res => setTimeout(res, 500))
                    } catch (err) {
                        console.error(chalk.red(`[AUTOGROUP OPEN ERROR] ${jid}:`), err.message)
                    }
                }

                // Eksekusi tutup grup otomatis
                if (currentTime === closeTime && chat.lastAutoAction !== `close_${todayDate}_${closeTime}`) {
                    try {
                        await conn.groupSettingUpdate(jid, 'announcement')
                        chat.lastAutoAction = `close_${todayDate}_${closeTime}`
                        global.saveData?.('chats', jid)

                        const textClose = `╭── ✦ *JADWAL TUTUP GRUP* ✦\n• Waktu: *${closeTime} WIB*\n• Status: Grup telah ditutup otomatis sesuai jadwal harian.\n• Hanya admin yang dapat mengirim pesan.\n╰━━━━━━━━━━━━━━━━━━━━━━━`
                        await conn.sendMessage(jid, { text: textClose })
                        await new Promise(res => setTimeout(res, 500))
                    } catch (err) {
                        console.error(chalk.red(`[AUTOGROUP CLOSE ERROR] ${jid}:`), err.message)
                    }
                }
            }
        } catch (e) {
            console.error(chalk.red('[AUTOGROUP CRON ERROR]:'), e.message)
        }
    }, {
        scheduled: true,
        timezone: 'Asia/Jakarta'
    })
}

export function stopAutoGroupScheduler() {
    if (autoGroupCron) {
        autoGroupCron.stop()
        autoGroupCron = null
    }
}
