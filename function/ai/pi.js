/*
 * @Author      : Rafli
 * @Feature     : Pi AI Core Engine (Inflection AI)
 * @Description : Empathetic Personal AI with Multi-turn Memory, SSE Streaming, and Auto-Recovery
 * @Version     : 1.0 (Clean Architecture & Bypass Cloudflare)
 */

import axios from 'axios';

const CONFIG = {
  BASE_URL: 'https://ios-app.heypi.com',
  HEADERS: {
    'User-Agent': 'Pi/1315 CFNetwork/1494.0.7 Darwin/23.4.0',
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
};

export const pi = {
  /**
   * Membuat sesi percakapan baru di Pi AI dan mengambil cookie __Host-session
   */
  createSession: async () => {
    try {
      const res = await axios.post(
        `${CONFIG.BASE_URL}/api/chat/start`,
        {},
        {
          headers: CONFIG.HEADERS,
          timeout: 15000
        }
      );

      const rawCookies = res.headers['set-cookie'] || [];
      const sessionCookie = rawCookies.find(c => c.startsWith('__Host-session='));
      const cookie = sessionCookie ? sessionCookie.split(';')[0] : null;

      return {
        cookie,
        greeting: res.data?.text || '',
        sid: res.data?.sid || ''
      };
    } catch (err) {
      console.error('[Pi AI] createSession error:', err.response?.status || err.message);
      return null;
    }
  },

  /**
   * Mengirim pesan ke Pi AI dengan streaming SSE
   * @param {string} prompt Teks pertanyaan/pesan
   * @param {object} options Opsi sesi { cookie, retryCount }
   */
  chat: async (prompt, options = {}) => {
    const retryCount = options.retryCount || 0;
    let cookie = options.cookie;

    // Jika belum ada cookie sesi, buat sesi baru
    if (!cookie) {
      const session = await pi.createSession();
      if (!session?.cookie) {
        return { status: false, error: 'Gagal membuat sesi baru Pi AI.' };
      }
      cookie = session.cookie;
    }

    try {
      const response = await axios.post(
        `${CONFIG.BASE_URL}/api/v2/chat`,
        { text: prompt },
        {
          headers: {
            ...CONFIG.HEADERS,
            'Cookie': cookie,
            'Accept': 'text/event-stream'
          },
          responseType: 'stream',
          timeout: 30000
        }
      );

      return new Promise((resolve) => {
        let fullText = '';
        let isResolved = false;

        const finish = () => {
          if (isResolved) return;
          isResolved = true;
          resolve({
            status: true,
            text: fullText.trim(),
            cookie
          });
        };

        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.text) {
                fullText += parsed.text;
              }
            } catch (_) {}
          }
        });

        response.data.on('end', finish);
        response.data.on('error', (err) => {
          if (!isResolved) {
            isResolved = true;
            resolve({ status: false, error: err.message, cookie });
          }
        });
      });

    } catch (error) {
      // Auto-recovery jika cookie expired (401 Unauthorized)
      if (retryCount === 0 && (error.response?.status === 401 || error.response?.status === 403)) {
        console.log('[Pi AI] Sesi kedaluwarsa, memperbarui sesi...');
        const newSession = await pi.createSession();
        if (newSession?.cookie) {
          return pi.chat(prompt, { ...options, cookie: newSession.cookie, retryCount: 1 });
        }
      }

      return {
        status: false,
        error: error.response?.status ? `HTTP Error ${error.response.status}` : error.message,
        cookie
      };
    }
  }
};

export default pi;
