import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'
import { tmpdir } from 'os'

class SafeTmpManager {
    constructor() {
        this.tmpDir = join(process.cwd(), 'tmp')
        this.activeFiles = new Map()
        this.init()
    }

    init() {
        if (!existsSync(this.tmpDir)) {
            mkdirSync(this.tmpDir, { recursive: true })
            console.log('[TMP] Folder tmp created')
        }
    }

    generateFilename(ext = '') {
        const timestamp = Date.now()
        const random = randomBytes(4).toString('hex')
        return `tmp_${timestamp}_${random}${ext}`
    }

    async writeBuffer(buffer, ext = '') {
        if (!buffer || !Buffer.isBuffer(buffer)) {
            throw new Error('Invalid buffer: bukan Buffer object')
        }

        if (buffer.length === 0) {
            throw new Error('Invalid buffer: ukuran 0 byte')
        }

        const filename = this.generateFilename(ext)
        const filepath = join(this.tmpDir, filename)

        try {
            writeFileSync(filepath, buffer, { flag: 'w' })

            if (!existsSync(filepath)) {
                throw new Error('File gagal ditulis')
            }

            const stats = statSync(filepath)
            if (stats.size === 0) {
                unlinkSync(filepath)
                throw new Error('File corrupt: 0 byte')
            }

            this.activeFiles.set(filepath, {
                created: Date.now(),
                size: stats.size
            })

            return filepath

        } catch (error) {
            if (existsSync(filepath)) {
                try { unlinkSync(filepath) } catch {}
            }
            throw new Error(`Gagal menulis file: ${error.message}`)
        }
    }

    readFile(filepath) {
        if (!filepath || !existsSync(filepath)) {
            throw new Error('File not found')
        }

        const buffer = readFileSync(filepath)

        if (!buffer || buffer.length === 0) {
            throw new Error('File corrupt atau kosong')
        }

        return buffer
    }

    deleteFile(filepath) {
        if (!filepath || !existsSync(filepath)) {
            return false
        }

        try {
            unlinkSync(filepath)
            this.activeFiles.delete(filepath)
            return true
        } catch (error) {
            console.error('[TMP] Gagal hapus:', error.message)
            return false
        }
    }

    cleanup(maxAge = 5 * 60 * 1000) {
        if (!existsSync(this.tmpDir)) return 0

        const now = Date.now()
        const files = readdirSync(this.tmpDir)
        let deletedCount = 0

        for (const file of files) {
            const filepath = join(this.tmpDir, file)

            try {
                const stats = statSync(filepath)
                const age = now - stats.mtimeMs

                if (age > maxAge) {
                    unlinkSync(filepath)
                    this.activeFiles.delete(filepath)
                    deletedCount++
                }
            } catch {}
        }

        if (deletedCount > 0) {
            console.log(`[TMP] Cleanup: ${deletedCount} files deleted`)
        }

        const osTmp = tmpdir()
        if (existsSync(osTmp) && osTmp !== this.tmpDir) {
            try {
                const osFiles = readdirSync(osTmp)
                for (const file of osFiles) {
                    if (/-(enc|original)$/.test(file) || /^(video|audio|image|document|sticker)/.test(file)) {
                        const fp = join(osTmp, file)
                        try {
                            const st = statSync(fp)
                            if (now - st.mtimeMs > maxAge) {
                                unlinkSync(fp)
                                deletedCount++
                            }
                        } catch {}
                    }
                }
            } catch {}
        }

        return deletedCount
    }

    getStats() {
        if (!existsSync(this.tmpDir)) {
            return {
                totalFiles: 0,
                totalSize: 0,
                activeFiles: 0
            }
        }

        const files = readdirSync(this.tmpDir)
        let totalSize = 0

        for (const file of files) {
            try {
                const filepath = join(this.tmpDir, file)
                const stats = statSync(filepath)
                totalSize += stats.size
            } catch {}
        }

        return {
            totalFiles: files.length,
            totalSize,
            activeFiles: this.activeFiles.size
        }
    }

    forceCleanup() {
        if (!existsSync(this.tmpDir)) return 0

        const files = readdirSync(this.tmpDir)
        let deleted = 0

        for (const file of files) {
            try {
                unlinkSync(join(this.tmpDir, file))
                deleted++
            } catch {}
        }

        this.activeFiles.clear()
        console.log(`[TMP] Force cleanup: ${deleted} files deleted`)
        return deleted
    }
}

const tmpManager = new SafeTmpManager()

setInterval(() => {
    tmpManager.cleanup(2 * 60 * 1000)
}, 2 * 60 * 1000)

process.on('exit', () => {
    tmpManager.forceCleanup()
})

export default tmpManager
export { SafeTmpManager }