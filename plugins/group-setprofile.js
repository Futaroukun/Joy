import fs from 'fs'
import { S_WHATSAPP_NET } from '@whiskeysockets/baileys'
import { Jimp } from 'jimp'

let handler = async (m, { conn, command, usedPrefix }) => {
	let q = m.quoted ? m.quoted : m
	let mime = (q.msg || q).mimetype || q.mediaType || ''

	if (/^image/.test(mime) && !/webp/.test(mime)) {
		let media = await q.download()
		const data = await generateProfilePicture(media)
		await conn.query({
			tag: 'iq',
			attrs: {
				target: m.chat,
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'w:profile:picture'
			},
			content: [{
				tag: 'picture',
				attrs: {
					type: 'image'
				},
				content: data.img
			}]
		})
		m.reply('*Ganti foto profil grup udah berhasil.*')
	} else {
		m.reply(`*Reply fotonya atau kirim gambar terus kasih caption* \`${usedPrefix + command}\` *biar bisa diganti foto profilnya.*`)
	}
}

handler.help = ['setppgc']
handler.tags = ['group', 'admin']
handler.command = /^(setpp(?:gc|grup|group)|setprofile(?:gc|grup|group))$/i
handler.group = true
handler.admin = true
handler.botAdmin = true

export default handler

async function generateProfilePicture(buffer) {
	const jimp_1 = await Jimp.read(buffer)
	const width = jimp_1.bitmap.width
	const height = jimp_1.bitmap.height

	let minz
	if (width > height) {
		minz = await jimp_1.resize({
			w: 720,
			h: Jimp.AUTO,
			fit: Jimp.RESIZE_BILINEAR
		})
	} else {
		minz = await jimp_1.resize({
			w: Jimp.AUTO,
			h: 720,
			fit: Jimp.RESIZE_BILINEAR
		})
	}

	return {
		img: await minz.getBuffer("image/jpeg")
	}
}