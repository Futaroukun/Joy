import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

const exec = promisify(cp.exec).bind(cp)

let cronJob = null
const DATA_DIR = path.join(process.cwd(), 'data')
const LOG_FILE = path.join(DATA_DIR, 'update_history.json')

if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

const CONFIG = {
  git: {
    email: "raflisetiawan093@gmail.com",
    name: "Futaroukun"
  },
  schedule: '0 0 * * *',
  targetJid: '6283854551575@s.whatsapp.net',
  maxRetries: 3,
  retryDelay: 5000
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function runGitCommand(command, retries = 0) {
  try {
    const { stdout, stderr } = await exec(command, { 
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10 
    })
    return { success: true, stdout, stderr }
  } catch (error) {
    if (retries < CONFIG.maxRetries) {
      await sleep(CONFIG.retryDelay)
      return runGitCommand(command, retries + 1)
    }
    return { success: false, error }
  }
}

async function saveUpdateLog(logData) {
  try {
    let logs = []
    try {
      const data = await fs.readFile(LOG_FILE, 'utf-8')
      logs = JSON.parse(data)
    } catch {}
    
    logs.unshift({
      ...logData,
      timestamp: new Date().toISOString()
    })
    
    if (logs.length > 50) logs = logs.slice(0, 50)
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2))
  } catch (err) {
    console.error(err)
  }
}

function sanitizeCommitMessage(message) {
  return message.replace(/"/g, '\\"').replace(/\n/g, ' ').substring(0, 500)
}

function parseGitStatus(statusOutput) {
  const changes = statusOutput.trim().split('\n').filter(Boolean)
  const addedFiles = []
  const deletedFiles = []
  const modifiedFiles = []
  const renamedFiles = []

  changes.forEach(change => {
    const parts = change.trim().split(/\s+/)
    const status = parts[0]
    const file = parts.slice(1).join(' ')

    if (status.includes('A') || status.includes('?')) addedFiles.push(file)
    else if (status.includes('D')) deletedFiles.push(file)
    else if (status.includes('R')) renamedFiles.push(file)
    else if (status.includes('M')) modifiedFiles.push(file)
  })

  return { addedFiles, deletedFiles, modifiedFiles, renamedFiles }
}

function formatFileList(files) {
  if (!files || files.length === 0) return ''
  const displayFiles = files.slice(0, 20)
  const remaining = files.length - displayFiles.length
  let result = displayFiles.map(f => `• ${f}`).join('\n')
  if (remaining > 0) result += `\n• ... dan ${remaining} lainnya`
  return result
}

async function getRepoInfo() {
  try {
    const { stdout: remoteUrlOut } = await exec('git config --get remote.origin.url')
    let repoUrl = remoteUrlOut.trim()
    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')
    if (repoUrl.startsWith('git@')) repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    repoUrl = repoUrl.replace('.git', '')

    const splitUrl = repoUrl.split('/')
    const username = splitUrl[splitUrl.length - 2]
    const repoName = splitUrl[splitUrl.length - 1]

    const { stdout: branchOut } = await exec('git branch --show-current')
    const branch = branchOut.trim() || 'main'

    return { repoUrl, username, repoName, branch }
  } catch (error) {
    throw new Error(error.message)
  }
}

async function checkGitChanges() {
  try {
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim()
    if (!changes) return { hasChanges: false, stats: null }

    const stats = parseGitStatus(changesStdout)
    const totalChanges = stats.addedFiles.length + stats.deletedFiles.length + stats.modifiedFiles.length + stats.renamedFiles.length
    return { hasChanges: true, stats, totalChanges }
  } catch (error) {
    throw new Error(error.message)
  }
}

async function githubUpload(conn, commitMessage) {
  const startTime = Date.now()
  try {
    const repoInfo = await getRepoInfo()
    const changeCheck = await checkGitChanges()
    
    if (!changeCheck.hasChanges) {
      await saveUpdateLog({ success: false, reason: 'no_changes', message: commitMessage })
      return {
        success: false,
        repoUrl: repoInfo.repoUrl,
        message: `*UPDATE DIBATALKAN*\n\nRepository: *${repoInfo.repoName}*\nBranch: *${repoInfo.branch}*\nStatus: Tidak ada perubahan terdeteksi.`
      }
    }

    await runGitCommand(`git config user.email "${CONFIG.git.email}"`)
    await runGitCommand(`git config user.name "${CONFIG.git.name}"`)
    await runGitCommand('git add .')
    
    const sanitized = sanitizeCommitMessage(commitMessage)
    const commitResult = await runGitCommand(`git commit -m "${sanitized}"`)
    if (!commitResult.success) throw new Error('Gagal membuat commit.')

    await runGitCommand(`git push origin ${repoInfo.branch}`)
    
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const now = new Date()
    const commitDate = now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })
    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    const { addedFiles, deletedFiles, modifiedFiles, renamedFiles } = changeCheck.stats
    let fileList = ''
    if (addedFiles.length) fileList += `*File Baru (${addedFiles.length}):*\n${formatFileList(addedFiles)}\n\n`
    if (modifiedFiles.length) fileList += `*File Diedit (${modifiedFiles.length}):*\n${formatFileList(modifiedFiles)}\n\n`
    if (renamedFiles.length) fileList += `*File Diganti Nama (${renamedFiles.length}):*\n${formatFileList(renamedFiles)}\n\n`
    if (deletedFiles.length) fileList += `*File Dihapus (${deletedFiles.length}):*\n${formatFileList(deletedFiles)}\n\n`

    const successMessage = `*PUSH BERHASIL*\n\n` +
      `• User: *${repoInfo.username}*\n` +
      `• Repo: *${repoInfo.repoName}*\n` +
      `• Branch: *${repoInfo.branch}*\n` +
      `• Waktu: *${commitDate}*\n` +
      `• Durasi: *${duration}s*\n\n` +
      `• Pesan: _${commitMessage}_\n` +
      `• Hash: \`${commitHash.trim()}\`\n\n` +
      `*Detail Perubahan (${changeCheck.totalChanges}):*\n${fileList || "_Tidak ada rincian file_"}`

    await saveUpdateLog({ success: true, repo: repoInfo.repoName, branch: repoInfo.branch, hash: commitHash.trim(), message: commitMessage, filesChanged: changeCheck.totalChanges, duration })
    return { success: true, repoUrl: repoInfo.repoUrl, message: successMessage }

  } catch (err) {
    await saveUpdateLog({ success: false, error: err.message, message: commitMessage })
    return { success: false, repoUrl: "https://github.com", message: `*PUSH GAGAL*\n\nDeskripsi Error:\n\`\`\`${err.message}\`\`\`` }
  }
}

async function sendReportButton(conn, jid, result, title, quoted = null) {
  const linkButton = {
    name: "cta_url",
    buttonParamsJson: JSON.stringify({
      display_text: "Buka Repository",
      url: result.repoUrl || "https://github.com",
      merchant_url: result.repoUrl || "https://github.com"
    })
  }

  const listButton = {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "Menu Sistem",
      sections: [{
        title: "Pilih Opsi",
        rows: [
          { header: "Status", title: "Cek Status Sistem", description: "Lihat konfigurasi auto update", id: ".autoupdate status" },
          { header: "History", title: "Riwayat Update", description: "Tampilkan 10 log terakhir", id: ".autoupdate history" },
          { header: "Restart", title: "Mulai Ulang Bot", description: "Restart sistem sekarang", id: ".restart" }
        ]
      }]
    })
  }

  await conn.sendButton(jid, {
    header: title,
    image: { url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" }, 
    body: result.message,
    footer: "Joy Automation System",
    buttons: [linkButton, listButton]
  }, { quoted })
}

async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const result = await githubUpload(conn, `Auto Update - ${dateStr}`)
  try {
    await sendReportButton(conn, CONFIG.targetJid, result, "LAPORAN AUTO UPDATE")
  } catch (err) {
    console.error(err)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) return false
  cronJob = cron.schedule(CONFIG.schedule, () => autoUpdate(conn), { timezone: "Asia/Jakarta" })
  return true
}

function stopAutoUpdate() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    return true
  }
  return false
}

const handler = async (m, { conn, isOwner, args, command, usedPrefix }) => {
  if (!isOwner) return m.reply('*Akses ditolak. Hanya untuk Owner.*')

  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      return m.reply(started ? `*AUTO UPDATE AKTIF*\nJadwal: 00:00 WIB.` : `*Sistem sudah berjalan.*`)
    }

    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      return m.reply(stopped ? `*AUTO UPDATE DIMATIKAN*` : `*Sistem memang sedang tidak aktif.*`)
    }

    if (action === 'status') {
      const isActive = cronJob !== null
      const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: isActive ? "Nonaktifkan" : "Aktifkan",
          sections: [{
            title: "Kontrol Sistem",
            rows: [
              { header: isActive ? "Stop" : "Start", title: isActive ? "Matikan" : "Jalankan", id: isActive ? ".autoupdate stop" : ".autoupdate start" },
              { header: "Log", title: "Lihat History", id: ".autoupdate history" }
            ]
          }]
        })
      }]
      return conn.sendButton(m.chat, {
        header: "STATUS SISTEM",
        body: isActive ? `*STATUS: AKTIF*\nJadwal: 00:00 WIB` : `*STATUS: MATI*`,
        footer: "Konfigurasi Otomasi",
        buttons
      }, { quoted: m })
    }

    if (action === 'history' || action === 'log') {
      try {
        const logs = JSON.parse(await fs.readFile(LOG_FILE, 'utf-8'))
        if (logs.length === 0) return m.reply('*Riwayat kosong.*')
        let txt = `*RIWAYAT UPDATE TERAKHIR*\n\n`
        logs.slice(0, 10).forEach((log, i) => {
          txt += `${i + 1}. [${log.success ? 'SUKSES' : 'GAGAL'}] ${log.message}\n   Durasi: ${log.duration}s | Hash: ${log.hash || '-'}\n\n`
        })
        return m.reply(txt)
      } catch { return m.reply('*Log tidak ditemukan.*') }
    }

    return conn.sendButton(m.chat, {
      header: "KONFIGURASI AUTO UPDATE",
      body: `Status Saat Ini: ${cronJob ? 'Aktif' : 'Mati'}`,
      footer: "Automation Management",
      buttons: [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: "Pilih Tindakan",
          sections: [{
            title: "Menu Utama",
            rows: [
              { title: "Mulai Auto Update", id: ".autoupdate start" },
              { title: "Hentikan Auto Update", id: ".autoupdate stop" },
              { title: "Cek Status", id: ".autoupdate status" },
              { title: "Lihat Riwayat", id: ".autoupdate history" }
            ]
          }]
        })
      }]
    }, { quoted: m })
  }

  const dateStr = new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Update Manual - ${dateStr}`
  let loading = await m.reply(`*Memulai proses upload ke GitHub...*`)
  const result = await githubUpload(conn, commitMessage)
  await sendReportButton(conn, m.chat, result, "LAPORAN UPDATE MANUAL", m)
  if (loading?.key) setTimeout(() => conn.sendMessage(m.chat, { delete: loading.key }), 2000)
}

handler.help = ['update', 'autoupdate']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler