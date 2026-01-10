import cp from 'child_process'
import { promisify } from 'util'

const exec = promisify(cp.exec).bind(cp)

async function githubUpload(conn, commitMessage = 'Update') {
  try {
    const { stdout: remoteUrl } = await exec('git config --get remote.origin.url')
    const repoUrl = remoteUrl.trim()
      .replace('git@github.com:', 'https://github.com/')
      .replace('.git', '')
      .replace(/https:\/\/.*?@github\.com/, 'https://github.com')
    
    const username = repoUrl.split('/')[3]
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    const addedFiles = []
    const deletedFiles = []
    const modifiedFiles = []

    changes.forEach(change => {
      const status = change.trim().split(' ')[0]
      const file = change.trim().split(' ').slice(1).filter(Boolean).join(' ')

      if (status.includes('A')) addedFiles.push(`• ${file}`)
      else if (status.includes('D')) deletedFiles.push(`• ${file}`)
      else modifiedFiles.push(`• ${file}`)
    })

    if (!changes.length) {
      return {
        success: false,
        message: `❌ UPLOAD DIBATALKAN ❌

ℹ️ Informasi:
Tidak ada perubahan file yang terdeteksi di direktori saat ini.
Silakan cek kembali file yang ingin diupload ya! ✨`
      }
    }

    const gitCommands = [
      'git config --global user.email "raflisetiawan093@gmail.com"',
      'git config --global user.name "Futaroukun"',
      'git add .',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      'git push'
    ].join(' && ')

    await exec(gitCommands)

    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const { stdout: commitDate } = await exec('git log -1 --format=%cd --date=format:"%d %B %Y, %H:%M:%S"')

    const summary = []
    if (addedFiles.length) summary.push(`📥 File yang Ditambahkan:
${addedFiles.join('\n')}`)
    if (deletedFiles.length) summary.push(`🗑️ File yang Dihapus:
${deletedFiles.join('\n')}`)
    if (modifiedFiles.length) summary.push(`✏️ File yang Diubah:
${modifiedFiles.join('\n')}`)

    return {
      success: true,
      message: `✅ UPLOAD GITHUB BERHASIL ✅

👤 Username GitHub: ${username}
🔑 Hash Commit: ${commitHash.trim()}
📅 Tanggal Update: ${commitDate.trim()}
💬 Pesan Commit: ${commitMessage}

${summary.join('\n\n')}

🔗 Link Repo: ${repoUrl}`
    }

  } catch (err) {
    return {
      success: false,
      message: `❌ UPLOAD GITHUB GAGAL ❌

⚠️ Error: ${err.message}`
    }
  }
}

const handler = async (m, { conn, isOwner, args }) => {
  if (!isOwner) {
    return conn.reply(m.chat, `❌ AKSES DITOLAK ❌

Hanya Owner yang bisa pakai perintah ini.`, m)
  }

  const commitMessage = args.join(' ').trim() || 'Manual update via bot'

  let loading
  try {
    loading = await conn.sendMessage(m.chat, {
      text: `⏳ LAGI UPLOAD KE GITHUB ⏳

💬 Pesan commit: ${commitMessage}

Tunggu bentar, lagi kirim perubahan ke repo...`
    }, { quoted: m })
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  await conn.reply(m.chat, result.message, m)

  if (loading?.key) {
    setTimeout(async () => {
      try {
        await conn.sendMessage(m.chat, { delete: loading.key })
      } catch {}
    }, 3000)
  }
}

handler.help = ['update *commit*']
handler.tags = ['owner']
handler.command = /^(update|u)$/i
handler.owner = true

export default handler