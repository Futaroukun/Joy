import { GoogleGenAI } from "@google/genai";
import { fileTypeFromBuffer } from "file-type";

const API_KEY = "AIzaSyCxYzZUVmejUpxtTZlR7e0rLBFj5-AeM5c"; // Ganti kalau perlu
const MODEL_NAME = "gemini-2.5-flash";

const ai = new GoogleGenAI({
    apiKey: API_KEY
});

async function chat(messages = [], fileBuffer = null) {
    if (!Array.isArray(messages) || messages.length === 0) {
        throw new Error("Messages array is required");
    }

    let systemInstruction = undefined;
    const contents = [];

    // 1. Parsing Pesan
    for (const msg of messages) {
        if (msg.role === "system") {
            // Library baru support format string langsung untuk system instruction
            systemInstruction = msg.content;
        } else {
            contents.push({
                role: msg.role === "assistant" ? "model" : "user",
                parts: [{ text: msg.content }]
            });
        }
    }

    // 2. Handle File/Gambar
    if (fileBuffer) {
        const type = await fileTypeFromBuffer(fileBuffer);
        if (!type) throw new Error("Unable to detect file type");

        const encodedImage = fileBuffer.toString("base64");
        
        const lastUserIndex = contents.map(c => c.role).lastIndexOf("user");
        const imagePart = {
            inlineData: {
                mimeType: type.mime,
                data: encodedImage
            }
        };

        if (lastUserIndex !== -1) {
            contents[lastUserIndex].parts.push(imagePart);
        } else {
            contents.push({
                role: "user",
                parts: [imagePart]
            });
        }
    }

    try {
        // 3. Request ke AI
        const response = await ai.models.generateContent({
            model: MODEL_NAME,
            config: {
                systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
                generationConfig: {
                    temperature: 1.0,
                    maxOutputTokens: 8192
                }
            },
            contents: contents
        });

        // --- PERBAIKAN UTAMA DI SINI ---
        // Error sebelumnya: response.text()
        // Fix: response.text (Ambil sebagai properti, bukan fungsi)
        if (response && response.text) {
            return response.text; 
        }
        
        return "";

    } catch (error) {
        // Tangkap error detail
        throw new Error(`Gemini API Error: ${error.message}`);
    }
}

export default chat;