function decodeSnapSave(data) {
    function decode(h, u, n, t, e, r) {
        r = "";
        for (let i = 0, len = h.length; i < len; i++) {
            let s = "";
            while (h[i] !== n[e]) {
                s += h[i];
                i++;
            }
            for (let j = 0; j < n.length; j++) {
                s = s.replace(new RegExp(n[j], "g"), j.toString());
            }
            r += String.fromCharCode(Number(parseInt(s, e)) - t);
        }
        return decodeURIComponent(escape(r));
    }
    const match = data.match(/eval\(function\(h,u,n,t,e,r\)\{[\s\S]*?\}\((.*?)\)\)/);
    if (!match) return null;
    const args = match[1].split(",").map(v => v.trim().replace(/^["']|["']$/g, ""));
    return decode(args[0], args[1], args[2], parseInt(args[3], 10), parseInt(args[4], 10), parseInt(args[5], 10));
}

async function downloadSnapSave(url) {
    const body = new URLSearchParams({ url });
    const res = await fetch("https://snapsave.app/action.php?lang=id", {
        method: "POST",
        headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": "https://snapsave.app/id",
            "Origin": "https://snapsave.app"
        },
        body
    });
    if (!res.ok) throw new Error(`SnapSave error (HTTP ${res.status})`);
    const text = await res.text();
    const html = decodeSnapSave(text);
    if (!html) throw new Error("Gagal mengurai data SnapSave.");

    const urls = [];
    const videoMatches = [...html.matchAll(/href="([^"]+)"[^>]*>Download (HD|SD)</gi)];
    for (const m of videoMatches) {
        urls.push({ url: m[1], quality: m[2].toUpperCase() });
    }
    if (!urls.length) {
        const fallbackMatch = html.match(/href="([^"]+)"[^>]*class="button is-success/i);
        if (fallbackMatch) urls.push({ url: fallbackMatch[1], quality: 'SD' });
    }
    if (!urls.length) throw new Error("Link video tidak ditemukan di SnapSave.");
    return urls;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(
        `*FACEBOOK DOWNLOADER*\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Unduh video Reels & Post Facebook kualitas HD/SD.\n\n` +
        `*Cara Pakai:*\n` +
        `› \`${usedPrefix + command} <url facebook>\`\n\n` +
        `*Contoh:*\n` +
        `› \`${usedPrefix + command} https://www.facebook.com/share/r/xxx\`\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`
    )

    if (!text.includes('facebook.com') && !text.includes('fb.com') && !text.includes('fb.watch')) {
        return m.reply('URL harus berasal dari Facebook.')
    }

    const loadingMsg = await m.reply('_Mengunduh video Facebook..._')

    try {
        let videoUrl = null;
        let quality = 'HD';
        let title = '';

        try {
            const apiRes = await fetch(`https://api.nexray.web.id/api/downloader/facebook?url=${encodeURIComponent(text.trim())}`, {
                signal: AbortSignal.timeout(20000)
            });
            if (apiRes.ok) {
                const json = await apiRes.json();
                if (json.status && json.result) {
                    videoUrl = json.result.video_hd || json.result.video_sd || null;
                    quality = json.result.video_hd ? 'HD' : 'SD';
                    title = json.result.title || '';
                }
            }
        } catch (_) {}

        if (!videoUrl) {
            const snaps = await downloadSnapSave(text.trim());
            const picked = snaps.find(v => v.quality === 'HD') || snaps[0];
            videoUrl = picked.url;
            quality = picked.quality;
        }

        if (!videoUrl) throw new Error('Gagal mendapatkan link video dari semua server.');

        const captionText = 
            `*FACEBOOK VIDEO*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `${title ? `• Judul: ${title}\n` : ''}` +
            `• Kualitas: ${quality}\n` +
            `• Sumber: Facebook\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `> _Powered by Joy Multi-Device_`

        await conn.sendFile(m.chat, videoUrl, 'fb.mp4', captionText, m)
        await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})

    } catch (err) {
        console.error('[FBDL ERROR]:', err)
        await m.reply(`*GAGAL DOWNLOAD*\n\n*Error:* ${err.message}\n\nCoba lagi nanti.`)
        await conn.sendMessage(m.chat, { delete: loadingMsg.key }).catch(() => {})
    }
}

handler.help    = ['facebook *url*']
handler.tags    = ['downloader']
handler.command = /^(facebook|fb|fbdl)$/i
handler.limit   = false

export default handler
