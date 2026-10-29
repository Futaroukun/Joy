/*
- @Author: Rafli
- @Feature: GitHub Auto Update & Git Manager
- @Description: Push otomatis ke GitHub dengan smart commit / custom commit, sinkronisasi pull, manajemen token, dan jadwal harian.
*/

import cp from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import path from 'path'
import cron from 'node-cron'
import chalk from 'chalk'
import fetch from 'node-fetch'

async function deleteMsg(conn, m, msg) {
    if (!msg) return;
    try {
        const chatId = m.chat.replace('@t.me', '');
        if (global.tgBot && msg.message_id) {
            await global.tgBot.telegram.deleteMessage(chatId, msg.message_id).catch(() => {});
        } else if (msg.key) {
            await conn.sendMessage(m.chat, { delete: msg.key }).catch(() => {});
        }
    } catch (e) {}
}

const exec = promisify(cp.exec).bind(cp)

let cronJob      = null
let isProcessing = false

const CONFIG = {
    git       : { email: 'raflisetiawan093@gmail.com', name: 'Futaroukun' },
    schedule  : '0 0 * * *',
    maxRetries: 3,
    retryDelay: 3000,
    timezone  : 'Asia/Jakarta'
}

function normalizeToken(token) {
    if (!token) return '';
    if (token.startsWith('ghp_') || token.startsWith('github_pat_')) return token;
    return 'ghp_' + token;
}

async function setupGitCredential() {
    const botLid = getBotLid()
    if (!botLid || !global.db?.data?.settings?.[botLid]?.github) {
        return
    }

    let { token, username, email, name } = global.db.data.settings[botLid].github

    if (!token || !username) {
        return
    }

    const fullToken = normalizeToken(token)

    try {
        const r = await exec('git config --get remote.origin.url')
        let url = r.stdout.trim()

        // Bersihkan kredensial lama dari URL kalau ada
        url = url.replace(/(https?:\/\/)[^@]+@/, '$1')

        // Sisipkan token baru ke URL remote
        const authedUrl = url.replace(/^https:\/\//, `https://${username}:${fullToken}@`)

        await exec(`git remote set-url origin "${authedUrl}"`)

        if (name) await exec(`git config user.name "${name}"`)
        if (email) await exec(`git config user.email "${email}"`)

        console.log(chalk.green(' [AUTOUPDATE] Remote credential berhasil di-set otomatis dari database.'))
    } catch (e) {
        console.log(chalk.red(' [AUTOUPDATE] Gagal set remote credential:'), e.message)
    }
}

async function fetchGitHubProfile(token) {
    const fullToken = normalizeToken(token)

    // 1. Ambil profil user
    const res = await fetch('https://api.github.com/user', {
        headers: {
            Authorization: `Bearer ${fullToken}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Joy-WA-Bot-AutoUpdate'
        }
    })

    if (!res.ok) {
        throw new Error(`Gagal fetch profil GitHub: ${res.statusText} (${res.status})`)
    }

    const user = await res.json()
    const username = user.login
    const name = user.name || user.login
    let email = user.email

    // 2. Ambil email utama jika tidak public
    if (!email) {
        try {
            const emailsRes = await fetch('https://api.github.com/user/emails', {
                headers: {
                    Authorization: `Bearer ${fullToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Joy-WA-Bot-AutoUpdate'
                }
            })
            if (emailsRes.ok) {
                const emails = await emailsRes.json()
                const primaryEmail = emails.find(e => e.primary) || emails[0]
                if (primaryEmail) email = primaryEmail.email
            }
        } catch {}
    }

    if (!email) {
        email = `${username}@users.noreply.github.com`
    }

    // 3. Konfigurasi Git lokal
    await exec(`git config user.name "${name}"`)
    await exec(`git config user.email "${email}"`)

    return { username, name, email }
}

const getTargetJid = () => {
    const rawOwner = global.info?.nomorowner || (Array.isArray(global.owner) ? global.owner[0] : global.owner) || ''
    const cleanNum = String(rawOwner).replace(/[^0-9]/g, '')
    return cleanNum ? `${cleanNum}@s.whatsapp.net` : ''
}

const getBotLid = () => {
    if (!global.db?.data?.settings) return null
    return Object.keys(global.db.data.settings).find(v => v.endsWith('@lid'))
}

setTimeout(async () => {
    if (!global.conn?.authState?.creds?.registered) return
    const botLid = getBotLid()
    if (!botLid) return

    await setupGitCredential()

    if (global.db.data.settings[botLid]?.autoupdate) {
        console.log(`${chalk.white.bold(' [SISTEM]')} ${chalk.cyan.bold('Melanjutkan jadwal Auto Update GitHub...')}`)
        startAutoUpdate(global.conn)
    }
}, 15000)

const sleep = ms => new Promise(r => setTimeout(r, ms))

function getTimestamp() {
    return new Date().toLocaleString('id-ID', {
        timeZone : CONFIG.timezone,
        day      : '2-digit', month: 'short', year: 'numeric',
        hour     : '2-digit', minute: '2-digit', hour12: false
    })
}

async function runGit(command, retries = 0) {
    try {
        const { stdout, stderr } = await exec(command, {
            timeout  : 45000,
            maxBuffer: 1024 * 1024 * 10,
            cwd      : process.cwd()
        })
        return { success: true, stdout, stderr }
    } catch (error) {
        if (retries < CONFIG.maxRetries) {
            await sleep(CONFIG.retryDelay * (retries + 1))
            return runGit(command, retries + 1)
        }
        return { success: false, error }
    }
}

function sanitize(msg) {
    return msg.replace(/[`'"]/g, '').replace(/[\n\r\\]/g, ' ').trim().substring(0, 300)
}

function parseStatus(output) {
    const added = [], deleted = [], modified = [], renamed = [], untracked = []
    output.trim().split('\n').filter(Boolean).forEach(line => {
        const parts  = line.trim().split(/\s+/)
        const status = parts[0]
        const file   = parts.slice(1).join(' ')
        if (!file) return
        if (status === 'A')                         added.push(file)
        else if (status === '??' || status === '?') untracked.push(file)
        else if (status === 'D')                    deleted.push(file)
        else if (status.includes('R'))              renamed.push(file)
        else if (status.includes('M'))              modified.push(file)
    })
    return { added, deleted, modified, renamed, untracked }
}

function formatDuration(seconds) {
    if (seconds < 1)  return `${(seconds * 1000).toFixed(0)}ms`
    if (seconds < 60) return `${seconds.toFixed(2)}s`
    return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`
}

function formatRelativeTime(str) {
    if (!str) return '';
    return str
        .replace(/years? ago/i, 'thn lalu')
        .replace(/months? ago/i, 'bln lalu')
        .replace(/weeks? ago/i, 'mgg lalu')
        .replace(/days? ago/i, 'hari lalu')
        .replace(/hours? ago/i, 'jam lalu')
        .replace(/minutes? ago/i, 'mnt lalu')
        .replace(/seconds? ago/i, 'dtk lalu')
        .replace(/just now/i, 'baru saja');
}

function parseShortStat(statStr) {
    if (!statStr) return '';
    const fileMatch = statStr.match(/(\d+)\s+file/i);
    const insMatch = statStr.match(/(\d+)\s+insertion/i);
    const delMatch = statStr.match(/(\d+)\s+deletion/i);

    const files = fileMatch ? `${fileMatch[1]} berkas` : '';
    const ins = insMatch ? `+${insMatch[1]}` : '';
    const del = delMatch ? `-${delMatch[1]}` : '';

    const linesPart = (ins && del) ? `${ins}, ${del} baris` : (ins ? `${ins} baris` : (del ? `${del} baris` : ''));
    if (files && linesPart) return `${files} (${linesPart})`;
    return files || statStr;
}

function formatChangedFile(status, filename) {
    const s = (status || '').toUpperCase();
    if (s === 'M') return `› ${filename} _(diperbarui)_`;
    if (s === 'D') return `› ~${filename}~ _(dihapus)_`;
    if (s === 'A') return `› *${filename}* _(baru)_`;
    if (s.startsWith('R')) return `› ${filename} _(direname)_`;
    return `› ${filename}`;
}

async function getRepoInfo() {
    const r = await exec('git config --get remote.origin.url')
    if (!r.stdout) throw new Error('Repository tidak memiliki remote origin.')

    let url = r.stdout.trim()
        .replace(/(https?:\/\/)[^@]+@/, '$1')
        .replace(/^git@(.+):/, 'https://$1/')
        .replace(/\.git$/, '')

    const parts    = url.split('/')
    const username = parts[parts.length - 2] || 'unknown'
    const repoName = parts[parts.length - 1] || 'unknown'
    const branch   = (await exec('git branch --show-current')).stdout.trim() || 'main'

    let lastCommit = 'No commits yet'
    try { lastCommit = (await exec('git log -1 --format="%h - %s (%cr)"')).stdout.trim() } catch {}

    return { repoUrl: url, username, repoName, branch, lastCommit }
}

async function getChanges() {
    const r = await exec('git status -s')
    if (!r.stdout.trim()) return { hasChanges: false, total: 0, stats: { added: [], deleted: [], modified: [], renamed: [], untracked: [] } }
    const stats = parseStatus(r.stdout)
    const total = Object.values(stats).reduce((s, a) => s + a.length, 0)
    return { hasChanges: true, stats, total }
}

function isProtectedDatabaseFile(file) {
    if (!file) return false
    const clean = file.trim()
    if (/\.(db|db-wal|db-shm|safe)($|\.)/i.test(clean)) return true
    if (clean.startsWith('data/backups/')) return true
    if (clean === '.codebase_graph.db') return true
    return false
}

function backupDataShield() {
    const shieldDir = path.join(process.cwd(), 'data', 'backups', '.git_shield')
    try {
        if (!fs.existsSync(shieldDir)) fs.mkdirSync(shieldDir, { recursive: true })
        const dataDir = path.join(process.cwd(), 'data')
        if (!fs.existsSync(dataDir)) return {}

        const files = fs.readdirSync(dataDir).filter(f => {
            return f.endsWith('.db') || f.endsWith('.safe') || f === 'catatan.json' || f === 'store.json'
        })

        const backedUp = {}
        for (const f of files) {
            const src = path.join(dataDir, f)
            const dst = path.join(shieldDir, f)
            try {
                if (fs.statSync(src).size > 0) {
                    fs.copyFileSync(src, dst)
                    backedUp[f] = fs.statSync(src).size
                }
            } catch (_) {}
        }
        return backedUp
    } catch (e) {
        console.error('[GIT SHIELD BACKUP ERROR]', e.message)
        return {}
    }
}

function restoreDataShield(backedUp) {
    const shieldDir = path.join(process.cwd(), 'data', 'backups', '.git_shield')
    try {
        const dataDir = path.join(process.cwd(), 'data')
        for (const [f, origSize] of Object.entries(backedUp || {})) {
            const dst = path.join(dataDir, f)
            const src = path.join(shieldDir, f)
            try {
                if (!fs.existsSync(dst) || fs.statSync(dst).size < origSize) {
                    if (fs.existsSync(src)) {
                        fs.copyFileSync(src, dst)
                        console.log(chalk.green(`[GIT SHIELD RESTORE] Memulihkan ${f} (${origSize} bytes)`))
                    }
                }
            } catch (_) {}
        }
    } catch (e) {
        console.error('[GIT SHIELD RESTORE ERROR]', e.message)
    }
}

async function smartCommit(stats) {
    await runGit(`git config user.email "${CONFIG.git.email}"`)
    await runGit(`git config user.name "${CONFIG.git.name}"`)

    const results = []
    const groups  = [
        { files: [...stats.added, ...stats.untracked], type: 'Add'    },
        { files: stats.modified,                      type: 'Update' },
        { files: stats.deleted,                       type: 'Delete' },
        { files: stats.renamed,                       type: 'Rename' }
    ]

    for (const { files, type } of groups) {
        for (const file of files) {
            if (isProtectedDatabaseFile(file)) continue
            const add = await runGit(`git add "${file}"`)
            if (!add.success) continue
            const commit = await runGit(`git commit -m "${sanitize(`${type}: ${file}`)}"`)
            if (commit.success) results.push({ type: type.toLowerCase(), file })
        }
    }

    if (results.length === 0) throw new Error('NOTHING_TO_COMMIT')
    return results
}

async function gitPush(branch, isForce = false) {
    await setupGitCredential()

    const forceFlag = isForce ? ' --force' : ''
    let r = await runGit(`git push origin ${branch}${forceFlag}`)
    if (!r.success) {
        const msg = r.error?.message || ''

        // Jika push ditolak karena remote lebih baru, coba rebase otomatis
        if (msg.includes('rejected') && !isForce) {
            console.log(chalk.yellow('[GIT PUSH] Push ditolak, mencoba rebase dari remote origin...'))
            const pullRes = await runGit(`git pull --rebase origin ${branch}`)
            if (pullRes.success) {
                r = await runGit(`git push origin ${branch}`)
            }
        }

        if (!r.success) {
            const finalMsg = r.error?.message || ''
            if (finalMsg.includes('Authentication failed'))  throw new Error('Autentikasi gagal. Periksa token GitHub di database.')
            if (finalMsg.includes('Could not resolve host')) throw new Error('Tidak bisa terhubung ke GitHub. Cek koneksi internet.')
            if (finalMsg.includes('rejected'))               throw new Error('Push ditolak karena ada pembaruan di remote. Silakan coba `.git pull` terlebih dahulu.')
            throw new Error(`Gagal push: ${finalMsg}`)
        }
    }
}

async function gitPull(branch, isForce = false) {
    await setupGitCredential()
    let oldHead = ''
    try {
        oldHead = (await exec('git rev-parse HEAD')).stdout.trim()
    } catch {}

    const shieldedFiles = backupDataShield()

    try {
        if (isForce) {
            await runGit('git merge --abort').catch(() => {})
            await runGit('git rebase --abort').catch(() => {})
            await runGit(`git fetch origin ${branch}`).catch(() => {})
            await runGit(`git reset --hard origin/${branch}`).catch(() => {})
        }

        let r = await runGit(`git pull --rebase --autostash origin ${branch}`)
        if (!r.success) {
            const errMsg = r.error?.message || ''
            if (/unmerged|conflict|needs merge/i.test(errMsg)) {
                console.log(chalk.yellow('[GIT PULL] Mendeteksi konflik merge/unmerged files, mereset otomatis ke remote...'))
                await runGit('git merge --abort').catch(() => {})
                await runGit('git rebase --abort').catch(() => {})
                await runGit(`git fetch origin ${branch}`).catch(() => {})
                await runGit(`git reset --hard origin/${branch}`).catch(() => {})
                r = await runGit(`git pull origin ${branch}`)
            } else if (/overwritten by merge/i.test(errMsg)) {
                await runGit('git rm --cached data/*.db 2>/dev/null').catch(() => {})
                r = await runGit(`git pull origin ${branch}`)
            } else {
                r = await runGit(`git pull origin ${branch}`)
            }
        }
        if (!r.success && /overwritten by merge/i.test(r.error?.message || '')) {
            await runGit('git rm --cached data/*.db 2>/dev/null').catch(() => {})
            r = await runGit(`git pull origin ${branch}`)
        }
        if (!r.success) {
            throw new Error(r.error?.message || 'Gagal pull dari GitHub.')
        }

        let newHead = ''
        try {
            newHead = (await exec('git rev-parse HEAD')).stdout.trim()
        } catch {}

        const hasUpdate = Boolean(oldHead && newHead && oldHead !== newHead)
        let commitList = ''
        let shortStat = ''
        let fileList = ''

        if (hasUpdate) {
            try {
                const logRes = await exec(`git log ${oldHead}..${newHead} --format="› \`%h\` %s"`)
                commitList = logRes.stdout.trim()
            } catch {}

            try {
                const statRes = await exec(`git diff --shortstat ${oldHead}..${newHead}`)
                shortStat = parseShortStat(statRes.stdout.trim())
            } catch {}

            try {
                const diffTreeRes = await exec(`git diff --name-status ${oldHead}..${newHead}`)
                const lines = diffTreeRes.stdout.trim().split('\n').filter(Boolean)
                const formatted = lines.slice(0, 15).map(line => {
                    const [status, ...f] = line.trim().split(/\s+/)
                    return formatChangedFile(status, f.join(' '))
                })
                fileList = formatted.join('\n')
                if (lines.length > 15) {
                    fileList += `\n› ...dan ${lines.length - 15} berkas lainnya`
                }
            } catch {}
        }

        return {
            raw: r.stdout || r.stderr || 'Already up to date.',
            oldHead,
            newHead,
            hasUpdate,
            commitList,
            shortStat,
            fileList
        }
    } finally {
        restoreDataShield(shieldedFiles)
    }
}

async function githubUpload({ isAuto = false, customMessage = '', isForce = false } = {}) {
    if (isProcessing) return {
        success: false,
        repoUrl: 'https://github.com',
        message: '*Upload dibatalkan.*\n\nProses upload / push lain sedang berjalan.'
    }

    isProcessing = true
    const startTime = Date.now()

    try {
        const repo    = await getRepoInfo()
        const changes = await getChanges()

        if (!changes.hasChanges) return {
            success: false,
            repoUrl: repo.repoUrl,
            message:
                `╭── ✦ *GIT PUSH* ✦\n` +
                `• *Status:* Tidak ada perubahan yang perlu di-commit.\n` +
                `• *Repository:* ${repo.repoName} (\`${repo.branch}\`)\n` +
                `• *Waktu:* ${getTimestamp()}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
        }

        let results = []
        if (customMessage) {
            await runGit(`git config user.email "${CONFIG.git.email}"`)
            await runGit(`git config user.name "${CONFIG.git.name}"`)
            await runGit('git add -A')
            await runGit('git reset HEAD -- data/*.db* data/backups/ .codebase_graph.db 2>/dev/null').catch(() => {})
            const commitRes = await runGit(`git commit -m "${sanitize(customMessage)}"`)
            if (!commitRes.success) {
                throw new Error(commitRes.error?.message || 'Gagal membuat commit.')
            }
            results.push({ type: 'custom', file: customMessage })
        } else {
            results = await smartCommit(changes.stats)
        }

        await gitPush(repo.branch, isForce)

        const hash     = (await exec('git rev-parse --short HEAD')).stdout.trim()
        const duration = formatDuration((Date.now() - startTime) / 1000)

        let summary = ''
        let details = ''

        if (customMessage) {
            summary = `• *Pesan Commit:* "${customMessage}"\n• *Total File:* ${changes.total} file`
        } else {
            const addCount    = results.filter(r => r.type === 'add').length
            const updateCount = results.filter(r => r.type === 'update').length
            const deleteCount = results.filter(r => r.type === 'delete').length
            const renameCount = results.filter(r => r.type === 'rename').length

            summary = '*Ringkasan:* \n'
            if (updateCount) summary += `• Diperbarui: ${updateCount} file\n`
            if (addCount)    summary += `• Ditambahkan: ${addCount} file\n`
            if (deleteCount) summary += `• Dihapus: ${deleteCount} file\n`
            if (renameCount) summary += `• Direname: ${renameCount} file\n`

            details = '\n*Daftar Berkas:*\n'
            results.slice(0, 15).forEach(r => {
                if (r.type === 'delete') {
                    details += `› ~${r.file}~ _(dihapus)_\n`
                } else if (r.type === 'add') {
                    details += `› *${r.file}* _(baru)_\n`
                } else if (r.type === 'rename') {
                    details += `› ${r.file} _(direname)_\n`
                } else {
                    details += `› ${r.file} _(diperbarui)_\n`
                }
            })
            if (results.length > 15) details += `› ...dan ${results.length - 15} berkas lainnya\n`
        }

        return {
            success: true,
            repoUrl: repo.repoUrl,
            message:
                `╭── ✦ *GIT PUSH BERHASIL* ✦\n` +
                `• *Author:* ${repo.username}\n` +
                `• *Repository:* ${repo.repoName} (\`${repo.branch}\`)\n` +
                `• *Waktu:* ${getTimestamp()}\n` +
                `• *Durasi:* ${duration} | *Mode:* ${isAuto ? 'Otomatis' : 'Manual'}\n` +
                `• *Commit Hash:* \`${hash}\`\n\n` +
                `${summary}\n` +
                `${details ? `${details}\n` : ''}` +
                `• *URL:* ${repo.repoUrl}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
        }

    } catch (err) {
        if (err.message === 'NOTHING_TO_COMMIT') return {
            success: false,
            repoUrl: 'https://github.com',
            message:
                `╭── ✦ *GIT PUSH* ✦\n` +
                `• *Status:* Semua perubahan sudah ter-commit sebelumnya.\n` +
                `• *Waktu:* ${getTimestamp()}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
        }

        return {
            success: false,
            repoUrl: 'https://github.com',
            message:
                `╭── ✦ *GIT PUSH GAGAL* ✦\n` +
                `• *Error:* ${err.message}\n` +
                `• *Waktu:* ${getTimestamp()}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
        }
    } finally {
        isProcessing = false
    }
}

async function sendReport(conn, jid, result, mode = 'manual', quoted = null) {
    const header = mode === 'auto'
        ? (result.success ? 'UPDATE OTOMATIS' : 'ERROR AUTO UPDATE')
        : (result.success ? 'UPDATE MANUAL'   : 'UPDATE GAGAL')

    try {
        await conn.sendButton(jid, {
            header,
            image  : { url: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png' },
            body   : result.message,
            footer : 'GitHub Automation',
            buttons: [
                {
                    name            : 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: 'Buka Repository',
                        url         : result.repoUrl || 'https://github.com',
                        merchant_url: result.repoUrl || 'https://github.com'
                    })
                }
            ]
        }, { quoted })
    } catch {
        try {
            await conn.sendMessage(jid, { text: result.message }, { quoted })
        } catch (e) {
            console.error('[AUTOUPDATE] Gagal kirim notif:', e.message)
        }
    }
}

async function autoUpdate(conn) {
    try {
        const result = await githubUpload({ isAuto: true })
        await sendReport(conn, getTargetJid(), result, 'auto')
    } catch (e) {
        console.error('[AUTOUPDATE]', e.message)
        await sendReport(conn, getTargetJid(), {
            success: false,
            repoUrl: 'https://github.com',
            message: `*Auto update error.*\n\n${e.message}\n\nWaktu: ${getTimestamp()}`
        }, 'auto')
    }
}

function startAutoUpdate(conn) {
    if (cronJob) return false
    cronJob = cron.schedule(CONFIG.schedule, () => autoUpdate(conn), { timezone: CONFIG.timezone })
    const botLid = getBotLid()
    if (botLid && global.db.data.settings[botLid]) {
        global.db.data.settings[botLid].autoupdate = true
        global.saveData?.('settings', botLid)
    }
    console.log(`${chalk.white.bold(' [SISTEM]')} ${chalk.cyan.bold('Auto Update GitHub aktif.')}`)
    return true
}

function stopAutoUpdate() {
    if (!cronJob) return false
    cronJob.stop()
    cronJob = null
    const botLid = getBotLid()
    if (botLid && global.db.data.settings[botLid]) {
        global.db.data.settings[botLid].autoupdate = false
        global.saveData?.('settings', botLid)
    }
    return true
}

const handler = async (m, { conn, args, command, usedPrefix }) => {
    const botLid = getBotLid()
    if (!botLid) return m.reply('Sistem belum siap, database botLid tidak terdeteksi.')

    const sub = (args[0] || '').toLowerCase().trim()

    // ── 1. SUBCOMMAND: TOKEN SETUP & INSPECTION ─────────────────────────────
    if (sub === 'token') {
        const token = args[1]
        if (!token) return m.reply(`Format: \`${usedPrefix + command} token <github_token>\``)

        const loading = await m.reply('_Memverifikasi token dan mengambil data dari GitHub..._')
        try {
            const profile = await fetchGitHubProfile(token)

            if (!global.db.data.settings[botLid]) global.db.data.settings[botLid] = {}
            if (!global.db.data.settings[botLid].github) global.db.data.settings[botLid].github = {}

            const cleanToken = token.startsWith('ghp_') ? token.substring(4) : token

            global.db.data.settings[botLid].github.token    = cleanToken
            global.db.data.settings[botLid].github.username = profile.username
            global.db.data.settings[botLid].github.email    = profile.email
            global.db.data.settings[botLid].github.name     = profile.name

            global.saveData?.('settings', botLid)
            await setupGitCredential()

            await deleteMsg(conn, m, loading)
            return m.reply(
                `╭── ✦ *SETUP GITHUB BERHASIL* ✦\n` +
                `• *Username:* ${profile.username}\n` +
                `• *Nama:* ${profile.name}\n` +
                `• *Email:* ${profile.email}\n\n` +
                `_Git config lokal dan remote URL telah diperbarui otomatis._\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        } catch (e) {
            await deleteMsg(conn, m, loading)
            return m.reply(
                `╭── ✦ *SETUP GITHUB GAGAL* ✦\n` +
                `• *Penyebab:* ${e.message}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
    }

    if (sub === 'showtoken' || sub === 'gettoken') {
        const gh = global.db.data.settings[botLid]?.github || {}
        if (!gh.token) return m.reply('Token GitHub belum di-set di database bot.')
        const tokenToShow = normalizeToken(gh.token)
        return m.reply(
            `╭── ✦ *GITHUB TOKEN* ✦\n` +
            `• *Token:* \`${tokenToShow}\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    if (sub === 'username') {
        const username = args[1]
        if (!username) return m.reply(`Format: \`${usedPrefix + command} username <github_username>\``)

        if (!global.db.data.settings[botLid]) global.db.data.settings[botLid] = {}
        if (!global.db.data.settings[botLid].github) global.db.data.settings[botLid].github = {}

        global.db.data.settings[botLid].github.username = username
        global.saveData?.('settings', botLid)
        await setupGitCredential()

        return m.reply(
            `╭── ✦ *GITHUB USERNAME* ✦\n` +
            `• *Username:* ${username}\n` +
            `• *Status:* Remote URL telah diperbarui.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 2. SUBCOMMAND: PULL / SYNC ──────────────────────────────────────────
    if (sub === 'pull' || sub === 'sync') {
        const isForce = args.some(a => /--force|-f|reset/i.test(a))
        const loading = await m.reply('_Menarik pembaruan dari GitHub..._')
        try {
            const repo = await getRepoInfo()
            const result = await gitPull(repo.branch, isForce)
            await deleteMsg(conn, m, loading)

            if (!result.hasUpdate) {
                return m.reply(
                    `╭── ✦ *GIT PULL* ✦\n` +
                    `• *Branch:* \`${repo.branch}\`\n` +
                    `• *Status:* Sistem sudah mutakhir (versi terbaru).\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
            }

            let msg = `╭── ✦ *GIT PULL* ✦\n` +
                      `• *Branch:* \`${repo.branch}\`\n`
            if (result.shortStat) {
                msg += `• *Perubahan:* ${result.shortStat}\n`
            }
            if (result.commitList) {
                msg += `\n*Pembaruan Commit:*\n${result.commitList}\n`
            }
            if (result.fileList) {
                msg += `\n*Daftar Berkas:*\n${result.fileList}\n`
            }
            msg += `╰━━━━━━━━━━━━━━━━━━━━━━━`

            return m.reply(msg)
        } catch (e) {
            await deleteMsg(conn, m, loading)
            return m.reply(
                `╭── ✦ *GIT PULL GAGAL* ✦\n` +
                `• *Penyebab:* ${e.message}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
    }

    // ── 3. SUBCOMMAND: STATUS ───────────────────────────────────────────────
    if (sub === 'status' && command !== 'autoupdate') {
        const repo = await getRepoInfo().catch(() => ({ repoName: 'Joy', branch: 'main' }))
        const changes = await getChanges()
        if (!changes.hasChanges) {
            return m.reply(
                `╭── ✦ *GIT STATUS* ✦\n` +
                `• *Branch:* \`${repo.branch}\`\n` +
                `• *Status:* Bersih, tidak ada perubahan yang belum di-commit.\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        let details = ''
        const { modified, added, untracked, deleted, renamed } = changes.stats
        if (modified.length) {
            details += `\n*Berkas Dimodifikasi (${modified.length}):*\n` + modified.slice(0, 10).map(f => `› ${f} _(diperbarui)_`).join('\n')
            if (modified.length > 10) details += `\n› ...dan ${modified.length - 10} berkas lainnya`
        }
        const newFiles = [...added, ...untracked]
        if (newFiles.length) {
            details += `\n*Berkas Baru (${newFiles.length}):*\n` + newFiles.slice(0, 10).map(f => `› *${f}* _(baru)_`).join('\n')
            if (newFiles.length > 10) details += `\n› ...dan ${newFiles.length - 10} berkas lainnya`
        }
        if (deleted.length) {
            details += `\n*Berkas Dihapus (${deleted.length}):*\n` + deleted.slice(0, 10).map(f => `› ~${f}~ _(dihapus)_`).join('\n')
            if (deleted.length > 10) details += `\n› ...dan ${deleted.length - 10} berkas lainnya`
        }
        if (renamed.length) {
            details += `\n*Berkas Direname (${renamed.length}):*\n` + renamed.slice(0, 10).map(f => `› ${f} _(direname)_`).join('\n')
            if (renamed.length > 10) details += `\n› ...dan ${renamed.length - 10} berkas lainnya`
        }

        return m.reply(
            `╭── ✦ *GIT STATUS* ✦\n` +
            `• *Branch:* \`${repo.branch}\`\n` +
            `• *Perubahan:* ${changes.total} berkas belum di-commit\n` +
            `${details}\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 4. SUBCOMMAND: LOG ──────────────────────────────────────────────────
    if (sub === 'log') {
        const repo = await getRepoInfo().catch(() => ({ branch: 'main' }))
        const limitArg = args.find((a, i) => i > 0 && /^\d+$/.test(a))
        const limit = limitArg ? parseInt(limitArg) : 5
        const actualLimit = Math.min(Math.max(limit, 1), 15)

        try {
            const { stdout } = await exec(`git log -n ${actualLimit} --format="%h|||%s|||%cr"`)
            const lines = stdout.trim().split('\n').filter(Boolean).map(l => {
                const [hash, msg, cr] = l.split('|||')
                return `› \`${hash}\` ${msg} _(${formatRelativeTime(cr)})_`
            })
            return m.reply(
                `╭── ✦ *GIT LOG* ✦\n` +
                `• *Branch:* \`${repo.branch}\`\n` +
                `• *Menampilkan:* ${actualLimit} commit terakhir\n\n` +
                `${lines.join('\n') || 'Tidak ada riwayat commit.'}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        } catch (e) {
            return m.reply(
                `╭── ✦ *GIT LOG GAGAL* ✦\n` +
                `• *Penyebab:* ${e.message}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
    }

    // ── 5. SUBCOMMAND: DIFF ─────────────────────────────────────────────────
    if (sub === 'diff') {
        try {
            const statRes = await exec('git diff --stat')
            const statOut = statRes.stdout.trim()
            if (!statOut) {
                return m.reply(
                    `╭── ✦ *GIT DIFF* ✦\n` +
                    `• *Status:* Tidak ada perbedaan pada file yang terlacak.\n` +
                    `╰━━━━━━━━━━━━━━━━━━━━━━━`
                )
            }
            return m.reply(
                `╭── ✦ *GIT DIFF STAT* ✦\n\n` +
                `\`\`\`\n${statOut}\n\`\`\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        } catch (e) {
            return m.reply(
                `╭── ✦ *GIT DIFF GAGAL* ✦\n` +
                `• *Penyebab:* ${e.message}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
    }

    // ── 6. SUBCOMMAND: AUTO UPDATE CRON ─────────────────────────────────────
    if (command === 'autoupdate' || sub === 'auto' || sub === 'cron') {
        const action = (command === 'autoupdate' ? sub : (args[1] || '').toLowerCase().trim())

        if (action === 'start' || action === 'on' || action === '1') {
            const ok = startAutoUpdate(conn)
            return m.reply(
                `╭── ✦ *AUTO UPDATE AKTIF* ✦\n` +
                `• *Status:* ${ok ? 'Berhasil diaktifkan' : 'Sudah berjalan'}\n` +
                `• *Jadwal:* Setiap hari jam 00:00 WIB\n` +
                `• *Monitoring:* Ketik \`${usedPrefix + command} auto status\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (action === 'stop' || action === 'off' || action === '0') {
            const ok = stopAutoUpdate()
            return m.reply(
                `╭── ✦ *AUTO UPDATE NONAKTIF* ✦\n` +
                `• *Status:* ${ok ? 'Berhasil dinonaktifkan' : 'Tidak sedang berjalan'}\n` +
                `• *Waktu:* ${getTimestamp()}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        if (action === 'status') {
            const isActive = cronJob !== null
            const repo     = await getRepoInfo().catch(() => ({ repoName: 'Unknown', branch: 'Unknown', lastCommit: 'N/A' }))
            const dbStatus = global.db.data.settings[botLid]?.autoupdate ? 'AKTIF' : 'NONAKTIF'

            return m.reply(
                `╭── ✦ *STATUS AUTO UPDATE* ✦\n` +
                `• *Status Cron:* ${isActive ? 'AKTIF' : 'NONAKTIF'}\n` +
                `• *Status DB:* ${dbStatus}\n` +
                `• *Jadwal:* 00:00 WIB setiap hari\n` +
                `• *Notif Target:* ${getTargetJid().replace('@s.whatsapp.net', '')}\n` +
                `• *Repository:* ${repo.repoName} (\`${repo.branch}\`)\n` +
                `• *Last Commit:* ${repo.lastCommit}\n\n` +
                `*Pengaturan:*\n` +
                `› Aktifkan: \`${usedPrefix + command} auto on\`\n` +
                `› Matikan: \`${usedPrefix + command} auto off\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }

        return m.reply(
            `╭── ✦ *MENU AUTO UPDATE* ✦\n` +
            `› \`${usedPrefix + command} auto on\` - Aktifkan jadwal auto push harian (00:00 WIB)\n` +
            `› \`${usedPrefix + command} auto off\` - Matikan jadwal auto push\n` +
            `› \`${usedPrefix + command} auto status\` - Cek status aktif\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        )
    }

    // ── 7. SUBCOMMAND: GIT RAW COMMANDS FALLBACK ─────────────────────────────
    if (command === 'git' && sub && !['push', 'commit'].includes(sub)) {
        const gitCmd = args.join(' ')
        const loading = await m.reply(`_Menjalankan git ${gitCmd}..._`)
        const result = await runGit(`git ${gitCmd}`)
        await deleteMsg(conn, m, loading)

        if (result.success) {
            const rawOut = (result.stdout || result.stderr || 'No output').trim()
            const maxLen = 1500
            const truncated = rawOut.length > maxLen ? rawOut.slice(0, maxLen) + '\n...(output dipotong)' : rawOut
            return m.reply(
                `╭── ✦ *GIT EXEC* ✦\n` +
                `• *Perintah:* \`git ${gitCmd}\`\n\n` +
                `\`\`\`\n${truncated}\n\`\`\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        } else {
            return m.reply(
                `╭── ✦ *GIT ERROR* ✦\n` +
                `• *Perintah:* \`git ${gitCmd}\`\n\n` +
                `• *Penyebab:* ${result.error?.message || 'Error occurred'}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            )
        }
    }

    // ── 5. PUSH / UPDATE MANUAL ─────────────────────────────────────────────
    const isForce = args.includes('-f') || args.includes('--force')
    const filteredArgs = args.filter(a => a !== '-f' && a !== '--force')
    const customMessage = (filteredArgs[0]?.toLowerCase() === 'push' ? filteredArgs.slice(1) : filteredArgs).join(' ').trim()

    const loading = await m.reply('_Memproses upload ke GitHub, tunggu sebentar..._')

    try {
        const result = await githubUpload({ isAuto: false, customMessage, isForce })
        await deleteMsg(conn, m, loading)
        await sendReport(conn, m.chat, result, 'manual', m)
    } catch (e) {
        console.error('[UPDATE]', e)
        await deleteMsg(conn, m, loading)
        m.reply(`*Terjadi kesalahan.*\n\n${e.message}`)
    }
}

handler.help = ['git *pull/status/log/diff/push/auto*']
handler.tags    = ['owner']
handler.command = /^(update|push|git|autoupdate)$/i
handler.rowner  = true

export default handler