import fetch from 'node-fetch'

const searchCache = new Map();

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*TIKTOK SEARCH*\n\n` +
            `Cari video TikTok lewat kata kunci.\n\n` +
            `*Cara Pakai:*\n` +
            `\`${usedPrefix + command}\` *kata kunci*\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command}\` *Sirih kasih dipucuk pauh*`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply(`*Lagi nyari video: ${text}...*`)

        const apiUrl = `https://api.gimita.id/api/search/tiktokvideo?count=20&query=${encodeURIComponent(text)}`;
        const res = await fetch(apiUrl);
        const json = await res.json();

        if (!json.success || !json.data || !json.data.videos || json.data.videos.length === 0) {
            throw new Error('Videonya gak ketemu.');
        }

        const videos = json.data.videos;
        
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        let header = `*TIKTOK SEARCH RESULTS*\n`
        header += `Query: *${text}*\n`
        header += `Total: ${json.data.total}\n\n`
        header += `Balas pesan ini dengan angka (1-${videos.length}) buat milih videonya.\n\n`

        let listText = '';
        videos.forEach((v, i) => {
            let duration = `${v.duration}s`;
            let author = v.author.nickname || v.author.username;
            listText += `*${i + 1}.* ${v.title}\n`
            listText += `└ Author: ${author} | Durasi: ${duration} | Likes: ${v.stats.likes}\n\n`
        });

        conn.tiktokSearch = conn.tiktokSearch || {};
        conn.tiktokSearch[m.sender] = videos;

        await conn.sendMessage(m.chat, {
            text: header + listText,
            contextInfo: {
                externalAdReply: {
                    title: `Hasil Pencarian: ${text}`,
                    body: "Balas dengan angka buat download",
                    thumbnailUrl: videos[0].cover,
                    sourceUrl: '',
                    mediaType: 1,
                    renderLargerThumbnail: true
                }
            }
        }, { quoted: m })

    } catch (error) {
        console.error('TTSearch Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*PENCARIAN GAGAL*\n\n*Error:* ${error.message}`)
    }
}

handler.before = async (m, { conn }) => {
    conn.tiktokSearch = conn.tiktokSearch || {};
    const videos = conn.tiktokSearch[m.sender];

    if (m.text && videos && !isNaN(m.text)) {
        let index = parseInt(m.text) - 1;
        
        if (index >= 0 && index < videos.length) {
            let v = videos[index];
            delete conn.tiktokSearch[m.sender];

            let loading = await m.reply(`*Lagi ngirim video & audio:* \n${v.title}...`);

            try {
                let videoUrl = v.media.no_watermark || v.media.with_watermark || '';
                
                videoUrl = videoUrl.replace('https://tikwm.comhttps://', 'https://');
                videoUrl = videoUrl.replace('https://tikwm.comhttps', 'https');
                
                const vidRes = await fetch(videoUrl);
                const vidBuff = Buffer.from(await vidRes.arrayBuffer());

                let caption = `*TIKTOK VIDEO*\n\n`
                caption += `*Judul:* ${v.title}\n`
                caption += `*Author:* ${v.author.nickname} (@${v.author.username})\n`
                caption += `*Durasi:* ${v.duration} detik\n`
                caption += `*Plays:* ${v.stats.plays}\n`
                caption += `*Likes:* ${v.stats.likes}\n`
                caption += `*Comments:* ${v.stats.comments}\n`
                caption += `*Shares:* ${v.stats.shares}`

                await conn.sendMessage(m.chat, { 
                    video: vidBuff, 
                    caption: caption 
                }, { quoted: m });

                if (v.media.music) {
                    try {
                        const musicUrl = v.media.music;
                        const audRes = await fetch(musicUrl);
                        const audBuff = Buffer.from(await audRes.arrayBuffer());

                        await conn.sendMessage(m.chat, {
                            audio: audBuff,
                            mimetype: 'audio/mpeg',
                            fileName: `${v.title}.mp3`
                        }, { quoted: m });
                    } catch (errAudio) {
                        console.log('Gagal kirim audio:', errAudio);
                    }
                }

                await conn.sendMessage(m.chat, { delete: loading.key });

            } catch (e) {
                m.reply(`*Gagal kirim media:* ${e.message}`);
            }
            
            return true;
        }
    }
    return false; 
}

handler.help = ['tiktoksearch *query*']
handler.tags = ['downloader']
handler.command = /^(tiktoksearch|ttsearch|tiktoks)$/i
handler.limit = false

export default handler