let handler = async (m, { args, command, text, usedPrefix }) => {
    if (!m.isGroup) return m.reply('Perintah ini hanya dapat digunakan di dalam grup.');

    const isWelcome = command.toLowerCase() === 'setwelcome';
    const property = isWelcome ? 'sWelcome' : 'sBye';
    const message = (text || args.join(' ')).trim();

    if (!message) {
        return m.reply(
            `Cara penggunaan: \`${usedPrefix}${command} <pesan>\`\n` +
            `Placeholder: @user, @subject, @desc\n` +
            `Reset ke default: \`${usedPrefix}${command} reset\``
        );
    }

    if (!global.db.data.chats[m.chat]) global.db.data.chats[m.chat] = {};
    const chat = global.db.data.chats[m.chat];
    const isReset = message.toLowerCase() === 'reset';
    chat[property] = isReset ? '' : message;
    global.saveData('chats', m.chat);

    return m.reply(isReset
        ? `Pesan ${isWelcome ? 'welcome' : 'leave'} grup dikembalikan ke default.`
        : `Pesan ${isWelcome ? 'welcome' : 'leave'} grup berhasil disimpan.`);
};

handler.help = ['setwelcome <pesan|reset>', 'setleave <pesan|reset>'];
handler.tags = ['group'];
handler.command = /^(setwelcome|setleave)$/i;
handler.group = true;
handler.admin = true;

export default handler;
