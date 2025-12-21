import cp from 'child_process'
import { promisify } from 'util'

const exec = promisify(cp.exec).bind(cp)

// Fungsi upload ke GitHub (MANUAL ONLY)
async function githubUpload(conn, commitMessage = 'Update') {
  try {
    // Ambil URL repo
    const { stdout: remoteUrl } = await exec('git config --get remote.origin.url')
    const repoUrl = remoteUrl.trim()
      .replace('git@github.com:', 'https://github.com/')
      .replace('.git', '')
      .replace(/https:\/\/.*?@github\.com/, 'https://github.com')

    // Cek perubahan
    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    const addedFiles = []
    const deletedFiles = []
    const modifiedFiles = []

    changes.forEach(change => {
      const status = change.substring(0, 2).trim()
      const file = change.substring(3)

      if (status === 'A') {
        addedFiles.push(file)
      } else if (status === 'D') {
        deletedFiles.push(file)
      } else {
        modifiedFiles.push(file)
      }
    })

    // Kalau gak ada perubahan
    if (!changes.length) {
      return {
        success: false,
        message: '*PUSH DIBATALKAN*\n\nTidak ada perubahan file yang terdeteksi.'
      }
    }

    // Git command
    const gitCommands = [
      'git config --global user.email "raflisetiawan093@gmail.com"',
      'git config --global user.name "Futaroukun"',
      'git add .',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      'git push'
    ].join(' && ')

    await exec(gitCommands)

    // Ambil hash commit
    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')

    const summary = []
    if (addedFiles.length) summary.push('*Ditambahkan:*\n' + addedFiles.join('\n'))
    if (deletedFiles.length) summary.push('*Dihapus:*\n' + deletedFiles.join('\n'))
    if (modifiedFiles.length) summary.push('*Diubah:*\n' + modifiedFiles.join('\n'))

    return {
      success: true,
      message: [
        '*UPLOAD GITHUB BERHASIL*',
        '',
        `*Hash:* ${commitHash.trim()}`,
        `*Pesan:* ${commitMessage}`,
        '',
        summary.join('\n\n'),
        '',
        `*Repo:* ${repoUrl}`
      ].join('\n')
    }

  } catch (err) {
    return {
      success: false,
      message: [
        '*UPLOAD GITHUB GAGAL*',
        '',
        `*Kesalahan:* ${err.message}`
      ].join('\n')
    }
  }
}

// Handler command .update
const handler = async (m, { conn, isOwner, args }) => {
  if (!isOwner) {
    return conn.reply(m.chat, '*AKSES DITOLAK*\n\nPerintah ini hanya dapat digunakan oleh Owner.', m)
  }

  const commitMessage = args.join(' ').trim() || 'Manual update via bot'

  let loading
  try {
    loading = await conn.sendMessage(m.chat, {
      text: [
        '*PROSES UPLOAD GITHUB*',
        '',
        `*Pesan commit:* ${commitMessage}`,
        '',
        'Sedang mengirim perubahan ke repository...'
      ].join('\n')
    }, { quoted: m })
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  await conn.reply(m.chat, result.message, m)

  // hapus pesan loading
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