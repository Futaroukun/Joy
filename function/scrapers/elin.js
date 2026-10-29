/*
 * @Author      : Rafli
 * @Feature     : Elin AI Engine v2.0
 * @Description : Cognitive AI Assistant with Session Memory, Vision (Buffer/File), Real-time SSE Parsing & Auto-Recovery
 * @Version     : 2.0 (High Performance & Token Caching)
 */

import axios from 'axios';
import qs from 'qs';
import FormData from 'form-data';
import fs from 'fs';

const CONFIG = {
  BASE_URL: 'https://api.elin.ai',
  CREDENTIALS: {
    username: process.env.ELIN_USERNAME || '',
    password: process.env.ELIN_PASSWORD || ''
  },
  API: {
    TOKEN: '/api/v1/auth/token',
    SESSION: '/api/v3/chats/sessions/id',
    UPLOAD: '/api/v3/content/upload',
    CHAT: (id) => `/api/v3/chats/${id}/stream`
  },
  HEADERS: {
    'User-Agent': 'Elin AI/3.0.1 (ai.elin.app.android; build:301; Android 15; Model:25028RN03A)',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip',
    'x-device-id': '540e28659b22cf05',
    'accept-language': 'en',
    'x-timezone': 'Asia/Jakarta',
    'accept-charset': 'UTF-8'
  }
};

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Mengambil token autentikasi (dengan caching di memori)
 */
async function getToken(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const loginData = qs.stringify(CONFIG.CREDENTIALS);
  const res = await axios.post(CONFIG.BASE_URL + CONFIG.API.TOKEN, loginData, {
    headers: {
      ...CONFIG.HEADERS,
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8'
    },
    timeout: 15000
  });

  const token = res.data?.access_token;
  if (!token) throw new Error('Gagal login ke Elin AI: Access token kosong.');

  cachedToken = token;
  const expiresIn = res.data?.access_token_expires || res.data?.expires_in || 86400;
  tokenExpiresAt = now + (expiresIn * 1000) - 60000;
  return cachedToken;
}

/**
 * Membuat Session ID baru untuk percakapan
 */
async function createSession(token) {
  const res = await axios.get(CONFIG.BASE_URL + CONFIG.API.SESSION, {
    headers: {
      ...CONFIG.HEADERS,
      'authorization': `Bearer ${token}`
    },
    timeout: 15000
  });

  const chatId = res.data?.id;
  if (!chatId) throw new Error('Gagal membuat sesi percakapan Elin AI.');
  return chatId;
}

/**
 * Upload gambar (Support Buffer langsung atau File Path)
 */
async function uploadImage(token, imageInput, mimeType = 'image/jpeg') {
  const form = new FormData();

  if (Buffer.isBuffer(imageInput)) {
    const ext = mimeType.split('/')[1] || 'jpg';
    form.append('file', imageInput, { filename: `upload.${ext}`, contentType: mimeType });
  } else if (typeof imageInput === 'string') {
    if (!fs.existsSync(imageInput)) throw new Error(`File gambar tidak ditemukan: ${imageInput}`);
    form.append('file', fs.createReadStream(imageInput));
  } else {
    throw new Error('Format gambar tidak didukung.');
  }

  const res = await axios.post(CONFIG.BASE_URL + CONFIG.API.UPLOAD, form, {
    headers: {
      ...CONFIG.HEADERS,
      'authorization': `Bearer ${token}`,
      ...form.getHeaders()
    },
    timeout: 30000
  });

  if (!res.data?.filename) throw new Error('Gagal mengupload gambar ke server Elin AI.');
  return res.data.filename;
}

export const elin = {
  getToken,
  createSession,

  /**
   * Kirim pesan ke Elin AI dengan dukungan stream & multi-turn session
   * @param {string} prompt Teks prompt
   * @param {object} options Opsi: { chatId, image, mimeType, retryCount }
   */
  chat: async (prompt, options = {}) => {
    let { chatId, image, mimeType = 'image/jpeg', retryCount = 0 } = options;

    try {
      const token = await getToken(retryCount > 0);
      const authHeaders = {
        ...CONFIG.HEADERS,
        'authorization': `Bearer ${token}`
      };

      if (!chatId) {
        chatId = await createSession(token);
      }

      let messageContent;
      if (image) {
        const uploadedFilename = await uploadImage(token, image, mimeType);
        messageContent = {
          type: 'path',
          content: uploadedFilename,
          context: prompt || 'Jelaskan gambar ini.',
          resource_type: 'image'
        };
      } else {
        messageContent = {
          type: 'text',
          content: prompt
        };
      }

      const payload = {
        id: chatId,
        messages: [{
          type: 'user',
          order: 1,
          timestamp: new Date().toISOString(),
          context: {},
          content: messageContent
        }],
        type: 'generic',
        overrides: { retry: false }
      };

      const chatRes = await axios.post(CONFIG.BASE_URL + CONFIG.API.CHAT(chatId), payload, {
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        timeout: 45000
      });

      return new Promise((resolve, reject) => {
        let markdownText = '';
        let streamedTokens = '';
        let suggestions = [];
        let remaining = null;
        let title = '';
        let isResolved = false;

        const finish = () => {
          if (isResolved) return;
          isResolved = true;
          const text = markdownText.trim() || streamedTokens.trim() || 'Tidak ada respon teks.';
          resolve({
            status: true,
            chatId,
            result: text,
            suggestions,
            remaining,
            title
          });
        };

        chatRes.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') {
              finish();
              return;
            }

            try {
              const data = JSON.parse(jsonStr);
              if (data.event === 'message_content') {
                if (data.content?.type === 'markdown') {
                  markdownText = data.content.content;
                } else if (data.content?.type === 'token') {
                  streamedTokens += data.content.content;
                }
              } else if (data.event === 'message_end') {
                if (data.content?.type === 'markdown') {
                  markdownText = data.content.content;
                }
                if (Array.isArray(data.context?.value)) {
                  suggestions = data.context.value;
                }
                if (typeof data.context?.remaining_messages === 'number') {
                  remaining = data.context.remaining_messages;
                }
              } else if (data.event === 'title') {
                title = data.content || '';
              } else if (data.event === 'done') {
                finish();
              }
            } catch (_) {}
          }
        });

        chatRes.data.on('end', () => finish());
        chatRes.data.on('error', (err) => {
          if (!isResolved) reject(err);
        });
      });

    } catch (error) {
      // Auto recovery jika token expired atau session tidak valid
      if (retryCount === 0) {
        if (error.response?.status === 401) {
          cachedToken = null;
          return elin.chat(prompt, { ...options, retryCount: 1 });
        }
        if (error.response?.status === 404 || error.response?.status === 400) {
          return elin.chat(prompt, { ...options, chatId: null, retryCount: 1 });
        }
      }

      let errMsg = error.message;
      if (error.response?.data) {
        errMsg = `Server Error (${error.response.status}): ${typeof error.response.data === 'string' ? error.response.data : JSON.stringify(error.response.data)}`;
      }
      return { status: false, error: errMsg };
    }
  }
};