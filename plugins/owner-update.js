import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

const exec = promisify(cp.exec).bind(cp)

// ==================== STATE MANAGEMENT ====================
let cronJob = null
let lastNotificationHash = null
let notificationCooldown = false
let isProcessing = false
let consecutiveFailures = 0
let lastSuccessTime = null

const DATA_DIR = path.join(process.cwd(), 'data')
const LOG_FILE = path.join(DATA_DIR, 'update_history.json')
const CONFIG_FILE = path.join(DATA_DIR, 'autoupdate_config.json')
const STATE_FILE = path.join(DATA_DIR, 'autoupdate_state.json')

// Initialize data directory
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

// ==================== CONFIGURATION ====================
const DEFAULT_CONFIG = {
  git: {
    email: "raflisetiawan093@gmail.com",
    name: "Futaroukun"
  },
  schedule: '0 0 * * *',
  targetJid: '6283854551575@s.whatsapp.net',
  maxRetries: 3,
  retryDelay: 5000,
  timezone: 'Asia/Jakarta',
  notificationCooldown: 300000, // 5 minutes
  maxConsecutiveFailures: 5,
  enableDetailedLogs: true
}

let CONFIG = { ...DEFAULT_CONFIG }

// ==================== STATE PERSISTENCE ====================
async function saveState() {
  try {
    const state = {
      isActive: cronJob !== null,
      lastSuccessTime,
      consecutiveFailures,
      lastUpdate: new Date().toISOString()
    }
    await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2))
  } catch (err) {
    console.error('Failed to save state:', err.message)
  }
}

async function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      const data = await fs.readFile(STATE_FILE, 'utf-8')
      const state = JSON.parse(data)
      lastSuccessTime = state.lastSuccessTime
      consecutiveFailures = state.consecutiveFailures || 0
      return state
    }
  } catch (err) {
    console.error('Failed to load state:', err.message)
  }
  return null
}

async function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8')
      CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
      console.log('Configuration loaded successfully')
    }
  } catch (err) {
    console.error('Failed to load config, using defaults:', err.message)
  }
}

async function saveConfig() {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(CONFIG, null, 2))
    console.log('Configuration saved successfully')
  } catch (err) {
    console.error('Failed to save config:', err.message)
  }
}

// Load config and state on startup
await loadConfig()
await loadState()

// ==================== UTILITY FUNCTIONS ====================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getCurrentTimestamp() {
  return new Date().toLocaleString('id-ID', {
    timeZone: CONFIG.timezone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
}

async function runGitCommand(command, retries = 0) {
  try {
    const { stdout, stderr } = await exec(command, {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 10,
      cwd: process.cwd()
    })
    return { success: true, stdout, stderr }
  } catch (error) {
    if (retries < CONFIG.maxRetries) {
      console.log(`Retry ${retries + 1}/${CONFIG.maxRetries} for command: ${command}`)
      await sleep(CONFIG.retryDelay * (retries + 1)) // Exponential backoff
      return runGitCommand(command, retries + 1)
    }
    return { success: false, error }
  }
}

async function saveUpdateLog(logData) {
  try {
    let logs = []
    try {
      if (existsSync(LOG_FILE)) {
        const data = await fs.readFile(LOG_FILE, 'utf-8')
        logs = JSON.parse(data)
      }
    } catch (err) {
      console.warn('Creating new log file')
      logs = []
    }

    const logEntry = {
      ...logData,
      timestamp: new Date().toISOString(),
      dateFormatted: getCurrentTimestamp(),
      id: Date.now().toString(36) + Math.random().toString(36).substr(2)
    }

    logs.unshift(logEntry)

    // Keep last 15 logs
    if (logs.length > 15) logs = logs.slice(0, 15)

    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2))
    
    if (CONFIG.enableDetailedLogs) {
      console.log(`Log saved: ${logData.success ? 'SUCCESS' : 'FAILED'} - ${logData.message || logData.reason}`)
    }
    
    return true
  } catch (err) {
    console.error('Failed to save log:', err.message)
    return false
  }
}

async function getUpdateHistory(limit = 15) {
  try {
    if (!existsSync(LOG_FILE)) return []
    const data = await fs.readFile(LOG_FILE, 'utf-8')
    const logs = JSON.parse(data)
    return logs.slice(0, limit)
  } catch {
    return []
  }
}

async function getStatistics() {
  try {
    const logs = await getUpdateHistory(15)
    const totalLogs = logs.length
    const successCount = logs.filter(l => l.success).length
    const failCount = totalLogs - successCount
    const successRate = totalLogs > 0 ? ((successCount / totalLogs) * 100).toFixed(1) : 0

    let totalFiles = 0
    let totalDuration = 0
    let durationCount = 0

    logs.forEach(log => {
      if (log.filesChanged) totalFiles += log.filesChanged
      if (log.duration) {
        totalDuration += parseFloat(log.duration)
        durationCount++
      }
    })

    const avgDuration = durationCount > 0 ? (totalDuration / durationCount).toFixed(2) : 0

    return {
      totalLogs,
      successCount,
      failCount,
      successRate,
      totalFiles,
      avgDuration,
      lastSuccess: lastSuccessTime ? new Date(lastSuccessTime).toLocaleString('id-ID', { timeZone: CONFIG.timezone }) : 'Belum ada',
      consecutiveFailures
    }
  } catch {
    return null
  }
}

function sanitizeCommitMessage(message) {
  return message
    .replace(/[`'"]/g, '') // Remove backticks and quotes
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
    .replace(/\\/g, '')
    .trim()
    .substring(0, 500)
}

function parseGitStatus(statusOutput) {
  const changes = statusOutput.trim().split('\n').filter(Boolean)
  const addedFiles = []
  const deletedFiles = []
  const modifiedFiles = []
  const renamedFiles = []
  const untrackedFiles = []

  changes.forEach(change => {
    const trimmed = change.trim()
    const parts = trimmed.split(/\s+/)
    const status = parts[0]
    const file = parts.slice(1).join(' ')

    if (!file) return

    if (status === 'A') {
      addedFiles.push(file)
    } else if (status === '??' || status === '?') {
      untrackedFiles.push(file)
    } else if (status === 'D') {
      deletedFiles.push(file)
    } else if (status.includes('R')) {
      renamedFiles.push(file)
    } else if (status.includes('M')) {
      modifiedFiles.push(file)
    }
  })

  return { addedFiles, deletedFiles, modifiedFiles, renamedFiles, untrackedFiles }
}

function formatFileList(files, maxDisplay = 15) {
  if (!files || files.length === 0) return ''

  const displayFiles = files.slice(0, maxDisplay)
  const remaining = files.length - displayFiles.length

  let result = displayFiles.map(f => {
    // Truncate long filenames
    const displayName = f.length > 50 ? f.substring(0, 47) + '...' : f
    return `  • ${displayName}`
  }).join('\n')

  if (remaining > 0) {
    result += `\n  • ... dan ${remaining} file lainnya`
  }
  return result
}

function formatDuration(seconds) {
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`
  if (seconds < 60) return `${seconds.toFixed(2)}s`
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}m ${secs}s`
}

function generateNotificationHash(result) {
  const content = `${result.success}-${result.message.substring(0, 100)}-${Date.now()}`
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString()
}

async function canSendNotification(result) {
  if (notificationCooldown) {
    console.log('Notification blocked: cooldown active')
    return false
  }

  const currentHash = generateNotificationHash(result)
  
  // Allow different messages through, but prevent exact duplicates
  if (lastNotificationHash === currentHash) {
    console.log('Notification blocked: duplicate detected')
    return false
  }

  lastNotificationHash = currentHash

  notificationCooldown = true
  setTimeout(() => {
    notificationCooldown = false
  }, CONFIG.notificationCooldown)

  return true
}

// ==================== GIT OPERATIONS ====================

async function checkGitInstalled() {
  try {
    const result = await exec('git --version')
    return result.stdout.includes('git version')
  } catch {
    return false
  }
}

async function getRepoInfo() {
  try {
    const remoteResult = await exec('git config --get remote.origin.url')
    if (!remoteResult.stdout) {
      throw new Error('Repository tidak memiliki remote origin')
    }

    let repoUrl = remoteResult.stdout.trim()

    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')
    if (repoUrl.startsWith('git@')) {
      repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    }
    repoUrl = repoUrl.replace(/\.git$/, '')

    const urlParts = repoUrl.split('/')
    const username = urlParts[urlParts.length - 2] || 'unknown'
    const repoName = urlParts[urlParts.length - 1] || 'unknown'

    const branchResult = await exec('git branch --show-current')
    const branch = branchResult.stdout.trim() || 'main'

    let lastCommit = null
    try {
      const commitResult = await exec('git log -1 --format="%h - %s (%cr)"')
      lastCommit = commitResult.stdout.trim()
    } catch {
      lastCommit = 'No commits yet'
    }

    let ahead = 0
    let behind = 0
    try {
      const statusResult = await exec('git rev-list --left-right --count origin/' + branch + '...' + branch)
      const [behindStr, aheadStr] = statusResult.stdout.trim().split('\t')
      behind = parseInt(behindStr) || 0
      ahead = parseInt(aheadStr) || 0
    } catch {
      // Ignore if can't get ahead/behind info
    }

    return { repoUrl, username, repoName, branch, lastCommit, ahead, behind }
  } catch (error) {
    throw new Error(`Gagal mendapatkan info repository: ${error.message}`)
  }
}

async function checkGitChanges() {
  try {
    const statusResult = await exec('git status -s')
    const changes = statusResult.stdout.trim()

    if (!changes) {
      return { hasChanges: false, stats: null, totalChanges: 0 }
    }

    const stats = parseGitStatus(statusResult.stdout)
    const totalChanges =
      stats.addedFiles.length +
      stats.deletedFiles.length +
      stats.modifiedFiles.length +
      stats.renamedFiles.length +
      stats.untrackedFiles.length

    return { hasChanges: true, stats, totalChanges }
  } catch (error) {
    throw new Error(`Gagal memeriksa perubahan: ${error.message}`)
  }
}

async function performGitCommit(commitMessage) {
  const emailResult = await runGitCommand(`git config user.email "${CONFIG.git.email}"`)
  if (!emailResult.success) {
    throw new Error('Gagal set git email')
  }

  const nameResult = await runGitCommand(`git config user.name "${CONFIG.git.name}"`)
  if (!nameResult.success) {
    throw new Error('Gagal set git name')
  }

  const addResult = await runGitCommand('git add .')
  if (!addResult.success) {
    throw new Error(`Gagal staging files: ${addResult.error.message}`)
  }

  const sanitized = sanitizeCommitMessage(commitMessage)
  const commitResult = await runGitCommand(`git commit -m "${sanitized}"`)

  if (!commitResult.success) {
    const errMsg = commitResult.error.message.toLowerCase()
    if (errMsg.includes('nothing to commit') || errMsg.includes('no changes')) {
      throw new Error('NOTHING_TO_COMMIT')
    }
    throw new Error(`Gagal commit: ${commitResult.error.message}`)
  }

  return commitResult
}

async function performGitPush(branch) {
  const pushResult = await runGitCommand(`git push origin ${branch}`)

  if (!pushResult.success) {
    const errMsg = pushResult.error.message
    if (errMsg.includes('Authentication failed')) {
      throw new Error('Autentikasi gagal. Periksa kredensial Git Anda.')
    } else if (errMsg.includes('Could not resolve host')) {
      throw new Error('Tidak dapat terhubung ke GitHub. Periksa koneksi internet.')
    } else if (errMsg.includes('rejected')) {
      throw new Error('Push ditolak. Repository mungkin memiliki perubahan yang belum di-pull.')
    }
    throw new Error(`Gagal push: ${errMsg}`)
  }

  return pushResult
}

// ==================== MAIN UPLOAD FUNCTION ====================

async function githubUpload(conn, commitMessage, isAuto = false) {
  const startTime = Date.now()

  // Prevent concurrent processing
  if (isProcessing) {
    console.log('Another upload is in progress, skipping...')
    return {
      success: false,
      repoUrl: "https://github.com",
      message: `*UPLOAD DIBATALKAN*\n\nProses upload lain sedang berjalan.\nMohon tunggu hingga selesai.`
    }
  }

  isProcessing = true

  try {
    // Check git installation
    const gitInstalled = await checkGitInstalled()
    if (!gitInstalled) {
      throw new Error('Git tidak terinstall atau tidak ditemukan di PATH')
    }

    const repoInfo = await getRepoInfo()
    const changeCheck = await checkGitChanges()

    if (!changeCheck.hasChanges) {
      await saveUpdateLog({
        success: false,
        reason: 'no_changes',
        message: commitMessage,
        repo: repoInfo.repoName,
        branch: repoInfo.branch,
        type: isAuto ? 'auto' : 'manual'
      })

      await saveState()

      return {
        success: false,
        repoUrl: repoInfo.repoUrl,
        message: `*UPDATE DIBATALKAN*\n\n` +
          `Repository: ${repoInfo.repoName}\n` +
          `Branch: ${repoInfo.branch}\n` +
          `Status: Tidak ada perubahan terdeteksi\n` +
          `Waktu: ${getCurrentTimestamp()}\n\n` +
          `Working directory bersih.`
      }
    }

    await performGitCommit(commitMessage)
    await performGitPush(repoInfo.branch)

    const hashResult = await exec('git rev-parse --short HEAD')
    const commitHash = hashResult.stdout.trim()

    const duration = (Date.now() - startTime) / 1000
    const durationStr = formatDuration(duration)

    const { addedFiles, deletedFiles, modifiedFiles, renamedFiles, untrackedFiles } = changeCheck.stats
    const allNewFiles = [...addedFiles, ...untrackedFiles]

    let fileList = ''
    if (allNewFiles.length > 0) {
      fileList += `\nFile Baru (${allNewFiles.length}):\n${formatFileList(allNewFiles)}\n`
    }
    if (modifiedFiles.length > 0) {
      fileList += `\nFile Dimodifikasi (${modifiedFiles.length}):\n${formatFileList(modifiedFiles)}\n`
    }
    if (renamedFiles.length > 0) {
      fileList += `\nFile Diganti Nama (${renamedFiles.length}):\n${formatFileList(renamedFiles)}\n`
    }
    if (deletedFiles.length > 0) {
      fileList += `\nFile Dihapus (${deletedFiles.length}):\n${formatFileList(deletedFiles)}\n`
    }

    const successMessage = `*PUSH BERHASIL*\n\n` +
      `Author: ${repoInfo.username}\n` +
      `Repository: ${repoInfo.repoName}\n` +
      `Branch: ${repoInfo.branch}\n` +
      `Waktu: ${getCurrentTimestamp()}\n` +
      `Durasi: ${durationStr}\n` +
      `Mode: ${isAuto ? 'Auto' : 'Manual'}\n\n` +
      `Commit Message:\n"${commitMessage}"\n\n` +
      `Hash: ${commitHash}\n` +
      `Total Perubahan: ${changeCheck.totalChanges} file\n` +
      `${fileList || '\nTidak ada rincian file tersedia'}`

    await saveUpdateLog({
      success: true,
      repo: repoInfo.repoName,
      branch: repoInfo.branch,
      hash: commitHash,
      message: commitMessage,
      filesChanged: changeCheck.totalChanges,
      duration: duration.toFixed(2),
      author: repoInfo.username,
      type: isAuto ? 'auto' : 'manual'
    })

    // Reset failure counter on success
    consecutiveFailures = 0
    lastSuccessTime = new Date().toISOString()
    await saveState()

    return {
      success: true,
      repoUrl: repoInfo.repoUrl,
      message: successMessage
    }

  } catch (err) {
    consecutiveFailures++
    await saveState()

    if (err.message === 'NOTHING_TO_COMMIT') {
      await saveUpdateLog({
        success: false,
        reason: 'nothing_to_commit',
        message: commitMessage,
        type: isAuto ? 'auto' : 'manual'
      })

      return {
        success: false,
        repoUrl: "https://github.com",
        message: `*UPDATE DIBATALKAN*\n\n` +
          `Tidak ada perubahan untuk di-commit.\n` +
          `Semua perubahan sudah ter-commit sebelumnya.\n\n` +
          `Waktu: ${getCurrentTimestamp()}`
      }
    }

    await saveUpdateLog({
      success: false,
      error: err.message,
      message: commitMessage,
      duration: ((Date.now() - startTime) / 1000).toFixed(2),
      type: isAuto ? 'auto' : 'manual'
    })

    let errorMessage = `*PUSH GAGAL*\n\n` +
      `Error Detail:\n${err.message}\n\n` +
      `Waktu: ${getCurrentTimestamp()}\n` +
      `Percobaan Gagal Berturut: ${consecutiveFailures}\n\n`

    if (consecutiveFailures >= CONFIG.maxConsecutiveFailures) {
      errorMessage += `\n⚠️ PERINGATAN: ${consecutiveFailures} kegagalan berturut-turut!\n` +
        `Pertimbangkan untuk memeriksa konfigurasi atau koneksi.`
    }

    errorMessage += `\nSaran:\n` +
      `• Periksa koneksi internet\n` +
      `• Verifikasi kredensial Git\n` +
      `• Cek konfigurasi repository`

    return {
      success: false,
      repoUrl: "https://github.com",
      message: errorMessage
    }
  } finally {
    isProcessing = false
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================

async function sendReportButton(conn, jid, result, title, quoted = null) {
  const canSend = await canSendNotification(result)
  if (!canSend) {
    console.log('Notification skipped to prevent spam')
    return false
  }

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
      title: "Menu Lainnya",
      sections: [{
        title: "Opsi Sistem",
        highlight_label: "Menu",
        rows: [
          {
            header: "Status",
            title: "Status Auto Update",
            description: "Lihat status dan konfigurasi sistem",
            id: ".autoupdate status"
          },
          {
            header: "History",
            title: "Riwayat Update",
            description: "Tampilkan log update terbaru",
            id: ".autoupdate history"
          },
          {
            header: "Stats",
            title: "Statistik",
            description: "Lihat statistik performa sistem",
            id: ".autoupdate stats"
          },
          {
            header: "Config",
            title: "Konfigurasi",
            description: "Pengaturan auto update",
            id: ".autoupdate config"
          }
        ]
      }]
    })
  }

  try {
    await conn.sendButton(jid, {
      header: title,
      image: { url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" },
      body: result.message,
      footer: "GitHub Automation System v2.1",
      buttons: [linkButton, listButton]
    }, { quoted })
    return true
  } catch (err) {
    console.error('Failed to send notification:', err.message)
    return false
  }
}

// ==================== AUTO UPDATE FUNCTIONS ====================

async function autoUpdate(conn) {
  console.log('='.repeat(50))
  console.log('Auto update triggered at:', getCurrentTimestamp())
  console.log('='.repeat(50))

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CONFIG.timezone
  })
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: CONFIG.timezone
  })

  const commitMessage = `Auto Update - ${dateStr} ${timeStr}`

  try {
    const result = await githubUpload(conn, commitMessage, true)

    const sent = await sendReportButton(
      conn,
      CONFIG.targetJid,
      result,
      "LAPORAN AUTO UPDATE"
    )

    if (sent) {
      console.log('Auto update notification sent successfully')
    } else {
      console.log('Auto update notification skipped (cooldown/duplicate)')
    }
  } catch (err) {
    console.error('Auto update error:', err.message)

    // Send error notification
    try {
      await sendReportButton(
        conn,
        CONFIG.targetJid,
        {
          success: false,
          repoUrl: "https://github.com",
          message: `*AUTO UPDATE ERROR*\n\nTerjadi kesalahan fatal:\n${err.message}\n\nWaktu: ${getCurrentTimestamp()}`
        },
        "ERROR AUTO UPDATE"
      )
    } catch (notifErr) {
      console.error('Failed to send error notification:', notifErr.message)
    }
  }

  console.log('='.repeat(50))
  console.log('Auto update completed')
  console.log('='.repeat(50))
}

function startAutoUpdate(conn) {
  if (cronJob) {
    console.log('Auto update already running')
    return false
  }

  cronJob = cron.schedule(CONFIG.schedule, () => {
    autoUpdate(conn)
  }, {
    timezone: CONFIG.timezone
  })

  console.log(`Auto update started with schedule: ${CONFIG.schedule} (${CONFIG.timezone})`)
  saveState()
  return true
}

function stopAutoUpdate() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    console.log('Auto update stopped')
    saveState()
    return true
  }
  console.log('Auto update is not running')
  return false
}

function getAutoUpdateStatus() {
  return cronJob !== null
}

// ==================== COMMAND HANDLER ====================

const handler = async (m, { conn, isOwner, args, command, usedPrefix }) => {
  if (!isOwner) {
    return m.reply('Akses ditolak. Perintah ini hanya tersedia untuk owner.')
  }

  // AUTOUPDATE COMMAND
  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    // START
    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      const msg = started
        ? `*AUTO UPDATE DIAKTIFKAN*\n\n` +
          `Jadwal: Setiap hari jam 00:00 WIB\n` +
          `Timezone: ${CONFIG.timezone}\n` +
          `Target Notifikasi: ${CONFIG.targetJid.replace('@s.whatsapp.net', '')}\n\n` +
          `Sistem akan otomatis push ke GitHub sesuai jadwal.\n\n` +
          `Gunakan .autoupdate status untuk monitoring.`
        : `*INFO*\n\n` +
          `Auto update sudah berjalan.\n` +
          `Gunakan .autoupdate status untuk detail.`
      return m.reply(msg)
    }

    // STOP
    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      const msg = stopped
        ? `*AUTO UPDATE DINONAKTIFKAN*\n\n` +
          `Jadwal otomatis telah dihentikan.\n` +
          `Waktu: ${getCurrentTimestamp()}\n\n` +
          `Gunakan .autoupdate start untuk mengaktifkan kembali.`
        : `*INFO*\n\n` +
          `Auto update tidak sedang berjalan.\n` +
          `Gunakan .autoupdate start untuk mengaktifkan.`
      return m.reply(msg)
    }

    // STATUS
    if (action === 'status') {
      const isActive = getAutoUpdateStatus()
      const repoInfo = await getRepoInfo().catch(() => ({
        repoName: 'Unknown',
        branch: 'Unknown',
        lastCommit: 'N/A',
        ahead: 0,
        behind: 0
      }))

      const stats = await getStatistics()

      let statusText = `*STATUS AUTO UPDATE*\n\n`
      statusText += `Status: ${isActive ? 'AKTIF ✓' : 'NONAKTIF ✗'}\n`
      statusText += `Jadwal: ${CONFIG.schedule}\n`
      statusText += `Waktu: 00:00 WIB setiap hari\n`
      statusText += `Timezone: ${CONFIG.timezone}\n`
      statusText += `Target: ${CONFIG.targetJid.replace('@s.whatsapp.net', '')}\n\n`

      statusText += `*Repository Info:*\n`
      statusText += `Nama: ${repoInfo.repoName}\n`
      statusText += `Branch: ${repoInfo.branch}\n`
      statusText += `Last Commit: ${repoInfo.lastCommit}\n`
      if (repoInfo.ahead > 0) statusText += `Ahead: ${repoInfo.ahead} commit(s)\n`
      if (repoInfo.behind > 0) statusText += `Behind: ${repoInfo.behind} commit(s)\n`

      if (stats) {
        statusText += `\n*Quick Stats:*\n`
        statusText += `Success Rate: ${stats.successRate}%\n`
        statusText += `Last Success: ${stats.lastSuccess}\n`
        if (stats.consecutiveFailures > 0) {
          statusText += `⚠️ Gagal Berturut: ${stats.consecutiveFailures}x\n`
        }
      }

      statusText += `\n${isActive ? 'Sistem berjalan normal.' : 'Gunakan tombol di bawah untuk mengaktifkan.'}`

      const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: isActive ? "Kontrol Sistem" : "Aktifkan Sistem",
          sections: [{
            title: "Pengaturan Auto Update",
            highlight_label: "Menu",
            rows: [
              {
                header: isActive ? "Stop" : "Start",
                title: isActive ? "Nonaktifkan Auto Update" : "Aktifkan Auto Update",
                description: isActive ? "Hentikan jadwal otomatis" : "Jalankan jadwal otomatis",
                id: isActive ? ".autoupdate stop" : ".autoupdate start"
              },
              {
                header: "History",
                title: "Lihat Riwayat",
                description: "Tampilkan log update terbaru",
                id: ".autoupdate history"
              },
              {
                header: "Stats",
                title: "Statistik",
                description: "Lihat statistik performa",
                id: ".autoupdate stats"
              },
              {
                header: "Config",
                title: "Konfigurasi",
                description: "Lihat pengaturan sistem",
                id: ".autoupdate config"
              }
            ]
          }]
        })
      }]

      return conn.sendButton(m.chat, {
        header: "STATUS SISTEM",
        body: statusText,
        footer: "GitHub Automation",
        buttons
      }, { quoted: m })
    }

    // HISTORY
    if (action === 'history' || action === 'log') {
      const logs = await getUpdateHistory(15)

      if (logs.length === 0) {
        return m.reply('*RIWAYAT UPDATE*\n\nBelum ada riwayat update tersimpan.')
      }

      let historyText = `*RIWAYAT UPDATE (${logs.length} Terakhir)*\n\n`

      logs.forEach((log, i) => {
        const num = i + 1
        const status = log.success ? 'SUKSES' : 'GAGAL'
        const date = log.dateFormatted || new Date(log.timestamp).toLocaleString('id-ID')
        const type = log.type === 'auto' ? '[AUTO]' : '[MANUAL]'

        historyText += `${num}. [${status}] ${type} ${date}\n`
        historyText += `   Pesan: ${log.message || 'N/A'}\n`

        if (log.success) {
          if (log.filesChanged) historyText += `   File: ${log.filesChanged} perubahan\n`
          if (log.hash) historyText += `   Hash: ${log.hash}\n`
          if (log.duration) historyText += `   Durasi: ${log.duration}s\n`
        } else {
          if (log.reason === 'no_changes') {
            historyText += `   Alasan: Tidak ada perubahan\n`
          } else if (log.reason === 'nothing_to_commit') {
            historyText += `   Alasan: Nothing to commit\n`
          } else if (log.error) {
            const shortError = log.error.length > 60 ? log.error.substring(0, 60) + '...' : log.error
            historyText += `   Error: ${shortError}\n`
          }
        }
        historyText += `\n`
      })

      return m.reply(historyText)
    }

    // STATISTICS
    if (action === 'stats' || action === 'statistics') {
      const stats = await getStatistics()

      if (!stats) {
        return m.reply('*STATISTIK SISTEM*\n\nBelum ada data statistik tersedia.')
      }

      let statsText = `*STATISTIK SISTEM*\n\n`
      statsText += `*Performance:*\n`
      statsText += `Total Update: ${stats.totalLogs}\n`
      statsText += `Berhasil: ${stats.successCount}\n`
      statsText += `Gagal: ${stats.failCount}\n`
      statsText += `Success Rate: ${stats.successRate}%\n`
      statsText += `Avg Duration: ${stats.avgDuration}s\n\n`

      statsText += `*Activity:*\n`
      statsText += `Total Files Changed: ${stats.totalFiles}\n`
      statsText += `Last Success: ${stats.lastSuccess}\n`
      statsText += `Consecutive Failures: ${stats.consecutiveFailures}\n\n`

      if (stats.consecutiveFailures >= 3) {
        statsText += `⚠️ PERHATIAN:\n`
        statsText += `Ada ${stats.consecutiveFailures} kegagalan berturut-turut.\n`
        statsText += `Sebaiknya periksa konfigurasi sistem.\n\n`
      }

      const isActive = getAutoUpdateStatus()
      statsText += `Status: ${isActive ? 'AKTIF ✓' : 'NONAKTIF ✗'}\n`
      statsText += `Timestamp: ${getCurrentTimestamp()}`

      return m.reply(statsText)
    }

    // CONFIG
    if (action === 'config' || action === 'cfg') {
      const repoInfo = await getRepoInfo().catch(() => null)

      const cronParts = CONFIG.schedule.split(' ')
      const hour = cronParts[1] || '0'
      const minute = cronParts[0] || '0'
      const scheduleText = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`

      const targetNumber = CONFIG.targetJid.replace('@s.whatsapp.net', '')

      let configText = `*KONFIGURASI SISTEM*\n\n`
      configText += `*Git User:*\n`
      configText += `  Name: ${CONFIG.git.name}\n`
      configText += `  Email: ${CONFIG.git.email}\n\n`
      configText += `*Schedule:*\n`
      configText += `  Jam: ${scheduleText} WIB\n`
      configText += `  Cron: ${CONFIG.schedule}\n`
      configText += `  Timezone: ${CONFIG.timezone}\n\n`
      configText += `*Notification:*\n`
      configText += `  Nomor: ${targetNumber}\n`
      configText += `  Cooldown: ${CONFIG.notificationCooldown / 1000}s\n\n`
      configText += `*Retry Settings:*\n`
      configText += `  Max Retries: ${CONFIG.maxRetries}\n`
      configText += `  Retry Delay: ${CONFIG.retryDelay}ms\n`
      configText += `  Max Consecutive Failures: ${CONFIG.maxConsecutiveFailures}\n\n`
      configText += `*Features:*\n`
      configText += `  Detailed Logs: ${CONFIG.enableDetailedLogs ? 'Enabled' : 'Disabled'}\n`

      if (repoInfo) {
        configText += `\n*Repository Info:*\n`
        configText += `  Repo: ${repoInfo.repoName}\n`
        configText += `  Branch: ${repoInfo.branch}\n`
        configText += `  URL: ${repoInfo.repoUrl}\n`
        configText += `  Last Commit: ${repoInfo.lastCommit}\n`
      }

      configText += `\nConfig File: ${CONFIG_FILE}\n`
      configText += `Log File: ${LOG_FILE}\n`
      configText += `State File: ${STATE_FILE}`

      return m.reply(configText)
    }

    // TEST
    if (action === 'test') {
      const testMsg = await m.reply('*TESTING SISTEM*\n\nMemulai test koneksi dan konfigurasi...')

      let testResult = `*HASIL TEST SISTEM*\n\n`

      // Test Git Installation
      const gitInstalled = await checkGitInstalled()
      testResult += `Git Installation: ${gitInstalled ? '✓ OK' : '✗ FAILED'}\n`

      // Test Repository Info
      try {
        const repoInfo = await getRepoInfo()
        testResult += `Repository Info: ✓ OK\n`
        testResult += `  - Repo: ${repoInfo.repoName}\n`
        testResult += `  - Branch: ${repoInfo.branch}\n`
      } catch (err) {
        testResult += `Repository Info: ✗ FAILED\n`
        testResult += `  Error: ${err.message}\n`
      }

      // Test Git Changes
      try {
        const changes = await checkGitChanges()
        testResult += `Git Status Check: ✓ OK\n`
        testResult += `  - Changes: ${changes.totalChanges} file(s)\n`
      } catch (err) {
        testResult += `Git Status Check: ✗ FAILED\n`
        testResult += `  Error: ${err.message}\n`
      }

      // Test Config Files
      testResult += `Config File: ${existsSync(CONFIG_FILE) ? '✓ EXISTS' : '✗ NOT FOUND'}\n`
      testResult += `Log File: ${existsSync(LOG_FILE) ? '✓ EXISTS' : '✗ NOT FOUND'}\n`
      testResult += `State File: ${existsSync(STATE_FILE) ? '✓ EXISTS' : '✗ NOT FOUND'}\n`

      // Test Auto Update Status
      const isActive = getAutoUpdateStatus()
      testResult += `Auto Update: ${isActive ? '✓ ACTIVE' : '✗ INACTIVE'}\n`

      testResult += `\nTest Completed: ${getCurrentTimestamp()}`

      if (testMsg?.key) {
        setTimeout(() => {
          conn.sendMessage(m.chat, { delete: testMsg.key }).catch(() => {})
        }, 2000)
      }

      return m.reply(testResult)
    }

    // RESET
    if (action === 'reset') {
      consecutiveFailures = 0
      lastNotificationHash = null
      notificationCooldown = false
      await saveState()

      return m.reply(
        `*RESET SISTEM*\n\n` +
        `Status sistem telah direset:\n` +
        `• Consecutive failures: 0\n` +
        `• Notification cooldown: cleared\n` +
        `• Notification hash: cleared\n\n` +
        `Waktu: ${getCurrentTimestamp()}`
      )
    }

    // DEFAULT - Show menu
    const isActive = getAutoUpdateStatus()

    const menuRows = []

    if (!isActive) {
      menuRows.push({
        header: "Start",
        title: "Aktifkan Auto Update",
        description: "Jalankan jadwal update otomatis",
        id: ".autoupdate start"
      })
    } else {
      menuRows.push({
        header: "Stop",
        title: "Nonaktifkan Auto Update",
        description: "Hentikan jadwal update otomatis",
        id: ".autoupdate stop"
      })
    }

    menuRows.push(
      {
        header: "Status",
        title: "Cek Status",
        description: "Lihat status sistem saat ini",
        id: ".autoupdate status"
      },
      {
        header: "History",
        title: "Riwayat Update",
        description: "Tampilkan log update",
        id: ".autoupdate history"
      },
      {
        header: "Stats",
        title: "Statistik",
        description: "Lihat statistik performa",
        id: ".autoupdate stats"
      },
      {
        header: "Config",
        title: "Konfigurasi",
        description: "Lihat pengaturan sistem",
        id: ".autoupdate config"
      },
      {
        header: "Test",
        title: "Test Sistem",
        description: "Cek koneksi dan konfigurasi",
        id: ".autoupdate test"
      },
      {
        header: "Reset",
        title: "Reset Status",
        description: "Reset counter dan status",
        id: ".autoupdate reset"
      }
    )

    const buttons = [{
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "Pilih Aksi",
        sections: [{
          title: "Menu Auto Update",
          highlight_label: "Menu",
          rows: menuRows
        }]
      })
    }]

    const stats = await getStatistics()
    let menuBody = `*Pengaturan Update Otomatis*\n\n`
    menuBody += `Status: ${isActive ? 'AKTIF ✓' : 'NONAKTIF ✗'}\n`
    menuBody += `Jadwal: 00:00 WIB (Daily)\n`

    if (stats) {
      menuBody += `Success Rate: ${stats.successRate}%\n`
      if (stats.consecutiveFailures > 0) {
        menuBody += `⚠️ Gagal Berturut: ${stats.consecutiveFailures}x\n`
      }
    }

    menuBody += `\nPilih aksi di bawah ini:`

    return conn.sendButton(m.chat, {
      header: "AUTO UPDATE MENU",
      body: menuBody,
      footer: "GitHub Automation System v2.1",
      buttons
    }, { quoted: m })
  }

  // MANUAL UPDATE COMMAND
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: CONFIG.timezone
  })

  const commitMessage = args.join(' ').trim() || `Update Manual - ${dateStr}`

  const loading = await m.reply(
    `*Memproses Upload ke GitHub*\n\n` +
    `Commit Message:\n"${commitMessage}"\n\n` +
    `Mohon tunggu sebentar...`
  )

  const result = await githubUpload(conn, commitMessage, false)

  await sendReportButton(conn, m.chat, result, "LAPORAN UPDATE MANUAL", m)

  if (loading?.key) {
    setTimeout(async () => {
      try {
        await conn.sendMessage(m.chat, { delete: loading.key })
      } catch (err) {
        // Ignore delete errors
      }
    }, 3000)
  }
}

handler.help = [
  'update [message] - Manual push ke GitHub',
  'autoupdate start - Aktifkan auto update',
  'autoupdate stop - Nonaktifkan auto update',
  'autoupdate status - Lihat status sistem',
  'autoupdate history - Riwayat update',
  'autoupdate stats - Statistik performa',
  'autoupdate config - Lihat konfigurasi',
  'autoupdate test - Test sistem',
  'autoupdate reset - Reset status'
]
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler