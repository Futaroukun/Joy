/*
- @Author     : Rafli
- @Feature    : Sfile.co Core Manager
- @Description: Toolkit Sfile.co terintegrasi: Search, Direct Downloader (bypass ads/fingerprint), Resumable Chunk Uploader, Account Manager (Balance, Revenues, My Files).
*/

import axios from 'axios';
import * as cheerio from 'cheerio';
import FormData from 'form-data';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const CONFIG_FILE = path.join(process.cwd(), 'data', 'sfile.json');

class SfileService {
    constructor() {
        this.config = {
            email: process.env.SFILE_EMAIL || '',
            password: process.env.SFILE_PASSWORD || '',
            cookie: '',
            lastLogin: 0
        };
        this.loadConfig();
    }

    loadConfig() {
        try {
            if (fs.existsSync(CONFIG_FILE)) {
                const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
                this.config = { ...this.config, ...data };
            }
        } catch (e) {
            console.error('[SFILE LOAD CONFIG ERROR]', e.message);
        }
    }

    saveConfig(newData = {}) {
        try {
            this.config = { ...this.config, ...newData };
            const dir = path.dirname(CONFIG_FILE);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
        } catch (e) {
            console.error('[SFILE SAVE CONFIG ERROR]', e.message);
        }
    }

    /**
     * Otentikasi ke Akun Sfile.co
     */
    async login(email = this.config.email, password = this.config.password) {
        if (!email || !password) throw new Error('Email dan password Sfile belum dikonfigurasi.');

        const signinPage = await axios.get('https://sfile.co/signin', {
            headers: { 'User-Agent': UA },
            timeout: 20000
        });

        const $ = cheerio.load(signinPage.data);
        const csrf = $('input[name="csrftoken"]').val();
        if (!csrf) throw new Error('Gagal mengambil token CSRF dari sfile.co.');

        const initialCookies = signinPage.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

        const params = new URLSearchParams();
        params.append('mail', email);
        params.append('pass', password);
        params.append('remember', 'true');
        params.append('csrftoken', csrf);
        params.append('LogIn', 'Sign In');

        const loginRes = await axios.post('https://sfile.co/signin', params.toString(), {
            headers: {
                'User-Agent': UA,
                'Referer': 'https://sfile.co/signin',
                'Cookie': initialCookies,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            maxRedirects: 0,
            validateStatus: () => true,
            timeout: 20000
        });

        const setCookies = loginRes.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';
        const authCookies = [initialCookies, setCookies].filter(Boolean).join('; ');

        if (!authCookies.includes('_r=') && loginRes.status !== 302) {
            throw new Error('Login Sfile gagal. Periksa kembali email dan password Anda.');
        }

        this.saveConfig({
            email,
            password,
            cookie: authCookies,
            lastLogin: Date.now()
        });

        return authCookies;
    }

    /**
     * Memastikan session cookie aktif atau login ulang jika kedaluwarsa
     */
    async ensureSession() {
        if (!this.config.cookie || (Date.now() - this.config.lastLogin > 12 * 60 * 60 * 1000)) {
            return await this.login();
        }

        // Tes validitas cookie
        try {
            const check = await axios.get('https://sfile.co/user/v1/', {
                headers: { 'User-Agent': UA, 'Cookie': this.config.cookie },
                maxRedirects: 0,
                validateStatus: () => true,
                timeout: 10000
            });

            if (check.status === 200 && (check.data.includes('SIGN OUT') || check.data.includes('/logout'))) {
                return this.config.cookie;
            }
        } catch (_) {}

        return await this.login();
    }

    /**
     * 1. PENCARIAN FILE DI SFILE.CO
     */
    async search(query, page = 1) {
        if (!query) throw new Error('Masukkan kata kunci pencarian.');
        const url = `https://sfile.co/search?q=${encodeURIComponent(query)}&page=${page}`;
        const res = await axios.get(url, { headers: { 'User-Agent': UA }, timeout: 20000 });
        const $ = cheerio.load(res.data);
        const results = [];

        $('a').each((_, a) => {
            const href = $(a).attr('href') || '';
            if (/^https:\/\/sfile\.co\/[A-Za-z0-9]{11}$/.test(href)) {
                const parent = $(a).closest('div') || $(a).parent();
                const text = parent.text().trim().replace(/\s+/g, ' ');
                const sizeMatch = text.match(/([\d.]+\s*(?:KB|MB|GB|B))\s*•\s*([\w\s]+)/i);
                const title = $(a).text().trim();
                if (title && title !== 'Download' && !results.some(r => r.url === href)) {
                    results.push({
                        title,
                        url: href,
                        id: href.split('/').pop(),
                        size: sizeMatch ? sizeMatch[1] : 'Unknown',
                        date: sizeMatch ? sizeMatch[2] : 'Unknown'
                    });
                }
            }
        });

        return results;
    }

    /**
     * 2. BYPASS IKLAN & AMBIL DIRECT DOWNLOAD LINK
     */
    async download(url) {
        if (!url || !url.includes('sfile.co/')) throw new Error('URL sfile tidak valid.');

        // Format normalisasi URL
        const cleanUrl = url.trim().replace(/^http:\/\//i, 'https://');

        // [Langkah 1] Ambil data halaman detail
        const res1 = await axios.get(cleanUrl, {
            headers: { 'User-Agent': UA },
            timeout: 20000
        });

        const $1 = cheerio.load(res1.data);
        const dwBtn = $1('#download');
        const dwUrl = dwBtn.attr('data-dw-url') || dwBtn.attr('href');

        if (!dwUrl) {
            throw new Error('Tombol download halaman 1 tidak ditemukan.');
        }

        const cookies = res1.headers['set-cookie']?.map(c => c.split(';')[0]).join('; ') || '';

        // [Langkah 2] Kunjungi halaman interstitial
        const res2 = await axios.get(dwUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': cleanUrl,
                'Cookie': cookies
            },
            timeout: 20000
        });

        // [Langkah 3] Ekstrak URL file langsung via regex dari script interstitial
        const match = res2.data.match(/https:\\\/\\\/download\d*\.sfile\.co\\\/downloadfile\\\/[^"'\s]+/i) ||
                      res2.data.match(/https:\\\/\\\/sfile\.co\\\/download\\\/[^"'\s]+/i);

        if (!match) {
            throw new Error('Gagal mengekstrak direct URL sfile dari script.');
        }

        const directDownloadUrl = match[0].replace(/\\\//g, '/');

        // [Langkah 4] Ambil info header & metadata file
        const head = await axios.head(directDownloadUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': dwUrl,
                'Cookie': cookies
            },
            timeout: 20000
        }).catch(() => null);

        let filename = $1('title').text().trim() || 'sfile_download';
        if (head?.headers?.['content-disposition']) {
            const cdMatch = head.headers['content-disposition'].match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
            if (cdMatch) filename = decodeURIComponent(cdMatch[1].replace(/["']/g, ''));
        }

        const contentLength = head?.headers?.['content-length'];
        const sizeBytes = contentLength ? parseInt(contentLength) : 0;
        const sizeFormatted = sizeBytes > 0 ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB` : 'Unknown';

        return {
            title: filename,
            downloadUrl: directDownloadUrl,
            size: sizeFormatted,
            sizeBytes,
            mimetype: head?.headers?.['content-type'] || 'application/octet-stream',
            cookies,
            referer: dwUrl
        };
    }

    /**
     * 3. UPLOAD FILE KE AKUN SFILE (ATAU GUEST JIKA TANPA AKUN)
     */
    async upload(fileBuffer, fileName, description = 'Uploaded via Joy WhatsApp Bot') {
        if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) throw new Error('Buffer file tidak valid.');

        let authCookies = '';
        let isUserAuth = false;

        try {
            authCookies = await this.ensureSession();
            isUserAuth = true;
        } catch (e) {
            console.log('[SFILE UPLOAD GUEST FALLBACK]', e.message);
        }

        const endpoint = isUserAuth
            ? 'https://sfile.co/upload/resume_v1.php'
            : 'https://sfile.co/upload/resume_v1_guest.php';

        const fileSize = fileBuffer.length;
        const fileHash = crypto.createHash('md5').update(fileBuffer).digest('hex');
        const cleanName = fileName.replace(/[^0-9A-Za-z_.\-]/g, '_');
        const flowIdentifier = `${fileSize}-${cleanName.replace(/[^0-9A-Za-z_-]/g, '')}`;

        const form = new FormData();
        form.append('flowChunkNumber', '1');
        form.append('flowChunkSize', '1048576');
        form.append('flowCurrentChunkSize', String(fileSize));
        form.append('flowTotalSize', String(fileSize));
        form.append('flowIdentifier', flowIdentifier);
        form.append('flowFilename', cleanName);
        form.append('flowRelativePath', cleanName);
        form.append('flowTotalChunks', '1');
        form.append('file_hash', fileHash);
        form.append('desired_name', cleanName);
        form.append('des', description);
        form.append('file', fileBuffer, { filename: cleanName });

        const uploadRes = await axios.post(endpoint, form, {
            headers: {
                ...form.getHeaders(),
                'User-Agent': UA,
                'Referer': isUserAuth ? 'https://sfile.co/user/v1/' : 'https://sfile.co/',
                'Cookie': authCookies
            },
            timeout: 60000
        });

        const data = uploadRes.data;
        if (!data || data.status !== 'success') {
            throw new Error(data?.message || 'Gagal mengunggah file ke Sfile.co');
        }

        return {
            success: true,
            isUserAuth,
            fileId: data.file?.id,
            name: data.file?.name || cleanName,
            size: data.file?.size_label || `${(fileSize / (1024 * 1024)).toFixed(2)} MB`,
            url: data.share_url || data.file?.download_url || `https://sfile.co/${data.share_code}`,
            code: data.share_code || data.file?.short
        };
    }

    /**
     * 4. CEK STATISTIK & SALDO PENDAPATAN AKUN SFILE
     */
    async getAccountStats() {
        const authCookies = await this.ensureSession();
        const res = await axios.get('https://sfile.co/user/v1/revenues', {
            headers: { 'User-Agent': UA, 'Cookie': authCookies },
            timeout: 20000
        });

        const $ = cheerio.load(res.data);
        const text = $('body').text().replace(/\s+/g, ' ');

        const parseVal = (pattern) => {
            const m = text.match(pattern);
            return m ? m[1].trim() : '0';
        };

        const downloadsToday = parseVal(/Downloads Today\s*([\d.]+)/i);
        const earningsToday  = parseVal(/Earnings Today\s*(Rp\s*[\d.,]+)/i);
        const currentBalance = parseVal(/Current Balance\s*(Rp\s*[\d.,]+)/i);
        const totalEarnings  = parseVal(/Total Earnings\s*(Rp\s*[\d.,]+)/i);

        return {
            email: this.config.email,
            downloadsToday,
            earningsToday,
            currentBalance,
            totalEarnings
        };
    }

    /**
     * 5. DAFTAR FILE SAYA DI SFILE
     */
    async getMyFiles() {
        const authCookies = await this.ensureSession();
        const res = await axios.get('https://sfile.co/user/v1/files', {
            headers: { 'User-Agent': UA, 'Cookie': authCookies },
            timeout: 20000
        });

        const $ = cheerio.load(res.data);
        const text = $('body').text().replace(/\s+/g, ' ');

        const storageUsed = text.match(/Storage Used\s*([\d.]+\s*[KMG]?B)/i)?.[1] || '0 B';
        const totalDownloads = text.match(/Total Downloads\s*([\d.]+)/i)?.[1] || '0';

        const fileItems = [];
        // Gunakan selector spesifik item file Sfile
        $('a[data-file-name-display]').each((_, a) => {
            const href = $(a).attr('href');
            const name = $(a).text().trim();
            if (href && name && !fileItems.some(f => f.url === href)) {
                fileItems.push({ name, url: href });
            }
        });

        // Fallback jika tidak ada atribut data-file-name-display
        if (fileItems.length === 0) {
            $('a').each((_, a) => {
                const href = $(a).attr('href') || '';
                const name = $(a).text().trim();
                const ignoredTexts = ['User Portal', 'DASHBOARD', 'UPLOADS', 'FILES', 'REVENUES', 'PAYOUTS', 'SIGN OUT', 'Sign Out', 'Dashboard', 'Uploads', 'Files', 'Revenues', 'Payouts', 'sfile.mobi', 'sfile.co', 'Privacy', 'Terms', 'Contact'];
                if (/^https:\/\/sfile\.co\/[A-Za-z0-9]{11}$/.test(href) && name && !ignoredTexts.includes(name) && !fileItems.some(f => f.url === href)) {
                    fileItems.push({ name, url: href });
                }
            });
        }

        return {
            email: this.config.email,
            storageUsed,
            totalDownloads,
            files: fileItems
        };
    }
}

export const sfile = new SfileService();
export default sfile;
