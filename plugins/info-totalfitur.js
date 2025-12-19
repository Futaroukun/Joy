import fs from 'fs'

let handler = async (m, { conn, args, command }) => {
    try {
        const features = Object.values(global.plugins)
            .filter(plugin => plugin.help && plugin.tags && !plugin.disabled)
            .map(plugin => plugin.help)
            .flat(1)
        
        const totalFeatures = Object.values(global.plugins)
            .filter(plugin => plugin.help && plugin.tags && !plugin.disabled)
            .length;

        const message = `*STATISTIK FITUR BOT*\n\n` +
                       `*Total Plugin:* ${totalFeatures}\n` +
                       `*Total Perintah:* ${features.length}\n\n` +
                       `*Status:* Aktif dan siap digunakan`;

        await m.reply(message);
        
    } catch (error) {
        console.error('Error in totalfitur command:', error);
        await m.reply('*TERJADI KESALAHAN SISTEM*\n\nGagal menghitung total fitur saat ini.');
    }
}

handler.help = ['totalfitur'];
handler.tags = ['info'];
handler.command = ['totalfitur', 'totalcmd', 'totalfeatures'];

export default handler;