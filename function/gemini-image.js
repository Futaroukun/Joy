import axios from "axios";
import { fileTypeFromBuffer } from "file-type";

// ⚠️ GANTI DENGAN API KEY GEMINI ANDA
const API_KEY = "AIzaSyD6QwvrvnjU7j-R6fkOghfIVKwtvc7SmLk"; 
const API_URL = "https://firebasevertexai.googleapis.com/v1beta";
const MODEL_URL = "projects/gemmy-ai-bdc03/locations/us-central1/publishers/google/models";
const MODEL_IMAGE = "gemini-2.5-flash-image"; // Model untuk image generation/editing

const HEADERS = {
    "content-type": "application/json",
    "x-goog-api-client": "gl-kotlin/2.1.0-ai fire/16.5.0",
    "x-goog-api-key": API_KEY 
};

/**
 * Generate gambar dari text prompt
 * @param {string} prompt - Deskripsi gambar yang ingin dibuat
 * @param {string} aspectRatio - Aspect ratio (1:1, 16:9, 9:16, 4:3, 3:4, dll)
 * @returns {Promise<Buffer>} - Buffer gambar hasil generate
 */
export async function generateImage(prompt, aspectRatio = "1:1") {
    if (!prompt || typeof prompt !== "string") {
        throw new Error("Prompt text is required");
    }

    const payload = {
        model: `${MODEL_URL}/${MODEL_IMAGE}`,
        contents: [{
            role: "user",
            parts: [{ text: prompt }]
        }],
        generationConfig: {
            responseModalities: ["IMAGE"], // Hanya return gambar
            imageConfig: {
                aspectRatio: aspectRatio
            }
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const response = await axios.post(
            `${API_URL}/${MODEL_URL}/${MODEL_IMAGE}:generateContent`,
            payload,
            { headers: HEADERS }
        );

        if (response.status !== 200) {
            throw new Error(`API Error: Status ${response.status}`);
        }

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            throw new Error("No response from AI");
        }

        // Extract image dari response
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return Buffer.from(part.inlineData.data, "base64");
            }
        }

        throw new Error("No image data in response");
        
    } catch (error) {
        console.error("Gemini Image Generation Error:", error.response?.data || error.message);
        throw new Error("Failed to generate image: " + (error.response?.data?.error?.message || error.message));
    }
}

/**
 * Edit gambar yang sudah ada
 * @param {Buffer} imageBuffer - Buffer gambar yang akan diedit
 * @param {string} editPrompt - Instruksi edit (contoh: "ubah background jadi pantai")
 * @param {string} aspectRatio - Aspect ratio output
 * @returns {Promise<Buffer>} - Buffer gambar hasil edit
 */
export async function editImage(imageBuffer, editPrompt, aspectRatio = "1:1") {
    if (!Buffer.isBuffer(imageBuffer)) {
        throw new Error("Image buffer is required");
    }
    if (!editPrompt || typeof editPrompt !== "string") {
        throw new Error("Edit prompt is required");
    }

    // Detect file type
    const fileType = await fileTypeFromBuffer(imageBuffer);
    if (!fileType || !fileType.mime.startsWith('image/')) {
        throw new Error("Invalid image file");
    }

    const base64Image = imageBuffer.toString("base64");

    const payload = {
        model: `${MODEL_URL}/${MODEL_IMAGE}`,
        contents: [{
            role: "user",
            parts: [
                {
                    inlineData: {
                        mimeType: fileType.mime,
                        data: base64Image
                    }
                },
                { text: editPrompt }
            ]
        }],
        generationConfig: {
            responseModalities: ["IMAGE"], // Hanya return gambar
            imageConfig: {
                aspectRatio: aspectRatio
            }
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const response = await axios.post(
            `${API_URL}/${MODEL_URL}/${MODEL_IMAGE}:generateContent`,
            payload,
            { headers: HEADERS }
        );

        if (response.status !== 200) {
            throw new Error(`API Error: Status ${response.status}`);
        }

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            throw new Error("No response from AI");
        }

        // Extract edited image
        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return Buffer.from(part.inlineData.data, "base64");
            }
        }

        throw new Error("No image data in response");
        
    } catch (error) {
        console.error("Gemini Image Edit Error:", error.response?.data || error.message);
        throw new Error("Failed to edit image: " + (error.response?.data?.error?.message || error.message));
    }
}

/**
 * Blend multiple images dengan prompt
 * @param {Buffer[]} imageBuffers - Array of image buffers (max 5 images)
 * @param {string} blendPrompt - Instruksi blend (contoh: "gabungkan kedua gambar")
 * @param {string} aspectRatio - Aspect ratio output
 * @returns {Promise<Buffer>} - Buffer gambar hasil blend
 */
export async function blendImages(imageBuffers, blendPrompt, aspectRatio = "1:1") {
    if (!Array.isArray(imageBuffers) || imageBuffers.length === 0) {
        throw new Error("At least one image is required");
    }
    if (imageBuffers.length > 5) {
        throw new Error("Maximum 5 images allowed");
    }
    if (!blendPrompt || typeof blendPrompt !== "string") {
        throw new Error("Blend prompt is required");
    }

    const parts = [];
    
    // Add all images to parts
    for (const buffer of imageBuffers) {
        if (!Buffer.isBuffer(buffer)) {
            throw new Error("Invalid image buffer");
        }
        
        const fileType = await fileTypeFromBuffer(buffer);
        if (!fileType || !fileType.mime.startsWith('image/')) {
            throw new Error("Invalid image file");
        }

        parts.push({
            inlineData: {
                mimeType: fileType.mime,
                data: buffer.toString("base64")
            }
        });
    }

    // Add text prompt
    parts.push({ text: blendPrompt });

    const payload = {
        model: `${MODEL_URL}/${MODEL_IMAGE}`,
        contents: [{
            role: "user",
            parts: parts
        }],
        generationConfig: {
            responseModalities: ["IMAGE"],
            imageConfig: {
                aspectRatio: aspectRatio
            }
        },
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
    };

    try {
        const response = await axios.post(
            `${API_URL}/${MODEL_URL}/${MODEL_IMAGE}:generateContent`,
            payload,
            { headers: HEADERS }
        );

        if (response.status !== 200) {
            throw new Error(`API Error: Status ${response.status}`);
        }

        const candidate = response.data.candidates?.[0];
        if (!candidate) {
            throw new Error("No response from AI");
        }

        for (const part of candidate.content.parts) {
            if (part.inlineData && part.inlineData.data) {
                return Buffer.from(part.inlineData.data, "base64");
            }
        }

        throw new Error("No image data in response");
        
    } catch (error) {
        console.error("Gemini Image Blend Error:", error.response?.data || error.message);
        throw new Error("Failed to blend images: " + (error.response?.data?.error?.message || error.message));
    }
}

export default { generateImage, editImage, blendImages };