import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'
import fs from 'fs/promises'
import path from 'path'

const exec = promisify(cp.exec).bind(cp)

// State management
let cronJob = null
const LOG_FILE = 'update_history.json'

// Configuration
const CONFIG = {
  git: {
    email: "raflisetiawan093@gmail.com",
    name: "Futaroukun"
  },
  schedule: '0 0 * * *', // Midnight WIB (fixed from 17:00)
  targetJid: '6283854551575@s.whatsapp.net',
  maxRetries: 3,
  retryDelay: 5000
}

// ==================== UTILITY FUNCTIONS ====================

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
    } catch {
      // File doesn't exist yet
    }
    
    logs.unshift({
      ...logData,
      timestamp: new Date().toISOString()
    })
    
    // Keep last 50 logs
    if (logs.length > 50) logs = logs.slice(0, 50)
    
    await fs.writeFile(LOG_FILE, JSON.stringify(logs, null, 2))
  } catch (err) {
    console.error('Failed to save log:', err)
  }
}

function sanitizeCommitMessage(message) {
  return message
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .substring(0, 500) // Limit message length
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

    if (status.includes('A') || status.includes('?')) {
      addedFiles.push(file)
    } else if (status.includes('D')) {
      deletedFiles.push(file)
    } else if (status.includes('R')) {
      renamedFiles.push(file)
    } else if (status.includes('M')) {
      modifiedFiles.push(file)
    }
  })

  return { addedFiles, deletedFiles, modifiedFiles, renamedFiles }
}

function formatFileList(files) {
  if (!files || files.length === 0) return ''
  
  // Limit to first 20 files to avoid message overflow
  const displayFiles = files.slice(0, 20)
  const remaining = files.length - displayFiles.length
  
  let result = displayFiles.map(f => `• ${f}`).join('\n')
  if (remaining > 0) {
    result += `\n• ... dan ${remaining} file lainnya`
  }
  return result
}

// ==================== MAIN FUNCTIONS ====================

async function getRepoInfo() {
  try {
    const { stdout: remoteUrlOut } = await exec('git config --get remote.origin.url')
    let repoUrl = remoteUrlOut.trim()
    
    // Clean URL
    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')
    if (repoUrl.startsWith('git@')) {
      repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    }
    repoUrl = repoUrl.replace('.git', '')

    const splitUrl = repoUrl.split('/')
    const username = splitUrl[splitUrl.length - 2]
    const repoName = splitUrl[splitUrl.length - 1]

    const { stdout: branchOut } = await exec('git branch --show-current')
    const branch = branchOut.trim() || 'main'

    return { repoUrl, username, repoName, branch }
  } catch (error) {
    throw new Error(`Gagal mendapatkan info repository: ${error.message}`)
  }
}

async function checkGitChanges() {
  try {
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim()
    
    if (!changes) {
      return { hasChanges: false, stats: null }
    }

    const stats = parseGitStatus(changesStdout)
    const totalChanges = stats.addedFiles.length + 
                        stats.deletedFiles.length + 
                        stats.modifiedFiles.length + 
                        stats.renamedFiles.length

    return { hasChanges: true, stats, totalChanges }
  } catch (error) {
    throw new Error(`Gagal mengecek perubahan: ${error.message}`)
  }
}

async function performGitCommit(commitMessage) {
  // Configure git user
  await runGitCommand(`git config user.email "${CONFIG.git.email}"`)
  await runGitCommand(`git config user.name "${CONFIG.git.name}"`)
  
  // Stage all changes
  const addResult = await runGitCommand('git add .')
  if (!addResult.success) {
    throw new Error(`Gagal staging file: ${addResult.error.message}`)
  }

  // Commit
  const sanitized = sanitizeCommitMessage(commitMessage)
  const commitResult = await runGitCommand(`git commit -m "${sanitized}"`)
  
  if (!commitResult.success) {
    if (commitResult.error.message.includes('nothing to commit')) {
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

async function githubUpload(conn, commitMessage) {
  const startTime = Date.now()
  
  try {
    // Get repository info
    const repoInfo = await getRepoInfo()
    
    // Check for changes
    const changeCheck = await checkGitChanges()
    
    if (!changeCheck.hasChanges) {
      await saveUpdateLog({
        success: false,
        reason: 'no_changes',
        message: commitMessage
      })
      
      return {
        success: false,
        repoUrl: repoInfo.repoUrl,
        shortMessage: "Tidak Ada Perubahan",
        message: `*UPDATE DIBATALKAN*\n\n✓ Repository: *${repoInfo.repoName}*\n✓ Branch: *${repoInfo.branch}*\n\n_Direktori bersih, tidak ada file yang perlu di-upload._`
      }
    }

    // Perform commit
    await performGitCommit(commitMessage)
    
    // Perform push
    await performGitPush(repoInfo.branch)
    
    // Get commit info
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const now = new Date()
    const commitDate = now.toLocaleString('id-ID', { 
      timeZone: 'Asia/Jakarta',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false
    })

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Format file changes
    const { addedFiles, deletedFiles, modifiedFiles, renamedFiles } = changeCheck.stats
    
    let fileList = ''
    if (addedFiles.length) {
      fileList += `*✨ New (${addedFiles.length}):*\n${formatFileList(addedFiles)}\n\n`
    }
    if (modifiedFiles.length) {
      fileList += `*📝 Modified (${modifiedFiles.length}):*\n${formatFileList(modifiedFiles)}\n\n`
    }
    if (renamedFiles.length) {
      fileList += `*🔄 Renamed (${renamedFiles.length}):*\n${formatFileList(renamedFiles)}\n\n`
    }
    if (deletedFiles.length) {
      fileList += `*🗑️ Deleted (${deletedFiles.length}):*\n${formatFileList(deletedFiles)}\n\n`
    }

    const successMessage = `*✅ PUSH BERHASIL*\n\n` +
      `👤 Author: *${repoInfo.username}*\n` +
      `📦 Repo: *${repoInfo.repoName}*\n` +
      `🌿 Branch: *${repoInfo.branch}*\n` +
      `📅 Date: *${commitDate}*\n` +
      `⏱️ Duration: *${duration}s*\n\n` +
      `💬 Commit: _${commitMessage}_\n` +
      `🔖 Hash: \`${commitHash.trim()}\`\n\n` +
      `*📁 Files Changed (${changeCheck.totalChanges}):*\n${fileList || "_Tidak ada detail file_"}`

    await saveUpdateLog({
      success: true,
      repo: repoInfo.repoName,
      branch: repoInfo.branch,
      hash: commitHash.trim(),
      message: commitMessage,
      filesChanged: changeCheck.totalChanges,
      duration
    })

    return {
      success: true,
      repoUrl: repoInfo.repoUrl,
      shortMessage: "Push Berhasil",
      message: successMessage
    }

  } catch (err) {
    if (err.message === 'NOTHING_TO_COMMIT') {
      return {
        success: false,
        repoUrl: "https://github.com",
        shortMessage: "Tidak Ada Perubahan",
        message: `*UPDATE DIBATALKAN*\n\n_Tidak ada perubahan untuk di-commit._`
      }
    }

    await saveUpdateLog({
      success: false,
      error: err.message,
      message: commitMessage
    })

    return {
      success: false,
      repoUrl: "https://github.com",
      shortMessage: "Push Gagal",
      message: `*❌ PUSH GAGAL*\n\n*Error:*\n\`\`\`${err.message}\`\`\`\n\n_Coba lagi atau cek konfigurasi Git._`
    }
  }
}

// ==================== NOTIFICATION FUNCTIONS ====================

async function sendReportButton(conn, jid, result, title, quoted = null) {
  const linkButton = {
    name: "cta_url",
    buttonParamsJson: JSON.stringify({
      display_text: "🔗 Buka Repository",
      url: result.repoUrl || "https://github.com",
      merchant_url: result.repoUrl || "https://github.com"
    })
  }

  const listButton = {
    name: "single_select",
    buttonParamsJson: JSON.stringify({
      title: "⚙️ Opsi Lainnya",
      sections: [{
        title: "Manajemen Bot",
        highlight_label: "Manage",
        rows: [
          { 
            header: "📊 Status", 
            title: "Cek Status Auto Update", 
            description: "Lihat status dan riwayat update", 
            id: ".autoupdate status" 
          },
          { 
            header: "📜 History", 
            title: "Riwayat Update", 
            description: "Lihat 10 update terakhir", 
            id: ".autoupdate history" 
          },
          { 
            header: "🔄 Restart", 
            title: "Restart Bot", 
            description: "Mulai ulang sistem bot", 
            id: ".restart" 
          },
          {
            header: "📋 Menu",
            title: "Menu Utama",
            description: "Kembali ke menu bot",
            id: ".menu"
          }
        ]
      }]
    })
  }

  const content = {
    header: title,
    image: { url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" }, 
    body: result.message,
    footer: "🤖 Joy Auto Update System",
    buttons: [linkButton, listButton]
  }

  await conn.sendButton(jid, content, { quoted })
}

// ==================== AUTO UPDATE FUNCTIONS ====================

async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric', 
    timeZone: 'Asia/Jakarta' 
  })
  const timeStr = now.toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jakarta'
  })
  
  const commitMessage = `🤖 Auto Update - ${dateStr} ${timeStr}`
  
  const result = await githubUpload(conn, commitMessage)

  try {
    await sendReportButton(
      conn, 
      CONFIG.targetJid, 
      result, 
      "🤖 AUTO UPDATE NOTIFICATION"
    )
  } catch (err) {
    console.error('Failed to send notification:', err)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) return false
  
  cronJob = cron.schedule(CONFIG.schedule, () => {
    autoUpdate(conn)
  }, {
    timezone: "Asia/Jakarta"
  })
  
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

function getAutoUpdateStatus() {
  return cronJob !== null
}

// ==================== COMMAND HANDLER ====================

const handler = async (m, { conn, isOwner, args, command, usedPrefix }) => {
  if (!isOwner) return m.reply('❌ Perintah ini hanya untuk owner.')

  // AUTOUPDATE COMMAND
  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    // START
    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      const msg = started 
        ? `*✅ AUTO UPDATE DIAKTIFKAN*\n\n📅 Jadwal: Setiap hari jam 00:00 WIB\n⏰ Timezone: Asia/Jakarta\n\n_Bot akan otomatis push ke GitHub setiap hari._`
        : `*ℹ️ AUTO UPDATE SUDAH AKTIF*\n\n_Gunakan .autoupdate status untuk info detail._`
      return m.reply(msg)
    }

    // STOP
    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      const msg = stopped 
        ? `*🛑 AUTO UPDATE DINONAKTIFKAN*\n\n_Jadwal otomatis telah dimatikan._`
        : `*ℹ️ AUTO UPDATE SUDAH MATI*\n\n_Gunakan .autoupdate start untuk mengaktifkan._`
      return m.reply(msg)
    }

    // STATUS
    if (action === 'status') {
      const isActive = getAutoUpdateStatus()
      const statusText = isActive 
        ? `*🟢 STATUS: AKTIF*\n\n📅 Jadwal: 00:00 WIB\n⏰ Timezone: Asia/Jakarta\n🎯 Target: Auto Push Daily\n\n_Update otomatis berjalan normal._`
        : `*🔴 STATUS: NONAKTIF*\n\n_Auto update tidak berjalan._\n_Gunakan tombol di bawah untuk mengaktifkan._`
      
      const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: isActive ? "⚙️ Matikan" : "⚙️ Aktifkan",
          sections: [{
            title: "Kontrol Auto Update",
            rows: [
              { 
                header: isActive ? "🛑 Stop" : "▶️ Start", 
                title: isActive ? "Matikan Auto Update" : "Aktifkan Auto Update", 
                description: isActive ? "Hentikan jadwal otomatis" : "Jalankan jadwal otomatis", 
                id: isActive ? ".autoupdate stop" : ".autoupdate start" 
              },
              { 
                header: "📜 History", 
                title: "Lihat Riwayat", 
                description: "Tampilkan riwayat update", 
                id: ".autoupdate history" 
              }
            ]
          }]
        })
      }]
      
      return conn.sendButton(m.chat, {
        header: "📊 AUTO UPDATE STATUS",
        body: statusText,
        footer: "System Configuration",
        buttons
      }, { quoted: m })
    }

    // HISTORY
    if (action === 'history' || action === 'log') {
      try {
        const data = await fs.readFile(LOG_FILE, 'utf-8')
        const logs = JSON.parse(data)
        
        if (logs.length === 0) {
          return m.reply('📭 *Belum ada riwayat update.*')
        }

        const recent = logs.slice(0, 10)
        let historyText = `*📜 RIWAYAT UPDATE (10 Terakhir)*\n\n`
        
        recent.forEach((log, i) => {
          const date = new Date(log.timestamp).toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
          })
          const status = log.success ? '✅' : '❌'
          historyText += `${i + 1}. ${status} ${date}\n`
          historyText += `   ${log.message || 'N/A'}\n`
          if (log.filesChanged) historyText += `   📁 ${log.filesChanged} files\n`
          historyText += `\n`
        })

        return m.reply(historyText)
      } catch {
        return m.reply('📭 *Belum ada riwayat update.*')
      }
    }

    // DEFAULT - Show menu
    const buttons = [{
      name: "single_select",
      buttonParamsJson: JSON.stringify({
        title: "⚙️ Pilih Aksi",
        sections: [{
          title: "Konfigurasi Auto Update",
          rows: [
            { 
              header: "▶️ Start", 
              title: "Aktifkan Auto Update", 
              description: "Jalankan jadwal update otomatis", 
              id: ".autoupdate start" 
            },
            { 
              header: "🛑 Stop", 
              title: "Matikan Auto Update", 
              description: "Hentikan jadwal update otomatis", 
              id: ".autoupdate stop" 
            },
            { 
              header: "📊 Status", 
              title: "Cek Status", 
              description: "Lihat status auto update sekarang", 
              id: ".autoupdate status" 
            },
            { 
              header: "📜 History", 
              title: "Riwayat Update", 
              description: "Lihat 10 update terakhir", 
              id: ".autoupdate history" 
            }
          ]
        }]
      })
    }]
    
    return conn.sendButton(m.chat, {
      header: "🤖 AUTO UPDATE CONFIG",
      body: `*Pengaturan Update Otomatis*\n\nStatus: ${getAutoUpdateStatus() ? '🟢 Aktif' : '🔴 Nonaktif'}\nJadwal: 00:00 WIB Daily\n\nPilih aksi di bawah:`,
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
    timeZone: 'Asia/Jakarta' 
  })
  const commitMessage = args.join(' ').trim() || `📝 Update Manual - ${dateStr}`

  const loading = await m.reply(`*🔄 Mengirim perubahan ke GitHub...*\n\n💬 "${commitMessage}"\n\n_Mohon tunggu..._`)

  const result = await githubUpload(conn, commitMessage)

  await sendReportButton(conn, m.chat, result, "📤 MANUAL UPDATE REPORT", m)

  // Delete loading message
  if (loading?.key) {
    setTimeout(async () => {
      try {
        await conn.sendMessage(m.chat, { delete: loading.key })
      } catch {}
    }, 2000)
  }
}

handler.help = ['update [message]', 'autoupdate [start|stop|status|history]']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler