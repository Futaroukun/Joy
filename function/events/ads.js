/*
- @Author: Rafli
- @Feature: Ads Manager
- @Description: Sistem iklan otomatis optimal: persistent state, anti-spam chat cooldown, target filter (group/private/all), bypass premium, dan ID-based tracking.
*/

import fs from 'fs';
import fetch from 'node-fetch';
import { join } from 'path';

const ADS_FILE       = join(process.cwd(), 'data', 'ads.json');
const ADS_STATE_FILE = join(process.cwd(), 'data', 'ads_state.json');
const THUMBNAIL_PATH = join(process.cwd(), 'src', 'thumbnail.jpg');

let adsCache = null;
let adsState = null;
let saveStateTimeout = null;

export function loadAds() {
    if (adsCache) return adsCache;
    try {
        if (fs.existsSync(ADS_FILE)) {
            adsCache = JSON.parse(fs.readFileSync(ADS_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('[ADS] Gagal baca file konfigurasi:', e.message);
    }

    if (!adsCache || typeof adsCache !== 'object') {
        adsCache = { enabled: false, minCooldownMinutes: 30, skipPremium: true, messages: [] };
    }

    if (adsCache.minCooldownMinutes === undefined) adsCache.minCooldownMinutes = 30;
    if (adsCache.skipPremium === undefined) adsCache.skipPremium = true;
    if (!Array.isArray(adsCache.messages)) adsCache.messages = [];

    // Migrasi ID jika belum ada
    let changed = false;
    adsCache.messages.forEach((ad, i) => {
        if (!ad.id) {
            ad.id = `ad_${Date.now()}_${i + 1}`;
            changed = true;
        }
        if (!ad.target) {
            ad.target = 'all';
            changed = true;
        }
    });

    if (changed) saveAds(adsCache);
    return adsCache;
}

export function saveAds(data) {
    adsCache = data;
    try {
        fs.writeFileSync(ADS_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('[ADS] Gagal simpan konfigurasi:', e.message);
    }
}

export function reloadAds() {
    adsCache = null;
    return loadAds();
}

export function loadAdsState() {
    if (adsState) return adsState;
    try {
        if (fs.existsSync(ADS_STATE_FILE)) {
            adsState = JSON.parse(fs.readFileSync(ADS_STATE_FILE, 'utf-8'));
            if (!adsState.lastChatAdTime) adsState.lastChatAdTime = {};
            if (!adsState.lastAdTimes) adsState.lastAdTimes = {};
            return adsState;
        }
    } catch (e) {
        console.error('[ADS] Gagal baca file state:', e.message);
    }
    adsState = { lastChatAdTime: {}, lastAdTimes: {} };
    return adsState;
}

export function saveAdsState() {
    if (!adsState) return;
    if (saveStateTimeout) clearTimeout(saveStateTimeout);
    saveStateTimeout = setTimeout(() => {
        try {
            fs.writeFileSync(ADS_STATE_FILE, JSON.stringify(adsState, null, 2));
        } catch (e) {
            console.error('[ADS] Gagal simpan state:', e.message);
        }
    }, 1000);
}

export function resetAdsState() {
    adsState = { lastChatAdTime: {}, lastAdTimes: {} };
    try {
        if (fs.existsSync(ADS_STATE_FILE)) fs.unlinkSync(ADS_STATE_FILE);
    } catch (e) {
        console.error('[ADS] Gagal reset state:', e.message);
    }
}

let thumbnailCache   = null;
let thumbnailPromise = null;

export async function getThumbnail(customUrl = null) {
    if (!customUrl && thumbnailCache) return thumbnailCache;
    if (!customUrl && thumbnailPromise) return thumbnailPromise;

    const loader = (async () => {
        try {
            if (customUrl) {
                const res = await fetch(customUrl, { timeout: 10000 });
                if (res.ok) return Buffer.from(await res.arrayBuffer());
            }
            if (fs.existsSync(THUMBNAIL_PATH)) {
                const buf = fs.readFileSync(THUMBNAIL_PATH);
                if (!customUrl) thumbnailCache = buf;
                return buf;
            }
            const url = global.thum || '';
            if (!url) return null;

            const res = await fetch(url, { timeout: 10000 });
            if (res.ok) {
                const buf = Buffer.from(await res.arrayBuffer());
                if (!customUrl) thumbnailCache = buf;
                return buf;
            }
        } catch (e) {
            console.error('[ADS] Gagal load thumbnail:', e.message);
        }
        return null;
    })();

    if (!customUrl) {
        thumbnailPromise = loader;
        const res = await thumbnailPromise;
        thumbnailPromise = null;
        return res;
    }

    return await loader;
}

export function resetThumbnailCache() {
    thumbnailCache   = null;
    thumbnailPromise = null;
}

export function formatAdText(text) {
    const botname = global.info?.namabot || 'Bot';
    return `*Ads ${botname}*\n\n${text}`;
}

export async function sendAdMessage(conn, chatId, ad, quoted = null) {
    const thumbnail = await getThumbnail(ad.thumbnailUrl);
    const text      = formatAdText(ad.text);
    const botname   = global.info?.namabot || 'Bot';

    if (thumbnail) {
        return await conn.sendMessage(chatId, {
            text,
            contextInfo: {
                externalAdReply: {
                    title: ad.title || `${botname} Advertisement`,
                    body: ad.body || 'Pesan sponsor resmi',
                    mediaType: 1,
                    renderLargerThumbnail: false,
                    thumbnail,
                    sourceUrl: ad.url || global.lwa || ''
                }
            }
        }, quoted ? { quoted } : {});
    } else {
        return await conn.sendMessage(chatId, { text }, quoted ? { quoted } : {});
    }
}

export async function checkAndSendAd(conn, m, extra = {}) {
    try {
        if (!m?.chat || m.chat.endsWith('@newsletter') || m.chat === 'status@broadcast') return;

        const config = loadAds();
        if (!config.enabled || !config.messages?.length) return;

        // Cek filter bypass premium
        const isPrem = extra.isPremium || global.db?.data?.users?.[m.sender]?.premium || false;
        if (config.skipPremium && isPrem) return;

        const isGroup = m.isGroup || m.chat.endsWith('@g.us');
        const now = Date.now();
        const chatKey = m.chat;
        const state = loadAdsState();

        // 1. Cek Anti-Spam Chat Cooldown (Global Jeda per Chat)
        const minCooldownMs = (config.minCooldownMinutes ?? 30) * 60 * 1000;
        const lastChatAdTime = state.lastChatAdTime[chatKey] || 0;
        if (now - lastChatAdTime < minCooldownMs) return;

        if (!state.lastAdTimes[chatKey]) state.lastAdTimes[chatKey] = {};
        const chatTimes = state.lastAdTimes[chatKey];

        // 2. Filter kandidat berdasarkan target (all / group / private) dan interval
        const candidates = config.messages
            .filter(ad => {
                if (ad.target === 'group' && !isGroup) return false;
                if (ad.target === 'private' && isGroup) return false;
                return true;
            })
            .map(ad => {
                const intervalMs = (ad.intervalHours || 1) * 60 * 60 * 1000;
                const last = chatTimes[ad.id] || 0;
                const overdue = now - last - intervalMs;
                return { ad, overdue };
            })
            .filter(item => item.overdue >= 0)
            .sort((a, b) => b.overdue - a.overdue);

        if (!candidates.length) return;

        const pick = candidates[0].ad;

        // 3. Update state timestamps
        state.lastChatAdTime[chatKey] = now;
        chatTimes[pick.id] = now;
        saveAdsState();

        // 4. Kirim Iklan
        await sendAdMessage(conn, m.chat, pick);

    } catch (e) {
        console.error('[ADS] Error in checkAndSendAd:', e.message);
    }
}
