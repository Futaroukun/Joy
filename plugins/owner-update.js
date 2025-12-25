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

    const { stdout: changesStdout } = await exec('git status -s')
    const changes = changesStdout.trim().split('\n').filter(Boolean)

    const addedFiles = []
    const deletedFiles = []
    const modifiedFiles = []

    changes.forEach(change => {
      const status = change.trim().split(' ')[0]
      const file = change.trim().split(' ').slice(1).filter(Boolean).join(' ')

      if (status.includes('A')) {
        addedFiles.push(file)
      } else if (status.includes('D')) {
        deletedFiles.push(file)
      } else {
        modifiedFiles.push(file)
      }
    })

    if (!changes.length) {
      return {
        success: false,
        message: '*UPLOAD DIBATALKAN*\n\nGak ada perubahan file yang terdeteksi di sini.'
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
        `*Error:* ${err.message}`
      ].join('\n')
    }
  }
}

const handler = async (m, { conn, isOwner, args }) => {
  if (!isOwner) {
    return conn.reply(m.chat, '*AKSES DITOLAK*\n\nCuma Owner yang bisa pakai perintah ini.', m)
  }

  const commitMessage = args.join(' ').trim() || 'Manual update via bot'

  let loading
  try {
    loading = await conn.sendMessage(m.chat, {
      text: [
        '*LAGI UPLOAD KE GITHUB*',
        '',
        `*Pesan commit:* ${commitMessage}`,
        '',
        'Tunggu bentar, lagi kirim perubahan ke repo...'
      ].join('\n')
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