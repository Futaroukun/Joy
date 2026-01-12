import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'

const exec = promisify(cp.exec).bind(cp)

// Variabel untuk menyimpan status cron job
let cronJob = null

/**
 * Fungsi utama untuk melakukan Git Push
 */
async function githubUpload(conn, commitMessage) {
  try {
    // Cek Remote URL
    const { stdout: remoteUrl } = await exec('git config --get remote.origin.url')
    const repoUrl = remoteUrl.trim()
      .replace('git@github.com:', 'https://github.com/')
      .replace('.git', '')
      .replace(/https:\/\/.*?@github\.com/, 'https://github.com')
    
    const username = repoUrl.split('/')[3]
    const repoName = repoUrl.split('/')[4]

    // Cek Branch
    const { stdout: branchName } = await exec('git branch --show-current')
    const branch = branchName.trim() || 'main'

    // Cek Status Perubahan File
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    const addedFiles = []
    const deletedFiles = []
    const modifiedFiles = []
    const renamedFiles = []

    changes.forEach(change => {
      const status = change.trim().split(' ')[0]
      const file = change.trim().split(' ').slice(1).filter(Boolean).join(' ')

      if (status.includes('A') || status.includes('?')) addedFiles.push(file)
      else if (status.includes('D')) deletedFiles.push(file)
      else if (status.includes('R')) renamedFiles.push(file)
      else modifiedFiles.push(file)
    })

    if (!changes.length) {
      return {
        success: false,
        message: `⚠️ *GITHUB UPDATE CANCELLED*

📂 *Status:* Direktori Bersih
ℹ️ Tidak ada perubahan file baru yang perlu di-upload.`
      }
    }

    // Eksekusi Git Commands
    const gitCommands = [
      'git config --global user.email "raflisetiawan093@gmail.com"',
      'git config --global user.name "Futaroukun"',
      'git add .',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      `git push origin ${branch}`
    ].join(' && ')

    await exec(gitCommands)

    // Ambil Info Commit Terakhir
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const { stdout: commitDate } = await exec('git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"')

    let fileList = ''
    if (addedFiles.length) fileList += `🆕 *Ditambahkan (${addedFiles.length}):*\n` + addedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (modifiedFiles.length) fileList += `📝 *Diubah (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (deletedFiles.length) fileList += `🗑️ *Dihapus (${deletedFiles.length}):*\n` + deletedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (renamedFiles.length) fileList += `🔁 *Diganti Nama (${renamedFiles.length}):*\n` + renamedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n'

    return {
      success: true,
      message: `🚀 *GITHUB PUSH SUCCESS*

👤 *Author:* ${username}
📦 *Repo:* ${repoName}
🌿 *Branch:* ${branch}
📅 *Waktu:* ${commitDate.trim()}

📝 *Pesan Commit:*
${commitMessage}
(Hash: \`${commitHash.trim()}\`)

📊 *Rincian Perubahan:*
${fileList.trim()}

🔗 *Repository Link:*
${repoUrl}`
    }

  } catch (err) {
    return {
      success: false,
      message: `❌ *GITHUB PUSH FAILED*

⚠️ *Error Log:*
\`\`\`
${err.message}
\`\`\`
Cek koneksi internet, konflik file, atau permission repository.`
    }
  }
}

/**
 * Fungsi Auto-Update (Jalan Otomatis)
 */
async function autoUpdate(conn) {
  const now = new Date()
  
  // FIX: Pastikan tanggal yang diambil sesuai zona waktu Jakarta
  const dateStr = now.toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      timeZone: 'Asia/Jakarta' 
  })
  
  const commitMessage = `Auto Update - ${dateStr}`

  console.log('🤖 Auto-update triggered (Server Time UTC: 17:00 | WIB: 00:00)')

  // 1. Lakukan Upload
  const result = await githubUpload(conn, commitMessage)

  // 2. Kirim Notifikasi ke Target Khusus
  const targetJid = '6283854551575@s.whatsapp.net'; // <-- HARDCODED TARGET

  try {
      await conn.sendMessage(targetJid, { 
        text: `🤖 *AUTO UPDATE NOTIFICATION*\n\n${result.message}`,
        contextInfo: {
          externalAdReply: {
            title: "Auto GitHub Update",
            body: "Scheduled update at midnight (WIB)",
            thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            sourceUrl: "https://github.com",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      })
  } catch (err) {
      console.error('Failed to send auto-update notification:', err)
  }
}

// Start cron job
function startAutoUpdate(conn) {
  if (cronJob) {
    console.log('⚠️ Cron job already running')
    return false
  }

  // FIX: Menggunakan jam 17:00 UTC (Server Time)
  // 17:00 UTC = 00:00 WIB (Indonesia)
  // Format Cron: Menit Jam * * *
  cronJob = cron.schedule('0 17 * * *', () => {
    autoUpdate(conn)
  }, {
    // HAPUS opsi timezone agar mengikuti waktu server (biasanya UTC)
    // timezone: "Asia/Jakarta" <--- Sering bermasalah di VPS/Panel
  })

  console.log('✅ Auto-update scheduled: 17:00 Server Time (00:00 WIB)')
  return true
}

// Stop cron job
function stopAutoUpdate() {
  if (cronJob) {
    cronJob.stop()
    cronJob = null
    console.log('🛑 Auto-update stopped')
    return true
  }
  return false
}

const handler = async (m, { conn, isOwner, args, command }) => {
  if (!isOwner) return

  // === MODE 1: PENGATURAN AUTO UPDATE ===
  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      return m.reply(started 
        ? `✅ *AUTO UPDATE ENABLED*\n\n⏰ Jadwal: Setiap hari jam 17:00 UTC (00:00 WIB).\n📨 Laporan: 6283854551575`
        : `⚠️ Auto-update sudah berjalan`)
    }

    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      return m.reply(stopped 
        ? `🛑 *AUTO UPDATE DISABLED*\n\nUpdate otomatis telah dihentikan`
        : `⚠️ Auto-update tidak sedang berjalan`)
    }

    if (action === 'status') {
      return m.reply(cronJob 
        ? `✅ *AUTO UPDATE STATUS*\n\n🟢 Status: Aktif\n⏰ Jadwal: Setiap hari jam 00:00 WIB (17:00 UTC)`
        : `🔴 *AUTO UPDATE STATUS*\n\n⚠️ Status: Tidak aktif`)
    }

    return m.reply(`📌 *AUTO UPDATE COMMANDS*

• .autoupdate start - Mulai auto-update
• .autoupdate stop - Hentikan auto-update  
• .autoupdate status - Cek status`)
  }

  // === MODE 2: MANUAL UPDATE (PUSH SEKARANG) ===
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Maintenance & Update - ${dateStr}`

  let loading
  try {
    loading = await conn.sendMessage(m.chat, {
      text: `⚙️ *SYSTEM SYNCHRONIZATION*

🔄 *Status:* Mengirim perubahan ke GitHub...
💬 *Pesan:* ${commitMessage}
🌿 *Target:* Origin

Mohon tunggu sebentar...`
    }, { quoted: m })
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  // Kirim laporan manual ke chat tempat command diketik
  await conn.sendMessage(m.chat, { 
    text: result.message,
    contextInfo: {
      externalAdReply: {
        title: "GitHub Update Notification",
        body: `Branch: ${commitMessage}`,
        thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        sourceUrl: result.message.split('Link Repo:\n')[1] || "https://github.com",
        mediaType: 1,
        renderLargerThumbnail: true
      }
    }
  }, { quoted: m })

  if (loading?.key) {
    setTimeout(async () => {
      try {
        await conn.sendMessage(m.chat, { delete: loading.key })
      } catch {}
    }, 2000)
  }
}

handler.help = ['update', 'push', 'autoupdate']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler