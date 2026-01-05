import axios from 'axios';

/**
 * Generate Image menggunakan Model Flux (High Quality)
 * Solusi untuk hasil yang lebih akurat sesuai prompt & Anti Error 404
 * * @param {String} prompt - Deskripsi gambar
 * @param {String} aspectRatio - Rasio (1:1, 16:9, dll)
 * @returns {Promise<Buffer>} - Buffer gambar
 */
export async function generateImage(prompt, aspectRatio = "1:1") {
    try {
        // 1. Tentukan Lebar & Tinggi berdasarkan Rasio
        // Flux optimal di resolusi sekitar 1024x1024 (1MP)
        let width = 1024;
        let height = 1024;

        switch (aspectRatio) {
            case "16:9":
                width = 1280; height = 720;
                break;
            case "9:16":
                width = 720; height = 1280;
                break;
            case "4:3":
                width = 1152; height = 864;
                break;
            case "3:4":
                width = 864; height = 1152;
                break;
            case "21:9":
                width = 1440; height = 640;
                break;
            case "3:2":
                width = 1216; height = 832;
                break;
            case "2:3":
                width = 832; height = 1216;
                break;
            case "1:1":
            default:
                width = 1024; height = 1024;
                break;
        }

        // 2. Optimasi Prompt Otomatis
        // Menambahkan keyword agar hasil lebih tajam dan bagus
        const enhancedPrompt = `${prompt}, highly detailed, high quality, masterpiece, 8k resolution`;

        // 3. Request ke API (Flux Model)
        // Seed random agar setiap generate hasilnya beda walau prompt sama
        const seed = Math.floor(Math.random() * 1000000); 
        
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`;

        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 60000 // Timeout 60 detik jika server sibuk
        });

        if (response.status !== 200) {
            throw new Error(`Server Error: ${response.status}`);
        }

        return Buffer.from(response.data);

    } catch (error) {
        console.error('Image Gen Error:', error.message);
        throw new Error('Gagal membuat gambar. Server sedang sibuk atau prompt terlalu sulit.');
    }
}

/**
 * Placeholder untuk Edit Image (Belum tersedia di model Flux Gratis)
 */
export async function editImage(imageBuffer, editPrompt) {
    throw new Error("Fitur Edit Gambar belum tersedia untuk engine ini.");
}

/**
 * Placeholder untuk Blend Image (Belum tersedia di model Flux Gratis)
 */
export async function blendImages(imageBuffers, blendPrompt) {
    throw new Error("Fitur Blend Gambar belum tersedia untuk engine ini.");
}

export default { generateImage, editImage, blendImages };