import fetch from 'node-fetch'
// Pastikan path ini sesuai dengan lokasi file button.js kamu
import { sendInteractiveMessage } from '../function/button.js' 

const searchCache = new Map();

// Fungsi helper untuk format durasi (Detik -> Menit:Detik)
function formatDuration(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);

    const mDisplay = m < 10 ? '0' + m : m;
    const sDisplay = s < 10 ? '0' + s : s;
    
    // Format simpel MM:SS (Contoh: 03:45)
    return `${mDisplay}:${sDisplay}`;
}

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) {
        return m.reply(
            `*TIKTOK SEARCH*\n\n` +
            `Cari video TikTok lewat kata kunci.\n\n` +
            `*Cara Pakai:*\n` +
            `\`${usedPrefix + command}\` *kata kunci*\n\n` +
            `*Contoh:*\n` +
            `\`${usedPrefix + command}\` *Jedag jedug*`
        )
    }

    let loadingMsg = null
    try {
        loadingMsg = await m.reply(`*🔍 Lagi nyari video: ${text}...*`)

        const apiUrl = `https://api.gimita.id/api/search/tiktokvideo?count=20&query=${encodeURIComponent(text)}`;
        const res = await fetch(apiUrl);
        const json = await res.json();

        // Hapus pesan loading
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }

        if (!json.success || !json.data || !json.data.videos || json.data.videos.length === 0) {
            throw new Error('Videonya gak ketemu.');
        }

        const videos = json.data.videos;

        // Simpan ke Cache (PENTING: Agar handler.before bisa baca data videonya)
        conn.tiktokSearch = conn.tiktokSearch || {};
        conn.tiktokSearch[m.sender] = videos;

        // --- 1. MENYUSUN LIST MESSAGE ---
        
        // Buat baris-baris (Rows) untuk List
        const rows = videos.map((v, i) => {
            let duration = formatDuration(v.duration);
            let author = v.author.nickname || v.author.username;
            
            return {
                header: `No. ${i + 1}`, // Header kecil di atas judul
                title: v.title ? v.title.substring(0, 50) + (v.title.length > 50 ? '...' : '') : 'No Title', // Judul (dipotong kalau kepanjangan)
                description: `👤 ${author} | ⏱ ${duration} | ♥ ${v.stats.likes}`, // Deskripsi
                id: `${i + 1}` // ID: Kita kirim angka "1", "2" dst agar ditangkap oleh handler.before
            }
        });

        // Susun Parameter JSON untuk tombol
        const listParams = JSON.stringify({
            title: "KLIK UNTUK MEMILIH",
            sections: [
                {
                    title: `Hasil Pencarian: ${text}`,
                    rows: rows
                }
            ]
        });

        // Susun Konten Pesan Helper
        const content = {
            text: `Ditemukan *${json.data.total}* video untuk pencarian: *"${text}"*\n\nSilakan klik tombol di bawah untuk memilih video yang ingin didownload.`,
            footer: "TikTok Search Downloader",
            title: "TIKTOK SEARCH RESULTS",
            interactiveButtons: [
                {
                    name: "single_select",
                    buttonParamsJson: listParams
                }
            ]
        };

        // --- 2. KIRIM PESAN MENGGUNAKAN HELPER ---
        await sendInteractiveMessage(conn, m.chat, content, { quoted: m });

    } catch (error) {
        console.error('TTSearch Error:', error)
        if (loadingMsg?.key) {
            try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
        }
        m.reply(`*PENCARIAN GAGAL*\n\n*Error:* ${error.message}`)
    }
}

// --- HANDLER BEFORE (MENANGKAP PILIHAN) ---
// Bagian ini TIDAK PERLU DIUBAH karena kita mengirim ID berupa angka string ("1", "2")
// Jadi handler ini akan membaca input tersebut seolah-olah user mengetik angka manual.
handler.before = async (m, { conn }) => {
    conn.tiktokSearch = conn.tiktokSearch || {};
    const videos = conn.tiktokSearch[m.sender];

    // Cek jika ada input teks, ada cache video, dan inputnya adalah Angka
    if (m.text && videos && !isNaN(m.text)) {
        let index = parseInt(m.text) - 1;
        
        if (index >= 0 && index < videos.length) {
            let v = videos[index];
            
            // Hapus cache agar tidak memory leak
            delete conn.tiktokSearch[m.sender];

            // Feedback loading
            await m.reply(`*⏳ Mengirim Video...*\nJudul: ${v.title}`);

            try {
                let videoUrl = v.media.no_watermark || v.media.with_watermark || '';
                
                // Fix URL redirect
                videoUrl = videoUrl.replace('https://tikwm.comhttps://', 'https://');
                videoUrl = videoUrl.replace('https://tikwm.comhttps', 'https');
                
                const vidRes = await fetch(videoUrl);
                const vidBuff = Buffer.from(await vidRes.arrayBuffer());

                let caption = `*TIKTOK VIDEO*\n\n`
                caption += `*Judul:* ${v.title}\n`
                caption += `*Author:* ${v.author.nickname} (@${v.author.username})\n`
                caption += `*Durasi:* ${formatDuration(v.duration)}\n`
                caption += `*Plays:* ${v.stats.plays}\n`
                caption += `*Likes:* ${v.stats.likes}\n`
                caption += `*Shares:* ${v.stats.shares}`

                // Kirim Video
                await conn.sendMessage(m.chat, { 
                    video: vidBuff, 
                    caption: caption 
                }, { quoted: m });

                // Kirim Audio (Jika ada)
                if (v.media.music) {
                    try {
                        const musicUrl = v.media.music;
                        const audRes = await fetch(musicUrl);
                        const audBuff = Buffer.from(await audRes.arrayBuffer());

                        await conn.sendMessage(m.chat, {
                            audio: audBuff,
                            mimetype: 'audio/mpeg',
                            fileName: `${v.title}.mp3`,
                            contextInfo: {
                                externalAdReply: {
                                    title: v.title,
                                    body: "Music Audio",
                                    thumbnail: vidBuff, // Pakai thumbnail dari video buffer
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: m });
                    } catch (errAudio) {
                        console.log('Gagal kirim audio:', errAudio);
                    }
                }

            } catch (e) {
                m.reply(`*Gagal kirim media:* ${e.message}`);
            }
            
            return true; // Stop handler lain
        }
    }
    return false; 
}

handler.help = ['tiktoksearch *query*']
handler.tags = ['downloader']
handler.command = /^(tiktoksearch|ttsearch|tiktoks)$/i
handler.limit = false

export default handler