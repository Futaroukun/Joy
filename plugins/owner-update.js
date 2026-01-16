import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'

const exec = promisify(cp.exec).bind(cp)

// State management
let cronJob = null
let lastNotificationHash = null
let notificationCooldown = false
const DATA_DIR = path.join(process.cwd(), 'data')
const LOG_FILE = path.join(DATA_DIR, 'update_history.json')
const CONFIG_FILE = path.join(DATA_DIR, 'autoupdate_config.json')

// Initialize data directory
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true })
}

// Default configuration
const DEFAULT_CONFIG = {
  git: {
    email: "raflisetiawan093@gmail.com",
    name: "Futaroukun"
  },
  schedule: '0 0 * * *', // Midnight WIB
  targetJid: '6283854551575@s.whatsapp.net',
  maxRetries: 3,
  retryDelay: 5000,
  timezone: 'Asia/Jakarta'
}

let CONFIG = { ...DEFAULT_CONFIG }

// ==================== CONFIGURATION MANAGEMENT ====================

async function loadConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      const data = await fs.readFile(CONFIG_FILE, 'utf-8')
      CONFIG = { ...DEFAULT_CONFIG, ...JSON.parse(data) }
    }
  } catch (err) {
    console.error('Failed to load config, using defaults:', err.message)
  }
}

async function saveConfig() {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(CONFIG, null, 2))
  } catch (err) {
    console.error('Failed to save config:', err.message)
  }
}

// Load config on startup
await loadConfig()

// ==================== UTILITY FUNCTIONS ====================

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
      if (existsSync(LOG_FILE)) {
        const data = await fs.readFile(LOG_FILE, 'utf-8')
        logs = JSON.parse(data)
      }
    } catch (err) {
      logs = []
    }
    
    logs.unshift({
      ...logData,
      timestamp: new Date().toISOString(),
      dateFormatted: new Date().toLocaleString('id-ID', { 
        timeZone: CONFIG.timezone,
        dateStyle: 'medium',
        timeStyle: 'short'
      })
    })
    
    // Keep last 15 logs
    if (logs.length > 15) logs = logs.slice(0, 15)
    
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2))
    return true
  } catch (err) {
    console.error('Failed to save log:', err.message)
    return false
  }
}

async function getUpdateHistory(limit = 10) {
  try {
    if (!existsSync(LOG_FILE)) return []
    const data = await fs.readFile(LOG_FILE, 'utf-8')
    const logs = JSON.parse(data)
    return logs.slice(0, limit)
  } catch {
    return []
  }
}

function sanitizeCommitMessage(message) {
  return message
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '')
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
    const parts = change.trim().split(/\s+/)
    const status = parts[0]
    const file = parts.slice(1).join(' ')

    if (status === 'A') {
      addedFiles.push(file)
    } else if (status === '??' || status === '?') {
      untrackedFiles.push(file)
    } else if (status === 'D') {
      deletedFiles.push(file)
    } else if (status === 'R' || status.includes('R')) {
      renamedFiles.push(file)
    } else if (status === 'M' || status.includes('M')) {
      modifiedFiles.push(file)
    }
  })

  return { addedFiles, deletedFiles, modifiedFiles, renamedFiles, untrackedFiles }
}

function formatFileList(files, maxDisplay = 15) {
  if (!files || files.length === 0) return ''
  
  const displayFiles = files.slice(0, maxDisplay)
  const remaining = files.length - displayFiles.length
  
  let result = displayFiles.map(f => `  • ${f}`).join('\n')
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
  // Create hash from message content to detect duplicates
  const content = `${result.success}-${result.message.substring(0, 100)}`
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString()
}

async function canSendNotification(result) {
  // Check if we're in cooldown period
  if (notificationCooldown) {
    console.log('Notification blocked: cooldown active')
    return false
  }
  
  // Check if this is a duplicate notification
  const currentHash = generateNotificationHash(result)
  if (lastNotificationHash === currentHash) {
    console.log('Notification blocked: duplicate detected')
    return false
  }
  
  lastNotificationHash = currentHash
  
  // Set cooldown to prevent spam (5 minutes)
  notificationCooldown = true
  setTimeout(() => {
    notificationCooldown = false
    lastNotificationHash = null
  }, 5 * 60 * 1000)
  
  return true
}

// ==================== GIT OPERATIONS ====================

async function getRepoInfo() {
  try {
    // Get remote URL
    const remoteResult = await exec('git config --get remote.origin.url')
    if (!remoteResult.stdout) {
      throw new Error('Repository tidak memiliki remote origin')
    }

    let repoUrl = remoteResult.stdout.trim()
    
    // Clean and normalize URL
    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')
    if (repoUrl.startsWith('git@')) {
      repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    }
    repoUrl = repoUrl.replace(/\.git$/, '')

    // Extract username and repo name
    const urlParts = repoUrl.split('/')
    const username = urlParts[urlParts.length - 2] || 'unknown'
    const repoName = urlParts[urlParts.length - 1] || 'unknown'

    // Get current branch
    const branchResult = await exec('git branch --show-current')
    const branch = branchResult.stdout.trim() || 'main'

    // Get last commit info
    let lastCommit = null
    try {
      const commitResult = await exec('git log -1 --format="%h - %s"')
      lastCommit = commitResult.stdout.trim()
    } catch {
      lastCommit = 'No commits yet'
    }

    return { repoUrl, username, repoName, branch, lastCommit }
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
  // Set git user config
  const emailResult = await runGitCommand(`git config user.email "${CONFIG.git.email}"`)
  if (!emailResult.success) {
    throw new Error('Gagal set git email')
  }

  const nameResult = await runGitCommand(`git config user.name "${CONFIG.git.name}"`)
  if (!nameResult.success) {
    throw new Error('Gagal set git name')
  }
  
  // Stage all changes
  const addResult = await runGitCommand('git add .')
  if (!addResult.success) {
    throw new Error(`Gagal staging files: ${addResult.error.message}`)
  }

  // Commit changes
  const sanitized = sanitizeCommitMessage(commitMessage)
  const commitResult = await runGitCommand(`git commit -m "${sanitized}"`)
  
  if (!commitResult.success) {
    const errMsg = commitResult.error.message.toLowerCase()
    if (errMsg.includes('nothing to commit')) {
      throw new Error('NOTHING_TO_COMMIT')
    }
    throw new Error(`Gagal commit: ${commitResult.error.message}`)
  }

  return commitResult
}

async function performGitPush(branch) {
  const pushResult = await runGitCommand(`git push origin ${branch}`)
  
  if (!pushResult.success) {
    throw new Error(`Gagal push ke remote: ${pushResult.error.message}`)
  }

  return pushResult
}

// ==================== MAIN UPLOAD FUNCTION ====================

async function githubUpload(conn, commitMessage) {
  const startTime = Date.now()
  
  try {
    // Get repository information
    const repoInfo = await getRepoInfo()
    
    // Check for changes
    const changeCheck = await checkGitChanges()
    
    if (!changeCheck.hasChanges) {
      await saveUpdateLog({
        success: false,
        reason: 'no_changes',
        message: commitMessage,
        repo: repoInfo.repoName,
        branch: repoInfo.branch
      })
      
      return {
        success: false,
        repoUrl: repoInfo.repoUrl,
        message: `*UPDATE DIBATALKAN*\n\n` +
          `Repository: ${repoInfo.repoName}\n` +
          `Branch: ${repoInfo.branch}\n` +
          `Status: Tidak ada perubahan terdeteksi\n\n` +
          `Working directory bersih.`
      }
    }

    // Perform commit
    await performGitCommit(commitMessage)
    
    // Perform push
    await performGitPush(repoInfo.branch)
    
    // Get commit hash
    const hashResult = await exec('git rev-parse --short HEAD')
    const commitHash = hashResult.stdout.trim()
    
    const now = new Date()
    const commitDate = now.toLocaleString('id-ID', { 
      timeZone: CONFIG.timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })

    const duration = (Date.now() - startTime) / 1000
    const durationStr = formatDuration(duration)

    // Format file changes
    const { addedFiles, deletedFiles, modifiedFiles, renamedFiles, untrackedFiles } = changeCheck.stats
    
    // Combine added and untracked for display
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
      `Waktu: ${commitDate}\n` +
      `Durasi: ${durationStr}\n\n` +
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
      author: repoInfo.username
    })

    return {
      success: true,
      repoUrl: repoInfo.repoUrl,
      message: successMessage
    }

  } catch (err) {
    // Handle specific errors
    if (err.message === 'NOTHING_TO_COMMIT') {
      return {
        success: false,
        repoUrl: "https://github.com",
        message: `*UPDATE DIBATALKAN*\n\nTidak ada perubahan untuk di-commit.\nSemua perubahan sudah ter-commit sebelumnya.`
      }
    }

    await saveUpdateLog({
      success: false,
      error: err.message,
      message: commitMessage,
      duration: ((Date.now() - startTime) / 1000).toFixed(2)
    })

    return {
      success: false,
      repoUrl: "https://github.com",
      message: `*PUSH GAGAL*\n\nError Detail:\n${err.message}\n\nSilakan periksa konfigurasi Git atau koneksi internet.`
    }
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================

async function sendReportButton(conn, jid, result, title, quoted = null) {
  // Check if we can send notification (prevent spam)
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
            header: "Config",
            title: "Konfigurasi",
            description: "Pengaturan auto update",
            id: ".autoupdate config"
          },
          {
            header: "Restart",
            title: "Restart Bot",
            description: "Mulai ulang sistem bot",
            id: ".restart"
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
      footer: "GitHub Automation System v2.0",
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
  console.log('Auto update triggered at:', new Date().toLocaleString('id-ID', { timeZone: CONFIG.timezone }))
  
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
    const result = await githubUpload(conn, commitMessage)
    
    // Only send notification if there's something to report
    if (result.success || result.message.includes('GAGAL')) {
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
    } else {
      console.log('Auto update: No changes detected, notification skipped')
    }
  } catch (err) {
    console.error('Auto update error:', err.message)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) return false
  
  cronJob = cron.schedule(CONFIG.schedule, () => {
    console.log('Running scheduled auto update...')
    autoUpdate(conn)
  }, {
    timezone: CONFIG.timezone
  })
  
  console.log(`Auto update started with schedule: ${CONFIG.schedule}`)
  return true
}

function stopAutoUpdate() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    console.log('Auto update stopped')
    return true
  }
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
        ? `*AUTO UPDATE DIAKTIFKAN*\n\nJadwal: Setiap hari jam 00:00 WIB\nTimezone: ${CONFIG.timezone}\n\nSistem akan otomatis push ke GitHub sesuai jadwal.`
        : `*INFO*\n\nAuto update sudah berjalan.\nGunakan .autoupdate status untuk detail.`
      return m.reply(msg)
    }

    // STOP
    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      const msg = stopped
        ? `*AUTO UPDATE DINONAKTIFKAN*\n\nJadwal otomatis telah dihentikan.\nGunakan .autoupdate start untuk mengaktifkan kembali.`
        : `*INFO*\n\nAuto update tidak sedang berjalan.\nGunakan .autoupdate start untuk mengaktifkan.`
      return m.reply(msg)
    }

    // STATUS
    if (action === 'status') {
      const isActive = getAutoUpdateStatus()
      const repoInfo = await getRepoInfo().catch(() => ({ repoName: 'Unknown', branch: 'Unknown' }))
      
      const statusText = isActive
        ? `*STATUS AUTO UPDATE*\n\n` +
          `Status: AKTIF\n` +
          `Jadwal: ${CONFIG.schedule} (cron)\n` +
          `Waktu: 00:00 WIB setiap hari\n` +
          `Timezone: ${CONFIG.timezone}\n` +
          `Target: ${CONFIG.targetJid}\n\n` +
          `Repository: ${repoInfo.repoName}\n` +
          `Branch: ${repoInfo.branch}\n\n` +
          `Sistem berjalan normal.`
        : `*STATUS AUTO UPDATE*\n\n` +
          `Status: NONAKTIF\n` +
          `Jadwal: ${CONFIG.schedule}\n\n` +
          `Repository: ${repoInfo.repoName}\n` +
          `Branch: ${repoInfo.branch}\n\n` +
          `Gunakan tombol di bawah untuk mengaktifkan.`

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
        
        historyText += `${num}. [${status}] ${date}\n`
        historyText += `   Pesan: ${log.message || 'N/A'}\n`
        
        if (log.success) {
          if (log.filesChanged) historyText += `   File: ${log.filesChanged} perubahan\n`
          if (log.hash) historyText += `   Hash: ${log.hash}\n`
          if (log.duration) historyText += `   Durasi: ${log.duration}s\n`
        } else {
          if (log.reason === 'no_changes') {
            historyText += `   Alasan: Tidak ada perubahan\n`
          } else if (log.error) {
            historyText += `   Error: ${log.error.substring(0, 50)}...\n`
          }
        }
        historyText += `\n`
      })

      return m.reply(historyText)
    }

    // CONFIG
    if (action === 'config' || action === 'cfg') {
      const repoInfo = await getRepoInfo().catch(() => null)
      
      // Convert cron to readable format
      const cronParts = CONFIG.schedule.split(' ')
      const hour = cronParts[1] || '0'
      const minute = cronParts[0] || '0'
      const scheduleText = `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
      
      // Format target number (remove @s.whatsapp.net)
      const targetNumber = CONFIG.targetJid.replace('@s.whatsapp.net', '')
      
      let configText = `*KONFIGURASI SISTEM*\n\n`
      configText += `Git User:\n`
      configText += `  Name: ${CONFIG.git.name}\n`
      configText += `  Email: ${CONFIG.git.email}\n\n`
      configText += `Schedule:\n`
      configText += `  Jam: ${scheduleText} WIB\n`
      configText += `  Timezone: ${CONFIG.timezone}\n\n`
      configText += `Notification:\n`
      configText += `  Nomor: ${targetNumber}\n\n`
      configText += `Retry Settings:\n`
      configText += `  Max Retries: ${CONFIG.maxRetries}\n`
      configText += `  Retry Delay: ${CONFIG.retryDelay}ms\n`
      
      if (repoInfo) {
        configText += `\nRepository Info:\n`
        configText += `  Repo: ${repoInfo.repoName}\n`
        configText += `  Branch: ${repoInfo.branch}\n`
        configText += `  Last Commit: ${repoInfo.lastCommit}\n`
      }

      return m.reply(configText)
    }

    // DEFAULT - Show menu
    const isActive = getAutoUpdateStatus()
    
    // Build menu rows based on status
    const menuRows = []
    
    // Show Start only if inactive, Stop only if active
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
    
    // Always show these options
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
        header: "Config",
        title: "Konfigurasi",
        description: "Lihat pengaturan sistem",
        id: ".autoupdate config"
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

    return conn.sendButton(m.chat, {
      header: "AUTO UPDATE MENU",
      body: `*Pengaturan Update Otomatis*\n\nStatus Saat Ini: ${isActive ? 'AKTIF' : 'NONAKTIF'}\nJadwal: 00:00 WIB (Daily)\n\nPilih aksi di bawah ini:`,
      footer: "GitHub Automation System",
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
    `Mohon tunggu...`
  )

  const result = await githubUpload(conn, commitMessage)

  await sendReportButton(conn, m.chat, result, "LAPORAN UPDATE MANUAL", m)

  // Delete loading message after delay
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

handler.help = ['update [message]', 'autoupdate [start|stop|status|history|config]']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler