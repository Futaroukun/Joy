/*
 - @Author: Rafli & Antigravity
 - @Feature: Autonomous AI Developer Agent
 - @Description: AI Agent Developer dengan OpenRouter API default, deskripsi model fungsional & single-select interactive list.
*/

import fs from "fs";
import path from "path";
import axios from "axios";
import util from "util";
import Database from "better-sqlite3";
import { exec } from "child_process";
import { fileURLToPath } from "url";
import { fileTypeFromBuffer } from "file-type";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CONFIG_FILE = path.join(DATA_DIR, "ax_config.json");
const DB_PATH = path.join(DATA_DIR, "ai_sessions.db");
const execPromise = util.promisify(exec);

fs.mkdirSync(DATA_DIR, { recursive: true });

// Sesi input API Key interaktif: userId -> { provider, providerName, timeout }
const pendingKeySessions = new Map();
const KEY_SESSION_TIMEOUT = 3 * 60 * 1000; // 3 Menit timeout

// ============================================
// 1. DEFAULT PROVIDER CONFIG (JSON PERSISTENCE)
// ============================================
const DEFAULT_PROVIDER_CONFIG = {
    provider: "openrouter",
    openrouter: {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: process.env.OPENROUTER_KEYS || global.openrouterKeys || "",
        model: "openrouter/free"
    },
    modelnyaw: {
        baseUrl: "https://modelnyaw.xyz/v1",
        apiKey: process.env.MODELNYAW_API_KEY || global.openaiKey || "",
        model: "deepseek-v4-flash"
    }
};

// Deskripsi fungsional model yang mudah dipahami user
const MODEL_METADATA = {
    // OpenRouter Free & Recommended
    "openrouter/free": {
        category: "Pertanyaan Normal & Chat",
        desc: "Router Model Gratis OpenRouter (Rekomendasi Default)"
    },
    "minimax/minimax-m3:free": {
        category: "Pertanyaan Normal & Chat",
        desc: "MiniMax M3 Free (Cepat & Responsif)"
    },
    "minimax/minimax-m2.7:free": {
        category: "Pertanyaan Normal & Chat",
        desc: "MiniMax M2.7 Free"
    },
    "cohere/north-mini-code:free": {
        category: "Coding & Developer",
        desc: "Cohere Code Free untuk Pemrograman"
    },
    "z-ai/glm-5.2:free": {
        category: "Penalaran Mendalam",
        desc: "GLM 5.2 Free untuk Analisis & Teks"
    },
    "liquid/lfm-2.5-2.6b:free": {
        category: "Pertanyaan Normal & Chat",
        desc: "Liquid AI LFM Free (Ringan & Cepat)"
    },
    "nvidia/nemotron-3.5-lightning:free": {
        category: "Penalaran Mendalam",
        desc: "Nvidia Nemotron 3.5 Free"
    },
    "google/gemma-4-31b-it:free": {
        category: "Penalaran Mendalam",
        desc: "Google Gemma 4 31B Free"
    },
    "google/gemma-4-26b-a4b-it:free": {
        category: "Penalaran Mendalam",
        desc: "Google Gemma 4 26B Free"
    },
    "inclusionai/ling-3.0-flash-fin:free": {
        category: "Pertanyaan Normal & Chat",
        desc: "Ling 3.0 Flash Free"
    },
    "thinkingmachines/inkling:free": {
        category: "Penalaran Mendalam",
        desc: "Inkling Free"
    },
    // OpenRouter Flagship (Paid / Credit)
    "anthropic/claude-3.5-sonnet": {
        category: "Coding & Developer",
        desc: "Claude 3.5 Sonnet (Coding & Arsitektur Terbaik)"
    },
    "deepseek/deepseek-chat": {
        category: "Pertanyaan Normal & Chat",
        desc: "DeepSeek V3 Chat"
    },
    "deepseek/deepseek-r1": {
        category: "Penalaran Mendalam",
        desc: "DeepSeek R1 Reasoner (Penalaran Logika)"
    },
    "openai/gpt-4o-mini": {
        category: "Pertanyaan Normal & Chat",
        desc: "GPT-4o Mini (Cepat & Cerdas)"
    },
    "google/gemini-2.0-flash-001": {
        category: "Pertanyaan Normal & Chat",
        desc: "Gemini 2.0 Flash"
    },
    "meta-llama/llama-3.3-70b-instruct": {
        category: "Penalaran Mendalam",
        desc: "Llama 3.3 70B Instruct"
    },
    // Modelnyaw / Legacy Support
    "kimi-k2.7-code": {
        category: "Coding & Developer",
        desc: "Khusus Coding, Tulis/Edit File & Script"
    },
    "kimi-k2.7-code-highspeed": {
        category: "Coding & Developer",
        desc: "Coding Super Cepat untuk Script Ringan"
    },
    "deepseek-v4-pro": {
        category: "Coding & Developer",
        desc: "Analisis Kode Kompleks & Arsitektur Bot"
    },
    "deepseek-v4-mod": {
        category: "Coding & Developer",
        desc: "Refactoring, Tambah Fitur & Modifikasi Kode"
    },
    "deepseek-v4-pro-0813": {
        category: "Coding & Developer",
        desc: "Versi Stabil DeepSeek Pro untuk Pemrograman"
    },
    "kimi-k3": {
        category: "Penalaran Mendalam",
        desc: "Logika Rumit, Matematika & Pemecahan Masalah Sulit"
    },
    "glm-5.3": {
        category: "Penalaran Mendalam",
        desc: "Penalaran Logis, Analisis Dokumen & Teks Panjang"
    },
    "mimo-v2.5-pro": {
        category: "Penalaran Mendalam",
        desc: "Pemrosesan Data Teknis & Analisis Terstruktur"
    },
    "deepseek-v4-flash": {
        category: "Pertanyaan Normal & Chat",
        desc: "Tanya Jawab Santai, Cepat & Percakapan Harian"
    },
    "deepseek-v4-flash-0731": {
        category: "Pertanyaan Normal & Chat",
        desc: "Chat Cepat & Informasi Umum Ringan"
    },
    "glm-5.2": {
        category: "Pertanyaan Normal & Chat",
        desc: "Chat Natural, Penulisan Artikel & Bantuan Umum"
    },
    "glm-5.1": {
        category: "Pertanyaan Normal & Chat",
        desc: "Respon Kilat untuk Pertanyaan Standar"
    },
    "auto": {
        category: "Pertanyaan Normal & Chat",
        desc: "Mode Otomatis (Menyesuaikan Jenis Pertanyaan)"
    },
    "hy3": {
        category: "Pertanyaan Normal & Chat",
        desc: "Rangkuman Materi, Dialog & Ide Kreatif"
    },
    "deepseek-v4-flash-vision-exp": {
        category: "Vision & Debugging",
        desc: "Khusus Analisis Gambar, Foto & Diagram"
    },
    "auto-debug": {
        category: "Vision & Debugging",
        desc: "Pendeteksi Error & Troubleshooting Sistem"
    }
};

// ============================================
// 2. JSON CONFIG PERSISTENCE & RESOLUTION
// ============================================
function extractApiKeys(rawText) {
    if (!rawText || typeof rawText !== "string") return [];
    let text = rawText.trim();
    // Bersihkan prefix assignment seperti 'export OPENROUTER_KEYS=', 'OPENROUTER_KEYS =', 'API_KEY=' dll.
    text = text.replace(/^(?:export\s+)?[a-zA-Z0-9_]+\s*=\s*/i, "");
    // Bersihkan tanda kutip pembungkus di awal & akhir
    text = text.replace(/^["'`]|["'`]$/g, "");
    // Pisahkan berdasarkan koma, titik koma, newline, atau whitespace
    const items = text.split(/[\n\r,;\s]+/);
    // Bersihkan dan filter tiap key
    const cleanedKeys = items
        .map(k => k.replace(/^["'`]|["'`]$/g, "").trim())
        .filter(k => k.length > 0 && !/^(export|[a-zA-Z0-9_]+=)$/i.test(k));
    return [...new Set(cleanedKeys)];
}

function detectProviderFromKey(rawText) {
    if (!rawText) return null;
    const lower = String(rawText).toLowerCase();
    if (lower.includes("openrouter") || lower.includes("sk-or-")) return "openrouter";
    if (lower.includes("modelnyaw") || lower.includes("sk-qwen-")) return "modelnyaw";
    return null;
}

function getSavedConfig() {
    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
            const openrouter = { ...DEFAULT_PROVIDER_CONFIG.openrouter, ...(parsed.openrouter || {}) };
            const modelnyaw = { ...DEFAULT_PROVIDER_CONFIG.modelnyaw, ...(parsed.modelnyaw || {}) };
            if (openrouter.apiKey) openrouter.apiKey = extractApiKeys(openrouter.apiKey).join(",");
            if (modelnyaw.apiKey) modelnyaw.apiKey = extractApiKeys(modelnyaw.apiKey).join(",");
            return {
                ...DEFAULT_PROVIDER_CONFIG,
                ...parsed,
                openrouter,
                modelnyaw
            };
        } catch (_) {
            return { ...DEFAULT_PROVIDER_CONFIG };
        }
    }
    return { ...DEFAULT_PROVIDER_CONFIG };
}

function saveConfig(update) {
    const current = getSavedConfig();
    const merged = { ...current, ...update };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
}

function saveProviderConfig(provider, update) {
    const current = getSavedConfig();
    const providerConfig = { ...(current[provider] || DEFAULT_PROVIDER_CONFIG[provider] || {}), ...update };
    if (providerConfig.apiKey) {
        providerConfig.apiKey = extractApiKeys(providerConfig.apiKey).join(",");
    }
    const merged = { ...current, [provider]: providerConfig };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
}

function getEndpointConfig() {
    const conf = getSavedConfig();
    const activeProvider = conf.provider || "openrouter";
    const pConf = conf[activeProvider] || DEFAULT_PROVIDER_CONFIG[activeProvider] || DEFAULT_PROVIDER_CONFIG.openrouter;

    const rawUrl = pConf.baseUrl || "https://openrouter.ai/api/v1";
    const rawModel = pConf.model || (activeProvider === "openrouter" ? "openrouter/free" : "deepseek-v4-flash");
    const rawKeys = pConf.apiKey || "";

    const keys = extractApiKeys(rawKeys);
    const url = rawUrl.replace(/\/+$/, "");
    const fullUrl = url.endsWith("/chat/completions") ? url : `${url}/chat/completions`;

    const providerNames = {
        openrouter: "OpenRouter",
        modelnyaw: "Modelnyaw"
    };

    return {
        provider: activeProvider,
        providerName: providerNames[activeProvider] || activeProvider,
        url: fullUrl,
        rawBaseUrl: url,
        model: rawModel,
        keys: keys.length > 0 ? keys : extractApiKeys(DEFAULT_PROVIDER_CONFIG[activeProvider]?.apiKey || ""),
        referer: "https://github.com/Futaroukun/Joy",
        title: "Joy WhatsApp Agent"
    };
}

// ============================================
// 3. SQLITE SESSION PERSISTENCE & PRUNING
// ============================================
const db = new Database(DB_PATH);
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
`);

let keyIndex = 0;
function getNextApiKey(keys) {
    if (!keys || keys.length === 0) return { key: "", index: 1 };
    const activeIndex = keyIndex % keys.length;
    const key = keys[activeIndex];
    keyIndex = (keyIndex + 1) % keys.length;
    return { key, index: activeIndex + 1 };
}

// ============================================
// 4. FETCH AVAILABLE MODELS & CATEGORIZE
// ============================================
async function fetchAvailableModels(config) {
    const keys = config.keys;
    const url = `${config.rawBaseUrl}/models`;

    for (const key of keys) {
        try {
            const res = await axios.get(url, {
                headers: { "Authorization": `Bearer ${key}` },
                timeout: 10000
            });
            const rawData = res.data?.data || res.data || [];
            if (Array.isArray(rawData)) {
                return rawData.map(m => (typeof m === "string" ? m : m.id)).filter(Boolean);
            }
        } catch (_) {}
    }
    return [];
}

function buildModelSections(allModels, currentModel, usedPrefix, command) {
    let activeModels = allModels;

    // Bila endpoint OpenRouter (banyak model), prioritaskan model gratis & model di MODEL_METADATA
    if (allModels.length > 40) {
        const priorityModels = allModels.filter(m => 
            m === currentModel || 
            m.includes(":free") || 
            m === "openrouter/free" || 
            Boolean(MODEL_METADATA[m])
        );
        activeModels = priorityModels.length > 0 ? priorityModels.slice(0, 40) : allModels.slice(0, 40);
    } else {
        activeModels = allModels.filter(m => 
            !m.startsWith("claude-") && 
            !m.startsWith("gpt-5.6") && 
            m !== "kimi-k2.6"
        );
    }

    const categories = {
        "💻 Coding & Developer": [],
        "🧠 Penalaran Mendalam": [],
        "💬 Pertanyaan Normal & Chat": [],
        "👁️ Vision & Debugging": [],
        "📦 Model Lainnya": []
    };

    for (const modelId of activeModels) {
        const meta = MODEL_METADATA[modelId];
        const catKey = meta ? Object.keys(categories).find(k => k.includes(meta.category)) || "📦 Model Lainnya" : "📦 Model Lainnya";
        const desc = meta ? meta.desc : `Model AI (${modelId})`;
        const isCurrent = modelId === currentModel;

        const row = {
            header: isCurrent ? "MODEL AKTIF" : "PILIH",
            title: (isCurrent ? "✅ " : "") + modelId,
            description: desc,
            id: `${usedPrefix + command} setmodel ${modelId}`
        };

        if (isCurrent) {
            categories[catKey].unshift(row); // Model aktif selalu di urutan teratas kategori
        } else {
            categories[catKey].push(row);
        }
    }

    const sections = [];
    for (const [catTitle, rows] of Object.entries(categories)) {
        if (rows.length > 0) {
            sections.push({
                title: catTitle,
                rows: rows
            });
        }
    }

    return { sections, count: activeModels.length };
}

const MAX_HISTORY_MESSAGES = 10;

function pruneMessageHistory(messages) {
    if (!messages || messages.length <= 2) return messages;
    const systemMessage = messages[0];
    let nonSystem = messages.slice(1);

    // Pangkas output tool pada giliran lama untuk menghemat token masif
    nonSystem = nonSystem.map((msg, index) => {
        if (index < nonSystem.length - 4 && msg.role === "tool" && typeof msg.content === "string") {
            if (msg.content.length > 200) {
                return {
                    ...msg,
                    content: msg.content.slice(0, 180) + "\n[...output lama diringkas untuk hemat token...]"
                };
            }
        }
        return msg;
    });

    if (nonSystem.length > MAX_HISTORY_MESSAGES) {
        nonSystem = nonSystem.slice(-MAX_HISTORY_MESSAGES);
    }
    return [systemMessage, ...nonSystem];
}

const sessions = {
    get(chatId) {
        try {
            const row = db.prepare("SELECT data FROM sessions WHERE id = ?").get(chatId);
            return row ? JSON.parse(row.data) : null;
        } catch (_) {
            return null;
        }
    },
    set(chatId, history) {
        try {
            const pruned = pruneMessageHistory(history);
            db.prepare("INSERT OR REPLACE INTO sessions (id, data, updated_at) VALUES (?, ?, ?)")
                .run(chatId, JSON.stringify(pruned), Date.now());
        } catch (e) {
            console.error("[AX-AGENT] Gagal menyimpan sesi SQLite:", e.message);
        }
    },
    delete(chatId) {
        try {
            db.prepare("DELETE FROM sessions WHERE id = ?").run(chatId);
        } catch (_) {}
    }
};

const runningSessions = new Set();
const activeSessions = new Set();
const MAX_STEPS = 50;

function isAxActive(chatId) {
    if (activeSessions.has(chatId)) return true;
    return Boolean(global.db?.data?.chats?.[chatId]?.isAxOn);
}

function setAxActive(chatId, active) {
    if (active) {
        activeSessions.add(chatId);
    } else {
        activeSessions.delete(chatId);
    }
    if (global.db?.data?.chats) {
        if (!global.db.data.chats[chatId]) global.db.data.chats[chatId] = {};
        global.db.data.chats[chatId].isAxOn = Boolean(active);
        if (typeof global.saveData === "function") {
            global.saveData("chats", chatId);
        }
    }
}

// ============================================
// 5. DIAGNOSTICS & LOGGING
// ============================================
function log(message, data = null) {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[AX-AGENT] ${timestamp}: ${message}`, data);
    } else {
        console.log(`[AX-AGENT] ${timestamp}: ${message}`);
    }
}

function extractApiError(error) {
    if (error.response?.data?.error) {
        const apiError = error.response.data.error;
        return {
            code: apiError.code || "API_ERROR",
            message: apiError.message || JSON.stringify(apiError),
            status: error.response.status
        };
    }
    return {
        code: error.code || "UNKNOWN",
        message: error.message,
        status: error.response?.status || 0
    };
}

function resolvePath(p) {
    return path.isAbsolute(p) ? p : path.join(ROOT, p);
}

const SUPPORTED_IMAGE_MIMES = new Set([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp"
]);

async function detectMimeType(buffer) {
    try {
        const result = await fileTypeFromBuffer(buffer);
        return result?.mime ?? "application/octet-stream";
    } catch (_) {
        return "application/octet-stream";
    }
}

// ============================================
// 6. API CALL ENGINE
// ============================================
async function fetchChatCompletion(payload) {
    const config = getEndpointConfig();
    const keys = config.keys;
    const maxAttempts = keys.length;
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const { key: activeKey, index: keyNumber } = getNextApiKey(keys);
        const masked = activeKey.length > 16
            ? activeKey.slice(0, 8) + "..." + activeKey.slice(-4)
            : "***";

        try {
            log(`[Attempt ${attempt + 1}] Request [${config.model}] (${masked}) @ ${config.url}`);
            const response = await axios.post(config.url, {
                model: config.model,
                ...payload
            }, {
                headers: {
                    "Authorization": `Bearer ${activeKey}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": config.referer,
                    "X-Title": config.title
                },
                timeout: 180000
            });
            return response.data;
        } catch (error) {
            lastError = error;
            const status = error.response?.status;
            const errorMsg = error.response?.data?.error?.message || error.message;
            log(`[Key #${keyNumber}] Gagal (${status || "NET_ERROR"}): ${errorMsg}`);

            if (
                status === 429 ||
                status === 401 ||
                status === 403 ||
                status === 404 ||
                (status && status >= 500) ||
                error.code === "ECONNABORTED" ||
                error.code === "ETIMEDOUT"
            ) {
                continue;
            }
            throw error;
        }
    }
    throw lastError || new Error("Semua API key gagal digunakan.");
}

// ============================================
// 7. TOOLS DEFINITIONS & IMPLEMENTATIONS
// ============================================
const TOOL_EMOJI = {
    read_file: "📖",
    write_file: "📝",
    edit_file: "✏️",
    delete_file: "🗑️",
    list_directory: "📂",
    execute_command: "⚡",
    run_javascript: "🧬"
};

const TOOLS_SCHEMA = [
    {
        type: "function",
        function: {
            name: "read_file",
            description: "Membaca isi file teks. Gunakan start_line & end_line bila hanya butuh potongan baris agar hemat token.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Path target file" },
                    start_line: { type: "integer", description: "Nomor baris awal (1-indexed)" },
                    end_line: { type: "integer", description: "Nomor baris akhir (1-indexed)" }
                },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "write_file",
            description: "Membuat file baru atau menimpa file yang sudah ada.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Path file tujuan" },
                    content: { type: "string", description: "Isi teks file yang ditulis" }
                },
                required: ["path", "content"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "edit_file",
            description: "Mengganti teks spesifik (old_text) menjadi new_text di dalam file.",
            parameters: {
                type: "object",
                properties: {
                    path: { type: "string", description: "Path file" },
                    old_text: { type: "string", description: "Teks lama yang unik" },
                    new_text: { type: "string", description: "Teks baru pengganti" }
                },
                required: ["path", "old_text", "new_text"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "delete_file",
            description: "Menghapus file atau folder secara rekursif.",
            parameters: {
                type: "object",
                properties: { path: { type: "string", description: "Path yang akan dihapus" } },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "list_directory",
            description: "Menampilkan daftar file dan direktori.",
            parameters: {
                type: "object",
                properties: { path: { type: "string", description: "Path direktori (contoh: '.' atau 'plugins')" } },
                required: ["path"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "execute_command",
            description: "Menjalankan perintah shell Linux Termux dan membaca output stdout/stderr ringkas.",
            parameters: {
                type: "object",
                properties: { command: { type: "string", description: "Perintah bash shell" } },
                required: ["command"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "run_javascript",
            description: "Mengeksekusi kode JavaScript async dengan akses ke conn, m, fs, path, global.",
            parameters: {
                type: "object",
                properties: { code: { type: "string", description: "Kode JS async" } },
                required: ["code"]
            }
        }
    }
];

// ============================================
// 7. SECURITY & SENSITIVE PATH GUARDS
// ============================================
const SENSITIVE_PATTERNS = [
    /sessions(\/|$)/i,
    /\.env/i,
    /ai_sessions\.db/i,
    /pixiv\.json/i,
    /creds\.json/i,
    /id_rsa/i,
    /\.ssh/i,
    /\.git/i
];

function isProtectedPath(filePath) {
    const normalized = String(filePath).replace(/\\/g, "/");
    return SENSITIVE_PATTERNS.some(regex => regex.test(normalized));
}

const TOOL_TRIGGER_PATTERNS = [
    /\b(baca|read|lihat|buka|cek|periksa|scan)\s+(file|folder|direktori|isi|kode|script|plugin|project|source)/i,
    /\b(tulis|buat|bikin|write|create|save|simpan)\s+(file|folder|script|plugin)/i,
    /\b(edit|ubah|ganti|update|modifikasi|patch)\s+(file|kode|script|plugin)/i,
    /\b(hapus|delete|remove|rm)\s+(file|folder|script)/i,
    /\b(ls|dir|daftar\s+file|list\s+file|list\s+folder)/i,
    /\b(eksekusi|jalankan|run|exec|bash|terminal|command|perintah|sh|node\s+)/i,
    /\b(perbaiki|fix|debug)\s+(plugin|file|kode|error)/i
];

function shouldEnableTools(text, isOwner) {
    if (!isOwner) return false;
    if (!text || typeof text !== "string") return false;
    return TOOL_TRIGGER_PATTERNS.some(pattern => pattern.test(text));
}

const TOOLS = {
    read_file: async ({ path: p, start_line, end_line }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak membaca file sistem.");
        if (isProtectedPath(p)) throw new Error(`Akses ditolak: File '${p}' dilindungi untuk mencegah kebocoran data.`);

        const full = resolvePath(p);
        if (!fs.existsSync(full)) throw new Error(`File ${p} tidak ditemukan.`);
        const content = fs.readFileSync(full, "utf-8");
        const lines = content.split("\n");

        if (start_line !== undefined || end_line !== undefined) {
            const start = Math.max(1, parseInt(start_line) || 1) - 1;
            const end = Math.min(lines.length, parseInt(end_line) || lines.length);
            return lines.slice(start, end).join("\n") || "(kosong)";
        }

        if (lines.length > 200) {
            return lines.slice(0, 200).join("\n") + 
                `\n\n[...Dipangkas hemat token: Menampilkan 200 dari ${lines.length} baris. Gunakan start_line & end_line untuk melihat baris lainnya...]`;
        }
        return content;
    },
    write_file: async ({ path: p, content }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak menulis file.");
        if (isProtectedPath(p)) throw new Error(`Akses ditolak: Lokasi '${p}' dilindungi.`);

        const full = resolvePath(p);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, content);
        return `Berhasil menulis ${p} (${content.length} karakter)`;
    },
    edit_file: async ({ path: p, old_text, new_text }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak mengedit file.");
        if (isProtectedPath(p)) throw new Error(`Akses ditolak: File '${p}' dilindungi.`);

        const full = resolvePath(p);
        const content = fs.readFileSync(full, "utf-8");
        const occurrences = content.split(old_text).length - 1;

        if (occurrences === 0) {
            throw new Error(`old_text tidak ditemukan di ${p}. Pastikan teks & indentasi persis sama.`);
        }
        if (occurrences > 1) {
            throw new Error(`old_text muncul ${occurrences}x di ${p}. Berikan teks konteks lebih panjang.`);
        }

        fs.writeFileSync(full, content.replace(old_text, () => new_text));
        return `Berhasil mengedit ${p}`;
    },
    delete_file: async ({ path: p }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak menghapus file.");
        if (isProtectedPath(p)) throw new Error(`Akses ditolak: Path '${p}' dilindungi.`);

        fs.rmSync(resolvePath(p), { recursive: true, force: true });
        return `Berhasil menghapus ${p}`;
    },
    list_directory: async ({ path: p }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak memindai direktori.");
        if (isProtectedPath(p)) throw new Error(`Akses ditolak: Direktori '${p}' dilindungi.`);

        const items = fs.readdirSync(resolvePath(p), { withFileTypes: true });
        if (items.length > 40) {
            const sliced = items.slice(0, 40);
            return sliced.map(i => `${i.isDirectory() ? "📁" : "📄"} ${i.name}`).join("\n") + 
                `\n[...dan ${items.length - 40} file/folder lainnya...]`;
        }
        return items.map(i => `${i.isDirectory() ? "📁" : "📄"} ${i.name}`).join("\n") || "(kosong)";
    },
    execute_command: async ({ command }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak mengeksekusi shell command.");

        try {
            const { stdout, stderr } = await execPromise(command, {
                timeout: 120000,
                maxBuffer: 1024 * 1024 * 50,
                cwd: ROOT
            });
            let output = stdout + (stderr ? `\n[stderr]\n${stderr}` : "");
            if (output.length > 2500) {
                output = `[...Output awal dipangkas ${output.length - 2500} karakter...]\n` + output.slice(-2500);
            }
            return output || "(tidak ada output)";
        } catch (err) {
            let out = (err.stdout || "") + (err.stderr ? `\n[stderr]\n${err.stderr}` : "");
            if (out.length > 2500) out = out.slice(-2500);
            return out || `Error exec: ${err.message}`;
        }
    },
    run_javascript: async ({ code }, context) => {
        if (!context?.isOwner) throw new Error("Akses ditolak: Hanya Owner Bot yang berhak mengeksekusi kode JS.");

        const fn = new Function(
            "conn",
            "m",
            "fs",
            "path",
            "global",
            `return (async () => { ${code} })()`
        );
        const result = await fn(context.conn, context.m, fs, path, global);
        const str = typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return str.length > 2500 ? str.slice(0, 2500) + "\n[...dipangkas...]" : str;
    }
};

// ============================================
// 8. WHATSAPP FORMATTER & SYSTEM PROMPT
// ============================================

/**
 * Konversi tabel markdown web ke format daftar terstruktur WhatsApp yang ramah layar HP
 */
function convertTableToWA(text) {
    if (!text || !text.includes("|")) return text;

    const lines = text.split("\n");
    const result = [];
    let inTable = false;
    let tableLines = [];

    const processTable = (rows) => {
        if (rows.length < 2) return rows.join("\n");

        const rawRows = rows.filter(r => /\|/.test(r));
        if (rawRows.length === 0) return rows.join("\n");

        let headerRow = null;
        let dataRows = [];

        for (let i = 0; i < rawRows.length; i++) {
            const row = rawRows[i].trim();
            // Cek apakah separator baris (misal: |---|---| atau |:---:|)
            if (/^\|?[\s\-:|]+\|?$/.test(row) && row.includes("-")) {
                if (i > 0 && !headerRow) {
                    headerRow = rawRows[i - 1]
                        .replace(/^\s*\|/, "")
                        .replace(/\|\s*$/, "")
                        .split("|")
                        .map(c => c.trim());
                    dataRows.pop();
                }
                continue;
            }

            const cells = row
                .replace(/^\s*\|/, "")
                .replace(/\|\s*$/, "")
                .split("|")
                .map(c => c.trim());

            dataRows.push(cells);
        }

        if (!headerRow && dataRows.length > 0) {
            headerRow = dataRows.shift();
        }

        if (!headerRow || dataRows.length === 0) {
            return rows.join("\n");
        }

        const formatted = [];
        for (const cells of dataRows) {
            if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;

            if (headerRow.length === 2 && cells.length >= 2) {
                formatted.push(`• *${cells[0]}:* ${cells[1]}`);
            } else if (headerRow.length > 2) {
                const title = cells[0] || "Item";
                const details = [];
                for (let c = 1; c < Math.max(headerRow.length, cells.length); c++) {
                    const h = headerRow[c] || `Kolom ${c + 1}`;
                    const val = cells[c] || "-";
                    details.push(`  › *${h}:* ${val}`);
                }
                formatted.push(`• *${title}*\n${details.join("\n")}`);
            } else {
                formatted.push(`• ${cells.join("  |  ")}`);
            }
        }

        return formatted.join("\n");
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isTableRow = /^\s*\|.*\|\s*$/.test(line) || /^\s*\|?[\s\-:|]+\|?\s*$/.test(line);

        if (isTableRow) {
            inTable = true;
            tableLines.push(line);
        } else {
            if (inTable) {
                result.push(processTable(tableLines));
                tableLines = [];
                inTable = false;
            }
            result.push(line);
        }
    }

    if (inTable && tableLines.length > 0) {
        result.push(processTable(tableLines));
    }

    return result.join("\n");
}

/**
 * Format markdown Web / Browser -> Format WhatsApp Native
 */
function formatWhatsApp(text) {
    if (!text || typeof text !== "string") return "";

    let str = text;

    // 1. Format tag <think>...</think> jika ada
    str = str.replace(/<think>([\s\S]*?)<\/think>/gi, (_, thinkContent) => {
        const clean = thinkContent.replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
        if (!clean) return "";
        const preview = clean.length > 250
            ? clean.slice(0, 240).trim() + "..."
            : clean;
        return `💭 *Proses Berpikir:*\n_${preview}_\n\n────────────────────────\n\n`;
    });

    // 2. Proteksi blok kode (```...```) agar isi kode tidak rusak oleh regex markdown
    const codeBlocks = [];
    str = str.replace(/```(?:([a-zA-Z0-9_+#.-]+)\r?\n)?([\s\S]*?)```/g, (_, lang, code) => {
        const idx = codeBlocks.length;
        const cleanCode = (code || "").trim();
        let formattedCode = `\`\`\`\n${cleanCode}\n\`\`\``;
        if (lang && lang.trim()) {
            const langName = lang.trim().toUpperCase();
            formattedCode = `*${langName}:*\n\`\`\`\n${cleanCode}\n\`\`\``;
        }
        codeBlocks.push(formattedCode);
        return `%%%AX_CODE_BLOCK_${idx}%%%`;
    });

    // 3. Proteksi inline code (`...`)
    const inlineCodes = [];
    str = str.replace(/`([^`\n]+)`/g, (_, code) => {
        const idx = inlineCodes.length;
        inlineCodes.push(`\`${code}\``);
        return `%%%AX_INLINE_${idx}%%%`;
    });

    // 4. Konversi tabel markdown ke format WhatsApp
    str = convertTableToWA(str);

    // 5. Konversi tag HTML umum ke format WhatsApp
    str = str
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<(?:b|strong)>(.*?)<\/(?:b|strong)>/gi, "*$1*")
        .replace(/<(?:i|em)>(.*?)<\/(?:i|em)>/gi, "_$1_")
        .replace(/<(?:s|strike|del)>(.*?)<\/(?:s|strike|del)>/gi, "~$1~");

    // 6. Konversi LaTeX / Math formulas
    str = str
        .replace(/\\\[([\s\S]*?)\\\]/g, "```\n$1\n```")
        .replace(/\$\$([\s\S]*?)\$\$/g, "```\n$1\n```")
        .replace(/\\\(([\s\S]*?)\\\)/g, "`$1`");

    // 7. Konversi Link Markdown [Label](url) -> Label (url)
    str = str.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, (_, label, url) => {
        const cleanLabel = label.trim();
        const cleanUrl = url.trim();
        if (cleanLabel.toLowerCase() === cleanUrl.toLowerCase() || /^(https?:\/\/|link|url|tautan|sini|here)$/i.test(cleanLabel)) {
            return cleanUrl;
        }
        return `${cleanLabel} (${cleanUrl})`;
    });
    str = str.replace(/<(https?:\/\/[^>]+)>/g, "$1");

    // 8. Bersihkan sitasi web seperti [citation:1], [1], 【...】
    str = str
        .replace(/\[citation:\d+\]/gi, "")
        .replace(/【\d+:\d+†source】/g, "")
        .replace(/\[\^\d+\]/g, "");

    // 9. Konversi Garis Pembatas (---, ***, ___, ===) -> ────────────────────────
    str = str.replace(/^(?:-{3,}|\*{3,}|_{3,}|={3,})$/gm, "────────────────────────");

    // 10. Konversi Markdown Headings (# Header) -> *Header*
    str = str.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => {
        const cleanHeading = heading.replace(/\*\*/g, "").replace(/\*/g, "").trim();
        return `*${cleanHeading}*`;
    });
    str = str.replace(/^([^\n]+)\n[=]{3,}$/gm, "*$1*");

    // 11. Konversi List & Bullets SEBELUM asterisk bold formatting
    str = str.replace(/^(\s{2,}|\t+)[-*+]\s+/gm, "  › ");
    str = str.replace(/^[-*+]\s+/gm, "• ");

    // 12. Konversi Bold-Italic, Bold, Strikethrough
    str = str.replace(/(?:\*\*\*|___)\s*([^\n*]+?)\s*(?:\*\*\*|___)/g, "_*$1*_");
    str = str.replace(/\*\*_\s*([^\n*]+?)\s*_\*\*/g, "_*$1*_");
    str = str.replace(/_\*\*\s*([^\n*]+?)\s*\*\*_/g, "_*$1*_");
    str = str.replace(/(?:\*\*|__)\s*([^\n*]+?)\s*(?:\*\*|__)/g, "*$1*");
    str = str.replace(/~~\s*([^\n~]+?)\s*~~/g, "~$1~");

    // 13. Batasi newlines berlebih maksimal 2 baris kosong
    str = str.replace(/\n{3,}/g, "\n\n");

    // 14. Kembalikan inline code dan code blocks
    for (let i = 0; i < inlineCodes.length; i++) {
        str = str.replace(`%%%AX_INLINE_${i}%%%`, () => inlineCodes[i]);
    }
    for (let i = 0; i < codeBlocks.length; i++) {
        str = str.replace(`%%%AX_CODE_BLOCK_${i}%%%`, () => codeBlocks[i]);
    }

    return str.trim();
}

const SYSTEM_PROMPT = `PROTOKOL ASISTEN AI & FORMAT WHATSAPP (~80% HEMAT TOKEN)

Kamu adalah Asisten AI cerdas di WhatsApp Bot (Termux Linux).

ATURAN FORMAT TEKS WHATSAPP (MUTLAK - BUKAN FORMAT WEB/BROWSER):
1. FORMAT TEBAL & MIRING:
   - Gunakan *teks tebal* dengan satu asterisk (DILARANG menggunakan **teks** atau __teks__ format web).
   - Gunakan _teks miring_ dengan garis bawah.
   - Gunakan ~teks dicoret~ dengan satu tilde (DILARANG ~~teks~~).
   - Gunakan \`kode\` untuk teks monospace atau perintah singkat.
2. DILARANG MENGGUNAKAN MARKDOWN HEADER WEB (#, ##, ###, ####).
   - Ganti judul dengan teks tebal *JUDUL* atau border header WhatsApp:
     ╭── ✦ *JUDUL UTAMA* ✦
3. DILARANG MENGGUNAKAN LINK MARKDOWN WEB [Teks](url).
   - Tuliskan langsung format WhatsApp: Teks (url) atau Teks: url.
4. DILARANG MENGGUNAKAN TABEL MARKDOWN WEB (| col | col |).
   - WhatsApp tidak mendukung rendering tabel web. Selalu ubah tabel menjadi daftar poin terstruktur:
     • *Item:* Nilai
     › *Rincian:* Keterangan
5. FORMAT DAFTAR & LIST:
   - Gunakan bullet • untuk poin utama dan › untuk sub-poin/rincian (DILARANG menggunakan - atau * mentah).
6. GARIS PEMBATAS:
   - Gunakan ──────────────────────── atau ╰━━━━━━━━━━━━━━━━━━━━━━━ (DILARANG menggunakan --- atau ***).
7. HINDARI garis vertikal samping (│) pada teks panjang, panduan, atau link agar tidak rusak/wrap di layar HP.
8. KODE SUMBER:
   - Gunakan blok kode WhatsApp \`\`\` tanpa tag bahasa di dalam baris pertama blok. Cantumkan nama bahasa di luar blok (*JavaScript:*, *Bash:*, dll).
9. ZERO FLUFF & MINIMAL EMOJI:
   - Langsung ke inti jawaban tanpa basa-basi pembuka/penutup.
   - Hindari emoji dekoratif, gunakan hanya emoji fungsional bila perlu (✅, ❌, ⏳).
10. PRIVASI & ATURAN TOOL:
    - Chat santai & pertanyaan umum: Jawab langsung TANPA tool, DILARANG memindai folder/file bot.
    - Dilarang keras membaca/membocorkan folder sessions, file .env, database, kredensial, dan token.`;

// ============================================
// 8. AGENT RUN LOOP
// ============================================
async function runAgentLoop(messages, context, userPromptText = "") {
    const enableTools = shouldEnableTools(userPromptText, context.isOwner);

    for (let step = 0; step < MAX_STEPS; step++) {
        log(`Step ${step + 1} | ${messages.length} pesan dalam histori | Tools: ${enableTools ? "Aktif" : "Nonaktif"}`);

        const payload = {
            messages: messages,
            ...(enableTools ? { tools: TOOLS_SCHEMA, tool_choice: "auto" } : {}),
            temperature: 0
        };

        const responseData = await fetchChatCompletion(payload);
        const choice = responseData?.choices?.[0];
        const message = choice?.message;

        if (!message) throw new Error("Respons kosong dari API LLM");

        messages.push({
            role: "assistant",
            content: message.content || null,
            ...(message.tool_calls ? { tool_calls: message.tool_calls } : {})
        });

        const toolCalls = message.tool_calls;
        if (!toolCalls || toolCalls.length === 0) {
            return (
                message.content?.trim() ||
                message.reasoning?.trim() ||
                message.reasoning_content?.trim() ||
                "Selesai."
            );
        }

        for (const toolCall of toolCalls) {
            const { name, arguments: rawArgs } = toolCall.function;
            let args = {};
            try {
                args = typeof rawArgs === "string" ? JSON.parse(rawArgs || "{}") : (rawArgs || {});
            } catch (_) {
                args = {};
            }

            try {
                await context.m.react(TOOL_EMOJI[name] || "🔧");
            } catch (_) {}

            log(`Menjalankan tool: ${name}`, args);

            let output;
            try {
                output = TOOLS[name]
                    ? await TOOLS[name](args, context)
                    : `Tool ${name} tidak dikenal`;
            } catch (error) {
                output = `Error tool ${name}: ${error.message}`;
                log(`Tool ${name} gagal: ${error.message}`);
            }

            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: String(output)
            });
        }
    }
    throw new Error("Langkah maksimum (50) tercapai.");
}

// ============================================
// 9. JOY BOT HANDLER
// ============================================
let handler = async (m, context) => {
    const { conn, args, text, usedPrefix, command, isOwner, isAdmin } = context;
    const chat = m.chat;
    const subCmd = (args[0] || "").toLowerCase();

    // --- Subcommand: Sesi Auto-Reply (ON / OFF) ---
    if (subCmd === "on" && args.length === 1) {
        if (m.isGroup && !isAdmin && !isOwner) {
            return m.reply("❌ Pengaturan sesi hanya dapat diaktifkan oleh Admin Grup atau Owner Bot.");
        }
        if (isAxActive(chat)) {
            return m.reply(
                `╭── ✦ *SESI AX SUDAH AKTIF* ✦\n` +
                `• Mode sesi interaktif AX sudah *AKTIF* di chat ini.\n` +
                `• Kirim pesan langsung tanpa prefix untuk berinteraksi.\n` +
                `• *Matikan:* \`${usedPrefix + command} off\`\n` +
                `• *Reset:* \`${usedPrefix + command} reset\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
        setAxActive(chat, true);
        try { await m.react("✅"); } catch (_) {}
        const conf = getEndpointConfig();
        return m.reply(
            `╭── ✦ *SESI AX DIAKTIFKAN* ✦\n` +
            `• Mode sesi interaktif AX berhasil *DIAKTIFKAN*.\n` +
            `• Semua pesan masuk di chat ini akan dibalas otomatis oleh AX.\n` +
            `• *Model Aktif:* *${conf.model}*\n` +
            `• *Matikan:* \`${usedPrefix + command} off\`\n` +
            `• *Reset Sesi:* \`${usedPrefix + command} reset\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (subCmd === "off" && args.length === 1) {
        if (m.isGroup && !isAdmin && !isOwner) {
            return m.reply("❌ Pengaturan sesi hanya dapat dimatikan oleh Admin Grup atau Owner Bot.");
        }
        if (!isAxActive(chat)) {
            return m.reply(
                `╭── ✦ *SESI AX SUDAH MATI* ✦\n` +
                `• Mode sesi interaktif AX sedang *NONAKTIF* di chat ini.\n` +
                `• *Aktifkan:* \`${usedPrefix + command} on\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
        setAxActive(chat, false);
        try { await m.react("✅"); } catch (_) {}
        return m.reply(
            `╭── ✦ *SESI AX DIMATIKAN* ✦\n` +
            `• Mode sesi interaktif AX berhasil *DINONAKTIFKAN*.\n` +
            `• Bot hanya akan merespon bila dipanggil langsung dengan \`${usedPrefix + command}\`.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand Khusus Owner ---
    if (["status", "config", "setmodel", "models", "model", "setkey", "setkey_select", "seturl", "setprovider", "provider"].includes(subCmd)) {
        if (!isOwner) {
            return m.reply("❌ Perintah konfigurasi ini hanya dapat diakses oleh Owner Bot.");
        }
    }

    // --- Subcommand: Ganti Provider (OpenRouter / Modelnyaw) ---
    if (subCmd === "setprovider" || subCmd === "provider") {
        const targetProvider = (args[1] || "").toLowerCase().trim();
        if (!targetProvider || !["openrouter", "modelnyaw"].includes(targetProvider)) {
            return m.reply(
                `╭── ✦ *PILIH PROVIDER AI* ✦\n` +
                `Pilih provider yang didukung:\n` +
                `› \`${usedPrefix + command} setprovider openrouter\`\n` +
                `› \`${usedPrefix + command} setprovider modelnyaw\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }
        saveConfig({ provider: targetProvider });
        try { await m.react("✅"); } catch (_) {}
        const conf = getEndpointConfig();
        return m.reply(
            `╭── ✦ *PROVIDER DIUBAH* ✦\n` +
            `• *Provider Aktif:* *${conf.providerName}* (\`${conf.provider}\`)\n` +
            `• *Endpoint:* ${conf.rawBaseUrl}\n` +
            `• *Model Default:* \`${conf.model}\`\n` +
            `• *Total Keys:* ${conf.keys.length} API key aktif\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand: Config Status ---
    if (subCmd === "status" || subCmd === "config") {
        const conf = getEndpointConfig();
        const maskedKeys = conf.keys.map(k => k.length > 12 ? k.slice(0, 6) + "..." + k.slice(-4) : "***").join(", ");
        const meta = MODEL_METADATA[conf.model];
        return m.reply(
            `╭── ✦ *AX AGENT CONFIG* ✦\n` +
            `• *Provider:* *${conf.providerName}* (\`${conf.provider}\`)\n` +
            `• *Endpoint:* ${conf.rawBaseUrl}\n` +
            `• *Model Aktif:* *${conf.model}*\n` +
            `• *Mode Sesi Chat:* *${isAxActive(chat) ? "AKTIF (Auto-Reply)" : "NONAKTIF"}*\n` +
            `• *Kategori:* ${meta ? meta.category : "Umum"}\n` +
            `• *Fungsi:* ${meta ? meta.desc : "Model AI"}\n` +
            `• *Total Keys:* ${conf.keys.length} API key (${maskedKeys})\n` +
            `• *Config File:* JSON (\`data/ax_config.json\`)\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand: Set Model (Single Select List / Direct Set) ---
    if (subCmd === "setmodel" || subCmd === "models" || subCmd === "model") {
        const targetModel = args.slice(1).join(" ").trim();
        const conf = getEndpointConfig();

        // Kasus 1: Model langsung ditentukan (contoh: .ax setmodel openrouter/free)
        if (targetModel) {
            saveProviderConfig(conf.provider, { model: targetModel });
            try { await m.react("✅"); } catch (_) {}
            const meta = MODEL_METADATA[targetModel];
            return m.reply(
                `╭── ✦ *MODEL DIUBAH* ✦\n` +
                `• *Provider:* ${conf.providerName}\n` +
                `• *Model Baru:* \`${targetModel}\`\n` +
                (meta ? `• *Fokus:* ${meta.category}\n• *Keterangan:* ${meta.desc}\n` : "") +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        // Kasus 2: Fetch model list dari endpoint & tampilkan Single Select List
        try { await m.react("⏳"); } catch (_) {}
        const models = await fetchAvailableModels(conf);

        if (!models || models.length === 0) {
            try { await m.react("❌"); } catch (_) {}
            return m.reply(
                `❌ *Gagal mengambil daftar model dari endpoint:*\n${conf.rawBaseUrl}\n\n` +
                `Gunakan format manual:\n\`${usedPrefix + command} setmodel <nama_model>\``
            );
        }

        const { sections, count } = buildModelSections(models, conf.model, usedPrefix, command);
        const listParams = {
            title: "PILIH MODEL AX",
            sections: sections
        };

        const buttons = [
            {
                name: "single_select",
                buttonParamsJson: JSON.stringify(listParams)
            }
        ];

        const bodyText =
            `╭── ✦ *PILIH MODEL AI AGENT* ✦\n` +
            `• *Provider:* *${conf.providerName}*\n` +
            `• *Model Aktif:* *${conf.model}*\n` +
            `• *Tersedia:* ${count} Model Siap Pakai\n\n` +
            `Pilih model sesuai kebutuhan tugas Anda:\n` +
            `› *Coding:* Kimi Code, Cohere & Claude\n` +
            `› *Penalaran:* DeepSeek R1 & GLM 5.2\n` +
            `› *Chat Santai:* OpenRouter Free & MiniMax\n\n` +
            `Klik tombol *PILIH MODEL AX* di bawah untuk mengganti.`;

        try {
            await m.react("📋");
            if (typeof conn.sendButton === "function") {
                return await conn.sendButton(m.chat, {
                    header: "AI MODEL SELECTOR",
                    body: bodyText,
                    footer: `${global.info?.namabot || "Joy"} • Model Selector`,
                    buttons: buttons
                }, { quoted: m });
            }
        } catch (_) {}

        // Fallback teks bila single select tidak didukung client
        let fallbackText = `${bodyText}\n\n*Daftar Model Rekomendasi:*\n`;
        for (const sec of sections) {
            fallbackText += `\n*${sec.title}*\n`;
            for (const r of sec.rows) {
                fallbackText += `• \`${r.title.replace("✅ ", "")}\` - _${r.description}_\n`;
            }
        }
        fallbackText += `\n*Ganti Model:* \`${usedPrefix + command} setmodel <nama_model>\`\n╰━━━━━━━━━━━━━━━━━━━━━━━`;
        return m.reply(fallbackText);
    }

    // --- Subcommand: Set Key (Interactive Single Select & Sesi Input) ---
    if (subCmd === "setkey") {
        const targetProviderArg = (args[1] || "").toLowerCase().trim();
        const directKey = args.slice(2).join(" ").trim();
        const fullArgs = args.slice(1).join(" ").trim();

        // 1. Shortcut: .ax setkey <provider> <key1,key2>
        if (["openrouter", "modelnyaw"].includes(targetProviderArg) && directKey) {
            const parsedKeys = extractApiKeys(directKey);
            if (parsedKeys.length === 0) {
                return m.reply("❌ Tidak ada API Key yang valid ditemukan dalam teks input.");
            }
            saveProviderConfig(targetProviderArg, { apiKey: parsedKeys.join(",") });
            try { await m.react("✅"); } catch (_) {}
            return m.reply(
                `╭── ✦ *API KEY DISIMPAN* ✦\n` +
                `• *Provider:* *${targetProviderArg === "openrouter" ? "OpenRouter" : "Modelnyaw"}*\n` +
                `• *Jumlah Key:* ${parsedKeys.length} key tersimpan di \`data/ax_config.json\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        // 2. Shortcut: .ax setkey <raw_keys> (bisa berupa OPENROUTER_KEYS=sk-or-..., multiline, atau dipisah koma)
        if (targetProviderArg && !["openrouter", "modelnyaw"].includes(targetProviderArg)) {
            const detected = detectProviderFromKey(fullArgs);
            const conf = getEndpointConfig();
            const targetProv = detected || conf.provider;
            const parsedKeys = extractApiKeys(fullArgs);

            if (parsedKeys.length === 0) {
                return m.reply("❌ Tidak ada API Key yang valid ditemukan dalam teks input.");
            }

            saveProviderConfig(targetProv, { apiKey: parsedKeys.join(",") });
            const provName = targetProv === "openrouter" ? "OpenRouter" : "Modelnyaw";
            try { await m.react("✅"); } catch (_) {}
            return m.reply(
                `╭── ✦ *API KEY DISIMPAN* ✦\n` +
                `• *Provider:* *${provName}*${detected ? " _(Otomatis Terdeteksi)_" : ""}\n` +
                `• *Jumlah Key:* ${parsedKeys.length} key tersimpan di \`data/ax_config.json\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        }

        // 3. Mode Interaktif: Munculkan Single Select Provider
        const listParams = {
            title: "PILIH PROVIDER",
            sections: [
                {
                    title: "PILIH PROVIDER AI",
                    rows: [
                        {
                            header: "OPENROUTER",
                            title: "OpenRouter",
                            description: "Multi-Model LLM (Claude, Llama, DeepSeek, Free models)",
                            id: `${usedPrefix + command} setkey_select openrouter`
                        },
                        {
                            header: "MODELNYAW",
                            title: "Modelnyaw",
                            description: "Endpoint Modelnyaw V1",
                            id: `${usedPrefix + command} setkey_select modelnyaw`
                        }
                    ]
                }
            ]
        };

        const buttons = [
            {
                name: "single_select",
                buttonParamsJson: JSON.stringify(listParams)
            }
        ];

        const bodyText =
            `╭── ✦ *SET API KEY AI* ✦\n` +
            `Pilih provider yang ingin Anda konfigurasi API key-nya:\n\n` +
            `› *OpenRouter:* Multi-model (Free/Paid)\n` +
            `› *Modelnyaw:* Modelnyaw V1\n\n` +
            `Klik tombol *PILIH PROVIDER* di bawah untuk membuka sesi input.`;

        try {
            await m.react("📋");
            if (typeof conn.sendButton === "function") {
                return await conn.sendButton(m.chat, {
                    header: "AI KEY CONFIG",
                    body: bodyText,
                    footer: `${global.info?.namabot || "Joy"} • Key Config`,
                    buttons: buttons
                }, { quoted: m });
            }
        } catch (_) {}

        // Fallback bila client tidak render button
        return m.reply(
            `${bodyText}\n\n` +
            `*Pilih Cepat:*\n` +
            `• \`${usedPrefix + command} setkey_select openrouter\`\n` +
            `• \`${usedPrefix + command} setkey_select modelnyaw\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand Internal: Buka Sesi Input API Key ---
    if (subCmd === "setkey_select") {
        const targetProvider = (args[1] || "").toLowerCase().trim();
        if (!["openrouter", "modelnyaw"].includes(targetProvider)) {
            return m.reply("❌ Provider tidak valid. Pilih `openrouter` atau `modelnyaw`.");
        }

        const providerName = targetProvider === "openrouter" ? "OpenRouter" : "Modelnyaw";
        const existing = pendingKeySessions.get(m.sender);
        if (existing?.timeout) clearTimeout(existing.timeout);

        const timeout = setTimeout(() => {
            if (pendingKeySessions.has(m.sender)) {
                pendingKeySessions.delete(m.sender);
                m.reply(`⏳ *Sesi input API Key (${providerName}) telah kedaluwarsa.*`);
            }
        }, KEY_SESSION_TIMEOUT);

        pendingKeySessions.set(m.sender, {
            provider: targetProvider,
            providerName,
            timeout
        });

        try { await m.react("🔑"); } catch (_) {}
        return m.reply(
            `╭── ✦ *SESI INPUT API KEY TERBUKA* ✦\n` +
            `• *Provider:* *${providerName}*\n` +
            `• *Status:* Menunggu input API key...\n\n` +
            `Silakan *kirim pesan berisi API Key* Anda di chat ini.\n` +
            `› _Bisa paste langsung format \`OPENROUTER_KEYS=sk-or-...\` atau beberapa key dipisah koma/baris baru._\n` +
            `› _Ketik *batal* untuk membatalkan sesi._\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand: Set Base URL ---
    if (subCmd === "seturl") {
        const conf = getEndpointConfig();
        const firstArg = (args[1] || "").toLowerCase();
        let targetProvider = conf.provider;
        let newUrl = "";

        if (["openrouter", "modelnyaw"].includes(firstArg)) {
            targetProvider = firstArg;
            newUrl = args.slice(2).join(" ").trim();
        } else {
            newUrl = args.slice(1).join(" ").trim();
        }

        if (!newUrl) {
            return m.reply(
                `*Penggunaan:* \`${usedPrefix + command} seturl [provider] <base_url>\`\nContoh: \`${usedPrefix + command} seturl openrouter https://openrouter.ai/api/v1\``
            );
        }

        saveProviderConfig(targetProvider, { baseUrl: newUrl });
        try { await m.react("✅"); } catch (_) {}
        return m.reply(
            `╭── ✦ *BASE URL DISIMPAN* ✦\n` +
            `• *Provider:* *${targetProvider === "openrouter" ? "OpenRouter" : "Modelnyaw"}*\n` +
            `• *Base URL Baru:* \`${newUrl}\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    // --- Subcommand: Reset Session ---
    if (subCmd === "reset") {
        sessions.delete(chat);
        try { await m.react("🧹"); } catch (_) {}
        return m.reply("*Riwayat percakapan agent di chat ini berhasil dibersihkan.*");
    }

    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    const hasMedia = !!mime;

    if (!text && !hasMedia) {
        let helpMsg = 
            `╭── ✦ *AX AI ASSISTANT* ✦\n` +
            `• *Chat / Tanya:* \`${usedPrefix + command} <pertanyaan/percakapan>\`\n` +
            `• *Aktifkan Sesi:* \`${usedPrefix + command} on\` (Auto-reply chat)\n` +
            `• *Matikan Sesi:* \`${usedPrefix + command} off\`\n` +
            `• *Reset Sesi:* \`${usedPrefix + command} reset\`\n` +
            `• *Status Sesi:* *${isAxActive(chat) ? "AKTIF" : "NONAKTIF"}*\n`;
        if (isOwner) {
            helpMsg += 
                `• *Set API Key:* \`${usedPrefix + command} setkey\` (Menu Pilihan Provider)\n` +
                `• *Ganti Provider:* \`${usedPrefix + command} setprovider <openrouter|modelnyaw>\`\n` +
                `• *Pilih Model:* \`${usedPrefix + command} setmodel\`\n` +
                `• *Cek Status:* \`${usedPrefix + command} status\`\n` +
                `• *Set URL:* \`${usedPrefix + command} seturl [provider] <url>\`\n`;
        }
        helpMsg += `╰━━━━━━━━━━━━━━━━━━━━━━━`;
        return m.reply(helpMsg);
    }

    if (runningSessions.has(chat)) {
        return m.reply("⏳ Sesi ax masih memproses instruksi sebelumnya di chat ini.");
    }

    try { await m.react("🧠"); } catch (_) {}
    runningSessions.add(chat);

    try {
        let userContent;
        if (hasMedia) {
            const buffer = await q.download?.();
            if (buffer) {
                const detectedMime = await detectMimeType(buffer);
                if (SUPPORTED_IMAGE_MIMES.has(detectedMime)) {
                    userContent = [
                        { type: "text", text: text || "Analisis gambar ini." },
                        {
                            type: "image_url",
                            image_url: { url: `data:${detectedMime};base64,${buffer.toString("base64")}` }
                        }
                    ];
                } else {
                    userContent = `${text || ""}\n\n[Lampiran file: MIME ${detectedMime}]`.trim();
                }
            } else {
                userContent = text || "Analisis permintaan ini.";
            }
        } else {
            userContent = text;
        }

        let history = sessions.get(chat);
        if (!history || !Array.isArray(history)) {
            history = [{ role: "system", content: SYSTEM_PROMPT }];
        } else if (history.length > 0 && history[0].role === "system") {
            history[0].content = SYSTEM_PROMPT;
        }

        history.push({ role: "user", content: userContent });

        const promptText = typeof userContent === "string" ? userContent : (text || "");
        const answer = await runAgentLoop(history, { m, conn, ...context }, promptText);
        sessions.set(chat, history);

        try { await m.react("✅"); } catch (_) {}
        const formattedAnswer = formatWhatsApp(answer) || "Selesai.";
        await m.reply(formattedAnswer);
    } catch (error) {
        const errorInfo = extractApiError(error);
        log("Error agent ax:", errorInfo);

        sessions.delete(chat);
        try { await m.react("❌"); } catch (_) {}

        let msg = `❌ *Agent Error*\n\n`;
        msg += `• *Pesan:* ${errorInfo.message}\n`;
        if (errorInfo.status) msg += `• *Status:* ${errorInfo.status}\n`;
        if (errorInfo.code) msg += `• *Code:* ${errorInfo.code}\n`;
        await m.reply(msg);
    } finally {
        runningSessions.delete(chat);
    }
};

handler.before = async function (m, context) {
    if (m.isBaileys || m.fromMe) return;

    // --- Sesi Input API Key Interaktif ---
    const keySession = pendingKeySessions.get(m.sender);
    if (keySession) {
        const rawText = (m.text || "").trim();
        if (!rawText) return;

        if (/^(batal|cancel|exit|stop)$/i.test(rawText)) {
            if (keySession.timeout) clearTimeout(keySession.timeout);
            pendingKeySessions.delete(m.sender);
            try { await m.react("❌"); } catch (_) {}
            await m.reply(`*Sesi input API key untuk ${keySession.providerName} telah dibatalkan.*`);
            return true;
        }

        const parsedKeys = extractApiKeys(rawText);
        if (parsedKeys.length === 0) {
            try { await m.react("❌"); } catch (_) {}
            await m.reply("❌ Format key tidak valid. Silakan kirimkan API Key yang benar atau ketik *batal*.");
            return true;
        }

        if (keySession.timeout) clearTimeout(keySession.timeout);
        pendingKeySessions.delete(m.sender);

        saveProviderConfig(keySession.provider, { apiKey: parsedKeys.join(",") });
        try { await m.react("✅"); } catch (_) {}
        await m.reply(
            `╭── ✦ *API KEY DISIMPAN* ✦\n` +
            `• *Provider:* *${keySession.providerName}*\n` +
            `• *Jumlah Key:* ${parsedKeys.length} key berhasil diparsing & disimpan ke \`data/ax_config.json\`\n` +
            `• Sesi input ditutup.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
        return true;
    }

    if (!isAxActive(m.chat)) return;
    if (runningSessions.has(m.chat)) return;

    // Abaikan jika pesan berawalan prefix perintah bot
    const prefixRegex = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^/]/;
    if (m.text && prefixRegex.test(m.text.trim())) return;

    const q = m.quoted || m;
    const mime = (q.msg || q).mimetype || "";
    const hasMedia = !!mime;
    const text = m.text || "";

    if (!text && !hasMedia) return;

    const chat = m.chat;
    const { conn, isOwner } = context || {};

    try { await m.react("🧠"); } catch (_) {}
    runningSessions.add(chat);
    if (conn?.sendPresenceUpdate) {
        await conn.sendPresenceUpdate("composing", chat).catch(() => {});
    }

    try {
        let userContent;
        if (hasMedia) {
            const buffer = await q.download?.();
            if (buffer) {
                const detectedMime = await detectMimeType(buffer);
                if (SUPPORTED_IMAGE_MIMES.has(detectedMime)) {
                    userContent = [
                        { type: "text", text: text || "Analisis gambar ini." },
                        {
                            type: "image_url",
                            image_url: { url: `data:${detectedMime};base64,${buffer.toString("base64")}` }
                        }
                    ];
                } else {
                    userContent = `${text || ""}\n\n[Lampiran file: MIME ${detectedMime}]`.trim();
                }
            } else {
                userContent = text || "Analisis permintaan ini.";
            }
        } else {
            userContent = text;
        }

        let history = sessions.get(chat);
        if (!history || !Array.isArray(history)) {
            history = [{ role: "system", content: SYSTEM_PROMPT }];
        } else if (history.length > 0 && history[0].role === "system") {
            history[0].content = SYSTEM_PROMPT;
        }

        history.push({ role: "user", content: userContent });

        const promptText = typeof userContent === "string" ? userContent : (text || "");
        const answer = await runAgentLoop(history, { m, conn, isOwner: Boolean(isOwner) }, promptText);
        sessions.set(chat, history);

        try { await m.react("✅"); } catch (_) {}
        const formattedAnswer = formatWhatsApp(answer) || "Selesai.";
        await m.reply(formattedAnswer);
        return true;
    } catch (error) {
        const errorInfo = extractApiError(error);
        log("Error agent ax before hook:", errorInfo);
        try { await m.react("❌"); } catch (_) {}
    } finally {
        runningSessions.delete(chat);
    }
};

handler.help = ['ax *teks*']
handler.tags = ['ai']
handler.command = /^(ax)$/i

export default handler
