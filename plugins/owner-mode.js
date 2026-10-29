/*
 * @Author      : Rafli
 * @Feature     : Bot Mode Switcher
 * @Description : Mengatur mode akses bot (Publik, Owner Only/Self, Group Only, Private Only, Sewa Only) dengan dukungan interactive single select list.
 * @Version     : 2.1 (No Decorational Emoji & Owner Only Mode)
 */

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

const modes = {
    'all': {
        title: 'Mode Publik',
        desc: 'Bot dapat digunakan di Grup maupun Chat Pribadi oleh semua orang.',
        value: '',
        aliases: ['all', 'public', 'publik', 'semua']
    },
    'owneronly': {
        title: 'Mode Owner Only (Self)',
        desc: 'Bot hanya merespons perintah dari Owner & Developer.',
        value: 'owneronly',
        aliases: ['owneronly', 'owner', 'self', 'pribadiowner']
    },
    'gconly': {
        title: 'Mode Group Only',
        desc: 'Bot hanya merespons di dalam Grup (DM hanya Owner & Premium).',
        value: 'gconly',
        aliases: ['gconly', 'gc', 'group', 'grup', 'grouponly']
    },
    'pconly': {
        title: 'Mode Private Only',
        desc: 'Bot hanya merespons di Chat Pribadi (Grup hanya Owner & Premium).',
        value: 'pconly',
        aliases: ['pconly', 'pc', 'private', 'dm', 'dmonly', 'chat']
    },
    'sewaonly': {
        title: 'Mode Sewa Only',
        desc: 'Bot di grup hanya merespons jika grup berstatus sewa aktif.',
        value: 'sewaonly',
        aliases: ['sewaonly', 'sewa', 'rent', 'rentonly']
    }
}

function resolveModeKey(input) {
    if (!input) return null
    const clean = input.toLowerCase().trim()
    for (const [key, m] of Object.entries(modes)) {
        if (key === clean || m.aliases.includes(clean)) return key
    }
    return null
}

let handler = async (m, { conn, args, usedPrefix, command }) => {
    const rawBotLid = conn.user?.lid || conn.user?.id || ''
    const botLid = cleanLID(rawBotLid)

    if (!global.db.data.settings[botLid]) global.db.data.settings[botLid] = {}
    const settings = global.db.data.settings[botLid]

    const currentModeValue = settings.chatMode || ''
    let currentModeKey = 'all'
    for (const [key, m] of Object.entries(modes)) {
        if (m.value === currentModeValue) {
            currentModeKey = key
            break
        }
    }
    const currentModeTitle = modes[currentModeKey]?.title || 'Mode Publik'

    // ── 1. TAMPILAN INTERAKTIF PILIH MODE ────────────────────────────────────
    if (!args[0]) {
        const rows = Object.entries(modes).map(([key, mode]) => {
            const isActive = (key === currentModeKey)
            return {
                header: mode.title,
                title: `${isActive ? '[AKTIF]' : '[PILIH]'} - ${mode.title}`,
                description: mode.desc,
                id: `${usedPrefix + command} ${key}`
            }
        })

        const listParams = {
            title: 'PILIH MODE',
            sections: [
                {
                    title: 'Daftar Mode Akses Bot',
                    rows: rows
                }
            ]
        }

        const buttons = [
            {
                name: 'single_select',
                buttonParamsJson: JSON.stringify(listParams)
            }
        ]

        const bodyText =
            `*PENGATURAN MODE BOT*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `• *Status Mode Saat Ini:* *${currentModeTitle}*\n\n` +
            `Silakan pilih mode akses bot melalui menu interaktif di bawah atau gunakan format cepat:\n\n` +
            `• \`${usedPrefix + command} all\` - Mode Publik\n` +
            `• \`${usedPrefix + command} owneronly\` - Mode Owner Only (Self)\n` +
            `• \`${usedPrefix + command} gconly\` - Mode Grup Saja\n` +
            `• \`${usedPrefix + command} pconly\` - Mode Chat Pribadi Saja\n` +
            `• \`${usedPrefix + command} sewaonly\` - Mode Grup Sewa Saja`

        try {
            return await conn.sendButton(m.chat, {
                body: bodyText,
                footer: `${global.info?.namabot || 'Joy'} • System Mode`,
                buttons: buttons
            }, { quoted: m })
        } catch {
            let textList = `${bodyText}\n━━━━━━━━━━━━━━━━━━━━━━`
            return m.reply(textList)
        }
    }

    // ── 2. EKSEKUSI PERUBAHAN MODE ───────────────────────────────────────────
    const inputArg = args[0].toLowerCase().trim()
    const targetModeKey = resolveModeKey(inputArg)

    if (!targetModeKey || !modes[targetModeKey]) {
        const availableList = Object.entries(modes)
            .map(([k, m]) => `• \`${usedPrefix + command} ${k}\` - ${m.title}`)
            .join('\n')

        return m.reply(
            `*PILIHAN MODE TIDAK VALID*\n\n` +
            `Mode *"${inputArg}"* tidak dikenal.\n\n` +
            `*Pilihan Mode yang Tersedia:*\n${availableList}`
        )
    }

    const targetMode = modes[targetModeKey]

    if (targetMode.value === currentModeValue) {
        return m.reply(`Bot sudah berada dalam *${targetMode.title}*. Tidak ada perubahan yang dilakukan.`)
    }

    // Simpan ke database
    settings.chatMode = targetMode.value
    global.db.data.settings[botLid] = settings
    if (global.saveData && botLid) {
        global.saveData('settings', botLid)
    }

    return m.reply(
        `*SUKSES MENGUBAH MODE BOT*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `• *Mode Baru:* *${targetMode.title}*\n` +
        `• *Keterangan:* ${targetMode.desc}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
    )
}

handler.help    = ['setmode'];
handler.tags    = ['owner'];
handler.command = /^(setmode|mode|botmode)$/i;
handler.owner   = true;

export default handler;