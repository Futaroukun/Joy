import axios from "axios";
import { fileTypeFromBuffer } from "file-type";

// ⚠️ GANTI DENGAN API KEY GEMINI ANDA
const API_KEY = "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"; 
const API_URL = "https://firebasevertexai.googleapis.com/v1beta";
const MODEL_URL = "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
const MODEL = "gemini-2.5-pro"; // Atau gemini-1.5-pro

const HEADERS = {
    "content-type": "application/json",
    "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0",
    "x-goog-api-key": API_KEY 
};

/**
 * Chat Gemini dengan dukungan System Instruction & Gambar
 */
async function chat(messages = [], fileBuffer = null, systemPrompt = "") {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required");
    }

    // 1. Format Pesan
    const contents = messages.map(msg => ({
        role: msg.role === "system" ? "user" : (msg.role === "assistant" ? "model" : "user"),
        parts: [{ text: msg.content }]
    }));

    // 2. Handle Gambar (Vision)
    if (fileBuffer) {
        const type = await fileTypeFromBuffer(fileBuffer);
        if (type) {
            const inlinePart = {
                inlineData: {
                    mimeType: type.mime,
                    data: fileBuffer.toString("base64")
                }
            };
            // Masukkan data gambar ke giliran user terakhir
            const lastUserIndex = contents.map(m => m.role).lastIndexOf("user");
            if (lastUserIndex !== -1) {
                contents[lastUserIndex].parts.unshift(inlinePart);
            } else {
                contents.push({ role: "user", parts: [inlinePart] });
            }
        }
    }

    // 3. Susun Payload
    const payload = {
        model: `${MODEL_URL}/${MODEL}`,
        contents,
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    // 4. Tambahkan System Instruction (Prompt Ahli)
    if (systemPrompt) {
        payload.systemInstruction = {
            parts: [{ text: systemPrompt }]
        };
    }

    try {
        const r = await axios.post(
            `${API_URL}/${MODEL_URL}/${MODEL}:generateContent`,
            payload,
            { headers: HEADERS }
        );

        if (r.status !== 200) throw new Error("No result found");
        
        if (r.data.candidates && r.data.candidates[0].content) {
            const parts = r.data.candidates[0].content.parts;
            let textResponse = "";
            let imageBuffer = null;
            
            for (const part of parts) {
                if (part.text) {
                    textResponse += part.text;
                } else if (part.inlineData && part.inlineData.data) {
                    imageBuffer = Buffer.from(part.inlineData.data, "base64");
                }
            }
            
            // Kembalikan objek agar bisa diolah oleh plugin
            return {
                text: textResponse || "AI tidak memberikan respon teks.",
                image: imageBuffer
            };
            
        } else {
            return {
                text: "AI tidak memberikan respon.",
                image: null
            };
        }
    } catch (e) {
        console.error("Gemini Error:", e.response ? e.response.data : e.message);
        throw new Error("Gagal menghubungi AI.");
    }
}

export default chat;