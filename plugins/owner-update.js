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
        message: `*GITHUB UPDATE DIBATALIN*\n\nStatus: Direktori Bersih\nGak ada file yang diubah atau ditambahin.`
      }
    }

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
                message: `*GITHUB UPDATE DIBATALIN*\nGak ada perubahan yang perlu di-commit.`
            }
        }
        throw commitErr 
    }

    try {
        await exec(`git push origin ${branch}`)
    } catch (pushErr) {
        throw new Error(`Gagal Push. Cek koneksi atau token.\nDetail: ${pushErr.message}`)
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
    if (addedFiles.length) fileList += `*Ditambahin (${addedFiles.length}):*\n` + addedFiles.map(f => `• ${f}`).join('\n') + '\n\n'
    if (modifiedFiles.length) fileList += `*Diubah (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `• ${f}`).join('\n') + '\n\n'
    if (deletedFiles.length) fileList += `*Dihapus (${deletedFiles.length}):*\n` + deletedFiles.map(f => `• ${f}`).join('\n') + '\n\n'
    if (renamedFiles.length) fileList += `*Ganti Nama (${renamedFiles.length}):*\n` + renamedFiles.map(f => `• ${f}`).join('\n') + '\n'

    return {
      success: true,
      repoUrl,
      message: `*GITHUB PUSH BERHASIL*\n\nAuthor: *${username}*\nRepo: *${repoName}*\nBranch: *${branch}*\nWaktu: *${commitDate} WIB*\n\nPesan Commit:\n*${commitMessage}*\n(Hash: \`${commitHash.trim()}\`)\n\nRincian:\n${fileList.trim() || "- Gak ada detail file -"}\n\nLink:\n${repoUrl}`
    }

  } catch (err) {
    return {
      success: false,
      repoUrl: "https://github.com",
      message: `*GITHUB PUSH GAGAL*\n\nError Log:\n\`${err.message}\``
    }
  }
}

async function autoUpdate(conn) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { 
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' 
  })
  const commitMessage = `Auto Update - ${dateStr}`
  
  const result = await githubUpload(conn, commitMessage)
  const targetJid = '6283854551575@s.whatsapp.net'

  try {
      await conn.sendMessage(targetJid, { 
        text: `*NOTIFIKASI AUTO UPDATE*\n\n${result.message}`,
        contextInfo: {
          externalAdReply: {
            title: "Auto GitHub Update",
            body: result.success ? "Success" : "Failed",
            thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
            sourceUrl: result.repoUrl || "https://github.com",
            mediaType: 1,
            renderLargerThumbnail: true
          }
        }
      })
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

const handler = async (m, { conn, isOwner, args, command }) => {
  if (!isOwner) return

  if (command === 'autoupdate') {
    const action = args[0]?.toLowerCase()

    if (action === 'start' || action === 'on') {
      const started = startAutoUpdate(conn)
      return m.reply(started 
        ? `*AUTO UPDATE AKTIF*\n\nJadwal: Jam 00:00 WIB tiap hari.\nLaporan bakal dikirim ke nomor owner.`
        : `*Auto update udah jalan kok.*`)
    }

    if (action === 'stop' || action === 'off') {
      const stopped = stopAutoUpdate()
      return m.reply(stopped 
        ? `*AUTO UPDATE DIMATIIN*\n\nUpdate otomatis udah dihentiim.`
        : `*Emang lagi gak jalan auto updatenya.*`)
    }

    if (action === 'status') {
      return m.reply(cronJob 
        ? `*STATUS AUTO UPDATE*\n\nStatus: Aktif\nJadwal: Jam 00:00 WIB`
        : `*STATUS AUTO UPDATE*\n\nStatus: Mati`)
    }

    return m.reply(`*PERINTAH AUTO UPDATE*\n\n• \`${usedPrefix + command}\` *start* - Nyalain\n• \`${usedPrefix + command}\` *stop* - Matiin\n• \`${usedPrefix + command}\` *status* - Cek status`)
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' })
  const commitMessage = args.join(' ').trim() || `Maintenance & Update - ${dateStr}`

  let loading = await m.reply(`*Lagi ngirim perubahan ke GitHub...*\n\nPesan: *${commitMessage}*`)

  const result = await githubUpload(conn, commitMessage)

  await conn.sendMessage(m.chat, { 
    text: result.message,
    contextInfo: {
      externalAdReply: {
        title: "GitHub Update Notification",
        body: result.success ? `Pesan: ${commitMessage}` : "Gagal",
        thumbnailUrl: "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
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