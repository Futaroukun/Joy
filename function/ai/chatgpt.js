/*
  - @Author: ZennzXD & Rafli
  - @Feature: ChatGPT AI Web Scraper Engine (Conduit Backend)
  - @Description: Engine ChatGPT dengan dukungan Chat, Multi-turn Context, Web Search Grounding, dan Formatter WhatsApp.
*/

import https from 'https'
import crypto from 'crypto'

const agent = new https.Agent({ keepAlive: true })

/**
 * Konversi tabel markdown ke format WhatsApp yang rapi dan mudah dibaca di layar HP
 */
function convertMarkdownTable(text) {
    const lines = text.split('\n')
    const result = []
    let headers = []

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const isRow = /^\s*\|/.test(line)
        const isSep = /^\s*\|[\s\-|:]+\|\s*$/.test(line)

        if (!isRow) {
            headers = []
            result.push(line)
            continue
        }

        const cells = line
            .replace(/^\s*\|/, '')
            .replace(/\|\s*$/, '')
            .split('|')
            .map(c => c.trim())

        if (isSep) continue

        if (headers.length === 0) {
            const nextLine = lines[i + 1] || ''
            if (/^\s*\|[\s\-|:]+\|\s*$/.test(nextLine)) {
                headers = cells
            } else {
                result.push(cells.join(' • '))
            }
            continue
        }

        const parts = cells.map((cell, idx) =>
            headers[idx] ? `*${headers[idx]}:* ${cell}` : cell
        )
        result.push('› ' + parts.join(' | '))
    }

    return result.join('\n')
}

/**
 * Format Markdown lengkap ke standar formatting teks WhatsApp
 */
export function formatWA(text) {
    if (!text) return ''

    // 1. Bersihkan citation token internal OpenAI (\uE200...\uE201)
    text = text.replace(/\uE200[^\uE201]*\uE201/g, '').replace(/[\uE200-\uE2FF]/g, '')

    // 2. Format tabel markdown ke list baris
    text = convertMarkdownTable(text)

    // 3. Konversi heading markdown (#, ##, ###) -> *Teks*
    text = text.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')

    // 4. Konversi bold: **teks** dan __teks__ -> *teks*
    text = text.replace(/(?:\*\*|__)(.*?)(?:\*\*|__)/gs, (match, p1) => {
        const content = p1.trim()
        if (!content) return ''
        return `*${content}*`
    })

    // 5. Konversi strikethrough: ~~teks~~ -> ~teks~
    text = text.replace(/~~(.*?)~~/gs, '~$1~')

    // 6. Konversi markdown link: [teks](url) -> *teks* (url)
    text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '*$1* ($2)')

    // 7. Konversi bullet point (* item, - item, + item) -> • item
    text = text.replace(/^[\s]*[-*+]\s+(.+)$/gm, '• $1')

    // 8. Konversi horizontal line (---, ***, ___) -> ────────────────────────────
    text = text.replace(/^[-*_]{3,}$/gm, '────────────────────────────')

    // 9. Rapikan multiple whitespace & newline
    text = text.replace(/\n{3,}/g, '\n\n')

    return text.trim()
}

/**
 * Class Client ChatGPT AI Backend Anon
 */
export class ChatGPTClient {
    constructor(options = {}) {
        this.userAgent = options.userAgent || 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36'
        this.lang = options.lang || 'id-ID'
        this.screenWidth = options.screenWidth || 423
        this.screenHeight = options.screenHeight || 965
        this.systemPrompt = options.systemPrompt || null

        this.cookies = {}
        this.oaiDid = crypto.randomUUID()
        this.buildNumber = null
        this.activeConversationId = null
        this.lastMessageId = null
        this.agent = agent
        this.initialized = false

        if (options.cookie) this.setCookieString(options.cookie)
    }

    setCookieString(cookieStr) {
        if (!cookieStr) return
        for (const pair of cookieStr.split(';')) {
            const idx = pair.indexOf('=')
            if (idx > 0) this.cookies[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim()
        }
    }

    _syncCookies(setCookies = []) {
        if (!setCookies) return
        const list = Array.isArray(setCookies) ? setCookies : [setCookies]
        for (const item of list) {
            if (!item) continue
            const pair = item.split(';')[0].split('=')
            if (pair.length >= 2) {
                this.cookies[pair[0].trim()] = pair.slice(1).join('=').trim()
            }
        }
    }

    _getCookieString() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ')
    }

    _getHeaders() {
        const cookieHeader = this._getCookieString()
        return {
            'User-Agent': this.userAgent,
            'accept': '*/*',
            'accept-language': `${this.lang},en-US;q=0.9,en;q=0.8`,
            'content-type': 'application/json',
            'OAI-Device-Id': this.oaiDid,
            'sec-ch-ua': '"Chromium";v="144", "Not/A)Brand";v="24"',
            'sec-ch-ua-mobile': '?1',
            'sec-ch-ua-platform': '"Android"',
            'origin': 'https://chatgpt.com',
            'referer': 'https://chatgpt.com/',
            ...(cookieHeader ? { 'cookie': cookieHeader } : {})
        }
    }

    _request(url, { method = 'GET', headers = {}, body = null, stream = false } = {}) {
        return new Promise((resolve, reject) => {
            const u = new URL(url)
            const opts = {
                hostname: u.hostname,
                path: u.pathname + u.search,
                method,
                headers: body ? { ...headers, 'content-length': Buffer.byteLength(body) } : headers,
                agent: this.agent,
                maxHeaderSize: 1048576
            }

            const req = https.request(opts, res => {
                if (stream) return resolve({ res, headers: res.headers, status: res.statusCode })
                const chunks = []
                res.on('data', c => chunks.push(c))
                res.on('end', () => resolve({ text: Buffer.concat(chunks).toString(), headers: res.headers, status: res.statusCode }))
            })

            req.on('error', reject)
            if (body) req.write(body)
            req.end()
        })
    }

    _fnv1a(str) {
        let h = 2166136261
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i)
            h = Math.imul(h, 16777619) >>> 0
        }
        h ^= h >>> 16
        h = Math.imul(h, 2246822507) >>> 0
        h ^= h >>> 13
        h = Math.imul(h, 3266489909) >>> 0
        h ^= h >>> 16
        return (h >>> 0).toString(16).padStart(8, '0')
    }

    _encodeConfig(cfg) {
        return Buffer.from(JSON.stringify(cfg)).toString('base64')
    }

    _makeBrowserConfig() {
        return [
            this.screenWidth + this.screenHeight,
            String(new Date()),
            2172649472,
            0,
            this.userAgent,
            null,
            this.buildNumber,
            this.lang,
            `${this.lang},en`,
            0,
            'contacts\u2212[object ContactsManager]',
            '_reactListening',
            'User',
            performance.now(),
            crypto.randomUUID(),
            '',
            8,
            performance.timeOrigin,
            0, 0, 0, 0, 0, 0, 0,
        ]
    }

    _computePow(seed, difficulty, cfg) {
        const start = performance.now()
        for (let i = 0; i < 500000; i++) {
            cfg[3] = i
            cfg[9] = Math.round(performance.now() - start)
            const encoded = this._encodeConfig(cfg)
            if (this._fnv1a(seed + encoded).substring(0, difficulty.length) <= difficulty) {
                return 'gAAAAAB' + encoded + '~S'
            }
        }
        return 'wQ8Lk5FbGpA2NcR9dShT6gYjU7VxZ4De'
    }

    async init() {
        if (this.initialized) return this
        const homeRes = await this._request('https://chatgpt.com/', {
            method: 'GET',
            headers: {
                'User-Agent': this.userAgent,
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': `${this.lang},en-US;q=0.9,en;q=0.8`,
            }
        })

        this._syncCookies(homeRes.headers['set-cookie'])

        const match = homeRes.text.match(/prod-([a-f0-9]+)/) ||
                      homeRes.text.match(/["']buildNumber["']\s*:\s*["']([^"']+)["']/) ||
                      homeRes.text.match(/["']version["']\s*:\s*["']([^"']+)["']/)
        if (match && match[1]) this.buildNumber = match[1]

        this.initialized = true
        return this
    }

    async _generateSentinelTokens() {
        const initCfg = this._makeBrowserConfig()
        initCfg[3] = 1
        initCfg[9] = 0
        const initToken = 'gAAAAAC' + this._encodeConfig(initCfg)

        const prepareRes = await this._request('https://chatgpt.com/backend-anon/sentinel/chat-requirements/prepare', {
            method: 'POST',
            headers: this._getHeaders(),
            body: JSON.stringify({ p: initToken })
        })
        const prepareData = JSON.parse(prepareRes.text)

        let pow = null
        if (prepareData.proofofwork?.required) {
            pow = this._computePow(
                prepareData.proofofwork.seed,
                prepareData.proofofwork.difficulty,
                this._makeBrowserConfig()
            )
        }

        const turnstile = crypto.randomBytes(Math.floor((2256 / 4) * 3)).toString('base64').slice(0, 2256)

        const finalizeBody = {
            prepare_token: prepareData.prepare_token ?? '',
            ...(pow ? { proofofwork: pow } : {}),
            turnstile
        }

        const finalizeRes = await this._request('https://chatgpt.com/backend-anon/sentinel/chat-requirements/finalize', {
            method: 'POST',
            headers: this._getHeaders(),
            body: JSON.stringify(finalizeBody)
        })
        const finalizeData = JSON.parse(finalizeRes.text)

        return {
            pow,
            turnstile,
            chatRequirementsToken: finalizeData.token ?? null
        }
    }

    async _getConduitToken(message, msgId, opts = {}) {
        const { conversationId, parentMsgId, webSearch, model = 'auto' } = opts
        const parentMessageId = parentMsgId || 'client-created-root'

        const body = {
            action: 'next',
            fork_from_shared_post: false,
            parent_message_id: parentMessageId,
            model,
            timezone_offset_min: new Date().getTimezoneOffset(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            conversation_mode: { kind: 'primary_assistant' },
            system_hints: webSearch ? ['search'] : [],
            supports_buffering: true,
            supported_encodings: ['v1'],
            partial_query: {
                id: msgId,
                author: { role: 'user' },
                content: { content_type: 'text', parts: [message] }
            },
            client_contextual_info: { app_name: 'chatgpt.com' }
        }

        if (conversationId) body.conversation_id = conversationId

        const res = await this._request('https://chatgpt.com/backend-anon/f/conversation/prepare', {
            method: 'POST',
            headers: { ...this._getHeaders(), 'X-Conduit-Token': 'no-token' },
            body: JSON.stringify(body)
        })
        const data = JSON.parse(res.text)
        return data.token || data.conduit_token
    }

    _buildMessageBody(message, msgId, opts = {}) {
        const { conversationId, parentMsgId, webSearch, model = 'auto' } = opts
        const parentMessageId = parentMsgId || 'client-created-root'

        let effectiveMessage = message
        if (this.systemPrompt && !conversationId) {
            effectiveMessage = `[System Instructions: ${this.systemPrompt}]\n\n${message}`
        }

        const content = { content_type: 'text', parts: [effectiveMessage] }
        const msgMeta = {
            selected_github_repos: [],
            selected_all_github_repos: false,
            serialization_metadata: { custom_symbol_offsets: [] },
            ...(webSearch ? { system_hints: ['search'] } : {}),
        }

        const body = {
            action: 'next',
            messages: [{
                id: msgId,
                author: { role: 'user' },
                create_time: Date.now() / 1000,
                content,
                metadata: msgMeta,
            }],
            parent_message_id: parentMessageId,
            model,
            timezone_offset_min: new Date().getTimezoneOffset(),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            conversation_mode: { kind: 'primary_assistant' },
            enable_message_followups: true,
            system_hints: webSearch ? ['search'] : [],
            supports_buffering: true,
            supported_encodings: ['v1'],
            client_contextual_info: {
                is_dark_mode: true,
                time_since_loaded: 10,
                page_height: 845,
                page_width: 423,
                pixel_ratio: 1.7,
                screen_height: this.screenHeight,
                screen_width: this.screenWidth,
                app_name: 'chatgpt.com',
            },
            no_auth_ad_preferences: {
                personalization_enabled: true,
                history_enabled: true,
            },
            paragen_cot_summary_display_override: 'allow',
            force_parallel_switch: 'auto',
        }

        if (conversationId) body.conversation_id = conversationId
        if (webSearch) {
            body.force_use_search = true
            body.client_reported_search_source = 'conversation_composer_web_icon'
        }

        return body
    }

    _parseSSE(buffer) {
        const lines = buffer.split('\n')
        const results = []
        for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const raw = line.slice(5).trim()
            if (!raw || raw === '[DONE]') continue
            try {
                results.push(JSON.parse(raw))
            } catch {}
        }
        return results
    }

    async _askInternal(prompt, options = {}) {
        if (!this.initialized) await this.init()
        if (!prompt?.trim()) throw new Error('Prompt tidak boleh kosong.')

        const {
            webSearch = false,
            model = 'auto',
            stream = false,
            onChunk = null,
            onThought = null,
            conversationId = this.activeConversationId,
            parentMsgId = this.lastMessageId
        } = options

        const msgId = crypto.randomUUID()
        const parentMessageId = parentMsgId || 'client-created-root'

        const [tokens, conduitToken] = await Promise.all([
            this._generateSentinelTokens(),
            this._getConduitToken(prompt, msgId, { conversationId, parentMsgId: parentMessageId, webSearch, model }),
        ])

        const body = this._buildMessageBody(prompt, msgId, {
            conversationId,
            parentMsgId: parentMessageId,
            webSearch,
            model
        })

        const headers = {
            ...this._getHeaders(),
            'accept': 'text/event-stream',
            'OAI-Language': this.lang,
            'OpenAI-Sentinel-Chat-Requirements-Token': tokens.chatRequirementsToken,
            'OpenAI-Sentinel-Turnstile-Token': tokens.turnstile,
            'OpenAI-Sentinel-Proof-Token': tokens.pow,
            'X-Conduit-Token': conduitToken,
        }

        const { res, headers: resHeaders, status } = await this._request('https://chatgpt.com/backend-anon/f/conversation', {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            stream: true,
        })

        this._syncCookies(resHeaders['set-cookie'])

        if (status !== 200) {
            const chunks = []
            for await (const chunk of res) chunks.push(chunk)
            throw new Error(`HTTP ${status}: ${Buffer.concat(chunks).toString()}`)
        }

        return new Promise((resolve, reject) => {
            const state = {
                fullText: '',
                thoughts: '',
                title: null,
                model: null,
                convId: null,
                assistantMsgId: null,
                sources: []
            }
            let buf = ''

            res.on('data', chunk => {
                try {
                    buf += chunk.toString('utf8')
                    const events = buf.split('\n\n')
                    buf = events.pop() || ''

                    for (const event of events) {
                        const parsed = this._parseSSE(event)
                        for (const json of parsed) {
                            if (json.conversation_id) state.convId = json.conversation_id
                            if (json.type === 'title_generation') state.title = json.title
                            if (json.type === 'server_ste_metadata') state.model = json.metadata?.model_slug || json.metadata?.resolved_model_slug || null

                            const msg = json.message || json.v?.message
                            if (msg) {
                                if (msg.author?.role === 'assistant') {
                                    if (msg.id) state.assistantMsgId = msg.id
                                    if (msg.channel === 'thought' || msg.recipient === 'thought') {
                                        if (msg.content?.parts?.length) {
                                            state.thoughts = msg.content.parts.join('')
                                            if (stream && typeof onThought === 'function') onThought(state.thoughts)
                                        }
                                    } else if (msg.content?.parts?.length) {
                                        const partText = msg.content.parts.join('')
                                        if (partText && !state.fullText) {
                                            state.fullText = partText
                                            if (stream && typeof onChunk === 'function') onChunk(partText)
                                        }
                                        if (partText.length > (state.lastFullAssistantText?.length || 0)) {
                                            state.lastFullAssistantText = partText
                                        }
                                    }
                                }

                                // Ekstrak link referensi pencarian web
                                const searchGroups = msg.metadata?.search_result_groups || []
                                for (const group of searchGroups) {
                                    for (const entry of group.entries || []) {
                                        let refKey = null
                                        if (entry.ref_id && typeof entry.ref_id.turn_index === 'number') {
                                            refKey = `turn${entry.ref_id.turn_index}${entry.ref_id.ref_type || 'search'}${entry.ref_id.ref_index}`
                                        }
                                        if (entry.url && !state.sources.some(s => s.url === entry.url)) {
                                            state.sources.push({
                                                refKey,
                                                title: entry.title || '',
                                                url: entry.url,
                                                domain: group.domain || entry.attribution || '',
                                                snippet: entry.snippet || ''
                                            })
                                        }
                                    }
                                }
                            }

                            // Delta text streaming accumulation
                            if (typeof json.v === 'string' && !json.p && !json.o) {
                                state.fullText += json.v
                                if (stream && typeof onChunk === 'function') onChunk(json.v)
                            } else if (json.o === 'append' && json.p?.includes('/message/content/parts/0') && typeof json.v === 'string') {
                                state.fullText += json.v
                                if (stream && typeof onChunk === 'function') onChunk(json.v)
                            } else if (json.o === 'replace' && json.p?.includes('/message/content/parts/0') && typeof json.v === 'string') {
                                state.fullText = json.v
                                if (stream && typeof onChunk === 'function') onChunk(json.v)
                            } else if (Array.isArray(json.v)) {
                                for (const sub of json.v) {
                                    if (sub.o === 'append' && sub.p?.includes('/message/content/parts/0') && typeof sub.v === 'string') {
                                        state.fullText += sub.v
                                        if (stream && typeof onChunk === 'function') onChunk(sub.v)
                                    } else if (sub.o === 'replace' && sub.p?.includes('/message/content/parts/0') && typeof sub.v === 'string') {
                                        state.fullText = sub.v
                                        if (stream && typeof onChunk === 'function') onChunk(sub.v)
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    reject(err)
                }
            })

            res.on('end', () => {
                if (state.lastFullAssistantText && state.lastFullAssistantText.length > state.fullText.length) {
                    state.fullText = state.lastFullAssistantText
                }
                if (state.convId) this.activeConversationId = state.convId
                if (state.assistantMsgId) this.lastMessageId = state.assistantMsgId

                resolve({
                    text: formatWA(state.fullText),
                    rawText: state.fullText,
                    thoughts: state.thoughts ? formatWA(state.thoughts) : null,
                    sources: state.sources.length > 0 ? state.sources : null,
                    title: state.title,
                    model: state.model,
                    conversationId: state.convId,
                    messageId: state.assistantMsgId
                })
            })

            res.on('error', reject)
        })
    }

    async ask(prompt, options = {}) {
        try {
            return await this._askInternal(prompt, options)
        } catch (err) {
            // Auto-recovery jika token / session expired
            if (/401|403|429|token|unauthorized|forbidden/i.test(err.message)) {
                this.initialized = false
                await this.init()
                return await this._askInternal(prompt, options)
            }
            throw err
        }
    }

    newChat() {
        this.activeConversationId = null
        this.lastMessageId = null
    }
}
