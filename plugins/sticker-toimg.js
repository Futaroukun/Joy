import fetch from 'node-fetch';
import FormData from 'form-data';
import { JSDOM } from 'jsdom';

let handler = async (m, { conn, usedPrefix, command }) => {
   if (!m.quoted) return m.reply(`Balas stikernya terus ketik \`${usedPrefix + command}\``);
   
   let q = m.quoted ? m.quoted : m;
   let mime = q.mimetype || '';
   
   if (!/webp/.test(mime)) return m.reply(`Itu bukan stiker, balas stiker pake perintah \`${usedPrefix + command}\``);
   
   m.reply('*Tunggu bentar, lagi diproses...*');
   
   try {
      let media = await q.download();
      let out;
      
      if (/video/i.test(mime) || q.isAnimated) {
         out = await webp2mp4(media);
         await conn.sendMessage(m.chat, {
            video: { url: out },
            caption: '*Berhasil diubah ke video*',
            mimetype: 'video/mp4'
         }, { quoted: m });
      } else {
         out = await webp2png(media);
         await conn.sendMessage(m.chat, {
            image: { url: out },
            caption: '*Berhasil diubah ke gambar*'
         }, { quoted: m });
      }
   } catch (e) {
      console.error(e);
      m.reply('*Gagal konversi. Mungkin servernya lagi sibuk atau stikernya error.*');
   }
};

handler.help = ['toimg', 'tovideo'];
handler.tags = ['sticker'];
handler.command = /^(toimg|tovid|tovideo)$/i;

export default handler;

async function webp2mp4(source) {
   let form = new FormData();
   let isUrl = typeof source === 'string' && /https?:\/\//.test(source);
   form.append('new-image-url', isUrl ? source : '');
   form.append('new-image', isUrl ? '' : source, 'image.webp');
   
   let res = await fetch('https://ezgif.com/webp-to-mp4', {
      method: 'POST',
      body: form
   });
   
   let html = await res.text();
   let { document } = new JSDOM(html).window;
   let form2 = new FormData();
   let obj = {};
   
   for (let input of document.querySelectorAll('form input[name]')) {
      obj[input.name] = input.value;
      form2.append(input.name, input.value);
   }
   
   let res2 = await fetch('https://ezgif.com/webp-to-mp4/' + obj.file, {
      method: 'POST',
      body: form2
   });
   
   let html2 = await res2.text();
   let { document: document2 } = new JSDOM(html2).window;
   return new URL(document2.querySelector('div#output > p.outfile > video > source').src, res2.url).toString();
}

async function webp2png(source) {
   let form = new FormData();
   let isUrl = typeof source === 'string' && /https?:\/\//.test(source);
   form.append('new-image-url', isUrl ? source : '');
   form.append('new-image', isUrl ? '' : source, 'image.webp');
   
   let res = await fetch('https://ezgif.com/webp-to-png', {
      method: 'POST',
      body: form
   });
   
   let html = await res.text();
   let { document } = new JSDOM(html).window;
   let form2 = new FormData();
   let obj = {};
   
   for (let input of document.querySelectorAll('form input[name]')) {
      obj[input.name] = input.value;
      form2.append(input.name, input.value);
   }
   
   let res2 = await fetch('https://ezgif.com/webp-to-png/' + obj.file, {
      method: 'POST',
      body: form2
   });
   
   let html2 = await res2.text();
   let { document: document2 } = new JSDOM(html2).window;
   return new URL(document2.querySelector('div#output > p.outfile > img').src, res2.url).toString();
}