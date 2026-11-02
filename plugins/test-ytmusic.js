/*
 * @Author      : Rafli
 * @Feature     : Test Native YouTube Music Downloader (No Fallback / Pure Innertube)
 * @Description : Plugin pengujian langsung scraper native YouTube Music (Innertube VisionOS/Android_VR) tanpa fallback agar error terlihat jelas
 */

import ytmusic from '../function/scrapers/ytmusic.js';

function isValidAudioBuffer(buf) {
    if (!buf || !Buffer.isBuffer(buf) || buf.length < 50000) return false;
    const headerStr = buf.slice(0, 200).toString('utf-8').toLowerCase();
    if (headerStr.includes('<!doctype') || headerStr.includes('<html') || headerStr.includes('<?xml')) {
        return false;
    }
    const isId3 = buf.slice(0, 3).toString('ascii') === 'ID3';
    const isMp3Sync = (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0);
    const isM4a = buf.slice(4, 8).toString('ascii') === 'ftyp';
    const isOgg = buf.slice(0, 4).toString('ascii') === 'OggS';
    const isWebm = buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3;
    const isRiff = buf.slice(0, 4).toString('ascii') === 'RIFF';

    return isId3 || isMp3Sync || isM4a || isOgg || isWebm || isRiff;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `╭── ✦ *TEST YT MUSIC (NATIVE INNERTUBE)* ✦\n` +
            `• *Deskripsi:* Test scraper bawaan ytmusic.js langsung ke Innertube API tanpa fallback sama sekali.\n` +
            `• *Format:* \`${usedPrefix + command} <judul / link YT Music>\`\n` +
            `• *Contoh:* \`${usedPrefix + command} https://music.youtube.com/watch?v=M-TtxTKmIG8\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`
        );
    }

    let input = text.trim();
    let videoId = ytmusic.extractVideoId(input);

    await conn.sendMessage(m.chat, { react: { text: '⏳', key: m.key } }).catch(() => {});
    const loadMsg = await m.reply(
        `╭── ✦ *TEST YT MUSIC NATIVE* ✦\n` +
        `• *Input:* ${input}\n` +
        `• *Tahap 1:* Resolving Video ID & Metadata...\n` +
        `╰━━━━━━━━━━━━━━━━━━━━━━━`
    );

    const startTime = Date.now();
    let currentStage = 'Resolving Video ID';

    try {
        // ── Tahap 1: Identifikasi ID Video & Track Metadata ──────────────
        currentStage = 'Tahap 1: Search / Metadata Track';
        let trackMeta = null;

        if (!videoId) {
            const searchRes = await ytmusic.search(input);
            const foundTrack = searchRes?.topResult || searchRes?.songs?.[0] || searchRes?.videos?.[0];
            if (!foundTrack?.videoId) {
                throw new Error(`Lagu "${input}" tidak ditemukan dalam pencarian YouTube Music.`);
            }
            videoId = foundTrack.videoId;
            trackMeta = foundTrack;
        } else {
            try {
                trackMeta = await ytmusic.getTrack(videoId, { skipAudio: true });
            } catch (_) {
                trackMeta = { title: `Track ${videoId}`, author: 'YouTube Music' };
            }
        }

        const title = trackMeta?.title || `YouTube Audio ${videoId}`;
        const artist = trackMeta?.author || trackMeta?.artists?.[0]?.name || 'YouTube Music';

        await conn.sendMessage(m.chat, {
            text: `╭── ✦ *TEST YT MUSIC NATIVE* ✦\n` +
                  `• *Judul:* ${title}\n` +
                  `• *Artis:* ${artist}\n` +
                  `• *Video ID:* \`${videoId}\`\n` +
                  `• *Tahap 2:* Inisialisasi Innertube Config...\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━`,
            edit: loadMsg.key
        }).catch(() => {});

        // ── Tahap 2: Ambil Konfigurasi Innertube & Visitor Data ──────────
        currentStage = 'Tahap 2: Innertube Context & Visitor Data';
        const cfg = await ytmusic.getInnertubeConfig();
        if (!cfg?.apiKey) {
            throw new Error('Gagal mendapatkan INNERTUBE_API_KEY dari music.youtube.com');
        }

        await conn.sendMessage(m.chat, {
            text: `╭── ✦ *TEST YT MUSIC NATIVE* ✦\n` +
                  `• *Video ID:* \`${videoId}\`\n` +
                  `• *Visitor Data:* ${cfg.visitorData ? 'Tersedia' : 'Kosong'}\n` +
                  `• *Tahap 3:* Hit YouTubei Player API...\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━`,
            edit: loadMsg.key
        }).catch(() => {});

        // ── Tahap 3: Request Player Stream ke YouTubei (No Fallback) ─────
        currentStage = 'Tahap 3: POST /youtubei/v1/player';
        const INNERTUBE_CLIENTS = [
            {
                clientName: 'VISIONOS',
                clientVersion: '1.02',
                clientId: '104',
                deviceMake: 'Apple',
                deviceModel: 'RealityDevice17,1',
                osName: 'visionOS',
                osVersion: '26.5.23O471'
            },
            {
                clientName: 'ANDROID_VR',
                clientVersion: '1.61.48',
                clientId: '89',
                deviceMake: 'Oculus',
                deviceModel: 'Quest 3',
                osName: 'Android',
                osVersion: '12'
            }
        ];

        let playabilityData = null;
        let selectedAudioFormat = null;
        let usedClient = null;

        for (const client of INNERTUBE_CLIENTS) {
            const playerUrl = `https://www.youtube.com/youtubei/v1/player?key=${cfg.apiKey}&prettyPrint=false`;
            const playerRes = await fetch(playerUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'X-YouTube-Client-Name': client.clientId || '104',
                    'X-YouTube-Client-Version': client.clientVersion || '1.02',
                    'Origin': 'https://www.youtube.com',
                    ...(cfg.cookieHeader ? { Cookie: cfg.cookieHeader } : {})
                },
                body: JSON.stringify({
                    context: {
                        client: {
                            ...client,
                            visitorData: cfg.visitorData,
                            hl: 'en',
                            gl: 'US'
                        }
                    },
                    videoId
                })
            });

            if (!playerRes.ok) {
                throw new Error(`Player API request gagal: HTTP ${playerRes.status}`);
            }

            const pData = await playerRes.json();
            playabilityData = pData.playabilityStatus;

            if (pData.playabilityStatus?.status !== 'OK') {
                const reason = pData.playabilityStatus?.reason || pData.playabilityStatus?.status || 'Unknown';
                console.warn(`[TEST-YTM] Client ${client.clientName} playability not OK:`, reason);
                continue;
            }

            const afs = pData.streamingData?.adaptiveFormats || [];
            const m4aTrack = afs.find(f => f.itag === 140 && f.url);
            const webmTrack = afs.find(f => f.itag === 251 && f.url);
            const bestAudio = m4aTrack || webmTrack || afs.find(f => f.mimeType?.includes('audio') && f.url);

            if (bestAudio) {
                selectedAudioFormat = bestAudio;
                usedClient = client.clientName;
                break;
            }
        }

        if (!selectedAudioFormat || !selectedAudioFormat.url) {
            const playabilityReason = playabilityData?.reason || playabilityData?.status || 'Tidak ada audio stream langsung (URL kosong atau butuh cipher signature/PO-Token)';
            throw new Error(`Gagal mendapatkan direct audio URL dari YouTube Innertube. Status Playability: ${playabilityReason}`);
        }

        const streamUrl = selectedAudioFormat.contentLength
            ? `${selectedAudioFormat.url}&range=0-${Number(selectedAudioFormat.contentLength) - 1}`
            : selectedAudioFormat.url;

        await conn.sendMessage(m.chat, {
            text: `╭── ✦ *TEST YT MUSIC NATIVE* ✦\n` +
                  `• *Client:* ${usedClient}\n` +
                  `• *Codec:* ${selectedAudioFormat.mimeType?.split(';')[0]}\n` +
                  `• *Bitrate:* ${Math.round(selectedAudioFormat.bitrate / 1000)} kbps\n` +
                  `• *Tahap 4:* Mengunduh audio binary stream...\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━`,
            edit: loadMsg.key
        }).catch(() => {});

        // ── Tahap 4: Fetch Stream Audio dari googlevideo ──────────────────
        currentStage = 'Tahap 4: Fetch googlevideo binary stream';
        const streamRes = await fetch(streamUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://www.youtube.com',
                'Referer': 'https://www.youtube.com/'
            }
        });

        if (!streamRes.ok) {
            throw new Error(`Download googlevideo stream gagal: HTTP ${streamRes.status} ${streamRes.statusText}`);
        }

        const rawBuffer = Buffer.from(await streamRes.arrayBuffer());
        if (!isValidAudioBuffer(rawBuffer)) {
            const headPreview = rawBuffer.slice(0, 150).toString('utf-8');
            throw new Error(`Buffer yang diunduh bukan audio valid. Size: ${rawBuffer.length} bytes. Header: ${headPreview}`);
        }

        const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(2);
        const sizeMb = (rawBuffer.length / (1024 * 1024)).toFixed(2);
        const isM4A = selectedAudioFormat.mimeType?.includes('mp4') || (rawBuffer.slice(4, 8).toString('ascii') === 'ftyp');
        const mimeToSend = isM4A ? 'audio/mp4' : 'audio/webm';
        const ext = isM4A ? 'm4a' : 'webm';

        await conn.sendMessage(m.chat, {
            text: `╭── ✦ *TEST YT MUSIC NATIVE* ✦\n` +
                  `• *Status:* ✅ Berhasil (Direct Innertube)\n` +
                  `• *Judul:* ${title}\n` +
                  `• *Artis:* ${artist}\n` +
                  `• *Client Digunakan:* ${usedClient}\n` +
                  `• *Format Stream:* itag ${selectedAudioFormat.itag} (${ext})\n` +
                  `• *Ukuran:* ${sizeMb} MB\n` +
                  `• *Waktu:* ${elapsedSec} detik\n` +
                  `• *Fallback:* NONE (Pure Native Innertube)\n` +
                  `╰━━━━━━━━━━━━━━━━━━━━━━━`,
            edit: loadMsg.key
        }).catch(() => {});

        // ── Tahap 5: Kirim Audio ke Chat ──────────────────────────────────
        currentStage = 'Tahap 5: Kirim Audio ke WhatsApp';
        const cleanTitle = title.replace(/[\\/:*?"<>|]/g, '').trim();

        await conn.sendMessage(m.chat, {
            audio: rawBuffer,
            mimetype: mimeToSend,
            fileName: `${cleanTitle}.${ext}`,
            ptt: false
        }, { quoted: m });

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (err) {
        console.error('[TEST-YTM-NATIVE-ERROR]', err);
        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});

        const errDetail = err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : err.message;
        const errorMsg =
            `╭── ✦ *TEST YT MUSIC ERROR (NATIVE)* ✦\n` +
            `• *Status:* ❌ GAGAL (No Fallback)\n` +
            `• *Gagal di:* ${currentStage}\n` +
            `• *Pesan Error:* ${err.message}\n` +
            `• *Detail Stack:*\n` +
            `\`\`\`${errDetail}\`\`\`\n` +
            `╰━━━━━━━━━━━━━━━━━━━━━━━`;

        await conn.sendMessage(m.chat, {
            text: errorMsg,
            edit: loadMsg?.key
        }).catch(async () => {
            await m.reply(errorMsg);
        });
    }
};

handler.help    = ['testytm <judul / link>'];
handler.tags    = ['downloader', 'tools'];
handler.command = /^(testytm|testytmusic|tytm)$/i;
handler.limit   = false;

export default handler;
