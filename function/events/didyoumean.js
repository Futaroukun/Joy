/*
 * @Author: Rafli
 * @Feature: High-Accuracy Hybrid "Did You Mean" Engine
 * @Description: Sistem pencocokan typo perintah tingkat tinggi menggabungkan
 *               Jaro-Winkler, Levenshtein Distance, Sørensen-Dice, dan Prefix Heuristics.
 */

const dymCooldown = new Map();
const COOLDOWN_MS = 3000; // Anti-spam 3 detik per user

// Cache daftar perintah dan metadatanya
let commandCache = [];
let lastCacheTime = 0;
const CACHE_TTL = 60 * 1000; // 1 Menit

// ── 1. Levenshtein Distance ──────────────────────────────────────────────────
function levenshtein(a, b) {
    const al = a.length, bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    const m = [];
    for (let i = 0; i <= bl; i++) m[i] = [i];
    for (let j = 0; j <= al; j++) m[0][j] = j;

    for (let i = 1; i <= bl; i++) {
        for (let j = 1; j <= al; j++) {
            const cost = b.charAt(i - 1) === a.charAt(j - 1) ? 0 : 1;
            m[i][j] = Math.min(
                m[i - 1][j] + 1,
                m[i][j - 1] + 1,
                m[i - 1][j - 1] + cost
            );
        }
    }
    return m[bl][al];
}

// ── 2. Jaro-Winkler Similarity (Prioritaskan Urutan & Awalan Sama) ────────────
function jaroWinkler(s1, s2) {
    const l1 = s1.length, l2 = s2.length;
    if (l1 === 0 || l2 === 0) return 0;
    if (s1 === s2) return 1.0;

    const range = Math.floor(Math.max(l1, l2) / 2) - 1;
    const s1Matches = new Array(l1).fill(false);
    const s2Matches = new Array(l2).fill(false);
    let m = 0;

    for (let i = 0; i < l1; i++) {
        const start = Math.max(0, i - range);
        const end = Math.min(i + range + 1, l2);
        for (let j = start; j < end; j++) {
            if (!s2Matches[j] && s1[i] === s2[j]) {
                s1Matches[i] = true;
                s2Matches[j] = true;
                m++;
                break;
            }
        }
    }
    if (m === 0) return 0;

    let k = 0, transpositions = 0;
    for (let i = 0; i < l1; i++) {
        if (s1Matches[i]) {
            while (!s2Matches[k]) k++;
            if (s1[i] !== s2[k]) transpositions++;
            k++;
        }
    }

    const jaro = (m / l1 + m / l2 + (m - transpositions / 2) / m) / 3;

    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(l1, l2)); i++) {
        if (s1[i] === s2[i]) prefix++;
        else break;
    }

    return jaro + prefix * 0.1 * (1 - jaro);
}

// ── 3. Sørensen-Dice Coefficient (Bigram Matching) ───────────────────────────
function diceCoefficient(s1, s2) {
    if (s1 === s2) return 1.0;
    if (s1.length < 2 || s2.length < 2) return 0;

    const getBigrams = str => {
        const bigrams = new Map();
        for (let i = 0; i < str.length - 1; i++) {
            const bigram = str.substring(i, i + 2);
            bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
        }
        return bigrams;
    };

    const b1 = getBigrams(s1);
    const b2 = getBigrams(s2);
    let intersection = 0;

    for (const [bigram, count] of b1.entries()) {
        if (b2.has(bigram)) {
            intersection += Math.min(count, b2.get(bigram));
        }
    }

    return (2.0 * intersection) / (s1.length + s2.length - 2);
}

// ── 4. Hybrid Scoring Ensemble ───────────────────────────────────────────────
export function computeScore(query, target) {
    const q = (query || '').toLowerCase().trim();
    const t = (target || '').toLowerCase().trim();
    if (!q || !t) return 0;
    if (q === t) return 1.0;

    const jw = jaroWinkler(q, t);
    const maxLen = Math.max(q.length, t.length);
    const lev = (maxLen - levenshtein(q, t)) / maxLen;
    const dice = diceCoefficient(q, t);

    // Pembobotan optimal
    let score = (jw * 0.45) + (lev * 0.35) + (dice * 0.20);

    // Heuristik tambahan
    if (t.startsWith(q) || q.startsWith(t)) {
        score = Math.min(1.0, score + 0.08);
    }
    if (t.includes(q)) {
        score = Math.min(1.0, score + 0.05);
    }

    return score;
}

// ── 5. Pengumpulan dan Caching Seluruh Perintah Bot ──────────────────────────
export function getCommandIndex(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && commandCache.length > 0 && (now - lastCacheTime < CACHE_TTL)) {
        return commandCache;
    }

    const map = new Map();
    const plugins = global.plugins || {};

    for (const [fileName, plugin] of Object.entries(plugins)) {
        if (!plugin || plugin.disabled || plugin.disable) continue;

        const tag = (Array.isArray(plugin.tags) ? plugin.tags[0] : plugin.tags) || 'General';

        // 1. Ekstrak dari plugin.command
        const extractFromRegex = (reg) => {
            const raw = reg.source
                .replace(/^\^|\$$/g, '')
                .replace(/^\((.*)\)$/, '$1')
                .replace(/\(\?\:/g, '(')
                .split('|');
            for (const r of raw) {
                const clean = r.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                if (clean && clean.length >= 2 && !map.has(clean)) {
                    map.set(clean, { command: clean, tag, file: fileName });
                }
            }
        };

        if (typeof plugin.command === 'string') {
            const clean = plugin.command.toLowerCase();
            if (!map.has(clean)) map.set(clean, { command: clean, tag, file: fileName });
        } else if (Array.isArray(plugin.command)) {
            for (const c of plugin.command) {
                if (typeof c === 'string') {
                    const clean = c.toLowerCase();
                    if (!map.has(clean)) map.set(clean, { command: clean, tag, file: fileName });
                } else if (c instanceof RegExp) {
                    extractFromRegex(c);
                }
            }
        } else if (plugin.command instanceof RegExp) {
            extractFromRegex(plugin.command);
        }

        // 2. Ekstrak dari plugin.help
        if (plugin.help) {
            const helpList = Array.isArray(plugin.help) ? plugin.help : [plugin.help];
            for (const h of helpList) {
                if (typeof h === 'string') {
                    const firstWord = h.trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
                    if (firstWord && firstWord.length >= 2 && !map.has(firstWord)) {
                        map.set(firstWord, { command: firstWord, tag, file: fileName });
                    }
                }
            }
        }
    }

    commandCache = Array.from(map.values());
    lastCacheTime = now;
    return commandCache;
}

// ── 6. Pencarian Kandidat Terbaik ────────────────────────────────────────────
export function findSimilarCommands(typedCmd, threshold = 0.65, maxResults = 3) {
    if (!typedCmd || typedCmd.length < 2) return [];

    const index = getCommandIndex();
    const matches = [];

    for (const item of index) {
        if (item.command === typedCmd.toLowerCase()) continue;
        const score = computeScore(typedCmd, item.command);
        if (score >= threshold) {
            matches.push({
                command: item.command,
                tag: item.tag,
                score: score,
                percent: Math.round(score * 100)
            });
        }
    }

    matches.sort((a, b) => b.score - a.score);

    // Ambil hasil unik maksimal maxResults
    const unique = [];
    const seen = new Set();
    for (const m of matches) {
        if (!seen.has(m.command)) {
            seen.add(m.command);
            unique.push(m);
            if (unique.length >= maxResults) break;
        }
    }

    return unique;
}

// ── 7. Handler Respons Pesan Estetik ─────────────────────────────────────────
export async function handleDidYouMean(conn, m, typedCmd, usedPrefix = '.') {
    if (!conn || !m || !typedCmd) return false;

    const sender = m.sender || m.key.remoteJid;
    const now = Date.now();

    // Anti-spam cooldown per user
    if (dymCooldown.has(sender) && now - dymCooldown.get(sender) < COOLDOWN_MS) {
        return false;
    }

    const matches = findSimilarCommands(typedCmd, 0.65, 3);
    if (!matches || matches.length === 0) return false;

    dymCooldown.set(sender, now);

    const best = matches[0];

    // Desain kartu WhatsApp elegan & rapi
    let txt = `╭── ✦ *DID YOU MEAN* ✦\n`;
    txt += `│ Perintah \`${usedPrefix}${typedCmd}\` tidak ditemukan.\n`;
    txt += `│\n`;
    txt += `│ *Saran Perintah:*\n`;

    matches.forEach((item, index) => {
        const bullet = index === 0 ? '›' : '·';
        const tagBadge = item.tag ? `[${item.tag.toUpperCase()}]` : '';
        txt += `│  ${bullet} *${usedPrefix}${item.command}*  ${tagBadge} _(${item.percent}% cocok)_\n`;
    });

    txt += `╰━━━━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `> _Ketik perintah yang disarankan di atas._`;

    const thumbBuffer = Buffer.isBuffer(global.thum) ? global.thum : null;
    const sendOptions = { text: txt };
    if (thumbBuffer) {
        sendOptions.contextInfo = {
            externalAdReply: {
                title: 'Perintah Tidak Ditemukan',
                body: `Mungkin maksud kamu: ${usedPrefix}${best.command}`,
                thumbnail: thumbBuffer,
                mediaType: 1,
                renderLargerThumbnail: false
            }
        };
    }

    await conn.sendMessage(m.chat, sendOptions, { quoted: m }).catch(async () => {
        await m.reply(txt);
    });

    return true;
}

export default {
    computeScore,
    getCommandIndex,
    findSimilarCommands,
    handleDidYouMean
};
