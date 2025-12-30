let handler = async (m) => {
    if (!m.quoted) {
        return m.reply("*Reply dulu gambarnya atau videonya, jangan asal ketik doang.*");
    }

    const isViewOnce = m.quoted?.isViewOnce || m.quoted?.viewOnce;
    if (!isViewOnce) {
        return m.reply("*Itu bukan pesan view-once, gak usah aneh-aneh.*");
    }

    const supportedMime = ["image/jpeg", "video/mp4"];
    if (!supportedMime.includes(m.quoted.mimetype)) {
        return m.reply("*Cuma bisa buat gambar sama video doang, sisanya gak bisa.*");
    }

    try {
        const quotedMsg = m.quoted;

        let media = await quotedMsg.download();
        if (!media) {
            throw new Error("Gagal pas mau download medianya.");
        }

        await conn.sendFile(
            m.chat, 
            media, 
            'viewonce.' + (quotedMsg.mimetype.split('/')[1]), 
            quotedMsg.text || '', 
            m
        );

    } catch (e) {
        console.error("Read View-Once Error:", e);
        m.reply(`*Error:* ${e.message}`);
    }
};

handler.help = ['rvo'];
handler.tags = ['tools'];
handler.command = /^readviewonce|rvo/i;

export default handler;