import fs from "fs";
import path from "path";
import axios from "axios";
import Database from "better-sqlite3";
import {
    ROOT,
    TOOLS,
    TOOL_DEFS,
    EXTERNAL_CONTENT_SECURITY_PROMPT
} from "../function/ai/agent-tools.js";

const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "ai_agent_sessions.db");

fs.mkdirSync(DATA_DIR, { recursive: true });

const AI = {
    API_KEYS: ["REDACTED_KEY"],
    BASE_URL: "https://69roynaldi-sangjuara-router.irengcloud.com/v1",
    MODEL: "hv/deepseek-ai/deepseek-v4.1-flash-1017",
    FALLBACK_MODEL: "hv/zai-org/glm-5.3-flash",
    TIMEOUT_MS: 180000,
    MAX_TOKENS: 32768,
    MAX_STEPS: 10
};

let keyIndex = 0;
const runningSessions = new Set();

const log = (msg, data) =>
    console.log(`[AI-AGENT] ${new Date().toISOString()}: ${msg}`, data ? data : "");

const db = new Database(DB_PATH);
db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
    );
`);

const sessions = {
    get(chatId) {
        try {
            const row = db.prepare("SELECT data FROM sessions WHERE id = ?").get(chatId);
            return row ? JSON.parse(row.data) : null;
        } catch (e) {
            log("Gagal membaca session:", e.message);
            return null;
        }
    },
    set(chatId, history) {
        try {
            const trimmed = history.slice(-20);
            const payload = JSON.stringify(trimmed);
            db.prepare(`
                INSERT INTO sessions (id, data, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
            `).run(chatId, payload, Date.now());
        } catch (e) {
            log("Gagal menyimpan session:", e.message);
        }
    },
    delete(chatId) {
        try {
            db.prepare("DELETE FROM sessions WHERE id = ?").run(chatId);
        } catch (e) {
            log("Gagal menghapus session:", e.message);
        }
    }
};

const SYSTEM_PROMPT = `Kamu adalah Senior WhatsApp Bot Developer & Core Architect untuk Joy Bot dengan akses sistem penuh (full access).
Kamu memiliki kendali langsung atas Termux/Linux environment, codebase Joy (${ROOT}), file system, dan proses bot.

PRINSIP KERJA & EFISIENSI:
1. ZERO FLUFF & DIRECT: Langsung ke pokok permasalahan tanpa salam atau basa-basi.
2. EFISIENSI TINGGI: Kumpulkan informasi yang dibutuhkan dalam maksimal 2-3 langkah tool. Jangan berputar-putar menjalankan perintah serupa berulang kali.
3. JIKA DATA TIDAK DITEMUKAN: Bila changelog atau release note online tidak tersedia lengkap, simpulkan dari git log, versi package, atau diff struktur secara langsung. Jangan mengulang curl/fetch berkali-kali.
4. MINIMAL EMOJI: Gunakan format WhatsApp rapi (bold *, inline code \`, bullet •, border ╭── ✦ *JUDUL* ✦ dan ╰━━━━━━━━━━━━━━━━━━━━━━━).
5. VERIFIKASI SINTAKS: Jika memodifikasi kode, pastikan dicek dengan execute_command (\`node --check <file>\`).
6. ${EXTERNAL_CONTENT_SECURITY_PROMPT}`;

function mergeToolDeltas(acc, deltas) {
    for (const delta of deltas) {
        const idx = Number.isInteger(delta?.index) ? delta.index : 0;
        const current = acc.get(idx) || { id: null, type: "function", name: "", args: "" };
        if (delta?.id) current.id = delta.id;
        if (delta?.function?.name) current.name = delta.function.name;
        if (typeof delta?.function?.arguments === "string") current.args += delta.function.arguments;
        acc.set(idx, current);
    }
}

async function streamChatCompletion(payload, key) {
    const url = `${AI.BASE_URL.replace(/\/+$/, "")}/chat/completions`;
    const response = await axios.post(
        url,
        { ...payload, stream: true },
        {
            headers: {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
                Authorization: `Bearer ${key}`
            },
            responseType: "stream",
            timeout: AI.TIMEOUT_MS
        }
    );

    const stream = response.data;
    const content = [];
    const reasoning = [];
    const toolCalls = new Map();
    let buffer = "";
    let finishReason = null;

    stream.setEncoding?.("utf8");

    const consume = raw => {
        const line = raw.trim();
        if (!line.startsWith("data:")) return;
        const chunk = line.slice(5).trim();
        if (!chunk || chunk === "[DONE]") return;

        let parsed;
        try {
            parsed = JSON.parse(chunk);
        } catch (e) {
            console.warn("[AI-AGENT] Parse chunk SSE stream gagal:", e?.message);
            return;
        }

        if (parsed?.error) throw new Error(parsed.error.message || "Stream error");
        const choice = parsed?.choices?.[0];
        if (!choice) return;

        if (choice.finish_reason) finishReason = choice.finish_reason;
        const delta = choice.delta || {};
        if (typeof delta.content === "string") content.push(delta.content);
        if (typeof delta.reasoning_content === "string") reasoning.push(delta.reasoning_content);
        if (Array.isArray(delta.tool_calls)) {
            mergeToolDeltas(toolCalls, delta.tool_calls);
        }
    };

    for await (const chunk of stream) {
        buffer += chunk;
        let newline;
        while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline);
            buffer = buffer.slice(newline + 1);
            consume(line);
        }
    }
    if (buffer) consume(buffer);

    const message = {
        role: "assistant",
        content: content.join("") || null
    };

    if (toolCalls.size) {
        message.tool_calls = [...toolCalls.entries()]
            .sort((a, b) => a[0] - b[0])
            .map(([idx, call]) => ({
                id: call.id || `call_${idx}_${Date.now()}`,
                type: "function",
                function: { name: call.name, arguments: call.args || "{}" }
            }));
    }

    return {
        message,
        finishReason: finishReason || "stop"
    };
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function standardChatCompletion(payload, key) {
    const url = `${AI.BASE_URL.replace(/\/+$/, "")}/chat/completions`;
    const response = await axios.post(
        url,
        { ...payload, stream: false },
        {
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${key}`
            },
            timeout: AI.TIMEOUT_MS,
            transformResponse: [data => {
                if (typeof data !== "string") return data;
                try {
                    return JSON.parse(data);
                } catch (e) {
                    console.warn("[AI-AGENT] Parse fallback standard completion gagal:", e?.message);
                    const clean = data.replace(/data:\s*\[DONE\]\s*$/g, "").trim();
                    return JSON.parse(clean);
                }
            }]
        }
    );

    const choice = response.data?.choices?.[0];
    const message = choice?.message || { role: "assistant", content: null };
    return {
        message,
        finishReason: choice?.finish_reason || "stop"
    };
}

async function requestAI(payload) {
    const maxRetries = 3;
    const modelsToTry = [payload.model, AI.FALLBACK_MODEL].filter(Boolean);
    let lastError = null;

    for (const currentModel of modelsToTry) {
        const currentPayload = { ...payload, model: currentModel };

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const key = AI.API_KEYS[keyIndex % AI.API_KEYS.length];
            keyIndex = (keyIndex + 1) % AI.API_KEYS.length;

            try {
                return await streamChatCompletion(currentPayload, key);
            } catch (err) {
                lastError = err;
                const status = err.response?.status;
                const isRetryable =
                    !status ||
                    [429, 500, 502, 503, 504, 520, 521, 522, 524].includes(status) ||
                    err.code === "ECONNRESET" ||
                    err.code === "ETIMEDOUT" ||
                    err.code === "ERR_BAD_RESPONSE";

                log(`Percobaan ${attempt}/${maxRetries} gagal [Model: ${currentModel}, Status: ${status || err.message}]`);

                if (isRetryable && attempt < maxRetries) {
                    try {
                        log(`Mencoba fallback non-stream untuk ${currentModel}...`);
                        return await standardChatCompletion(currentPayload, key);
                    } catch (streamFallbackErr) {
                        lastError = streamFallbackErr;
                    }

                    const backoff = attempt * 1500;
                    await sleep(backoff);
                    continue;
                }
                break;
            }
        }
        log(`Model ${currentModel} gagal, mencoba model cadangan...`);
    }

    throw lastError;
}

async function runAgentLoop(history, context) {
    const executionLogs = [];

    for (let step = 0; step < AI.MAX_STEPS; step++) {
        log(`Step ${step + 1}/${AI.MAX_STEPS} memproses...`);

        const isFinalStep = step === AI.MAX_STEPS - 1;
        const payload = {
            model: AI.MODEL,
            messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
            max_tokens: AI.MAX_TOKENS,
            ...(isFinalStep ? {} : { tools: TOOL_DEFS, tool_choice: "auto" })
        };

        if (step >= 5) {
            payload.messages.push({
                role: "system",
                content: "Investigasi hampir selesai. Jangan jalankan tool lagi jika data esensial sudah cukup; segera tulis analisis dan kesimpulan akhir."
            });
        }

        const { message } = await requestAI(payload);

        const cleanAssistantMsg = {
            role: "assistant",
            content: message.content || null,
            ...(message.tool_calls && message.tool_calls.length ? {
                tool_calls: message.tool_calls.map(c => ({
                    id: c.id,
                    type: "function",
                    function: { name: c.function.name, arguments: c.function.arguments }
                }))
            } : {})
        };

        history.push(cleanAssistantMsg);

        const calls = message.tool_calls || [];
        if (!calls.length || isFinalStep) {
            const answer = message.content?.trim() || "Selesai tanpa output teks.";
            if (executionLogs.length > 0) {
                return (
                    `╭── ✦ *EKSEKUSI TUGAS SELESAI* ✦\n` +
                    executionLogs.map(l => `• \`${l.name}\` › ${l.status}`).join("\n") +
                    `\n╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                    answer
                );
            }
            return answer;
        }

        for (const call of calls) {
            const { name, arguments: rawArgs } = call.function;
            log(`Menjalankan tool: ${name}`, rawArgs);

            let args = {};
            try {
                args = JSON.parse(rawArgs || "{}");
            } catch (e) {
                console.warn(`[AI-AGENT] Parse arguments tool ${name} error:`, e?.message);
                args = {};
            }

            try {
                await (context?.m || context)?.react?.("⚡");
            } catch (e) {
                console.warn("[AI-AGENT] React ⚡ failed:", e?.message);
            }

            let output;
            let isOk = true;

            try {
                if (!TOOLS[name]) throw new Error(`Tool ${name} tidak ditemukan.`);
                output = await TOOLS[name](args, context);
            } catch (err) {
                isOk = false;
                output = `Error tool ${name}: ${err.message}`;
            }

            executionLogs.push({
                name,
                status: isOk ? "Berhasil" : "Gagal"
            });

            const maxToolLen = 10000;
            const strOutput = String(output);
            const truncatedOutput = strOutput.length > maxToolLen
                ? strOutput.slice(0, maxToolLen) + `\n\n[...Dipotong: melebihi ${maxToolLen} karakter...]`
                : strOutput;

            history.push({
                role: "tool",
                tool_call_id: call.id,
                content: truncatedOutput
            });
        }
    }

    return "Selesai memproses tugas.";
}

const handler = async (m, context) => {
    const { args, text, usedPrefix, command, chat } = context;
    const subCmd = (args[0] || "").toLowerCase();

    if (subCmd === "reset") {
        sessions.delete(chat);
        try {
            await m.react("🧹");
        } catch (e) {
            console.warn("[AI-AGENT] React 🧹 failed:", e?.message);
        }
        return m.reply(
            `╭── ✦ *AGENT RESET* ✦\n` +
            `• Riwayat sesi percakapan untuk chat ini telah dibersihkan.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (subCmd === "status") {
        return m.reply(
            `╭── ✦ *AI AGENT STATUS* ✦\n` +
            `• *Model Utama:* \`${AI.MODEL}\`\n` +
            `• *Model Cadangan:* \`${AI.FALLBACK_MODEL}\`\n` +
            `• *Host:* \`${AI.BASE_URL}\`\n` +
            `• *Tools:* ${TOOL_DEFS.length} tools aktif (Full Access)\n` +
            `• *Timeout Plugin:* Bebas (Unlimited / Long-running)\n` +
            `• *Mode:* Owner Autonomous Agent\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (!text) {
        return m.reply(
            `╭── ✦ *AI DEVELOPER AGENT* ✦\n` +
            `• *Gunakan:* \`${usedPrefix + command} <instruksi>\`\n` +
            `• *Reset Sesi:* \`${usedPrefix + command} reset\`\n` +
            `• *Cek Status:* \`${usedPrefix + command} status\`\n\n` +
            `_Memiliki akses penuh untuk shell command, edit file, membaca kode, web fetch, dan mengeksekusi JavaScript._\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    if (runningSessions.has(chat)) {
        return m.reply("⏳ Sesi agent masih aktif memproses instruksi sebelumnya di chat ini.");
    }

    try {
        await m.react("🧠");
    } catch (e) {
        console.warn("[AI-AGENT] React 🧠 failed:", e?.message);
    }
    runningSessions.add(chat);

    try {
        let history = sessions.get(chat) || [];
        history.push({ role: "user", content: text });

        const answer = await runAgentLoop(history, { m, ...context });
        sessions.set(chat, history);

        try {
            await m.react("✅");
        } catch (e) {
            console.warn("[AI-AGENT] React ✅ failed:", e?.message);
        }

        if (answer.length > 4000) {
            const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];
            for (const chunk of chunks) {
                await m.reply(chunk);
            }
        } else {
            await m.reply(answer);
        }
    } catch (error) {
        log("Agent execution error:", error.message);
        try {
            await m.react("❌");
        } catch (e) {
            console.warn("[AI-AGENT] React ❌ failed:", e?.message);
        }
        const status = error.response?.status;
        const errMsg = status ? `HTTP ${status}: ${error.message}` : error.message;
        return m.reply(
            `╭── ✦ *AGENT ERROR* ✦\n` +
            `• *Pesan:* ${errMsg}\n` +
            `• *Penyebab:* Router AI / provider upstream sedang gangguan sementara.\n` +
            `• *Solusi:* Coba kirim ulang instruksi atau ketik \`${usedPrefix + command} reset\` bila sesi tersendat.\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    } finally {
        runningSessions.delete(chat);
    }
};

handler.help = ['agent *<instruksi>*'];
handler.tags = ["ai", "owner"];
handler.command = /^(agent|aiagent|cai|deepseek)$/i;
handler.rowner = true;
handler.timeout = false;

export default handler;
