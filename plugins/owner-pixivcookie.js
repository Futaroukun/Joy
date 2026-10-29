/*
 * @Author      : Rafli
 * @Feature     : Pixiv Session & Cookie Manager
 * @Description : Atur cookie PHPSESSID, pantau status OAuth auto-refresh, dan koneksi akun Pixiv
 * @Version     : 5.0 (Dual-Mode Permanent Auth)
 */

import fetch from 'node-fetch'
import {
    saveConfig,
    checkSessionHealth
} from '../function/scrapers/pixiv.js'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const rawInput    = (text || m.quoted?.text || '').trim()
    const subCmd      = rawInput.toLowerCase()
    const isStatusCmd = /^(pcheck|pixivcheck|pixivstatus)$/i.test(command)

    // ── 1. STATUS CHECK (.pcheck / .pixivcheck / .pcookie status) ─────────────
    if (isStatusCmd || subCmd === 'status' || subCmd === 'cek' || subCmd === 'check') {
        const loadMsg = await m.reply('_Memeriksa status sesi Pixiv..._')
        try {
            const health = await checkSessionHealth()
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})

            if (!health.hasSession && !health.cookie && !health.refreshToken) {
                return m.reply(
                    `*Belum Ada Sesi Pixiv Tersimpan*\n\n` +
                    `Ketik: \`${usedPrefix}pcookie <PHPSESSID>\` untuk memasang cookie sesi Pixiv.`
                )
            }

            const oauthStatus  = health.tokenOk ? '🟢 Aktif (Auto-Refresh Permanen)' : (health.refreshToken ? '🟡 Token Tersimpan' : '⚪ Tidak Ada')
            const cookieStatus = health.cookieOk ? '🟢 Aktif (Valid)' : (health.cookie ? '🔴 Expired' : '⚪ Tidak Ada')

            return m.reply(
                `📊 *STATUS AUTENTIKASI PIXIV*\n\n` +
                `• *User ID:* \`${health.userId}\`\n` +
                `• *Username:* *${health.userName}*\n` +
                `• *OAuth Token:* ${oauthStatus}\n` +
                `• *Web Cookie:* ${cookieStatus}\n` +
                `• *Penyimpanan:* \`data/pixiv.json\``
            )
        } catch (e) {
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
            return m.reply(`*Gagal memeriksa sesi:* ${e.message}`)
        }
    }

    // ── 2. RESET / DELETE CREDENTIALS (.pcookie reset / del) ───────────────────
    if (subCmd === 'del' || subCmd === 'delete' || subCmd === 'reset') {
        saveConfig({ cookie: '', refreshToken: '', accessToken: '', userId: '', userName: '' })
        global.pixiv = { cookie: '', userId: '', userName: '' }
        return m.reply(`*Semua sesi & token Pixiv berhasil dihapus.*\nBot sekarang beroperasi dalam mode publik/anonim (SFW).`)
    }

    // ── 3. HELP / GUIDE ───────────────────────────────────────────────────────
    if (!rawInput) {
        return m.reply(
            `*🔑 PIXIV SESSION & COOKIE MANAGER*\n\n` +
            `*Cara Pakai:*\n` +
            `• \`${usedPrefix}pcookie <PHPSESSID>\` — Pasang cookie browser\n` +
            `• \`${usedPrefix}pcheck\` — Cek status koneksi, OAuth & akun\n` +
            `• \`${usedPrefix}pcookie reset\` — Hapus semua sesi tersimpan`
        )
    }

    // ── 4. PARSE & SET PHPSESSID COOKIE ───────────────────────────────────────
    let cookie = rawInput
    const match = rawInput.match(/PHPSESSID=([a-zA-Z0-9_\-]+)/i)
    if (match) {
        cookie = match[1]
    } else if (cookie.includes(';')) {
        const parts = cookie.split(';')
        for (const part of parts) {
            const p = part.trim()
            if (p.startsWith('PHPSESSID=')) {
                cookie = p.replace('PHPSESSID=', '').trim()
                break
            }
        }
    }

    cookie = cookie.trim()

    if (!/^[a-zA-Z0-9_\-]+$/.test(cookie) || cookie.length < 15) {
        return m.reply(
            `*Format cookie tidak valid.*\n\n` +
            `Cookie Pixiv berupa string PHPSESSID seperti:\n` +
            `\`117268539_Rx5TcafkYhyTxXB6jtqLixbiz11DbS8e\``
        )
    }

    const loadMsg = await m.reply(`_Memvalidasi cookie ke server Pixiv..._`)

    try {
        const userId = cookie.split('_')[0] || ''
        const res = await fetch('https://www.pixiv.net/ajax/user/extra?lang=en', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept'    : 'application/json',
                'Referer'   : 'https://www.pixiv.net/',
                'Cookie'    : `PHPSESSID=${cookie}`
            }
        })
        const json = await res.json().catch(() => ({}))
        const isValid = res.ok && !json.error && typeof json.body === 'object' && !Array.isArray(json.body)

        if (!isValid) {
            await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
            return m.reply(
                `*VALIDASI GAGAL (HTTP ${res.status})*\n\n` +
                `Server Pixiv menolak cookie tersebut. Pastikan mengambil dari browser yang sedang login di *pixiv.net*.`
            )
        }

        let userName = ''
        if (userId) {
            try {
                const resUser = await fetch(`https://www.pixiv.net/ajax/user/${userId}?full=1&lang=en`, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Cookie'    : `PHPSESSID=${cookie}`
                    }
                })
                const jsonUser = await resUser.json().catch(() => ({}))
                userName = jsonUser.body?.name || ''
            } catch (_) {}
        }

        saveConfig({
            cookie  : cookie,
            userId  : String(userId),
            userName: String(userName)
        })

        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
        return m.reply(
            `*COOKIE PIXIV BERHASIL DISIMPAN*\n\n` +
            `• *User ID:* \`${userId}\`\n` +
            (userName ? `• *Username:* *${userName}*\n` : '') +
            `• *Status:* Login Aktif (R-18 Support OK)\n` +
            `• *Penyimpanan:* \`data/pixiv.json\``
        )

    } catch (e) {
        console.error('[PIXIV COOKIE SET ERROR]', e)
        await conn.sendMessage(m.chat, { delete: loadMsg.key }).catch(() => {})
        return m.reply(`*Terjadi kesalahan saat memvalidasi:* ${e.message}`)
    }
}

handler.help = ['setpixiv *cookie/check/reset*']
handler.tags    = ['owner']
handler.command = /^(setpixiv|pixivcookie|pcookie|pcheck|pixivcheck|pixivstatus)$/i
handler.owner   = true

export default handler
