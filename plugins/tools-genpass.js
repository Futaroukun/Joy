/*
 * @Author      : Rafli
 * @Feature     : Password & Username Generator
 * @Description : Generator kata sandi dan nama pengguna berkekuatan kriptografis tinggi dengan estimasi ketahanan brute-force, anti-karakter ambigu, dan tombol salin cepat.
 * @Version     : 2.1 (No Decorational Emoji & High Entropy)
 */

import { randomBytes } from 'crypto'

const adjectives = [
    'cool','dark','fast','quiet','wild','sharp','brave','bright','silent','hidden',
    'shadow','storm','night','frost','iron','blue','red','gold','black','white',
    'lost','epic','lone','acid','neon','void','dead','holy','evil','toxic',
    'cyber','nano','hyper','ultra','mega','super','alpha','omega','delta','prime',
    'core','deep','pure','raw','zen','ash','jade','ruby','bolt','flash',
    'gloom','dusk','dawn','blaze','smoke','flame','onyx','sage','vivid','swift'
]

const nouns = [
    'wolf','fox','hawk','lion','tiger','blade','ghost','pixel','comet','raven',
    'spark','echo','drift','nova','viper','claw','fang','byte','code','node',
    'grid','loop','flux','core','void','beam','glow','mist','dust','rock',
    'fire','wind','wave','peak','soul','mind','gate','path','ray','star',
    'moon','sun','sky','sea','ice','sand','leaf','root','thorn','crow',
    'bear','deer','bull','shark','crane','drake','wren','lynx','puma','falcon'
]

const CHARS = {
    lower  : 'abcdefghijklmnopqrstuvwxyz',
    upper  : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    digits : '0123456789',
    symbols: '!@#$%&*-_=+'
}

const CHARS_CLEAN = {
    lower  : 'abcdefghijkmnopqrstuvwxyz',
    upper  : 'ABCDEFGHJKLMNPQRSTUVWXYZ',
    digits : '23456789',
    symbols: '!@#$%&*-_=+'
}

function secureRandInt(min, max) {
    const range = max - min + 1
    const bytes = randomBytes(4)
    return min + (bytes.readUInt32BE(0) % range)
}

function securePick(arr) {
    return arr[secureRandInt(0, arr.length - 1)]
}

function generateUsernameWord() {
    const adj  = securePick(adjectives)
    const noun = securePick(nouns)
    const num  = secureRandInt(10, 999)
    return `${adj}_${noun}${num}`
}

function generateUsernameRandom(length = 10) {
    const pool = (CHARS.lower + CHARS.digits).split('')
    const bytes = randomBytes(length)
    let result = CHARS.lower[bytes[0] % 26]
    for (let i = 1; i < length; i++) {
        result += pool[bytes[i] % pool.length]
    }
    return result
}

function generatePassword(length = 16, options = {}) {
    if (options.pin) {
        let pin = ''
        const bytes = randomBytes(length)
        for (let i = 0; i < length; i++) {
            pin += (bytes[i] % 10).toString()
        }
        return pin
    }

    const charsSource = options.clean ? CHARS_CLEAN : CHARS
    let charsPool = charsSource.lower + charsSource.upper + charsSource.digits
    if (!options.noSymbol) {
        charsPool += charsSource.symbols
    }

    const pool = charsPool.split('')
    const bytes = randomBytes(length + 8)
    let idx = 0

    let pass = [
        charsSource.lower[bytes[idx++] % charsSource.lower.length],
        charsSource.upper[bytes[idx++] % charsSource.upper.length],
        charsSource.digits[bytes[idx++] % charsSource.digits.length]
    ]

    if (!options.noSymbol) {
        pass.push(charsSource.symbols[bytes[idx++] % charsSource.symbols.length])
    } else {
        pass.push(pool[bytes[idx++] % pool.length])
    }

    const remaining = length - pass.length
    const extraBytes = randomBytes(remaining)
    for (let i = 0; i < remaining; i++) {
        pass.push(pool[extraBytes[i] % pool.length])
    }

    for (let i = pass.length - 1; i > 0; i--) {
        const j = bytes[idx++] % (i + 1);
        [pass[i], pass[j]] = [pass[j], pass[i]]
    }

    return pass.join('')
}

function calculateEntropy(password) {
    let poolSize = 0
    if (/[a-z]/.test(password)) poolSize += 26
    if (/[A-Z]/.test(password)) poolSize += 26
    if (/[0-9]/.test(password)) poolSize += 10
    if (/[^a-zA-Z0-9]/.test(password)) poolSize += 14

    if (poolSize === 0) return { label: 'Sangat Lemah', entropy: 0 }
    const entropy = Math.round(password.length * Math.log2(poolSize))

    let label = 'Sangat Lemah'
    if (entropy >= 80) label = 'Sangat Kuat (Kriptografis)'
    else if (entropy >= 60) label = 'Kuat'
    else if (entropy >= 40) label = 'Sedang'
    else if (entropy >= 25) label = 'Lemah'

    return { label, entropy }
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const args = text?.trim().toLowerCase().split(/\s+/) || []

    if (args[0] === 'help' || args[0] === 'h') {
        return m.reply(
            `*BANTUAN GENERATOR PASSWORD*\n\n` +
            `*Format:* \`${usedPrefix + command} <panjang> <jumlah_set> <opsi>\`\n\n` +
            `*Daftar Opsi:*\n` +
            `• \`pin\` : Menghasilkan angka PIN murni (contoh: 6 digit).\n` +
            `• \`random\` : Username dibuat acak karakter (contoh: x9q2m_k8).\n` +
            `• \`nosymbol\` : Password alfanumerik tanpa simbol khusus.\n` +
            `• \`raw\` : Mengizinkan karakter membingungkan (seperti l, 1, O, 0).\n\n` +
            `*Contoh Penggunaan:*\n` +
            `• \`${usedPrefix + command}\` (Default: 16 karakter, 3 set)\n` +
            `• \`${usedPrefix + command} 20 5 nosymbol\`\n` +
            `• \`${usedPrefix + command} 6 3 pin\``
        )
    }

    let isRandom = false
    let length = 16
    let count = 3
    let noSymbol = false
    let clean = true
    let isPin = false

    for (const arg of args) {
        if (arg === 'pin') {
            isPin = true
        } else if (arg === 'random') {
            isRandom = true
        } else if (arg === 'nosymbol' || arg === 'nosym') {
            noSymbol = true
        } else if (arg === 'raw') {
            clean = false
        } else {
            const num = parseInt(arg, 10)
            if (!isNaN(num)) {
                if (num >= 6) {
                    length = Math.min(num, 64)
                } else if (num >= 1) {
                    count = Math.min(num, 10)
                }
            }
        }
    }

    if (isPin && length === 16 && !args.some(a => parseInt(a, 10) >= 6)) {
        length = 6
    }

    const sets = []
    let msg = `*USERNAME & PASSWORD GENERATOR*\n`
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`
    msg += `• *Tipe:* ${isPin ? 'PIN Numerik' : 'Password Alfanumerik'}\n`
    msg += `• *Panjang:* ${length} karakter\n`
    msg += `• *Karakter Ambigu:* ${clean ? 'Dibersihkan' : 'Diizinkan'}\n`
    msg += `• *Simbol:* ${noSymbol ? 'Nonaktif' : 'Aktif'}\n`
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`

    for (let i = 1; i <= count; i++) {
        const username = isRandom ? generateUsernameRandom(10) : generateUsernameWord()
        const password = generatePassword(length, { noSymbol, clean, pin: isPin })
        const { label, entropy } = calculateEntropy(password)

        sets.push({ username, password })

        msg += `*Set ${i}*\n`
        if (!isPin) msg += `• Username: \`${username}\`\n`
        msg += `• Password: \`${password}\`\n`
        msg += `• Kekuatan: ${label} (${entropy} bit entropy)\n`
        if (i < count) msg += `\n`
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━\n`
    msg += `_Ketik \`${usedPrefix + command} help\` untuk panduan opsi kustomisasi._`

    const buttons = sets.slice(0, 3).map((s, i) => ({
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
            display_text: `Salin Set ${i + 1}`,
            copy_code: isPin ? s.password : `Username: ${s.username}\nPassword: ${s.password}`
        })
    }))

    try {
        await conn.sendButton(m.chat, {
            body: msg,
            footer: `${global.info?.namabot || 'Joy'} • Security Generator`,
            buttons
        }, { quoted: m })
    } catch (_) {
        await m.reply(msg)
    }
}

handler.help    = ['genpass'];
handler.tags    = ['tools'];
handler.command = /^(genpass|genpassword|genuser|passgen)$/i;

export default handler;