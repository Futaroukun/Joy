/*
  - @Author: Joy / DeepChat Engine
  - @Feature: DeepChat Multi-Model AI Client
  - @Description: Client API DeepChat dengan auto-topup, auto-session, penanganan latency rendah, dan multi-model.
*/

import { createHmac, createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

const BASE_URL = 'https://uebueqfehjrruiwrbmgs.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVlYnVlcWZlaGpycnVpd3JibWdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NTI0NDYsImV4cCI6MjA4ODQyODQ0Nn0.pC43b2gMMx44q7_SUfJDM_ceLaYWeMzKI4QvMwz_AxU'

export const AVAILABLE_MODELS = [
    { id: '1',  alias: 'gemini-flash',    name: 'Gemini 2.5 Flash Lite', providerId: 'gemini',   modelId: 'gemini-2.5-flash-lite',     latency: '⚡ ~2.2s', isDefault: true },
    { id: '2',  alias: 'deepseek-v3',     name: 'DeepSeek V3',           providerId: 'deepseek', modelId: 'deepseek-chat',             latency: '⚡ ~2.1s' },
    { id: '3',  alias: 'mistral-small',   name: 'Mistral Small (8B)',    providerId: 'mistral',  modelId: 'ministral-8b-latest',       latency: '⚡ ~1.9s' },
    { id: '4',  alias: 'deepseek-v4',     name: 'DeepSeek V4 Flash',     providerId: 'deepseek', modelId: 'deepseek-v4-flash',         latency: '⚡ ~2.3s' },
    { id: '5',  alias: 'claude-haiku',    name: 'Claude Haiku 4.5',      providerId: 'claude',   modelId: 'claude-haiku-4-5-20251001', latency: '🚀 ~2.8s' },
    { id: '6',  alias: 'gpt-4.1',         name: 'GPT-4.1 Flagship',      providerId: 'chatgpt',  modelId: 'gpt-4.1',                   latency: '🚀 ~3.4s' },
    { id: '7',  alias: 'gpt-4o-mini',     name: 'GPT-4o Mini',           providerId: 'chatgpt',  modelId: 'gpt-4o-mini',               latency: '🚀 ~4.1s' },
    { id: '8',  alias: 'mistral-large',   name: 'Mistral Large 3',       providerId: 'mistral',  modelId: 'mistral-large-latest',      latency: '🚀 ~4.1s' },
    { id: '9',  alias: 'claude-opus',     name: 'Claude Opus 4.7',       providerId: 'claude',   modelId: 'claude-opus-4-7',           latency: '🐢 ~7.6s' },
    { id: '10', alias: 'kimi-k3',         name: 'Kimi K3',               providerId: 'kimi',     modelId: 'kimi-k3',                   latency: '🐢 ~8.5s' },
    { id: '11', alias: 'grok-4',          name: 'Grok 4',                providerId: 'grok',     modelId: 'grok-4',                    latency: '🐢 ~11.7s' },
    { id: '12', alias: 'grok-fast',       name: 'Grok 4.1 Fast',         providerId: 'grok',     modelId: 'grok-4-1-fast',             latency: '🐢 ~13.3s' },
    { id: '13', alias: 'kimi-k2.6',       name: 'Kimi K2.6',             providerId: 'kimi',     modelId: 'kimi-k2.6',                 latency: '🐢 ~13.5s' },
    { id: '14', alias: 'gemini-pro',      name: 'Gemini 2.5 Pro',        providerId: 'gemini',   modelId: 'gemini-2.5-pro',            latency: '🐢 ~15.8s' }
]

export const DEFAULT_MODEL = AVAILABLE_MODELS.find(m => m.isDefault) || AVAILABLE_MODELS[0]

let cachedSession = null
let sessionPromise = null

function buildSignedHeaders(endpoint, bodyStr, session) {
    const timestampSec = Math.floor(Date.now() / 1000)
    const nonce = randomUUID()
    const idempotencyKey = randomUUID()
    const bodySha256 = createHash('sha256').update(bodyStr, 'utf-8').digest('hex')
    const message = `POST\n${endpoint}\n${timestampSec}\n${nonce}\n${bodySha256}`
    const secretBytes = Buffer.from(session.signingSecret, 'hex')
    const signature = createHmac('sha256', secretBytes).update(message, 'utf-8').digest('hex')

    return {
        'Content-Type': 'application/json',
        'apikey': ANON_KEY,
        'Authorization': `Bearer ${session.accessToken}`,
        'X-Request-Timestamp': String(timestampSec),
        'X-Idempotency-Key': idempotencyKey,
        'X-Request-Signature': signature,
        'X-Request-Nonce': nonce,
        'User-Agent': 'Ktor client'
    }
}

async function bootstrap() {
    const signupRes = await fetch(`${BASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${ANON_KEY}`,
            'User-Agent': 'Ktor client'
        },
        body: '{}'
    })

    if (!signupRes.ok) {
        throw new Error(`Anonymous auth failed: HTTP ${signupRes.status}`)
    }

    const signupData = await signupRes.json()
    const accessToken = signupData.access_token
    const anonUserId = signupData.user?.id

    const randomAndroidId = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')
    const installIdHash = createHash('sha256').update(randomAndroidId).digest('hex')

    const createRes = await fetch(`${BASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': ANON_KEY,
            'Authorization': `Bearer ${accessToken}`,
            'User-Agent': 'Ktor client'
        },
        body: JSON.stringify({ anonUserId, installIdHash })
    })

    if (!createRes.ok) {
        throw new Error(`User provisioning failed: HTTP ${createRes.status}`)
    }

    const createData = await createRes.json()
    const newSession = {
        accessToken,
        anonUserId,
        signingSecret: createData.signingSecret,
        balance: createData.credits?.balance ?? 5,
        adsRemainingToday: 30
    }

    cachedSession = newSession
    return cachedSession
}

export async function getSession(forceNew = false) {
    if (forceNew) cachedSession = null
    if (!cachedSession) {
        if (!sessionPromise) {
            sessionPromise = bootstrap().finally(() => {
                sessionPromise = null
            })
        }
        await sessionPromise
    }
    return cachedSession
}

export async function claimReward() {
    const session = await getSession()
    const headers = buildSignedHeaders('claim-ad-reward', '{}', session)
    const res = await fetch(`${BASE_URL}/functions/v1/claim-ad-reward`, {
        method: 'POST',
        headers,
        body: '{}'
    })
    if (!res.ok) {
        const err = await res.text()
        throw new Error(`Claim reward failed: HTTP ${res.status}: ${err}`)
    }
    const data = await res.json()
    if (session) {
        session.balance = data.newBalance ?? (session.balance + 1)
        session.adsRemainingToday = data.adsRemainingToday ?? (session.adsRemainingToday - 1)
    }
    return data
}

async function requestEndpoint(endpoint, payload, retryCount = 0) {
    let session = await getSession()
    const bodyStr = JSON.stringify(payload)
    const headers = buildSignedHeaders(endpoint, bodyStr, session)

    let res = await fetch(`${BASE_URL}/functions/v1/${endpoint}`, {
        method: 'POST',
        headers,
        body: bodyStr
    })

    if (res.status === 401 && retryCount < 2) {
        await getSession(true)
        return requestEndpoint(endpoint, payload, retryCount + 1)
    }

    if (res.status === 402 && retryCount < 6) {
        const errText = await res.text()
        let required = 5
        const match = errText.match(/Required:\s*~?(\d+)/i)
        if (match) required = parseInt(match[1], 10)

        let toppedUp = false
        for (let i = 0; i < Math.max(required, 5); i++) {
            try {
                const reward = await claimReward()
                if (reward.newBalance >= required) {
                    toppedUp = true
                    break
                }
                if (!reward.success || reward.adsRemainingToday <= 0) break
            } catch {
                break
            }
        }

        if (!toppedUp) {
            await getSession(true)
        }
        return requestEndpoint(endpoint, payload, retryCount + 1)
    }

    if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`[${endpoint}] HTTP ${res.status}: ${errorText}`)
    }

    const data = await res.json()
    if (session && data.creditsRemaining !== undefined) {
        session.balance = data.creditsRemaining
    }
    return data
}

function resolveImageBuffer(buffer, mimeType = 'image/jpeg') {
    if (!buffer) return null
    return {
        base64: Buffer.from(buffer).toString('base64'),
        mimeType
    }
}

export async function chatAI(message, options = {}) {
    if (!message || typeof message !== 'string') {
        throw new Error('Pesan pertanyaan tidak boleh kosong.')
    }

    const payload = {
        message: message.trim(),
        providerId: options.providerId || DEFAULT_MODEL.providerId,
        modelId: options.modelId || DEFAULT_MODEL.modelId
    }

    if (options.systemPrompt) payload.systemPrompt = options.systemPrompt
    if (Array.isArray(options.conversationHistory)) payload.conversationHistory = options.conversationHistory

    if (options.imageBuffer) {
        const img = resolveImageBuffer(options.imageBuffer, options.imageMime || 'image/jpeg')
        if (img) {
            payload.imageBase64 = img.base64
            payload.imageMimeType = img.mimeType
        }
    }

    const data = await requestEndpoint('send-message', payload)
    return {
        reply: data.reply || '',
        provider: data.provider || payload.providerId,
        model: data.model || payload.modelId,
        creditsRemaining: data.creditsRemaining ?? 0
    }
}
