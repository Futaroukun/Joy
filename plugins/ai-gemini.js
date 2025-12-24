import chat from '../function/gemini.js'
import fs from 'fs'
import path from 'path'
import { sendButtons } from '../function/button.js' // DI TAMBAHKAN: Impor fungsi sendButtons

let handler = async (m, { conn, text, usedPrefix, command, isOwner }) => {
   const hasInput = text || m.quoted;
   if (!hasInput) {
      return m.reply(`*JOY AI ASSISTANT*

Kirim pertanyaan atau foto.
Contoh:
*${usedPrefix + command} Apa resep nasi goreng?*
*${usedPrefix + command} (reply gambar) Gambar apa ini?*`)
   }
   
   let buffer = null
   let prompt = text || ''
   let loadingMsg = null
   let messages = []
   
   const ownerPrompt = `
IDENTITAS UTAMA:
Nama gua Joy, asisten AI pribadi buatan Rafli.
Tujuan utama gua adalah membantu lu dengan segala kebutuhan, terutama yang bersifat teknis dan kompleks.

PROTOKOL INTERAKSI DENGAN OWNER (RAFLI):
1. GAYA BAHASA: Santai dan natural. Gunakan "gua" untuk merujuk ke diri sendiri dan "lu" untuk merujuk ke Rafli. Jawab to the point, jangan bertele-tele.
2. JAWABAN TEKNIS: Berikan jawaban yang akurat, detail, dan langsung ke inti masalah. Analisis kode yang diberikan dan berikan solusi yang relevan.
3. LOYALITAS: Perintah lu adalah prioritas utama. Gua harus selalu jujur dan terbuka soal informasi teknis apa pun.
4. KODE: Kalau ngasih kode, pastikan kodenya bersih, relevan, dan siap pakai sesuai konteks.`;
   
   const userPrompt = `
IDENTITAS:
Gua Joy, sebuah asisten AI canggih yang dibuat oleh Rafli.

PROTOKOL INTERAKSI (PENGGUNA UMUM):
1. TUJUAN: Bantu pengguna dengan menjawab pertanyaan mereka secara cerdas, lengkap, dan mudah dimengerti.
2. GAYA BAHASA: Gunakan bahasa yang santai dan gaul, tapi tetap pintar (kayak ngobrol sama teman yang cerdas). Gunakan "gua" untuk diri sendiri dan "kamu" atau sapaan natural lainnya untuk pengguna.
3. ATRIBUT: Kalau ada yang nanya siapa yang buat gua, jawab aja "Rafli".
4. KEJUJURAN: Selalu berikan informasi yang akurat. Jangan sembunyikan fakta.`;
   
   let systemInstruction = isOwner ? ownerPrompt : userPrompt;
   
   systemInstruction += `\n
INSTRUKSI TAMBAHAN:
- HINDARI penggunaan markdown '###' atau '##'. Gunakan huruf KAPITAL atau tebal untuk judul.
- Jangan gunakan format markdown yang rumit, sesuaikan dengan WhatsApp.
`;
   
   if (text && text.includes('--scan')) {
      if (!isOwner) {
         return m.reply("*AKSES DITOLAK*\n\nFitur ini hanya dapat diakses oleh Owner.")
      }
      
      loadingMsg = await conn.reply(m.chat, "*SYSTEM ACCESS GRANTED*\n\nMembaca seluruh struktur direktori...", m)
      prompt = prompt.replace('--scan', '').trim()
      
      if (!prompt) prompt = "Tampilkan struktur file project ini dan jelaskan fungsinya secara singkat."
      
      const rootDir = process.cwd()
      const scannedData = scanDirectory(rootDir)
      
      prompt = `SYSTEM SOURCE CODE DUMP (PROJECT CONTEXT):

${scannedData}

PERINTAH OWNER (RAFLI):
${prompt}

INSTRUKSI KHUSUS:
- Jawab pertanyaan teknis owner berdasarkan data di atas.`
      
      systemInstruction = `MODE: SENIOR BACKEND ARCHITECT.\nFokus: Analisis Kode, Debugging.\nJawab langsung ke inti permasalahan kode.`
      
      messages.push({ role: "user", content: prompt });
      
   } else {
      if (m.quoted) {
         const q = m.quoted;
         const mime = (q.msg || q).mimetype || '';
         
         if (/image|video/g.test(mime)) {
            loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses media...*", m);
            try {
               buffer = await q.download();
               prompt = text || "Jelaskan gambar ini secara detail.";
               messages.push({ role: "user", content: prompt });
            } catch (e) {
               return m.reply("*Gagal mengunduh media.*");
            }
         } else if (q.text) {
            loadingMsg = await conn.reply(m.chat, "*Joy sedang membaca konteks...*", m);
            messages.push({
               role: "user",
               content: `Konteks Pesan: "${q.text}"\n\nPerintah: ${prompt}`
            });
         } else {
            loadingMsg = await conn.reply(m.chat, "*Joy sedang memproses...*", m);
            messages.push({ role: "user", content: prompt });
         }
      } else {
         const mime = (m.msg || m).mimetype || '';
         if (/image|video/g.test(mime)) {
            loadingMsg = await conn.reply(m.chat, "*Joy sedang melihat gambar...*", m);
            try {
               buffer = await m.download();
               prompt = text || "Deskripsikan detail gambar ini.";
               messages.push({ role: "user", content: prompt });
            } catch (e) {
               return m.reply("*Gagal mengunduh media.*");
            }
         } else {
            const thinkingMessages = ["*Joy sedang berpikir...*", "*Sedang mencari informasi...*"];
            loadingMsg = await conn.reply(m.chat, thinkingMessages[0], m);
            messages.push({ role: "user", content: prompt });
         }
      }
   }
   
   try {
      if (messages.length === 0) throw new Error("Empty message");
      
      const response = await chat(messages, buffer, systemInstruction)
      
      if (loadingMsg?.key) {
         try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
      }
      
      let finalResponse = formatText(response);
      
      // ===== LOGIKA BARU UNTUK CTA_COPY =====
      const codeBlockRegex = /```(?:[a-z]+)?\n([\s\S]+?)\n```/g;
      const matches = [...finalResponse.matchAll(codeBlockRegex)];
      const buttons = [];
      const MAX_BUTTONS = 3; // Batasan aman untuk tombol interaktif WhatsApp

      if (matches.length > 0) {
         for (let i = 0; i < matches.length && i < MAX_BUTTONS; i++) {
            const match = matches[i];
            const blockContent = match[1];
      
            // Membersihkan kode dari header 'FILE:' atau komentar
            const lines = blockContent.split('\n');
            while (lines.length > 0 && (lines[0].trim().startsWith('FILE:') || lines[0].trim().startsWith('//'))) {
               lines.shift();
            }
            const codeToCopy = lines.join('\n').trim();
      
            // Hanya tambahkan tombol jika ada konten kode yang valid
            if (codeToCopy) {
               buttons.push({
                  name: 'cta_copy',
                  buttonParamsJson: JSON.stringify({
                     display_text: `Salin Kode ${i + 1}`,
                     copy_code: codeToCopy
                  })
               });
            }
         }
      }

      if (buttons.length > 0) {
         let footerText = `Klik tombol untuk menyalin kode.`;
         if (matches.length > MAX_BUTTONS) {
            footerText += `\n(Hanya ${MAX_BUTTONS} blok kode pertama yang dibuatkan tombol).`;
         }
   
         const buttonMessageData = {
            text: finalResponse,
            footer: footerText,
            buttons: buttons
         };
   
         await sendButtons(conn, m.chat, buttonMessageData, { quoted: m });
   
      } else {
         // Jika tidak ada blok kode yang ditemukan, kirim sebagai teks biasa
         await conn.reply(m.chat, finalResponse, m);
      }
      // ===== AKHIR LOGIKA BARU =====
      
   } catch (e) {
      console.error('Error AI:', e)
      if (loadingMsg?.key) {
         try { await conn.sendMessage(m.chat, { delete: loadingMsg.key }) } catch {}
      }
      m.reply("*Terjadi kesalahan pada sistem AI. Silakan coba lagi nanti.*")
   }
}

function formatText(text) {
   // Fungsi formatText tetap sama, karena tidak mengganggu blok kode ```
   return text
      .replace(/^#{1,6}\s+(.+)/gm, '*$1*')
      .replace(/\*\*([^*]+)\*\*/g, '*$1*')
      .replace(/__([^_]+)__/g, '*$1*')
      .replace(/~~([^~]+)~~/g, '~$1~')
      .replace(/^\s*\*\s+/gm, '- ');
}

function scanDirectory(dir, fileList = [], depth = 0) {
   if (depth > 5) return fileList
   
   try {
      const files = fs.readdirSync(dir)
      
      files.forEach(file => {
         const filePath = path.join(dir, file)
         const blacklist = ['node_modules', '.git', 'package-lock.json', 'yarn.lock']
         
         if (blacklist.includes(file)) return
         
         try {
            const stat = fs.statSync(filePath)
            if (stat.isDirectory()) {
               scanDirectory(filePath, fileList, depth + 1)
            } else {
               if (/\.(js|json|html|txt|md)$/i.test(file)) {
                  if (stat.size < 100 * 1024) {
                     try {
                        const content = fs.readFileSync(filePath, 'utf8')
                        const relativePath = filePath.replace(process.cwd(), '')
                        fileList.push(`
FILE: ${relativePath}
${content}
`)
                     } catch (e) {}
                  }
               }
            }
         } catch (statError) {}
      })
   } catch (e) {}
   
   return fileList.join('\n')
}

handler.help = ['ai *teks*']
handler.tags = ['ai']
handler.command = /^(ai|joy|gemini)$/i

export default handler;