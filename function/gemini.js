import axios from "axios";
import { fileTypeFromBuffer } from "file-type";

const API_KEY = "AIzaSyBsJHBvXaY5CP9cirZ8IhUT6FUdh-KHFBA"; 
const MODEL = "gemini-1.5-pro";

async function chat(messages = [], fileBuffer = null, systemPrompt = "") {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required");
    }

    const contents = messages.map(msg => ({
        role: msg.role === "system" ? "user" : (msg.role === "assistant" ? "model" : "user"),
        parts: [{ text: msg.content }]
    }));

    if (fileBuffer) {
        const type = await fileTypeFromBuffer(fileBuffer);
        if (type) {
            const inlinePart = {
                inlineData: {
                    mimeType: type.mime,
                    data: fileBuffer.toString("base64")
                }
            };
            const lastUserIndex = contents.map(m => m.role).lastIndexOf("user");
            if (lastUserIndex !== -1) {
                contents[lastUserIndex].parts.unshift(inlinePart);
            } else {
                contents.push({ role: "user", parts: [inlinePart] });
            }
        }
    }

    const payload = {
        contents,
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    if (systemPrompt) {
        payload.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    try {
        const r = await axios.post(
            `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
            payload,
            { 
                headers: {
                    "Content-Type": "application/json"
                } 
            }
        );

        if (r.status !== 200) throw new Error("No result found");
        
        if (r.data.candidates && r.data.candidates[0].content) {
            return r.data.candidates[0].content.parts.map(p => p.text).join("");
        } else {
            return "AI tidak memberikan respon teks.";
        }
    } catch (e) {
        console.error("Gemini Error:", e.response ? e.response.data : e.message);
        throw new Error("Gagal menghubungi AI.");
    }
}

export default chat;