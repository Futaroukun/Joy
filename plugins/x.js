let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Default text yang akan disalin
    let copyText = text || "Hello! Ini adalah teks yang akan disalin secara otomatis ketika tombol diklik."
    
    try {
        // Menggunakan method dari simple.js
        const { generateWAMessageFromContent, proto } = await import('baileys')
        
        // Generate pesan interaktif dengan tombol copy
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
                                text: `*TEST CTA COPY BUTTON*\n\nTekan tombol di bawah untuk menyalin teks secara otomatis.\n\n*Teks yang akan disalin:*\n${copyText}`
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: `${global.info.namabot} © 2025`
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: "📋 COPY BUTTON TEST",
                                subtitle: "Klik untuk menyalin",
                                hasMediaAttachment: false
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [
                                    {
                                        name: "cta_copy",
                                        buttonParamsJson: JSON.stringify({
                                            display_text: "📋 SALIN TEKS",
                                            copy_code: copyText,
                                            id: `copy_${Date.now()}`
                                        })
                                    },
                                    {
                                        name: "quick_reply",
                                        buttonParamsJson: JSON.stringify({
                                            display_text: "🔄 Test Lagi",
                                            id: `.${command} Teks baru untuk test`
                                        })
                                    }
                                ]
                            })
                        })
                    }
                }
            },
            { quoted: m }
        )

        // Kirim pesan menggunakan conn method dari simple.js
        await conn.relayMessage(m.chat, msg.message, { 
            messageId: msg.key.id 
        })
        
    } catch (error) {
        console.error('CTA Copy Error:', error)
        
        m.reply(
            '*GAGAL MEMBUAT TOMBOL COPY*\n\n' +
            '*Kemungkinan penyebab:*\n' +
            '- Versi WhatsApp tidak mendukung\n' +
            '- Terjadi error pada server\n\n' +
            `*Error:* ${error.message}`
        )
    }
}

handler.help = ['testcopy *teks*']
handler.tags = ['tools']
handler.command = /^(testcopy|ctacopy|copybtn)$/i
handler.limit = false

export default handler