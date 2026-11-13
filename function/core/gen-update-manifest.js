import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'

const MANAGED = ['handler.js', 'main.js', 'start.js', 'setup.js', 'package.json', 'function/', 'src/', 'plugins/']
const PROTECTED = ['settings.js', '.env', 'data/', 'sessions/']
const HISTORY = 20

const git = args => execFileSync('git', args, { maxBuffer: 1 << 27, stdio: ['ignore', 'pipe', 'ignore'] })
const hash = buf => createHash('sha256').update(buf).digest('hex').slice(0, 20)
const match = (file, rules) => rules.some(r => r.endsWith('/') ? file.startsWith(r) : file === r)

const files = git(['ls-files', '-z']).toString().split('\0').filter(f => f && match(f, MANAGED) && !match(f, PROTECTED))

const manifest = {
    version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
    commit: git(['rev-parse', '--short', 'HEAD']).toString().trim(),
    files: {}
}

for (const file of files) {
    const current = hash(git(['show', `HEAD:${file}`]))
    const known = new Set()
    const commits = git(['log', `-n${HISTORY}`, '--format=%H', '--', file]).toString().split('\n').filter(Boolean)
    for (const commit of commits) {
        try { known.add(hash(git(['show', `${commit}:${file}`]))) } catch {}
    }
    known.delete(current)
    manifest.files[file] = { h: current, k: [...known] }
}

fs.writeFileSync('update.json', JSON.stringify(manifest))
console.log(`update.json: ${files.length} berkas, versi ${manifest.version} (${manifest.commit})`)
