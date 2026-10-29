/*
 * @Author      : Rafli
 * @Feature     : Google Gemini AI Multi-Provider Engine (Gemini API, Web Scraper & Vision/Image)
 * @Description : Engine Gemini AI terpadu dengan dukungan Vision, Dokumen, Text-to-Image, Image-to-Image, dan Multi-turn Conversation
 * @Version     : 4.1 (Full Context & Multi-turn Session Support)
 */

import axios from 'axios';
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    chat as webChat,
    generateImage,
    generateImageToImage,
    vision,
    visionFile,
    loadStoredCookies,
    startSession
} from './gemini-web.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUPPORTED_MIMES = new Set([
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
    "video/mp4", "video/mpeg", "video/mov", "video/avi", "video/x-flv",
    "video/mpg", "video/webm", "video/wmv", "video/3gpp",
    "audio/wav", "audio/mp3", "audio/aiff", "audio/aac", "audio/ogg",
    "audio/flac", "audio/mpeg", "audio/ogg; codecs=opus",
    "application/pdf", "text/plain", "text/html", "text/css",
    "text/javascript", "text/x-typescript", "text/csv", "text/markdown",
    "text/x-python", "application/json", "application/xml", "application/rtf"
]);

async function detectMimeType(buffer) {
    const result = await fileTypeFromBuffer(buffer);
    return result?.mime ?? "application/octet-stream";
}

function createResponseObject(reply, extra = {}) {
    const res = new String(reply || '');
    res.reply = reply || '';
    res.text = reply || '';
    Object.assign(res, extra);
    return res;
}

export async function chat(messages = [], fileBuffer = null, options = {}) {
    // Normalisasi format messages (bisa berupa string atau array pesan)
    const msgs = Array.isArray(messages) ? [...messages] : [{ role: 'user', content: String(messages) }];

    const userMsg = [...msgs].reverse().find(m => m.role === 'user');
    const prompt = typeof userMsg?.content === 'string' ? userMsg.content : (userMsg?.parts?.[0]?.text || 'Halo');

    const systemMsg = msgs.find(m => m.role === 'system');
    const systemPrompt = options.systemPrompt || (typeof systemMsg?.content === 'string' ? systemMsg.content : systemMsg?.parts?.[0]?.text);

    let auth = options.auth || options.session?.auth || null;
    let chatId = options.chatId || options.session?.chatId || null;

    const apiKey = process.env.GEMINI_API_KEY || global.geminiKey || global.api?.gemini || '';

    // ── Mode 1: Google AI Studio API (Jika API Key Disediakan) ─────────────────
    if (apiKey) {
        try {
            const systemInstructionText = systemPrompt || undefined;

            const contents = msgs
                .filter(m => m.role !== "system")
                .map(m => ({
                    role: m.role === "assistant" ? "model" : m.role,
                    parts: typeof m.content === "string"
                        ? [{ text: m.content }]
                        : (m.parts ?? [{ text: "" }])
                }));

            if (fileBuffer) {
                const mimeType = await detectMimeType(fileBuffer);
                const base64Data = fileBuffer.toString("base64");
                const filePart = { inlineData: { mimeType, data: base64Data } };

                if (contents.length === 0) {
                    contents.push({ role: "user", parts: [filePart] });
                } else {
                    const lastMsg = contents[contents.length - 1];
                    if (lastMsg.role === "user") {
                        lastMsg.parts.push(filePart);
                    } else {
                        contents.push({ role: "user", parts: [filePart] });
                    }
                }
            }

            const payload = {
                contents,
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 2048
                },
                ...(systemInstructionText && {
                    systemInstruction: {
                        parts: [{ text: systemInstructionText }]
                    }
                })
            };

            const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const res = await axios.post(endpoint, payload, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 30000
            });

            const textResponse = res.data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
            if (textResponse) {
                return createResponseObject(textResponse, { provider: 'api' });
            }
        } catch (e) {
            console.error('[GEMINI API ERROR]', e.response?.data || e.message);
        }
    }

    // ── Mode 2: Gemini Web Client (Menggunakan Cookie gemini-cookies.json) ──────
    const cookiesPath = path.join(process.cwd(), 'data', 'gemini-cookies.json');
    const fallbackCookiesPath = path.join(__dirname, '../../data/gemini-cookies.json');
    if (fs.existsSync(cookiesPath) || fs.existsSync(fallbackCookiesPath)) {
        try {
            // Jika sesi baru (belum ada chatId), sertakan instruksi sistem atau ringkasan riwayat ke prompt awal
            let sendPrompt = prompt;
            if (!chatId) {
                const nonSys = msgs.filter(m => m.role !== 'system');
                if (systemPrompt && nonSys.length <= 1) {
                    sendPrompt = `[Instruksi Sistem & Karakter]:\n${systemPrompt}\n\n[Pesan Pengguna]:\n${prompt}`;
                } else if (nonSys.length > 1) {
                    const historyStr = nonSys.slice(0, -1).map(m => `${m.role === 'assistant' ? 'AI' : 'User'}: ${m.content}`).join('\n');
                    const sysHeader = systemPrompt ? `[Instruksi Sistem]:\n${systemPrompt}\n\n` : '';
                    sendPrompt = `${sysHeader}[Riwayat Percakapan Sebelumnya]:\n${historyStr}\n\n[Pesan Pengguna]:\n${prompt}`;
                }
            }

            let webRes;
            try {
                webRes = await webChat(sendPrompt, auth, chatId, options.onChunk, fileBuffer, options.fileName);
            } catch (err) {
                // Auto-recovery jika sesi Google expired: buat sesi baru dan ulangi 1x
                if (chatId || auth) {
                    console.warn('[GEMINI WEB] Sesi lama kedaluwarsa, membuat sesi baru:', err.message);
                    auth = await startSession();
                    webRes = await webChat(sendPrompt, auth, null, options.onChunk, fileBuffer, options.fileName);
                } else {
                    throw err;
                }
            }

            if (webRes?.reply || webRes?.text) {
                const replyText = webRes.reply || webRes.text;
                return createResponseObject(replyText, {
                    provider: 'web',
                    auth: webRes.auth,
                    chatId: webRes.chatId
                });
            }
        } catch (e) {
            console.error('[GEMINI WEB ERROR]', e.message);
        }
    }
    throw new Error('Semua provider Gemini AI saat ini tidak tersedia. Silakan periksa cookies atau API Key.');
}

export {
    generateImage,
    generateImageToImage,
    vision,
    visionFile,
    loadStoredCookies,
    startSession
};

export default chat;