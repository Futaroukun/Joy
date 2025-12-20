import mime from 'mime-types';
import { fileTypeFromBuffer } from 'file-type';

/**
 * Upload file ke CloudSky Storage
 * Kunjungi: https://www.cloudsky.biz.id/
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type (opsional, akan auto-detect jika kosong)
 * @returns {Promise<string>} - URL file yang diupload
 */
export async function uploadFile(buffer, mimetype = null) {
    try {
        // Validasi input
        if (!Buffer.isBuffer(buffer)) {
            throw new Error('Buffer tidak valid');
        }

        // Auto-detect mimetype jika tidak disediakan
        if (!mimetype) {
            const fileType = await fileTypeFromBuffer(buffer);
            mimetype = fileType ? fileType.mime : 'application/octet-stream';
        }

        // Generate fileKey dengan timestamp
        const ext = mime.extension(mimetype) || 'bin';
        const fileKey = `kurumi-bot/${Date.now()}.${ext}`;
        const fileSize = buffer.length;

        // Validasi ukuran file (max 50MB)
        const MAX_SIZE = 50 * 1024 * 1024; // 50MB
        if (fileSize > MAX_SIZE) {
            throw new Error(`Ukuran file terlalu besar (${(fileSize / 1024 / 1024).toFixed(2)}MB). Maksimal 50MB`);
        }

        console.log(`📤 Uploading ${fileKey} (${(fileSize / 1024).toFixed(2)} KB)...`);

        // Step 1: Get presigned URL
        const presignResponse = await fetch('https://api.cloudsky.biz.id/get-upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fileKey: fileKey,
                contentType: mimetype,
                fileSize: fileSize
            })
        });

        if (!presignResponse.ok) {
            throw new Error(`Failed to get presigned URL: ${await presignResponse.text()}`);
        }

        const { uploadUrl } = await presignResponse.json();
        
        if (!uploadUrl) {
            throw new Error('No uploadUrl received from API');
        }

        // Step 2: Upload file to S3
        const uploadResponse = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': mimetype,
                'x-amz-server-side-encryption': 'AES256'
            },
            body: buffer
        });
        
        if (!uploadResponse.ok) {
            throw new Error(`File upload failed: ${await uploadResponse.text()}`);
        }

        // Step 3: Generate public URL
        const fileUrl = `https://api.cloudsky.biz.id/file?key=${fileKey}`;
        
        console.log(`✅ Upload success: ${fileUrl}`);
        
        return fileUrl;

    } catch (error) {
        console.error('❌ CloudSky Upload Error:', error);
        throw new Error(`Gagal upload ke CloudSky: ${error.message}`);
    }
}

/**
 * Upload file dengan retry mechanism
 * @param {Buffer} buffer - File buffer
 * @param {string} mimetype - MIME type
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {Promise<string>}
 */
export async function uploadWithRetry(buffer, mimetype = null, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`📤 Upload attempt ${attempt}/${maxRetries}...`);
            const url = await uploadFile(buffer, mimetype);
            return url;
        } catch (error) {
            lastError = error;
            console.log(`⚠️  Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt < maxRetries) {
                // Wait before retry (exponential backoff)
                const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
                console.log(`⏳ Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    throw new Error(`Upload gagal setelah ${maxRetries} percobaan: ${lastError.message}`);
}

/**
 * Get file info without uploading
 * @param {Buffer} buffer - File buffer
 * @returns {Promise<Object>}
 */
export async function getFileInfo(buffer) {
    try {
        const fileType = await fileTypeFromBuffer(buffer);
        const size = buffer.length;
        
        return {
            mime: fileType ? fileType.mime : 'application/octet-stream',
            ext: fileType ? fileType.ext : 'bin',
            size: size,
            sizeFormatted: formatBytes(size)
        };
    } catch (error) {
        throw new Error(`Gagal mendapatkan info file: ${error.message}`);
    }
}

/**
 * Format bytes ke human readable
 * @param {number} bytes
 * @param {number} decimals
 * @returns {string}
 */
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default {
    uploadFile,
    uploadWithRetry,
    getFileInfo
};