import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'

const exec = promisify(cp.exec).bind(cp)

// Variabel untuk menyimpan status cron job
let cronJob = null

/**
 * Fungsi helper untuk mengeksekusi perintah shell dengan aman
 */
async function runGitCommand(command) {
    try {
        const { stdout, stderr } = await exec(command)
        return { success: true, stdout, stderr }
    } catch (error) {
        return { success: false, error }
    }
}

/**
 * Fungsi utama untuk melakukan Git Push
 */
async function githubUpload(conn, commitMessage) {
  try {
    // 1. Cek Remote URL & Info Repo
    const { stdout: remoteUrlOut } = await exec('git config --get remote.origin.url')
    let repoUrl = remoteUrlOut.trim()
    
    // --- [SECURITY FIX] SANITASI TOKEN ---
    // Regex ini menghapus "user:token@" dari URL agar tidak bocor di chat
    // Mengubah: https://user:ghp_token@github.com/repo
    // Menjadi: https://github.com/repo
    repoUrl = repoUrl.replace(/(https?:\/\/)[^@]+@/, '$1')

    // Normalisasi URL SSH ke HTTPS untuk display
    if (repoUrl.startsWith('git@')) {
        repoUrl = repoUrl.replace(':', '/').replace('git@', 'https://')
    }
    repoUrl = repoUrl.replace('.git', '')

    const splitUrl = repoUrl.split('/')
    const username = splitUrl[splitUrl.length - 2]
    const repoName = splitUrl[splitUrl.length - 1]

    // 2. Cek Branch Aktif
    const { stdout: branchOut } = await exec('git branch --show-current')
    const branch = branchOut.trim() || 'main'

    // 3. Cek Status Perubahan File
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    if (changes.length === 0) {
      return {
        success: false,
        repoUrl, // Kembalikan URL bersih
        message: `⚠️ *GITHUB UPDATE CANCELLED*

📂 *Status:* Direktori Bersih (Clean)
ℹ️ Tidak ada file baru, diubah, atau dihapus.`
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

    // 4. Konfigurasi User
    await runGitCommand('git config --global user.email "raflisetiawan093@gmail.com"')
    await runGitCommand('git config --global user.name "Futaroukun"')

    // 5. Eksekusi Git Add
    await exec('git add .')

    // 6. Eksekusi Git Commit
    try {
        await exec(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`)
    } catch (commitErr) {
        if (commitErr.message.includes('nothing to commit')) {
             return {
                success: false,
                repoUrl,
                message: `⚠️ *GITHUB UPDATE CANCELLED*
ℹ️ Tidak ada perubahan yang perlu di-commit.`
            }
        }
        throw commitErr 
    }

    // 7. Eksekusi Git Push
    try {
        await exec(`git push origin ${branch}`)
    } catch (pushErr) {
        throw new Error(`Gagal Push ke Remote. Cek koneksi atau permission token.\nDetail: ${pushErr.message}`)
    }

    // 8. Ambil Info Hash
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    
    // Waktu
    const now = new Date()
    const commitDate = now.toLocaleString('en-GB', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false
    }).replace(',', '') 

    // Susun Pesan Laporan
    let fileList = ''
    if (addedFiles.length) fileList += `🆕 *Ditambahkan (${addedFiles.length}):*\n` + addedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (modifiedFiles.length) fileList += `📝 *Diubah (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (deletedFiles.length) fileList += `🗑️ *Dihapus (${deletedFiles.length}):*\n` + deletedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (renamedFiles.length) fileList += `🔁 *Diganti Nama (${renamedFiles.length}):*\n` + renamedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n'

    return {
      success: true,
      repoUrl, // Kembalikan URL yang sudah disanitasi
      message: `🚀 *GITHUB PUSH SUCCESS*

👤 *Author:* ${username}
📦 *Repo:* ${repoName}
🌿 *Branch:* ${branch}
📅 *Waktu:* ${commitDate} WIB

📝 *Pesan Commit:*
${commitMessage}
(Hash: \`${commitHash.trim()}\`)

📊 *Rincian Perubahan:*
${fileList.trim() || "- Tidak ada list file detail -"}

🔗 *Repository Link:*
${repoUrl}`
    }

  } catch (err) {
    return {
      success: false,
      repoUrl: "https://github.com", // Default jika gagal ambil url
      message: `❌ *GITHUB PUSH FAILED*

⚠️ *Error Log:*
\`\`\`
${err.message}
\`\`\`
Cek apakah git remote sudah disetting atau ada file konflik.`
    }
  }
}

// ... (AUTO UPDATE FUNCTIONS SAMA) ...

async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' 
  })
  const commitMessage = `Auto Update - ${dateStr}`
  console.log('🤖 Auto-update triggered')

  const result = await githubUpload(conn, commitMessage)
  const targetJid = '6283854551575@s.whatsapp.net'; 

  try {
      await conn.sendMessage(targetJid, { 
        text: `🤖 *AUTO UPDATE NOTIFICATION*\n\n${result.message}`,
        contextInfo: {
          externalAdReply: {
            title: "Auto GitHub Update",
            body: result.success ? "Success" : "Failed",
            thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            // Gunakan URL Bersih dari result
            sourceUrl: result.repoUrl || "https://github.com",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      })
  } catch (err) {
      console.error('Failed to send auto-update notification:', err)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) {
    console.log('⚠️ Cron job already running')
    return false
  }
  cronJob = cron.schedule('0 17 * * *', () => {
    autoUpdate(conn)
  })
  console.log('✅ Auto-update scheduled: 17:00 UTC (00:00 WIB)')
  return true
}

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

  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      return m.reply(started 
        ? `✅ *AUTO UPDATE ENABLED*\n\n⏰ Jadwal: Setiap hari jam 00:00 WIB.\n📨 Laporan: 6283854551575`
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
        ? `✅ *AUTO UPDATE STATUS*\n\n🟢 Status: Aktif\n⏰ Jadwal: Setiap hari jam 00:00 WIB`
        : `🔴 *AUTO UPDATE STATUS*\n\n⚠️ Status: Tidak aktif`)
    }

    return m.reply(`📌 *AUTO UPDATE COMMANDS*

• .autoupdate start - Mulai auto-update
• .autoupdate stop - Hentikan auto-update  
• .autoupdate status - Cek status`)
  }

  // MANUAL UPDATE
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Maintenance & Update - ${dateStr}`

  let loading
  try {
    loading = await m.reply(`⚙️ *SYSTEM SYNCHRONIZATION*\n\n🔄 *Status:* Mengirim perubahan ke GitHub...\n💬 *Pesan:* ${commitMessage}`)
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  await conn.sendMessage(m.chat, { 
    text: result.message,
    contextInfo: {
      externalAdReply: {
        title: "GitHub Update Notification",
        body: result.success ? `Branch: ${commitMessage}` : "Failed",
        thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
        // Gunakan URL Bersih dari result, BUKAN parsing dari pesan teks
        sourceUrl: result.repoUrl || "https://github.com",
        mediaType: 1,
        renderLargerThumbnail: true
      }
    }
  }, { quoted: m })

  if (loading?.key) {
    setTimeout(async () => { try { await conn.sendMessage(m.chat, { delete: loading.key }) } catch {} }, 2000)
  }
}

handler.help = ['update', 'push', 'autoupdate']
handler.tags = ['owner']
handler.command = /^(update|push|u|autoupdate)$/i
handler.owner = true

export default handler