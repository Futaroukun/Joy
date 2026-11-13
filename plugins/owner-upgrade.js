import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const REPO = 'Futaroukun/Joy'
const BRANCH = 'main'
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`
const ROOT = process.cwd()
const BACKUP_DIR = path.join(ROOT, 'data', 'backups', 'upgrade')
const PROTECTED = ['settings.js', '.env', 'data/', 'sessions/', 'node_modules/', '.git/']
const KEEP_BACKUPS = 5
const BATCH = 8
const FOOTER = '╰━━━━━━━━━━━━━━━━━━━━━━━'

let running = false

const sleep = ms => new Promise(r => setTimeout(r, ms))
const sha = buf => createHash('sha256').update(buf).digest('hex').slice(0, 20)
const matchRule = (rel, rules) => rules.some(r => r.endsWith('/') ? rel.startsWith(r) : rel === r)

function resolveSafe(rel) {
    if (typeof rel !== 'string' || !rel || path.isAbsolute(rel) || rel.split('/').includes('..')) return null
    if (matchRule(rel, PROTECTED)) return null
    const abs = path.resolve(ROOT, rel)
    return abs.startsWith(ROOT + path.sep) ? abs : null
}

async function download(rel) {
    const url = RAW + rel.split('/').map(encodeURIComponent).join('/')
    for (let attempt = 0; ; attempt++) {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(30000) })
            if (!res.ok) throw new Error(`HTTP ${res.status} untuk ${rel}`)
            return Buffer.from(await res.arrayBuffer())
        } catch (e) {
            if (attempt >= 2) throw e
            await sleep(1500)
        }
    }
}

async function buildPlan() {
    const manifest = JSON.parse((await download('update.json')).toString())
    const plan = { version: manifest.version, commit: manifest.commit, add: [], update: [], skipped: [], same: 0 }
    for (const [rel, info] of Object.entries(manifest.files || {})) {
        const abs = resolveSafe(rel)
        if (!abs) continue
        if (!fs.existsSync(abs)) {
            plan.add.push({ rel, hash: info.h })
            continue
        }
        const local = sha(fs.readFileSync(abs))
        if (local === info.h) plan.same++
        else if ((info.k || []).includes(local)) plan.update.push({ rel, hash: info.h })
        else plan.skipped.push({ rel, hash: info.h })
    }
    return plan
}

function listBackups() {
    if (!fs.existsSync(BACKUP_DIR)) return []
    return fs.readdirSync(BACKUP_DIR).filter(n => /^\d+$/.test(n)).sort()
}

function pruneBackups() {
    for (const id of listBackups().slice(0, -KEEP_BACKUPS)) {
        fs.rmSync(path.join(BACKUP_DIR, id), { recursive: true, force: true })
    }
}

function restore(id) {
    const dir = path.join(BACKUP_DIR, id)
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'))
    for (const rel of meta.replaced) {
        const abs = resolveSafe(rel)
        if (!abs) continue
        fs.mkdirSync(path.dirname(abs), { recursive: true })
        fs.copyFileSync(path.join(dir, 'files', rel), abs)
    }
    for (const rel of meta.added) {
        const abs = resolveSafe(rel)
        if (abs && fs.existsSync(abs)) fs.unlinkSync(abs)
    }
    fs.rmSync(dir, { recursive: true, force: true })
    return meta
}

async function stage(targets) {
    const staged = []
    for (let i = 0; i < targets.length; i += BATCH) {
        const chunk = await Promise.all(targets.slice(i, i + BATCH).map(async t => {
            const buf = await download(t.rel)
            if (sha(buf) !== t.hash) throw new Error(`Hash tidak cocok untuk ${t.rel}`)
            return { ...t, buf }
        }))
        staged.push(...chunk)
    }
    return staged
}

async function apply(targets) {
    const staged = await stage(targets)
    const id = String(Date.now())
    const dir = path.join(BACKUP_DIR, id)
    const meta = { replaced: [], added: [] }

    for (const s of staged) {
        const abs = path.join(ROOT, s.rel)
        if (fs.existsSync(abs)) {
            const dst = path.join(dir, 'files', s.rel)
            fs.mkdirSync(path.dirname(dst), { recursive: true })
            fs.copyFileSync(abs, dst)
            meta.replaced.push(s.rel)
        } else {
            meta.added.push(s.rel)
        }
    }
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta))

    try {
        for (const s of staged) {
            const abs = path.join(ROOT, s.rel)
            fs.mkdirSync(path.dirname(abs), { recursive: true })
            const tmp = abs + '.upgrade.tmp'
            fs.writeFileSync(tmp, s.buf)
            fs.renameSync(tmp, abs)
        }
        if (staged.some(s => s.rel === 'package.json')) {
            await execAsync('npm install --no-audit --no-fund', { cwd: ROOT, timeout: 600000, maxBuffer: 1 << 25 })
        }
    } catch (e) {
        restore(id)
        throw new Error(`Upgrade dibatalkan dan dipulihkan otomatis: ${e.message}`)
    }

    pruneBackups()
    return { id, count: staged.length }
}

const list = (arr, n = 10) =>
    arr.slice(0, n).map(f => `› ${f.rel}`).join('\n') + (arr.length > n ? `\n› ...dan ${arr.length - n} berkas lainnya` : '')

function planMessage(plan, usedPrefix, command) {
    let msg = `╭── ✦ *UPGRADE* ✦\n• *Versi Repo:* ${plan.version} (\`${plan.commit}\`)\n`
    msg += `• *Diperbarui:* ${plan.update.length} | *Baru:* ${plan.add.length}\n`
    msg += `• *Dilewati (dimodifikasi):* ${plan.skipped.length} | *Sudah terbaru:* ${plan.same}\n`
    if (plan.update.length) msg += `\n*Akan diperbarui:*\n${list(plan.update)}\n`
    if (plan.add.length) msg += `\n*Akan ditambahkan:*\n${list(plan.add)}\n`
    if (plan.skipped.length) {
        msg += `\n*Dilewati karena sudah kamu ubah:*\n${list(plan.skipped)}\n`
        msg += `\n_Timpa paksa: \`${usedPrefix + command} force <berkas|all>\`_\n`
    }
    return msg + FOOTER
}

async function restart(m, conn) {
    const mod = await import('./owner-restart.js')
    return mod.default(m, { conn, isOwner: true })
}

const handler = async (m, { conn, args, usedPrefix, command }) => {
    if (running) return m.reply('Proses upgrade lain sedang berjalan.')
    running = true

    const sub = (args[0] || '').toLowerCase()

    try {
        if (sub === 'rollback') {
            const ids = listBackups()
            if (!ids.length) return m.reply('Tidak ada backup untuk dipulihkan.')
            const meta = restore(ids[ids.length - 1])
            await m.reply(
                `╭── ✦ *ROLLBACK* ✦\n` +
                `• *Dipulihkan:* ${meta.replaced.length} berkas\n` +
                `• *Dihapus:* ${meta.added.length} berkas baru\n` +
                `${FOOTER}`
            )
            running = false
            return restart(m, conn)
        }

        const loading = await m.reply('_Mengecek pembaruan dari GitHub..._')
        const plan = await buildPlan()
        if (loading?.key) await conn.sendMessage(m.chat, { delete: loading.key }).catch(() => {})

        if (sub === 'check') return m.reply(planMessage(plan, usedPrefix, command))

        let targets = [...plan.add, ...plan.update]
        let forcedCount = 0

        if (sub === 'force') {
            const wanted = args.slice(1)
            if (!wanted.length) return m.reply(`Format: \`${usedPrefix + command} force <berkas|all>\``)
            const forced = wanted.includes('all') ? plan.skipped : plan.skipped.filter(f => wanted.includes(f.rel))
            forcedCount = forced.length
            targets = [...targets, ...forced]
        }

        if (!targets.length) {
            return m.reply(
                plan.skipped.length
                    ? planMessage(plan, usedPrefix, command)
                    : `╭── ✦ *UPGRADE* ✦\n• *Status:* Sistem sudah mutakhir.\n• *Versi Repo:* ${plan.version} (\`${plan.commit}\`)\n${FOOTER}`
            )
        }

        const working = await m.reply(`_Mengunduh dan memasang ${targets.length} berkas..._`)
        const result = await apply(targets)
        if (working?.key) await conn.sendMessage(m.chat, { delete: working.key }).catch(() => {})

        await m.reply(
            `╭── ✦ *UPGRADE BERHASIL* ✦\n` +
            `• *Terpasang:* ${result.count} berkas\n` +
            `• *Dilewati:* ${plan.skipped.length - forcedCount} berkas dimodifikasi\n` +
            `• *Backup:* \`${result.id}\`\n` +
            `• *Pulihkan:* \`${usedPrefix + command} rollback\`\n` +
            `${FOOTER}`
        )
        running = false
        return restart(m, conn)
    } catch (e) {
        return m.reply(
            `╭── ✦ *UPGRADE GAGAL* ✦\n` +
            `• *Penyebab:* ${e.message}\n` +
            `• *Status:* Tidak ada berkas yang berubah.\n` +
            `${FOOTER}`
        )
    } finally {
        running = false
    }
}

handler.help = ['upgrade *check/force/rollback*']
handler.tags = ['owner']
handler.command = /^(upgrade|updatebot)$/i
handler.rowner = true

export default handler
