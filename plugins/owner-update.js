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
    const repoName = repoUrl.split('/')[4]

    const { stdout: branchName } = await exec('git branch --show-current')
    const branch = branchName.trim() || 'main'

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

📂 *Status:* Clean directory
ℹ️ Tidak ada perubahan file baru yang terdeteksi untuk di-push.`
      }
    }

    const gitCommands = [
      'git config --global user.email "raflisetiawan093@gmail.com"',
      'git config --global user.name "Futaroukun"',
      'git add .',
      `git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
      `git push origin ${branch}`
    ].join(' && ')

    await exec(gitCommands)

    const { stdout: commitHash } = await exec('git rev-parse --short HEAD')
    const { stdout: commitDate } = await exec('git log -1 --format=%cd --date=format:"%d/%m/%Y %H:%M"')

    let fileList = ''
    if (addedFiles.length) fileList += `🆕 *Added (${addedFiles.length}):*\n` + addedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (modifiedFiles.length) fileList += `📝 *Modified (${modifiedFiles.length}):*\n` + modifiedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (deletedFiles.length) fileList += `🗑️ *Deleted (${deletedFiles.length}):*\n` + deletedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n\n'
    if (renamedFiles.length) fileList += `🔁 *Renamed (${renamedFiles.length}):*\n` + renamedFiles.map(f => `  ◦ ${f}`).join('\n') + '\n'

    return {
      success: true,
      message: `🚀 *GITHUB PUSH SUCCESS*

👤 *Author:* ${username}
📦 *Repo:* ${repoName}
🌿 *Branch:* ${branch}
📅 *Date:* ${commitDate.trim()}

📝 *Commit Info:*
Note: ${commitMessage}
Hash: \`${commitHash.trim()}\`

📊 *File Changes:*
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
Cek koneksi internet atau konflik pada repository.`
    }
  }
}

const handler = async (m, { conn, isOwner, args }) => {
  if (!isOwner) return

  const commitMessage = args.join(' ').trim() || `Auto-update: ${new Date().toLocaleDateString()}`

  let loading
  try {
    loading = await conn.sendMessage(m.chat, {
      text: `⚙️ *SYSTEM UPDATE*

🔄 *Status:* Synchronizing with GitHub...
💬 *Commit:* ${commitMessage}
🌿 *Target:* Origin

Mohon tunggu sebentar...`
    }, { quoted: m })
  } catch {}

  const result = await githubUpload(conn, commitMessage)

  await conn.sendMessage(m.chat, { 
    text: result.message,
    contextInfo: {
      externalAdReply: {
        title: "GitHub Notification",
        body: "Repository Updated Successfully",
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

handler.help = ['update', 'push']
handler.tags = ['owner']
handler.command = /^(update|push|gitpush)$/i
handler.owner = true

export default handler