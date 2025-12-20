import { generateWAMessageFromContent, proto } from 'baileys'

let handler = async (m, { conn }) => {
    // Pesan yang akan disalin
    let copyText = "SAYA SUKA SCRIPNYA BANG"

    let msg = generateWAMessageFromContent(
        m.chat,
        {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: "Klik tombol dibawah untuk menyalin teks otomatis."
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: "Mode Salin Saja"
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "TEST COPY BUTTON",
                            subtitle: "Subtitle",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "cta_copy",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📋 SALIN TEKS",
                                        copy_code: copyText,
                                        id: "copy_123"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        },
        { quoted: m }
    );

    await conn.relayMessage(m.chat, msg.message, { messageId: msg.key.id });
};

handler.help = ['testcopy'];
handler.tags = ['main'];
handler.command = /^(testcopy|copy)$/i;

export default handler;