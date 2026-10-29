/*
- @Author: Rafli 
- @Feature: Upload Status WhatsApp 
- @Description: Post status WA dengan support image, video, text, dan audio (auto-convert ke VN)
*/

import { spawn } from 'child_process'
import { promises } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let handler = async (m, { conn, text, usedPrefix, command }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    
    let isImage = /image/.test(mime)
    let isVideo = /video/.test(mime)
    let isAudio = /audio/.test(mime)
    let isMedia = isImage || isVideo || isAudio
    
    let caption = text || ''
    
    if (!isMedia && !caption) {
        return m.reply(`Kirim/Reply media atau teks dengan perintah *${usedPrefix + command}*`)
    }

    try {
        let contacts = Object.keys(conn.chats).filter(v => v.endsWith('@s.whatsapp.net'))
        if (contacts.length === 0) contacts = [m.sender]

        await m.reply('*Uploading status...*')

        if (isMedia) {
            let media = await q.download?.()
            if (!media) throw new Error('Gagal mendownload media.')

            if (isAudio) {
                let audioBuffer = await toPTT(media, 'mp3')
                
                await conn.sendMessage('status@broadcast', {
                    audio: audioBuffer,
                    mimetype: 'audio/ogg; codecs=opus',
                    ptt: true 
                }, { statusJidList: contacts })

            } else if (isImage) {
                await conn.sendMessage('status@broadcast', { 
                    image: media, 
                    caption 
                }, { statusJidList: contacts })

            } else if (isVideo) {
                await conn.sendMessage('status@broadcast', { 
                    video: media, 
                    caption 
                }, { statusJidList: contacts })
            }
        } else {
            await conn.sendMessage('status@broadcast', { 
                text: caption 
            }, { 
                statusJidList: contacts,
                backgroundColor: '#8795A8', 
                font: 1 
            })
        }

        m.reply('Berhasil upload ke status!')

    } catch (e) {
        console.error(e)
        m.reply(`Gagal: ${e.message}`)
    }
}

handler.help = ['upsw']
handler.tags = ['owner']
handler.command = /^(upsw|postsw)$/i
handler.owner = true

export default handler

function toPTT(buffer, ext) {
    return new Promise(async (resolve, reject) => {
        try {
            let tmp = join(tmpdir(), + new Date + '.' + ext)
            let out = tmp + '.opus'
            await promises.writeFile(tmp, buffer)
            
            spawn('ffmpeg', [
                '-y',
                '-i', tmp,
                '-vn',
                '-c:a', 'libopus',
                '-b:a', '128k',
                '-vbr', 'on',
                '-f', 'opus',
                out
            ])
            .on('error', reject)
            .on('close', async (code) => {
                await promises.unlink(tmp)
                if (code !== 0) return reject(new Error('FFMPEG Error'))
                let data = await promises.readFile(out)
                await promises.unlink(out)
                resolve(data)
            })
        } catch (e) {
            reject(e)
        }
    })
}