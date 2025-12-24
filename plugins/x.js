import fetch from 'node-fetch'

let handler = async (m, { conn }) => {
    await m.reply('Mengirim test album (2 gambar)...');

    try {
        // Siapkan array media
        // Konten bisa berupa Buffer atau { url: '...' }
        const mediaArray = [
            { 
                image: await (await fetch('https://api.cloudsky.biz.id/file?key=kurumi-bot/1766572165198.jpg')).buffer(),
                caption: 'Gambar Pertama' 
            },
            { 
                image: await (await fetch('https://api.cloudsky.biz.id/file?key=kurumi-bot/1766572151481.jpg')).buffer(),
                caption: 'Gambar Kedua'
            },
            // Anda juga bisa menambahkan video
            // { video: await (await fetch('link_video.mp4')).buffer(), caption: 'Video Keren' }
        ];

        // Panggil fungsi sendAlbum
        await conn.sendAlbum(m.chat, mediaArray, m);

    } catch (e) {
        console.error(e);
        m.reply(`Gagal mengirim album: ${e.message}`);
    }
};

handler.help = ['albumtest'];
handler.tags = ['tools'];
handler.command = /^(albumtest)$/i;
handler.owner = true;

export default handler;