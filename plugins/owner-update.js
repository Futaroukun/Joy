import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'

const exec = promisify(cp.exec).bind(cp)

// Variabel status cron
let cronJob = null

// --- HELPER FUNCTIONS ---
async function runGitCommand(command) {
    try {
        const { stdout, stderr } = await exec(command)
        return { success: true, stdout, stderr }
    } catch (error) {
        return { success: false, error }
    }
}

/**
 * Fungsi Utama: Upload ke GitHub
 */
async function githubUpload(conn, commitMessage) {
  try {
    // 1. Cek Remote URL & Sanitasi Token
    const { stdout: remoteUrlOut } = await exec('git config --get remote.origin.url')
    let repoUrl = remoteUrlOut.trim()
    
    // Hapus token (username:token@)
    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')

    if (repoUrl.startsWith('git@')) {
        repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    }
    repoUrl = repoUrl.replace('.git', '')

    const splitUrl = repoUrl.split('/')
    const username = splitUrl[splitUrl.length - 2]
    const repoName = splitUrl[splitUrl.length - 1]

    // 2. Cek Branch
    const { stdout: branchOut } = await exec('git branch --show-current')
    const branch = branchOut.trim() || 'main'

    // 3. Cek Perubahan
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    if (changes.length === 0) {
      return {
        success: false,
        repoUrl,
        shortMessage: "Tidak ada perubahan file.",
        message: `⚠️ *UPDATE DIBATALKAN*\nDirektori bersih, tidak ada yang perlu di-upload.`
      }
    }

    // Kategorisasi File
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
      else modifiedFiles.push(file)
    })

    // 4. Git Commands
    await runGitCommand('git config --global user.email "raflisetiawan093@gmail.com"')
    await runGitCommand('git config --global user.name "Futaroukun"')
    await exec('git add .')

    try {
        await exec(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`)
    } catch (commitErr) {
        if (commitErr.message.includes('nothing to commit')) {
             return {
                success: false,
                repoUrl,
                shortMessage: "Tidak ada perubahan.",
                message: `⚠️ *UPDATE DIBATALKAN*\nTidak ada perubahan untuk di-commit.`
            }
        }
        throw commitErr 
    }

    try {
        await exec(`git push origin ${branch}`)
    } catch (pushErr) {
        throw new Error(`Gagal Push: ${pushErr.message}`)
    }

    // 5. Info Hasil
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const now = new Date()
    const commitDate = now.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false
    })

    let fileList = ''
    if (addedFiles.length) fileList += `🆕 *New (${addedFiles.length}):*\n` + addedFiles.map(f => `◦ ${f}`).join('\n') + '\n'
    if (modifiedFiles.length) fileList += `📝 *Mod (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `◦ ${f}`).join('\n') + '\n'
    if (deletedFiles.length) fileList += `🗑️ *Del (${deletedFiles.length}):*\n` + deletedFiles.map(f => `◦ ${f}`).join('\n') + '\n'

    return {
      success: true,
      repoUrl,
      shortMessage: "Push Berhasil",
      message: `🚀 *PUSH SUCCESS*\n\n👤 Author: ${username}\n📦 Repo: ${repoName}\n🌿 Branch: ${branch}\n📅 Date: ${commitDate}\n\n📝 *Commit:* ${commitMessage}\n🔑 *Hash:* ${commitHash.trim()}\n\n📊 *Files:*\n${fileList || "- Tidak ada list detail -"}`
    }

  } catch (err) {
    return {
      success: false,
      repoUrl: "https://github.com",
      shortMessage: "Push Gagal",
      message: `❌ *PUSH FAILED*\n\nError:\n${err.message}`
    }
  }
}

/**
 * Fungsi Mengirim Laporan Menggunakan List Button (Native Flow)
 */
async function sendReportButton(conn, jid, result, title, quoted = null) {
    // 1. Tombol Link (Buka Repo)
    const linkButton = {
        name: "cta_url",
        buttonParamsJson: JSON.stringify({
            display_text: "🔗 Buka Repository",
            url: result.repoUrl || "https://github.com",
            merchant_url: result.repoUrl || "https://github.com"
        })
    }

    // 2. Tombol List (Menu Opsi) - PERBAIKAN DI SINI
    const listButton = {
        name: "single_select",
        buttonParamsJson: JSON.stringify({
            title: "📋 Opsi Lainnya",
            sections: [
                {
                    title: "Manajemen Bot",
                    highlight_label: "Menu",
                    rows: [
                        { 
                            header: "Cek Status", 
                            title: "Status Auto Update", 
                            description: "Lihat status auto update saat ini", 
                            id: ".autoupdate status" 
                        },
                        { 
                            header: "Restart Bot", 
                            title: "Restart Sistem", 
                            description: "Restart ulang bot WhatsApp", 
                            id: ".restart" 
                        }
                    ]
                }
            ]
        })
    }

    // 3. Susun Konten
    const content = {
        header: title,
        image: { url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" }, 
        body: result.message,
        footer: "GitHub Automation System",
        buttons: [linkButton, listButton]
    }

    // 4. Kirim
    await conn.sendButton(jid, content, { quoted: quoted })
}


/**
 * Logika Auto Update
 */
async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = `Auto Update - ${dateStr}`
  
  const result = await githubUpload(conn, commitMessage)
  const targetJid = '6283854551575@s.whatsapp.net' // Nomor Owner

  try {
      await sendReportButton(conn, targetJid, result, "🤖 AUTO UPDATE NOTIFICATION")
  } catch (err) {
      console.error("Gagal kirim notif auto update:", err)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) return false
  cronJob = cron.schedule('0 17 * * *', () => { // 17:00 UTC = 00:00 WIB
    autoUpdate(conn)
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

// --- HANDLER UTAMA ---
const handler = async (m, { conn, isOwner, args, command, usedPrefix }) => {
  if (!isOwner) return

  // === MODE 1: PENGATURAN AUTO UPDATE ===
  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    // --- START ---
    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      const msg = started 
        ? `✅ *AUTO UPDATE DIAKTIFKAN*\nJadwal: 00:00 WIB setiap hari.`
        : `⚠️ *Auto update sudah berjalan.*`
      return m.reply(msg)
    }

    // --- STOP ---
    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      const msg = stopped 
        ? `🛑 *AUTO UPDATE DIMATIKAN*`
        : `⚠️ *Auto update tidak aktif.*`
      return m.reply(msg)
    }

    // --- STATUS ---
    if (action === 'status') {
      const statusText = cronJob 
        ? `✅ *STATUS: AKTIF*\n🕒 Jadwal: 00:00 WIB\n\nKlik tombol di bawah untuk mematikan.`
        : `🔴 *STATUS: MATI*\n\nKlik tombol di bawah untuk menyalakan.`
      
      const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
            title: "⚙️ Ubah Status",
            sections: [{
                title: "Kontrol Auto Update",
                highlight_label: "Config",
                rows: [
                    { 
                        header: "Aktifkan", 
                        title: "Nyalakan Auto Update", 
                        description: "Aktifkan penjadwalan update otomatis", 
                        id: ".autoupdate start" 
                    },
                    { 
                        header: "Matikan", 
                        title: "Matikan Auto Update", 
                        description: "Hentikan penjadwalan update otomatis", 
                        id: ".autoupdate stop" 
                    }
                ]
            }]
        })
      }]
      
      return conn.sendButton(m.chat, {
          header: "AUTO UPDATE STATUS",
          body: statusText,
          footer: "System Config",
          buttons: buttons
      }, { quoted: m })
    }

    // --- MENU UTAMA (.autoupdate) ---
    const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
            title: "📋 Pilih Aksi",
            sections: [{
                title: "Konfigurasi Auto Update",
                highlight_label: "Menu",
                rows: [
                    { 
                        header: "Start", 
                        title: "Start Auto Update", 
                        description: "Nyalakan penjadwalan otomatis", 
                        id: ".autoupdate start" 
                    },
                    { 
                        header: "Stop", 
                        title: "Stop Auto Update", 
                        description: "Hentikan penjadwalan otomatis", 
                        id: ".autoupdate stop" 
                    },
                    { 
                        header: "Status", 
                        title: "Cek Status", 
                        description: "Lihat status auto update saat ini", 
                        id: ".autoupdate status" 
                    }
                ]
            }]
        })
    }]
    
    return conn.sendButton(m.chat, {
        header: "AUTO UPDATE CONFIG",
        body: "Silakan pilih konfigurasi untuk update otomatis:",
        footer: "GitHub Automation",
        buttons: buttons
    }, { quoted: m })
  }

  // === MODE 2: MANUAL UPDATE (PUSH) ===
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Update Manual - ${dateStr}`

  let loading
  try {
     loading = await m.reply(`⏳ *Sedang mengirim perubahan ke GitHub...*\n"${commitMessage}"`)
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  // Kirim laporan hasil pakai List Button
  await sendReportButton(conn, m.chat, result, "MANUAL UPDATE REPORT", m)

  if (loading?.key) {
    setTimeout(async () => { try { await conn.sendMessage(m.chat, { delete: loading.key }) } catch {} }, 2000)
  }
}

handler.help = ['update', 'autoupdate']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler