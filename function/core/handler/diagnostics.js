import { format } from "util";

export function parseAndDiagnoseError(err, pluginName = '') {
    const rawText = format(err);
    const stack = (err && typeof err === 'object' && err.stack) ? String(err.stack) : rawText;

    // Bersihkan path absolut Termux & query update cache-buster ESM
    const cleanedStack = stack
        .replace(/file:\/\/\/?data\/data\/com\.termux\/files\/home\/Joy\/?/g, '')
        .replace(/\/data\/data\/com\.termux\/files\/home\/Joy\/?/g, '')
        .replace(/\?update=\d+/g, '')
        .trim();

    const errorLines = cleanedStack.split('\n').map(l => l.trimEnd());
    const rawHeader = errorLines[0] || 'Error';

    // Cari letak spesifik file & baris penyebab error
    let culpritLocation = '-';
    const relevantStackLines = [];
    for (let line of errorLines.slice(1)) {
        // Abaikan baris pembungkus internal handler/dispatcher
        if ((line.includes('handler.js') || line.includes('dispatcher.js')) && (line.includes('m.reply') || line.includes('sendOwnerReport') || line.includes('console.error'))) continue;
        relevantStackLines.push(line);
        if (culpritLocation === '-') {
            const match = line.match(/((?:plugins|function|lib|handler|main)[^:\s)]+):(\d+):(\d+)/);
            if (match) {
                culpritLocation = `${match[1]} [Baris ${match[2]}, Kolom ${match[3]}]`;
            }
        }
    }
    if (culpritLocation === '-' && pluginName) {
        culpritLocation = `plugins/${pluginName}`;
    }

    // Ringkas stack trace (maksimal 4 baris pertama yang paling relevan)
    const shortStack = [rawHeader, ...relevantStackLines.slice(0, 3)].join('\n');

    // Analisis cerdas & rekomendasi langkah perbaikan
    let diagnosis = 'Terjadi kesalahan sistem saat mengeksekusi plugin.';
    let solution = 'Periksa alur logika atau tambahkan blok try-catch pada fungsi terkait.';

    const errStr = (rawHeader + ' ' + (err?.message || '')).toLowerCase();

    if (errStr.includes('unauthorized ip address') || errStr.includes('whitelist this ip') || errStr.includes('whitelist ip')) {
        diagnosis = 'IP server bot belum terdaftar di whitelist akun penyedia API.';
        solution = 'Buka dashboard penyedia API dan daftarkan IP server bot ke daftar IP Whitelist.';
    } else if (errStr.includes('cannot read propert') || errStr.includes('cannot read property') || errStr.includes('of undefined') || errStr.includes('of null')) {
        const propMatch = rawHeader.match(/reading '([^']+)'/i) || rawHeader.match(/property '([^']+)'/i);
        const propName = propMatch ? `'${propMatch[1]}'` : 'properti';
        diagnosis = `Mencoba mengakses ${propName} dari objek yang bernilai undefined atau null.`;
        solution = `Gunakan optional chaining (\`?.\`) atau lakukan validasi objek sebelum diakses (contoh: \`data?.${propMatch ? propMatch[1] : 'item'}\` atau \`if (data) { ... }\`).`;
    } else if (errStr.includes('is not defined')) {
        const varMatch = rawHeader.match(/([a-zA-Z0-9_$]+) is not defined/i);
        const varName = varMatch ? `\`${varMatch[1]}\`` : 'Variabel';
        diagnosis = `${varName} dipanggil namun belum dideklarasikan atau belum di-import.`;
        solution = `Deklarasikan variabel dengan \`const\`/\`let\` atau tambahkan import yang sesuai di baris atas file.`;
    } else if (errStr.includes('is not a function')) {
        const funcMatch = rawHeader.match(/([a-zA-Z0-9_$.]+) is not a function/i);
        diagnosis = `${funcMatch ? `\`${funcMatch[1]}\`` : 'Fungsi'} dipanggil sebagai fungsi padahal tipenya bukan function.`;
        solution = `Pastikan modul/library diexport dengan benar dan verifikasi tipe datanya menggunakan \`typeof\`.`;
    } else if (errStr.includes('enospc')) {
        diagnosis = 'Ruang penyimpanan disk internal/tmp di Termux penuh.';
        solution = 'Bersihkan file cache dan folder sementara di Termux (\`rm -rf tmp/*\`).';
    } else if (err?.name === 'TimeoutError' || errStr.includes('waktu eksekusi plugin melebihi batas')) {
        diagnosis = 'Eksekusi plugin melebihi batas waktu maksimum (Timeout). Terjadi kebuntuan (hanging promise) pada API eksternal atau proses child.';
        solution = 'Periksa respon endpoint API penyedia layanan atau optimalkan logika asynchronous pada plugin.';
    } else if (errStr.includes('timeout') || errStr.includes('etimedout') || errStr.includes('esockettimedout')) {
        diagnosis = 'Koneksi ke endpoint/API target mengalami batas waktu (timeout).';
        solution = 'Server target sedang lambat merespons. Periksa koneksi internet bot atau tingkatkan durasi timeout request (\`timeout: 30000\`).';
    } else if (errStr.includes('enotfound') || errStr.includes('econnrefused') || errStr.includes('network error')) {
        diagnosis = 'Gagal terhubung ke server/host API (domain tidak ditemukan atau server offline).';
        solution = 'Periksa domain endpoint API yang digunakan atau beralih ke penyedia API cadangan.';
    } else if (errStr.includes('fetch failed') || errStr.includes('undici') || errStr.includes('mmg.whatsapp.net')) {
        diagnosis = 'Permintaan HTTP (fetch) gagal terhubung ke CDN WhatsApp atau endpoint API eksternal.';
        solution = 'Koneksi jaringan terputus sementara atau media WhatsApp sudah kadaluarsa di server CDN. Coba kirim ulang media.';
    } else if (errStr.includes('403') || errStr.includes('forbidden') || errStr.includes('cloudflare')) {
        diagnosis = 'Akses diblokir oleh server target (403 Forbidden / Cloudflare Protection / Whitelist IP).';
        solution = 'Periksa apakah IP server bot perlu di-whitelist di dashboard API, atau gunakan header browser / scraper alternatif.';
    } else if (errStr.includes('404') || errStr.includes('not found')) {
        diagnosis = 'Media atau data tidak ditemukan di server target (404 Not Found).';
        solution = 'URL target mungkin telah kedaluwarsa, salah ketik, atau postingan telah dihapus/disetel privat.';
    } else if (errStr.includes('ffmpeg') || errStr.includes('exited with code')) {
        diagnosis = 'Proses konversi atau encoding FFmpeg gagal.';
        solution = 'Periksa argumen/filter FFmpeg yang digunakan dan pastikan file media input tidak korup.';
    } else if (errStr.includes('rate limit') || errStr.includes('429')) {
        diagnosis = 'Terkena batasan frekuensi panggilan API (Rate Limited / 429 Too Many Requests).';
        solution = 'Beri jeda delay antar request atau gunakan rotasi API key / proxy.';
    } else if (err?.message) {
        diagnosis = err.message;
        solution = 'Periksa parameter input dan baris kode pada lokasi di atas.';
    }

    return {
        culpritLocation,
        diagnosis,
        solution,
        shortStack,
        rawHeader
    };
}

export function createErrorReporter({
    conn,
    m,
    name,
    command,
    usedPrefix,
    senderPn,
    senderLid,
    senderLID,
    userDb,
    groupMetadata
}) {
    let isErrorAlreadyReported = false;

    const sendOwnerReport = async (err, callerPlugin = null) => {
        if (isErrorAlreadyReported) return;
        isErrorAlreadyReported = true;

        try {
            const rawOwner = global.info?.nomorowner || (Array.isArray(global.owner) ? global.owner[0] : global.owner) || (Array.isArray(global.developer) ? global.developer[0] : global.developer);
            const own = rawOwner ? `${rawOwner.toString().replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;
            if (!own) return;

            const pluginName = callerPlugin || m.plugin || name || '-';
            const diag = parseAndDiagnoseError(err, pluginName);
            const senderName = m.pushName || userDb?.name || 'User';
            const senderNum = (typeof senderPn !== 'undefined' && senderPn) ? `+${senderPn}` : ((typeof senderLid !== 'undefined' && senderLid) || senderLID || '-');
            const chatTitle = m.isGroup
                ? (groupMetadata?.subject ? `Grup: ${groupMetadata.subject}` : `Grup: ${m.chat.split('@')[0]}`)
                : 'Chat Pribadi';
            const cmdUsed = (usedPrefix || '') + (command || '') || (m.text ? m.text.trim().slice(0, 30) : '-');

            let msg =
                `╭── ✦ *LAPORAN ERROR SISTEM* ✦\n` +
                `• *📂 Plugin*: \`${pluginName}\`\n` +
                `• *📍 Lokasi*: \`${diag.culpritLocation}\`\n` +
                `• *📥 Command*: \`${cmdUsed}\`\n` +
                `• *👤 Pengirim*: ${senderName} (\`${senderNum}\`)\n` +
                `• *📄 Chat*: ${chatTitle}\n` +
                `• *⏱️ Waktu*: \`${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\`\n\n` +
                `*Penyebab Error:*\n` +
                `› ${diag.diagnosis}\n\n` +
                `*💡 Analisis & Solusi:*\n` +
                `› ${diag.solution}\n\n` +
                `*🔍 Stack Trace Ringkas:*\n` +
                `\`\`\`${diag.shortStack}\`\`\`\n` +
                `╰━━━━━━━━━━━━━━━━━━━━━━━`;

            console.log(`[HANDLER] Mengirim notifikasi log error ke owner: ${own}`);
            if (conn.reply) {
                await conn.reply(own, msg).catch(() => conn.sendMessage(own, { text: msg }).catch(e => console.error('[ERROR NOTIFY FAILED]', e.message)));
            } else {
                await conn.sendMessage(own, { text: msg }).catch(e => console.error('[ERROR NOTIFY FAILED]', e.message));
            }
        } catch (reportErr) {
            console.error('[REPORT ERROR HANDLER FAILED]', reportErr);
        }
    };

    const reportError = async (err, customUserMsg = null) => {
        const text = format(err);
        console.log('[ERROR REPORTED]', text);

        // 1. Kirim pesan ke user jika customUserMsg diberikan
        if (customUserMsg && typeof customUserMsg === 'string') {
            await m.reply(customUserMsg).catch(() => {});
        }

        // 2. Kirim laporan terstruktur detail ke Owner (hanya 1x)
        if (isErrorAlreadyReported) return;
        await sendOwnerReport(err);
    };

    return {
        sendOwnerReport,
        reportError
    };
}
