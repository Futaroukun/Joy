import cp from 'child_process'
import { promisify } from 'util'
import cron from 'node-cron'

const exec = promisify(cp.exec).bind(cp)

let cronJob = null

async function runGitCommand(command) {
    try {
        const { stdout, stderr } = await exec(command)
        return { success: true, stdout, stderr }
    } catch (error) {
        return { success: false, error }
    }
}

async function githubUpload(conn, commitMessage) {
  try {
    const { stdout: remoteUrlOut } = await exec('git config --get remote.origin.url')
    let repoUrl = remoteUrlOut.trim()
    
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

    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    if (changes.length === 0) {
      return {
        success: false,
        repoUrl,
        shortMessage: "Gak ada perubahan.",
        message: `*UPDATE DIBATALIN*\n\nDirektori masih bersih, gak ada file yang perlu di-upload.`
      }
    }

    const addedFiles = []
    const deletedFiles = []
    const modifiedFiles = []

    changes.forEach(change => {
      const parts = change.trim().split(/\s+/)
      const status = parts[0]
      const file = parts.slice(1).join(' ')

      if (status.includes('A') || status.includes('?')) addedFiles.push(file)
      else if (status.includes('D')) deletedFiles.push(file)
      else modifiedFiles.push(file)
    })

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
                shortMessage: "Gak ada perubahan.",
                message: `*UPDATE DIBATALIN*\n\nGak ada perubahan buat di-commit.`
            }
        }
        throw commitErr 
    }

    try {
        await exec(`git push origin ${branch}`)
    } catch (pushErr) {
        throw new Error(`Gagal Push: ${pushErr.message}`)
    }

    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const now = new Date()
    const commitDate = now.toLocaleString('id-ID', { 
        timeZone: 'Asia/Jakarta',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        hour12: false
    })

    let fileList = ''
    if (addedFiles.length) fileList += `*New (${addedFiles.length}):*\n` + addedFiles.map(f => `• ${f}`).join('\n') + '\n'
    if (modifiedFiles.length) fileList += `*Mod (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `• ${f}`).join('\n') + '\n'
    if (deletedFiles.length) fileList += `*Del (${deletedFiles.length}):*\n` + deletedFiles.map(f => `• ${f}`).join('\n') + '\n'

    return {
      success: true,
      repoUrl,
      shortMessage: "Push Berhasil",
      message: `*PUSH SUCCESS*\n\nAuthor: *${username}*\nRepo: *${repoName}*\nBranch: *${branch}*\nDate: *${commitDate}*\n\nCommit: *${commitMessage}*\nHash: \`${commitHash.trim()}\`\n\n*Files:*\n${fileList || "- Gak ada detail file -"}`
    }

  } catch (err) {
    return {
      success: false,
      repoUrl: "https://github.com",
      shortMessage: "Push Gagal",
      message: `*PUSH FAILED*\n\nError:\n\`${err.message}\``
    }
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
            title: "Opsi Lainnya",
            sections: [
                {
                    title: "Manajemen Bot",
                    highlight_label: "Manage",
                    rows: [
                        { 
                            header: "Cek Status", 
                            title: "Status Auto Update", 
                            description: "Lihat status auto update sekarang", 
                            id: ".autoupdate status" 
                        },
                        { 
                            header: "Restart Bot", 
                            title: "Restart Sistem", 
                            description: "Mulai ulang bot WhatsApp", 
                            id: ".restart" 
                        },
                        {
                            header: "Menu",
                            title: "Menu Bot",
                            description: "Lihat menu bot WhatsApp",
                            id: ".menu"
                        }
                    ]
                }
            ]
        })
    }

    const content = {
        header: title,
        image: { url: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png" }, 
        body: result.message,
        footer: "GitHub Automation System",
        buttons: [linkButton, listButton]
    }

    await conn.sendButton(jid, content, { quoted: quoted })
}

async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = `Auto Update - ${dateStr}`
  
  const result = await githubUpload(conn, commitMessage)
  const targetJid = '6283854551575@s.whatsapp.net'

  try {
      await sendReportButton(conn, targetJid, result, "🤖 AUTO UPDATE NOTIFICATION")
  } catch (err) {
      console.error(err)
  }
}

function startAutoUpdate(conn) {
  if (cronJob) return false
  cronJob = cron.schedule('0 17 * * *', () => {
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

const handler = async (m, { conn, isOwner, args, command, usedPrefix }) => {
  if (!isOwner) return

  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      const msg = started 
        ? `*AUTO UPDATE AKTIF*\nJadwal: Jam 00:00 WIB tiap hari.`
        : `*Auto update udah jalan kok.*`
      return m.reply(msg)
    }

    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      const msg = stopped 
        ? `*AUTO UPDATE DIMATIIN*`
        : `*Emang lagi gak aktif auto updatenya.*`
      return m.reply(msg)
    }

    if (action === 'status') {
      const statusText = cronJob 
        ? `*STATUS: AKTIF*\nJadwal: 00:00 WIB\n\nPake tombol di bawah buat matiin.`
        : `*STATUS: MATI*\n\nPake tombol di bawah buat nyalain.`
      
      const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
            title: "Ubah Status",
            sections: [{
                title: "Kontrol Auto Update",
                highlight_label: "Setting",
                rows: [
                    { 
                        header: "Aktifkan", 
                        title: "Nyalakan Auto Update", 
                        description: "Nyalain jadwal update otomatis", 
                        id: ".autoupdate start" 
                    },
                    { 
                        header: "Matikan", 
                        title: "Matikan Auto Update", 
                        description: "Berentiin jadwal update otomatis", 
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

    const buttons = [{
        name: "single_select",
        buttonParamsJson: JSON.stringify({
            title: "Pilih Aksi",
            sections: [{
                title: "Konfigurasi Auto Update",
                highlight_label: "Manage",
                rows: [
                    { 
                        header: "Start", 
                        title: "Start Auto Update", 
                        description: "Nyalain jadwal otomatis", 
                        id: ".autoupdate start" 
                    },
                    { 
                        header: "Stop", 
                        title: "Stop Auto Update", 
                        description: "Berentiin jadwal otomatis", 
                        id: ".autoupdate stop" 
                    },
                    { 
                        header: "Status", 
                        title: "Cek Status", 
                        description: "Liat status auto update sekarang", 
                        id: ".autoupdate status" 
                    }
                ]
            }]
        })
    }]
    
    return conn.sendButton(m.chat, {
        header: "AUTO UPDATE CONFIG",
        body: "Pilih pengaturan buat update otomatis:",
        footer: "GitHub Automation",
        buttons: buttons
    }, { quoted: m })
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Update Manual - ${dateStr}`

  let loading = await m.reply(`*Lagi ngirim perubahan ke GitHub...*\n"${commitMessage}"`)

  const result = await githubUpload(conn, commitMessage)

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