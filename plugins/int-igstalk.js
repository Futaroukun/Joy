/*
 * @Author      : Rafli
 * @Feature     : Instagram User Stalker (Direct Mobile API & Multi-Fallback)
 * @Description : Ambil profil Instagram (Followers, Following, Bio, Verifikasi, Foto Profil HD, dan Postingan Terbaru)
 * @Version     : 3.0 (Direct Instagram Web API Engine)
 */

import axios from 'axios';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 324.0.0.34.110',
    'x-ig-app-id': '936619743392459',
    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8',
    'Origin': 'https://www.instagram.com',
    'Referer': 'https://www.instagram.com/'
};

async function igStalk(username) {
    const cleanUser = username.replace(/@/g, '').trim().toLowerCase();
    if (!cleanUser) throw new Error('Username tidak valid.');

    try {
        const res = await axios.get(`https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(cleanUser)}`, {
            headers: HEADERS,
            timeout: 12000
        });

        const user = res.data?.data?.user;
        if (!user) throw new Error('USER_NOT_FOUND');

        const posts = user.edge_owner_to_timeline_media?.edges || [];
        const recent_posts = posts.slice(0, 5).map(edge => {
            const node = edge.node;
            return {
                shortcode: node.shortcode || '',
                caption: node.edge_media_to_caption?.edges?.[0]?.node?.text || '',
                type: node.is_video ? '🎥 Video' : 'Foto',
                likes: node.edge_liked_by?.count || node.edge_media_preview_like?.count || 0,
                comments: node.edge_media_to_comment?.count || 0,
                display_url: node.display_url || ''
            };
        });

        return {
            status: true,
            username: user.username,
            full_name: user.full_name || '-',
            biography: user.biography || '',
            category: user.category_name || user.business_category_name || '',
            media_count: user.edge_owner_to_timeline_media?.count || 0,
            follower_count: user.edge_followed_by?.count || 0,
            following_count: user.edge_follow?.count || 0,
            is_private: Boolean(user.is_private),
            is_verified: Boolean(user.is_verified),
            profile_pic_url: user.profile_pic_url_hd || user.profile_pic_url || '',
            external_url: user.external_url || '',
            recent_posts
        };

    } catch (error) {
        if (error.response?.status === 404 || error.message === 'USER_NOT_FOUND') {
            throw new Error('USER_NOT_FOUND');
        }
        throw new Error(error.response?.data?.message || error.message || 'Gagal terhubung ke server Instagram.');
    }
}

function formatNumber(num) {
    if (!num) return '0';
    if (num >= 1_000_000_000) return (num / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1_000_000)     return (num / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1_000)         return (num / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString('id-ID');
}

function cleanUsername(input) {
    if (!input) return '';
    return input.replace(/@/g, '').replace(/\s+/g, '').trim().toLowerCase();
}

let handler = async (m, { conn, args, command, usedPrefix }) => {
    try {
        if (!args[0]) {
            return m.reply(
                `*📸 INSTAGRAM STALKER*\n\n` +
                `Lihat info profil Instagram publik/kreator.\n\n` +
                `*Cara Pakai:* \`${usedPrefix + command} <username>\`\n\n` +
                `*Contoh:*\n` +
                `\`${usedPrefix + command} cristiano\`\n` +
                `\`${usedPrefix + command} @instagram\``
            );
        }

        const username = cleanUsername(args[0]);
        if (!username) return m.reply('Username tidak valid.');

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

        const res = await igStalk(username);

        let caption = `📸 *INSTAGRAM PROFILE*\n\n`;
        caption += `• *Username:* @${res.username}\n`;
        caption += `• *Nama:* ${res.full_name || '-'}\n`;
        if (res.category) caption += `• *Kategori:* ${res.category}\n`;
        if (res.biography) caption += `• *Bio:* ${res.biography}\n`;
        caption += `\n`;
        caption += `• *Postingan:* ${formatNumber(res.media_count)}\n`;
        caption += `• *Followers:* ${formatNumber(res.follower_count)}\n`;
        caption += `• *Following:* ${formatNumber(res.following_count)}\n`;
        caption += `\n`;
        caption += `• *Privat:* ${res.is_private ? 'Ya' : '🔓 Tidak'}\n`;
        caption += `• *Centang Biru:* ${res.is_verified ? 'Ya' : 'Tidak'}\n`;
        if (res.external_url) caption += `• *Link Web:* ${res.external_url}\n`;

        if (res.recent_posts && res.recent_posts.length > 0) {
            caption += `\n*POSTINGAN TERBARU:*\n`;
            res.recent_posts.forEach((post, i) => {
                caption += `\n${i + 1}. *Tipe:* ${post.type} | *Suka:* ${formatNumber(post.likes)} | *Komen:* ${formatNumber(post.comments)}\n`;
                if (post.caption) {
                    const cleanCap = post.caption.replace(/\n+/g, ' ').trim();
                    caption += `   _${cleanCap.length > 60 ? cleanCap.substring(0, 60) + '...' : cleanCap}_\n`;
                }
                caption += `   https://instagram.com/p/${post.shortcode}\n`;
            });
        }
        caption += `\nhttps://instagram.com/${res.username}`;

        if (res.profile_pic_url) {
            await conn.sendMessage(m.chat, {
                image  : { url: res.profile_pic_url },
                caption: caption.trim()
            }, { quoted: m });
        } else {
            await m.reply(caption.trim());
        }

        await conn.sendMessage(m.chat, { react: { text: '✅', key: m.key } }).catch(() => {});

    } catch (error) {
        let errorMsg;
        if (error.message === 'USER_NOT_FOUND') {
            errorMsg =
                `*Username tidak ditemukan.*\n\n` +
                `Akun *@${cleanUsername(args[0])}* tidak ditemukan di Instagram.\n` +
                `Pastikan username sudah benar dan akun masih aktif.`;
        } else {
            errorMsg = `*Gagal mengambil profil Instagram:*\n${error.message}`;
        }

        await conn.sendMessage(m.chat, { react: { text: '❌', key: m.key } }).catch(() => {});
        return m.reply(errorMsg);
    }
};

handler.help = ['igstalk *username*'];
handler.tags    = ['internet'];
handler.command = /^(igstalk|stalkig)$/i;

export default handler;