import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js'

// ===== SYSTEM PROMPTS =====
const SYSTEM_PROMPTS = {
    developer: `GUA JOY - AI DEVELOPER EXPERT

IDENTITAS & KEMAMPUAN:
- Expert JavaScript/Node.js ES6+ & TypeScript
- Master Baileys WhatsApp Library v7.0.0
- Spesialis debugging & code optimization
- Paham full arsitektur bot WhatsApp
- Bisa analisis code secara mendalam
- Kasih solusi yang 100% work & tested

SPECIALIZATION:
1. DEBUG MASTER
   - Tracking bug dengan cepat & akurat
   - Root cause analysis
   - Fix error dengan minimal side effect
   - Performance debugging

2. CODE ARCHITECT
   - Design pattern yang tepat
   - Clean code practices
   - Scalable architecture
   - Best practices enforcement

3. OPTIMIZATION GURU
   - Memory leak detection
   - Performance bottleneck analysis
   - Code refactoring
   - Database optimization

4. FEATURE ENGINEER
   - Build fitur dari scratch
   - Integration dengan API
   - Error handling yang robust
   - Testing & validation

TECH STACK EXPERTISE:
- Baileys v7.0.0 (LID System Expert)
- Node.js ESM (import/export)
- LowDB untuk database
- Async/Await patterns
- Event-driven architecture
- WebSocket connection handling

CARA KERJA GUA:
1. ANALISIS DULU
   - Baca context lengkap
   - Identify root problem
   - Consider side effects
   - Plan solution strategy

2. SOLUSI YANG PRESISI
   - Code yang clean & readable
   - Proper error handling
   - Memory efficient
   - Scalable implementation

3. EXPLAIN DENGAN JELAS
   - Kenapa error terjadi
   - Gimana cara fixnya
   - Best practice yang dipakai
   - Prevention untuk masa depan

ATURAN PENTING:
- WAJIB pakai LID System (bukan JID)
- SEMUA async harus pakai try-catch
- SELALU validate input dulu
- Memory management yang ketat
- JANGAN hardcode values
- USE environment variables untuk config
- IMPLEMENT proper logging

CODE QUALITY CHECKLIST:
✅ Error handling lengkap
✅ Input validation
✅ Memory leak prevention
✅ Async pattern yang benar
✅ Clean & readable code
✅ Proper commenting
✅ Type safety (JSDoc)
✅ Performance optimized

DEBUG METHODOLOGY:
1. Reproduce error
2. Isolate the problem
3. Identify root cause
4. Fix dengan minimal change
5. Test thoroughly
6. Document the fix

GAYA KOMUNIKASI:
- Santai tapi profesional
- Pakai "gua" & "lu"
- Langsung to the point
- Explain complex things simply
- Kasih contoh code yang jelas
- TIDAK PERNAH BOHONG atau NGARANG

FORMAT RESPONSE:
- JANGAN pakai markdown heading (###)
- Pake *KAPITAL TEBAL* untuk section
- Code block: \`\`\`javascript
- Bullet points untuk list
- Clear before/after comparison

CONTOH RESPONSE FORMAT:

*ANALISIS ERROR*

Gua nemu masalahnya di handler.js line 127. Lu lupa convert JID ke LID sebelum akses database.

*ROOT CAUSE*

Baileys v7 sekarang pakai LID system, jadi kalau lu langsung pakai m.sender buat akses db.data.users, bakal undefined karena format ID-nya beda.

*SOLUSI*

\`\`\`javascript
// SEBELUM (ERROR)
const user = global.db.data.users[m.sender]

// SESUDAH (FIXED)
const senderLID = await ensureLID(conn, m.sender)
const user = global.db.data.users[senderLID]
\`\`\`

*PENJELASAN*

Function ensureLID() bakal:
1. Cek cache dulu
2. Kalau gak ada, fetch dari server
3. Update cache
4. Return LID yang valid

*PREVENTION*

Untuk hindari error serupa:
- SELALU convert ke LID sebelum akses database
- Pakai ensureLID() helper function
- Add proper error logging
- Validate data exists sebelum use

Simpel kan? Sekarang systemnya bakalan lebih stable.`,

    user: `GUA JOY - AI ASSISTANT

IDENTITAS:
- Nama: Joy
- Creator: Rafli
- Fungsi: Bantu user dengan cerdas & friendly

KEMAMPUAN:
- Jawab pertanyaan umum
- Kasih info yang akurat
- Explain dengan jelas
- Helpful & supportive

GAYA KOMUNIKASI:
- Santai kayak ngobrol temen
- Pake "gua" untuk diri sendiri
- Panggil user "kamu" atau "lu"
- TIDAK pakai bahasa formal
- To the point & jelas

ATURAN:
- JANGAN bohong atau ngarang
- Kalau gak tau, bilang gak tau
- Kasih info yang benar
- Be helpful & friendly

FORMAT:
- JANGAN pakai heading markdown
- Pakai *tebal* untuk emphasis
- Keep it simple
- Easy to read di WhatsApp`
}

// ===== ADVANCED FILE SCANNER =====
class ProjectScanner {
    constructor() {
        this.rootDir = process.cwd()
        this.blacklist = [
            'node_modules', '.git', 'package-lock.json', 
            'yarn.lock', 'tmp', 'sessions', '.env'
        ]
        this.maxFileSize = 200 * 1024 // 200KB
        this.cache = new Map()
    }

    // Full project scan with caching
    async fullScan() {
        const cacheKey = 'full_scan'
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey)
            if (Date.now() - cached.timestamp < 300000) { // 5 min cache
                return cached.data
            }
        }

        const files = this.scanDirectory(this.rootDir)
        const data = {
            files,
            structure: this.generateStructure(files),
            stats: this.generateStats(files),
            timestamp: Date.now()
        }

        this.cache.set(cacheKey, { data, timestamp: Date.now() })
        return data
    }

    // Scan specific files by pattern
    async smartScan(keywords) {
        const targetFiles = this.detectTargetFiles(keywords)
        const contents = []

        for (const file of targetFiles) {
            const content = this.readFile(file)
            if (content) {
                contents.push({
                    path: file,
                    content,
                    size: content.length,
                    lines: content.split('\n').length
                })
            }
        }

        return contents
    }

    // Recursive directory scanner
    scanDirectory(dir, fileList = [], depth = 0) {
        if (depth > 5) return fileList

        try {
            const items = fs.readdirSync(dir)

            for (const item of items) {
                if (this.blacklist.includes(item)) continue

                const fullPath = path.join(dir, item)
                
                try {
                    const stat = fs.statSync(fullPath)

                    if (stat.isDirectory()) {
                        this.scanDirectory(fullPath, fileList, depth + 1)
                    } else if (this.isValidFile(item, stat.size)) {
                        fileList.push({
                            path: path.relative(this.rootDir, fullPath),
                            size: stat.size,
                            extension: path.extname(item),
                            modified: stat.mtime
                        })
                    }
                } catch (e) {
                    console.error(`Error accessing ${fullPath}:`, e.message)
                }
            }
        } catch (e) {
            console.error(`Error reading directory ${dir}:`, e.message)
        }

        return fileList
    }

    // Check if file should be included
    isValidFile(filename, size) {
        const validExtensions = ['.js', '.json', '.md', '.txt']
        const ext = path.extname(filename)
        return validExtensions.includes(ext) && size < this.maxFileSize
    }

    // Read file with error handling
    readFile(filePath) {
        try {
            const fullPath = path.join(this.rootDir, filePath)
            if (fs.existsSync(fullPath)) {
                return fs.readFileSync(fullPath, 'utf8')
            }
        } catch (e) {
            console.error(`Error reading ${filePath}:`, e.message)
        }
        return null
    }

    // Generate project structure tree
    generateStructure(files) {
        const tree = {}
        files.forEach(file => {
            const parts = file.path.split(path.sep)
            let current = tree
            parts.forEach((part, index) => {
                if (index === parts.length - 1) {
                    current[part] = { type: 'file', size: file.size }
                } else {
                    if (!current[part]) {
                        current[part] = { type: 'dir', children: {} }
                    }
                    current = current[part].children || current[part]
                }
            })
        })
        return tree
    }

    // Generate statistics
    generateStats(files) {
        const stats = {
            totalFiles: files.length,
            totalSize: files.reduce((sum, f) => sum + f.size, 0),
            byExtension: {},
            byDirectory: {}
        }

        files.forEach(file => {
            // By extension
            const ext = file.extension || 'no-ext'
            if (!stats.byExtension[ext]) {
                stats.byExtension[ext] = { count: 0, size: 0 }
            }
            stats.byExtension[ext].count++
            stats.byExtension[ext].size += file.size

            // By directory
            const dir = path.dirname(file.path)
            if (!stats.byDirectory[dir]) {
                stats.byDirectory[dir] = { count: 0, size: 0 }
            }
            stats.byDirectory[dir].count++
            stats.byDirectory[dir].size += file.size
        })

        return stats
    }

    // Intelligent file detection
    detectTargetFiles(text) {
        const files = new Set()
        const lowerText = text.toLowerCase()

        // File mapping with priority
        const fileMap = {
            // Core files (Priority 1)
            'handler': ['handler.js'],
            'main': ['main.js'],
            'settings': ['settings.js'],
            
            // Function files (Priority 2)
            'antidelete': ['function/antidelete.js'],
            'connection': ['function/connection.js'],
            'simple': ['function/simple.js'],
            'store': ['function/store.js'],
            'button': ['function/button.js'],
            'gemini': ['function/gemini.js'],
            'converter': ['function/converter.js'],
            'uploader': ['function/uploader.js'],
            'exif': ['function/exif.js'],
            
            // Library files (Priority 3)
            'leveling': ['lib/leveling.js'],
            
            // Data files (Priority 4)
            'database': ['data/database.json']
        }

        // Check for specific keywords
        for (const [keyword, paths] of Object.entries(fileMap)) {
            if (lowerText.includes(keyword)) {
                paths.forEach(p => files.add(p))
            }
        }

        // Detect plugin references
        const pluginMatch = lowerText.match(/plugin[s]?[\s\/\\-]*([\w-]+)/i)
        if (pluginMatch) {
            files.add(`plugins/${pluginMatch[1]}.js`)
        }

        // Context-aware detection
        const contextKeywords = {
            'error': ['handler.js', 'main.js'],
            'bug': ['handler.js'],
            'database': ['data/database.json', 'handler.js'],
            'connection': ['function/connection.js', 'main.js'],
            'level': ['lib/leveling.js', 'handler.js'],
            'ai': ['function/gemini.js', 'plugins/ai-gemini.js']
        }

        for (const [keyword, paths] of Object.entries(contextKeywords)) {
            if (lowerText.includes(keyword)) {
                paths.forEach(p => files.add(p))
            }
        }

        // If no specific files detected, add default context files
        if (files.size === 0) {
            files.add('handler.js')
            files.add('main.js')
        }

        return Array.from(files)
    }
}

// ===== CODE ANALYZER =====
class CodeAnalyzer {
    // Analyze code for common issues
    static analyzeCode(code, filename) {
        const issues = {
            errors: [],
            warnings: [],
            suggestions: []
        }

        // Check for common anti-patterns
        if (code.includes('var ')) {
            issues.warnings.push('Gunakan let/const instead of var')
        }

        if (!code.includes('try') && code.includes('await')) {
            issues.warnings.push('Async operations tanpa try-catch')
        }

        if (code.includes('@s.whatsapp.net') && !code.includes('@lid')) {
            issues.warnings.push('Possible JID usage, consider LID system')
        }

        if (code.includes('console.log') && filename.includes('plugin')) {
            issues.suggestions.push('Remove console.log di production')
        }

        // Check for memory leaks
        if (code.includes('setInterval') && !code.includes('clearInterval')) {
            issues.warnings.push('Potential memory leak: setInterval without clear')
        }

        // Check for proper error handling
        if (code.includes('throw') && !code.includes('Error')) {
            issues.suggestions.push('Throw Error objects, not strings')
        }

        return issues
    }

    // Generate code metrics
    static generateMetrics(code) {
        return {
            lines: code.split('\n').length,
            functions: (code.match(/function\s+\w+|const\s+\w+\s*=\s*\(/g) || []).length,
            asyncFunctions: (code.match(/async\s+function|async\s+\(/g) || []).length,
            tryBlocks: (code.match(/try\s*{/g) || []).length,
            imports: (code.match(/import\s+/g) || []).length,
            exports: (code.match(/export\s+/g) || []).length
        }
    }
}

// ===== MAIN HANDLER =====
let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
    const scanner = new ProjectScanner()
    const hasInput = text || m.quoted

    // Show help if no input
    if (!hasInput) {
        return m.reply(`*JOY - AI DEVELOPER ASSISTANT*

Gua AI developer yang bisa bantu lu develop bot WhatsApp.

*BASIC USAGE:*
• ${usedPrefix + command} <pertanyaan>
• Reply gambar + ${usedPrefix + command} <pertanyaan>

*DEVELOPER MODE (Owner Only):*

*1. SCAN COMMANDS*
• *scan* - Full project scan
• *scan <keyword>* - Smart scan berdasarkan keyword
• *analyze <file>* - Deep analysis file tertentu

*2. DEBUG COMMANDS*
• *debug* - Debug mode analysis
• *fix <masalah>* - Auto-fix common issues
• *trace <error>* - Error tracing & solution

*3. CODE COMMANDS*
• *review <code>* - Code review & suggestions
• *optimize <code>* - Code optimization
• *generate <request>* - Generate boilerplate code

*EXAMPLES:*
${usedPrefix + command} scan handler
${usedPrefix + command} debug connection error
${usedPrefix + command} fix memory leak
${usedPrefix + command} review function antidelete
${usedPrefix + command} generate plugin template

*FITUR ADVANCED:*
✅ Full project scanning
✅ Smart file detection
✅ Code analysis & metrics
✅ Auto-fix suggestions
✅ Performance optimization
✅ Best practices enforcement

Tanya apa aja, gua bantu!`)
    }

    let buffer = null
    let prompt = text || ''
    let loadingMsg = null
    let messages = []
    let systemInstruction = isOwner ? SYSTEM_PROMPTS.developer : SYSTEM_PROMPTS.user

    // === COMMAND DETECTION & PROCESSING ===
    const cmdMatch = prompt.match(/^(scan|analyze|debug|fix|trace|review|optimize|generate)\s+(.*)/i)
    
    if (isOwner && cmdMatch) {
        const cmd = cmdMatch[1].toLowerCase()
        const args = cmdMatch[2].trim()

        loadingMsg = await conn.reply(m.chat, 
            `*${cmd.toUpperCase()} MODE ACTIVE*\n\nProcessing your request...`, 
            m
        )

        try {
            switch (cmd) {
                case 'scan':
                    if (!args || args === 'all') {
                        // Full scan
                        const scanData = await scanner.fullScan()
                        const summary = `
=== FULL PROJECT SCAN ===

*STATISTICS:*
- Total Files: ${scanData.stats.totalFiles}
- Total Size: ${formatBytes(scanData.stats.totalSize)}

*BY EXTENSION:*
${Object.entries(scanData.stats.byExtension).map(([ext, data]) => 
    `- ${ext}: ${data.count} files (${formatBytes(data.size)})`
).join('\n')}

*PROJECT STRUCTURE:*
${JSON.stringify(scanData.structure, null, 2)}

=== ANALYSIS REQUEST ===
${args || 'Analyze the entire project structure and provide insights'}
`
                        messages.push({ role: 'user', content: summary })
                    } else {
                        // Smart scan based on keywords
                        const files = await scanner.smartScan(args)
                        const content = files.map(f => `
=== FILE: ${f.path} ===
Lines: ${f.lines} | Size: ${formatBytes(f.size)}

${f.content}
`).join('\n\n')

                        messages.push({ 
                            role: 'user', 
                            content: `
=== SMART SCAN: ${args} ===

${content}

=== REQUEST ===
Analyze the above files and provide detailed insights.
` 
                        })
                    }
                    break

                case 'analyze':
                    // Deep file analysis
                    const fileContent = scanner.readFile(args)
                    if (!fileContent) {
                        throw new Error(`File ${args} not found`)
                    }

                    const analysis = CodeAnalyzer.analyzeCode(fileContent, args)
                    const metrics = CodeAnalyzer.generateMetrics(fileContent)

                    messages.push({
                        role: 'user',
                        content: `
=== DEEP ANALYSIS: ${args} ===

*FILE CONTENT:*
${fileContent}

*CODE METRICS:*
${JSON.stringify(metrics, null, 2)}

*DETECTED ISSUES:*
${JSON.stringify(analysis, null, 2)}

=== REQUEST ===
Provide comprehensive analysis, identify issues, and suggest improvements.
`
                    })
                    break

                case 'debug':
                case 'fix':
                case 'trace':
                    // Debug & fix mode
                    const debugFiles = await scanner.smartScan(args)
                    const debugContent = debugFiles.map(f => `
=== ${f.path} ===
${f.content}
`).join('\n\n')

                    messages.push({
                        role: 'user',
                        content: `
=== ${cmd.toUpperCase()} MODE ===
Issue: ${args}

*RELEVANT FILES:*
${debugContent}

*SYSTEM INFO:*
- Node Version: ${process.version}
- Baileys Version: 7.0.0-rc.9
- Platform: ${process.platform}

=== REQUEST ===
Identify the root cause, provide step-by-step fix, and explain prevention strategies.
`
                    })
                    break

                case 'review':
                case 'optimize':
                    // Code review & optimization
                    messages.push({
                        role: 'user',
                        content: `
=== ${cmd.toUpperCase()} REQUEST ===

${args}

=== CHECKLIST ===
- Error handling
- Performance
- Memory leaks
- Best practices
- Code readability
- Security issues

Provide detailed ${cmd} with actionable suggestions.
`
                    })
                    break

                case 'generate':
                    // Code generation
                    messages.push({
                        role: 'user',
                        content: `
=== CODE GENERATION REQUEST ===

${args}

=== REQUIREMENTS ===
- Clean & readable code
- Proper error handling
- JSDoc documentation
- Best practices
- Production-ready

Generate complete, working code with explanations.
`
                    })
                    break
            }

        } catch (error) {
            if (loadingMsg?.key) {
                try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
            }
            return m.reply(`*ERROR*\n\n${error.message}`)
        }

    } else {
        // Regular AI chat mode
        if (m.quoted) {
            const q = m.quoted
            const mime = (q.msg || q).mimetype || ''
            
            if (/image|video/g.test(mime)) {
                loadingMsg = await conn.reply(m.chat, "*Processing media...*", m)
                try {
                    buffer = await q.download()
                    messages.push({ 
                        role: "user", 
                        content: prompt || "Analyze this image in detail." 
                    })
                } catch (e) {
                    return m.reply("*Failed to download media.*")
                }
            } else if (q.text) {
                loadingMsg = await conn.reply(m.chat, "*Processing...*", m)
                messages.push({
                    role: "user",
                    content: `Context: "${q.text}"\n\nQuestion: ${prompt}`
                })
            }
        } else {
            loadingMsg = await conn.reply(m.chat, "*Processing...*", m)
            messages.push({ role: "user", content: prompt })
        }
    }

    // === SEND TO AI & PROCESS RESPONSE ===
    try {
        if (messages.length === 0) throw new Error("Empty message")

        const response = await chat(messages, buffer, systemInstruction)
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let finalResponse = formatText(response)
        
        // Extract code blocks for copy buttons
        const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g
        const matches = [...finalResponse.matchAll(codeBlockRegex)]
        const buttons = []
        const MAX_BUTTONS = 3
        
        if (matches.length > 0) {
            for (let i = 0; i < matches.length && i < MAX_BUTTONS; i++) {
                const match = matches[i]
                const blockContent = match[1]
                
                const lines = blockContent.split('\n')
                while (lines.length > 0 && (lines[0].trim().startsWith('FILE:') || lines[0].trim().startsWith('//'))) {
                    lines.shift()
                }
                const codeToCopy = lines.join('\n').trim()
                
                if (codeToCopy) {
                    buttons.push({
                        name: 'cta_copy',
                        buttonParamsJson: JSON.stringify({
                            display_text: `📋 Copy Code ${i + 1}`,
                            copy_code: codeToCopy
                        })
                    })
                }
            }
        }
        
        if (buttons.length > 0) {
            let footerText = `Klik tombol untuk copy code.`
            if (matches.length > MAX_BUTTONS) {
                footerText += `\n(${MAX_BUTTONS} dari ${matches.length} code blocks)`
            }
            
            await sendButtons(conn, m.chat, {
                text: finalResponse,
                footer: footerText,
                buttons: buttons
            }, { quoted: m })
        } else {
            await conn.reply(m.chat, finalResponse, m)
        }
        
    } catch (e) {
        console.error('AI Error:', e)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply("*AI system error.* Please try again.")
    }
}

// ===== HELPER FUNCTIONS =====

function formatText(text) {
    return text
        .replace(/^#{1,6}\s+(.+)/gm, '*$1*')
        .replace(/\*\*([^*]+)\*\*/g, '*$1*')
        .replace(/__([^_]+)__/g, '*$1*')
        .replace(/~~([^~]+)~~/g, '~$1~')
        .replace(/^\s*\*\s+/gm, '- ')
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

handler.help = ['ai *teks*']
handler.tags = ['ai']
handler.command = /^(ai|gemini|joy)$/i

export default handler