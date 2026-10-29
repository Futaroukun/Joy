/*
 * @Author      : Rafli
 * @Feature     : Alight Motion Premium Generator (Random & Custom Email)
 * @Description : Generator akun Alight Motion gratis & unlimited via otomasi sistem MotionPlus.
 * @Version     : 1.1 (Support Custom Email & Session Checker)
 */

import https from 'https';

class MotionPlusClient {
    constructor(baseUrl = 'https://motionplus.my.id') {
        this.baseUrl = baseUrl;
        this.cookies = {};
    }

    updateCookies(setCookieHeader) {
        if (!setCookieHeader) return;
        const arr = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
        for (const c of arr) {
            const parts = c.split(';')[0].split('=');
            const k = parts[0].trim();
            const v = parts.slice(1).join('=').trim();
            if (k) this.cookies[k] = v;
        }
    }

    getCookieHeader() {
        return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    }

    getCsrf() {
        return this.cookies['aw_csrf'] || '';
    }

    request(path, method = 'GET', bodyObj = null) {
        return new Promise((resolve, reject) => {
            const u = new URL(path, this.baseUrl);
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
                'Referer': `${this.baseUrl}/`,
                'Origin': this.baseUrl,
                'Cookie': this.getCookieHeader(),
                'Connection': 'close'
            };

            let postData = null;
            if (method !== 'GET') {
                headers['X-CSRF-Token'] = this.getCsrf();
                if (bodyObj !== null) {
                    headers['Content-Type'] = 'application/json';
                    postData = JSON.stringify(bodyObj);
                    headers['Content-Length'] = Buffer.byteLength(postData);
                }
            }

            const req = https.request({
                hostname: u.hostname,
                port: 443,
                path: u.pathname + u.search,
                method,
                headers,
                agent: false,
                timeout: 15000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    this.updateCookies(res.headers['set-cookie']);
                    let parsed = null;
                    try { parsed = JSON.parse(data); } catch {}
                    resolve({
                        status: res.statusCode,
                        data: parsed,
                        raw: data,
                        headers: res.headers
                    });
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout ke server MotionPlus.'));
            });

            req.on('error', reject);
            if (postData) req.write(postData);
            req.end();
        });
    }

    static async getStatus() {
        const client = new MotionPlusClient();
        const [statsRes, apiRes] = await Promise.all([
            client.request('/api/public/stats'),
            client.request('/api/public/api-status')
        ]);
        return {
            stats: statsRes.data || {},
            api: apiRes.data || {}
        };
    }

    static async checkSession(recoveryCode) {
        const cleanCode = recoveryCode.replace(/[^A-Za-z0-9]/g, '');
        const client = new MotionPlusClient();
        client.cookies['aw_anon'] = cleanCode;
        const res = await client.request('/api/emails');
        return res.data || [];
    }

    async bypassAds(kind = null) {
        const query = kind ? `?kind=${encodeURIComponent(kind)}` : '';
        const adsStatus = await this.request(`/api/free/ads/status${query}`);
        const ads = adsStatus.data || { enabled: true, required: 5, done: 0 };

        if (ads.enabled) {
            let done = ads.done || 0;
            const required = ads.required || 5;

            while (done < required) {
                await new Promise(r => setTimeout(r, 600));

                const claimBody = kind ? { kind } : {};
                const claim = await this.request(`/api/free/ads/claim${query}`, 'POST', claimBody);
                if (!claim.data || !claim.data.token) {
                    throw new Error(claim.data?.detail || 'Gagal memproses tiket iklan server.');
                }

                await new Promise(r => setTimeout(r, 4300));

                const compBody = {
                    token: claim.data.token,
                    away_ms: 4300,
                    ...(kind ? { kind } : {})
                };
                const comp = await this.request('/api/free/ads/complete', 'POST', compBody);

                if (comp.data && typeof comp.data.done === 'number') {
                    done = comp.data.done;
                } else {
                    throw new Error(comp.data?.detail || 'Gagal menyelesaikan validasi tiket iklan.');
                }
            }
        }
    }

    async generate() {
        await this.request('/');
        if (!this.getCsrf()) {
            throw new Error('Gagal menginisialisasi sesi server MotionPlus.');
        }

        await this.bypassAds();

        const createRes = await this.request('/api/free/create', 'POST', { turnstile: '' });
        if (!createRes.data || !createRes.data.email) {
            throw new Error(createRes.data?.detail || 'Gagal membuat akun Alight Motion.');
        }

        const account = createRes.data;

        // Polling aktivasi akun
        for (let i = 0; i < 6; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const emails = await this.request('/api/emails');
            if (Array.isArray(emails.data) && emails.data.length > 0) {
                const found = emails.data.find(e => e.id === account.id || e.email === account.email);
                if (found && found.activation === 'active') {
                    return found;
                }
            }
        }

        return account;
    }

    async createPersonal(email) {
        await this.request('/pribadi');
        if (!this.getCsrf()) {
            throw new Error('Gagal menginisialisasi sesi server MotionPlus.');
        }

        await this.bypassAds('pribadi');

        const res = await this.request('/api/create-personal', 'POST', { email });
        if (res.status !== 200 || !res.data || res.data.detail) {
            if (res.status === 502 || res.status === 503) {
                throw new Error('Server upstream Alight Motion sedang down/tunnel terputus (502 Bad Gateway). Coba lagi nanti saat server aktif.');
            }
            throw new Error(res.data?.detail || `Gagal mengirim link verifikasi (Status ${res.status}).`);
        }

        return res.data;
    }

    async verifyPersonal(email, link) {
        const res = await this.request('/api/verify-personal', 'POST', { email, link });
        if (res.status !== 200 || !res.data || res.data.detail) {
            if (res.status === 502 || res.status === 503) {
                throw new Error('Server upstream Alight Motion sedang down/tunnel terputus (502 Bad Gateway).');
            }
            throw new Error(res.data?.detail || `Gagal memverifikasi akun pribadi (Status ${res.status}).`);
        }
        return res.data;
    }
}

function formatUptime(sec) {
    if (!sec || isNaN(sec)) return '-';
    const s = Number(sec);
    if (s < 3600) return `${Math.max(1, Math.floor(s / 60))} menit`;
    if (s < 86400) return `${(s / 3600).toFixed(1)} jam`;
    return `${(s / 86400).toFixed(1)} hari`;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    const args = (text || '').trim().split(/\s+/);
    const sub = (args[0] || '').toLowerCase();

    // ── SUBCOMMAND: STATUS SERVER ──────────────────────────────────────────────
    if (sub === 'status' || sub === 'stats') {
        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            const { stats, api } = await MotionPlusClient.getStatus();
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            const isApiActive = api?.status === 'aktif';
            return m.reply(
                `╭── ✦ *STATUS SERVER ALIGHT MOTION* ✦\n` +
                `• *Server API*: ${isApiActive ? 'Aktif' : 'Gangguan / Nonaktif'}\n` +
                `• *Total Generate*: ${stats.emails_total ?? '-'} akun\n` +
                `• *Generate Hari Ini*: ${stats.emails_today ?? '-'} akun\n` +
                `• *Tingkat Keberhasilan*: ${stats.activation_rate ?? 100}%\n` +
                `• *Uptime Server*: ${formatUptime(stats.uptime_seconds)}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal memeriksa status server:*\n_${e.message}_`);
        }
    }

    // ── SUBCOMMAND: CEK SESI / LINK LOGIN ─────────────────────────────────────
    if (sub === 'cek' || sub === 'check') {
        const code = args[1];
        if (!code) {
            return m.reply(
                `*Format Salah!*\n\n` +
                `Gunakan:\n` +
                `\`${usedPrefix + command} cek <kode-pemulihan>\`\n\n` +
                `*Contoh:*\n` +
                `\`${usedPrefix + command} cek D2H2U-7CJ6T\``
            );
        }

        await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
        try {
            const emails = await MotionPlusClient.checkSession(code);
            if (!emails.length) {
                await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
                return m.reply(`*Sesi tidak ditemukan atau sudah kadaluarsa.*\nPastikan kode pemulihan dimasukkan dengan benar.`);
            }

            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});
            const item = emails[0];
            const cleanCode = (item.recovery_code || code).replace(/[^A-Za-z0-9]/g, '');
            const links = item.login_links || [];

            let linkSection = '';
            if (links.length > 0) {
                linkSection = `• *Link Login Ditemukan*:\n` + links.map((l, idx) => `  ${idx + 1}. ${l}`).join('\n');
            } else {
                linkSection = `• *Link Login*: _Belum masuk_\n_(Masukkan email ke aplikasi Alight Motion terlebih dahulu, lalu cek kembali)_`;
            }

            return m.reply(
                `╭── ✦ *STATUS SESI ALIGHT MOTION* ✦\n` +
                `• *Email*: \`${item.email}\`\n` +
                `• *Status Aktivasi*: ${item.activation === 'active' ? 'Aktif' : 'Menunggu'}\n` +
                `• *Kode Pemulihan*: \`${item.recovery_code || code}\`\n` +
                `• *Tautan Sesi Web*: https://motionplus.my.id/s/${cleanCode}\n` +
                `${linkSection}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`
            );
        } catch (e) {
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal memeriksa sesi:*\n_${e.message}_`);
        }
    }

    // ── SUBCOMMAND: CUSTOM EMAIL (PRIBADI) ───────────────────────────────────
    if (sub === 'custom' || sub === 'pribadi' || sub === 'personal') {
        const targetEmail = (args[1] || '').trim().toLowerCase();
        if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
            return m.reply(
                `*Format Email Tidak Valid!*\n\n` +
                `Gunakan:\n` +
                `\`${usedPrefix + command} custom <email-anda>\`\n\n` +
                `*Contoh:*\n` +
                `\`${usedPrefix + command} custom namakamu@gmail.com\``
            );
        }

        // Cek status server API terlebih dahulu
        try {
            const { api } = await MotionPlusClient.getStatus();
            if (api?.status && api.status !== 'aktif') {
                return m.reply(
                    `*Server Alight Motion Sedang Nonaktif!*\n\n` +
                    `Server upstream MotionPlus saat ini sedang mengalami gangguan (tunnel terputus).\n` +
                    `Cek status berkala via \`${usedPrefix + command} status\` dan coba lagi nanti.`
                );
            }
        } catch {}

        let loadingMsg = null;
        try {
            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
            loadingMsg = await m.reply(`_Sedang memproses tiket & mengirim link verifikasi ke ${targetEmail} (~25 detik)..._`);

            const client = new MotionPlusClient();
            await client.createPersonal(targetEmail);

            // Simpan sesi verifikasi di memory bot (berlaku 30 menit)
            conn.alightCustom = conn.alightCustom || {};
            conn.alightCustom[m.sender] = {
                email: targetEmail,
                cookies: client.cookies,
                timestamp: Date.now()
            };

            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            return m.reply(
                `╭── ✦ *VERIFIKASI EMAIL DIKIRIM* ✦\n` +
                `• *Email*: \`${targetEmail}\`\n` +
                `• *Status*: Menunggu Verifikasi Manual\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `*Langkah Selanjutnya:*\n` +
                `1. Buka kotak masuk (atau folder spam) di email *${targetEmail}*.\n` +
                `2. Cari pesan dari *Alight Motion* dan salin link/tautan verifikasinya.\n` +
                `3. Kirim link verifikasi ke bot dengan mengetik:\n` +
                `   \`${usedPrefix + command} verif <link-verifikasi>\``
            );
        } catch (e) {
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal mengirim link ke email pribadi:*\n_${e.message}_`);
        }
    }

    // ── SUBCOMMAND: VERIFIKASI LINK CUSTOM EMAIL ─────────────────────────────
    if (sub === 'verif' || sub === 'verify') {
        conn.alightCustom = conn.alightCustom || {};
        const session = conn.alightCustom[m.sender];

        let targetEmail = session?.email || '';
        let targetLink = '';

        if (args[1] && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args[1])) {
            targetEmail = args[1].trim().toLowerCase();
            targetLink = args.slice(2).join(' ').trim();
        } else {
            targetLink = args.slice(1).join(' ').trim();
        }

        // Pembersihan karakter petik / kurung di link
        targetLink = targetLink.replace(/^['"<]|['">]$/g, '').trim();

        if (!targetEmail) {
            return m.reply(
                `*Sesi Verifikasi Tidak Ditemukan!*\n\n` +
                `Mulai terlebih dahulu dengan:\n` +
                `\`${usedPrefix + command} custom <email-anda>\`\n\n` +
                `Atau masukkan langsung email & link:\n` +
                `\`${usedPrefix + command} verif <email> <link>\``
            );
        }

        if (!targetLink || targetLink.length < 10 || !targetLink.startsWith('http')) {
            return m.reply(
                `*Link Verifikasi Tidak Valid!*\n\n` +
                `Pastikan menyalin link lengkap dari email Alight Motion:\n` +
                `\`${usedPrefix + command} verif <link-verifikasi>\``
            );
        }

        let loadingMsg = null;
        try {
            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
            loadingMsg = await m.reply(`_Sedang memvalidasi dan mengaktifkan akun ${targetEmail}..._`);

            const client = new MotionPlusClient();
            if (session?.cookies) {
                client.cookies = { ...session.cookies };
            } else {
                await client.request('/pribadi');
            }

            const res = await client.verifyPersonal(targetEmail, targetLink);
            delete conn.alightCustom[m.sender];

            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            const verifiedEmail = res.email?.email || targetEmail;
            return m.reply(
                `╭── ✦ *AKUN PRIBADI BERHASIL AKTIF* ✦\n` +
                `• *Email*: \`${verifiedEmail}\`\n` +
                `• *Status Aktivasi*: Aktif (Premium)\n` +
                `• *Jenis Akun*: Akun Permanen (Email Pribadi)\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `Akun Alight Motion Anda telah aktif! Silakan login di aplikasi Alight Motion menggunakan email tersebut.`
            );
        } catch (e) {
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal memverifikasi akun:* \n_${e.message}_`);
        }
    }

    // ── SUBCOMMAND: GENERATE AKUN RANDOM ──────────────────────────────────────
    if (sub === 'gen' || sub === 'create' || sub === 'free') {
        let loadingMsg = null;
        try {
            await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
            loadingMsg = await m.reply(`_Sedang memproses generate akun Alight Motion Premium (~25 detik)..._`);

            const client = new MotionPlusClient();
            const account = await client.generate();

            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

            const recoveryUrl = account.recovery_url ? `https://motionplus.my.id${account.recovery_url}` : `https://motionplus.my.id/s/${account.recovery_code?.replace(/[^A-Za-z0-9]/g, '')}`;

            return m.reply(
                `╭── ✦ *AKUN ALIGHT MOTION SIAP* ✦\n` +
                `• *Email*: \`${account.email}\`\n` +
                `• *Status Aktivasi*: ${account.activation === 'active' ? 'Aktif (Premium)' : 'Proses'}\n` +
                `• *Kode Sesi*: \`${account.recovery_code}\`\n` +
                `• *Tautan Sesi Web*: ${recoveryUrl}\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
                `*Panduan Login:*\n` +
                `1. Salin email di atas.\n` +
                `2. Buka aplikasi *Alight Motion* › pilih Masuk dengan Email.\n` +
                `3. Masukkan email tersebut untuk meminta link verifikasi.\n` +
                `4. Buka *Tautan Sesi Web* di atas atau ketik:\n` +
                `   \`${usedPrefix + command} cek ${account.recovery_code}\`\n` +
                `   untuk mengambil link login verifikasi.`
            );
        } catch (e) {
            if (loadingMsg?.key) {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {});
            }
            await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
            return m.reply(`*Gagal membuat akun Alight Motion:*\n_${e.message}_`);
        }
    }

    // ── MENU / PANDUAN PENGGUNAAN ─────────────────────────────────────────────
    return m.reply(
        `╭── ✦ *ALIGHT MOTION GENERATOR* ✦\n` +
        `Generator akun Alight Motion Premium gratis & otomatis.\n\n` +
        `*Perintah yang Tersedia:*\n` +
        `• \`${usedPrefix + command} gen\`\n` +
        `  › Membuat akun instan (email random/otomatis).\n` +
        `• \`${usedPrefix + command} custom <email>\`\n` +
        `  › Buat akun permanen menggunakan email Gmail/pribadi Anda.\n` +
        `• \`${usedPrefix + command} verif <link>\`\n` +
        `  › Verifikasi & aktifkan akun pribadi dari link email.\n` +
        `• \`${usedPrefix + command} cek <kode>\`\n` +
        `  › Cek status sesi & link login dari kode pemulihan.\n` +
        `• \`${usedPrefix + command} status\`\n` +
        `  › Cek statistik & status operasional server API.\n\n` +
        `*Cara Login ke Alight Motion:*\n` +
        `1. Generate akun via \`${usedPrefix + command} gen\` (otomatis) atau \`${usedPrefix + command} custom <email>\` (pribadi).\n` +
        `2. Buka aplikasi Alight Motion dan login menggunakan email tersebut.\n` +
        `3. Ambil tautan verifikasi login via bot atau inbox email Anda.\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );
};

handler.help = ['alight']
handler.tags    = ['tools']
handler.command = /^(alight|amprem)$/i

export default handler
