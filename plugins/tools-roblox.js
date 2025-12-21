import fetch from 'node-fetch';

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text || text.trim() === '') {
        return m.reply(
            '*ROBLOX USER STALKER*\n\n' +
            '*Username diperlukan untuk melakukan pencarian.*\n\n' +
            '*Cara Penggunaan:*\n' +
            '*' + usedPrefix + command + ' <username>*\n\n' +
            '*Contoh:*\n' +
            '*' + usedPrefix + command + ' roblox*\n' +
            '*' + usedPrefix + command + ' @roblox*\n\n' +
            '*Catatan:*\n' +
            '- Masukkan username Roblox yang valid\n' +
            '- Pencarian bersifat case-sensitive'
        );
    }

    let loadingMsg = null;

    try {
        loadingMsg = await m.reply('*Sedang mencari data player Roblox, mohon tunggu sebentar...*');

        let username = text.trim();
        if (username.startsWith('@')) {
            username = username.slice(1);
        }

        const apiKey = 'CVWXfnLiyFM3gKu2xSfAcjE5iOqrQ0ArOzK2lZUFCg5TqQBNhWijacZzmMGDUik5';
        const url = `https://api.cookie-api.com/api/roblox/user?username=${encodeURIComponent(username)}`;
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': apiKey
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }

        const json = await response.json();

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key });
            } catch (e) {}
        }

        if (!json.success) {
            return m.reply(
                '*USER TIDAK DITEMUKAN*\n\n' +
                'Username *' + username + '* tidak ditemukan di database Roblox.'
            );
        }

        let createdDate = 'Tidak tersedia';
        if (json.created_iso) {
            try {
                createdDate = new Date(json.created_iso).toLocaleDateString('id-ID', {
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric'
                });
            } catch (e) {}
        }

        let caption = `*ROBLOX USER STALKER*\n\n` +
                      `*Display Name:* ${json.display_name || json.username}\n` +
                      `*Username:* @${json.username}\n` +
                      `*User ID:* ${json.userid}\n` +
                      `*Akun Dibuat:* ${createdDate}\n` +
                      `*Verified Badge:* ${json.has_verified_badge ? 'Ya' : 'Tidak'}\n` +
                      `*Status Ban:* ${json.is_banned ? 'Banned (Terbanned)' : 'Aktif (Tidak Diban)'}\n\n` +
                      `*Deskripsi Bio:*\n${json.description || 'Tidak ada deskripsi'}\n\n` +
                      `*Profile:* https://www.roblox.com/users/${json.userid}/profile`;

        if (json.user_avatar_picture) {
            await conn.sendFile(
                m.chat, 
                json.user_avatar_picture, 
                'roblox-avatar.png', 
                caption, 
                m
            );
        } else {
            await m.reply(caption);
        }

    } catch (e) {
        console.error('Roblox Stalk Error:', e);

        if (loadingMsg?.key) {
            try {
                await conn.sendMessage(m.chat, { delete: loadingMsg.key });
            } catch {}
        }

        let errorMsg = '*TERJADI KESALAHAN SISTEM*\n\n';
        errorMsg += `*Kesalahan:* ${e.message}`;

        m.reply(errorMsg);
    }
}

handler.help = ['roblox *username*'];
handler.tags = ['tools'];
handler.command = /^(roblox|rblx)$/i;
handler.limit = false;

export default handler;