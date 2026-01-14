import { deepseek } from '../function/deepseek.js';
import fs from 'fs';
import path from 'path';

const CONFIG = {
   sessionTimeout: 86400000,
   maxFileSize: 10 * 1024 * 1024,
   defaultAccount: { 
      email: "raflisetiawan093@gmail.com",
      password: "apin123-"
   }
};

const userSessions = new Map();

async function getUserSession(userId) {
   const now = Date.now();
   const existing = userSessions.get(userId);
   
   if (existing && (now - existing.timestamp) < CONFIG.sessionTimeout) {
      return existing;
   }
   
   try {
      const account = CONFIG.defaultAccount;
      const auth = await deepseek.login(account.email, account.password);
      if (!auth) throw new Error('Login failed');
      
      const sessionId = await deepseek.createSession(auth.token);
      if (!sessionId) throw new Error('Gagal buat sesi');
      
      const session = {
         token: auth.token,
         sessionId: sessionId,
         timestamp: now,
         user: auth.user,
         accountEmail: account.email
      };
      
      userSessions.set(userId, session);
      return session;
   } catch (error) {
      console.error(error.message);
      return null;
   }
}

function resetUserSession(userId) {
   userSessions.delete(userId);
}

function convertMarkdownToWhatsApp(text) {
   text = text.replace(/\*\*(.+?)\*\*/g, '*$1*');
   text = text.replace(/^###\s+(.+)$/gm, '*$1*');
   text = text.replace(/\[citation:\d+\]/g, '');
   return text;
}

const handler = async (m, { conn, text, command, usedPrefix }) => {
   if (command === 'dsreset') {
      try {
         resetUserSession(m.sender);
         await m.reply('*Sesi berhasil direset. Sesi baru bakal dibuat pas kamu pake perintah ds lagi.*');
         return;
      } catch (error) {
         await m.reply('*Gagal reset sesi. Coba lagi ya.*');
         return;
      }
   }
   
   if (!text) {
      const helpText = `*DEEPSEEK AI*\n\nAI buat jawab pertanyaan, analisis dokumen, atau cari info di web.\n\n*Cara Pakai:*\n• \`${usedPrefix + command}\` *pertanyaan*\n• \`${usedPrefix + command}\` *think pertanyaan*\n• \`${usedPrefix + command}\` *search pertanyaan*\n\n*Contoh:*\n• \`${usedPrefix + command}\` *Apa itu coding?*\n\n*Analisis Dokumen:*\nReply file atau gambar terus ketik \`${usedPrefix + command}\` *analisis ini*.\n\n*Command Lain:*\n• \`${usedPrefix}dsreset\` *buat reset sesi.*`;
      return m.reply(helpText);
   }
   
   let mode = 'normal';
   let prompt = text;
   let loadingText = '*Bentar ya, lagi diproses...*';

   if (text.toLowerCase().startsWith('think ')) {
      mode = 'think';
      prompt = text.substring(6).trim();
      loadingText = '*Lagi mikir keras... Bentar ya, butuh waktu lebih buat mikirin ini.*';
   } else if (text.toLowerCase().startsWith('search ')) {
      mode = 'search';
      prompt = text.substring(7).trim();
      loadingText = '*Lagi nyari info di internet... Tunggu bentar ya.*';
   }
   
   await m.reply(loadingText);
   
   try {
      const session = await getUserSession(m.sender);
      if (!session) return m.reply('*Gagal buat sesi. Coba ketik dsreset dulu terus ulangi.*');
      
      let fileIds = [];
      if (m.quoted) {
         const quotedMsg = m.quoted;
         const mediaTypes = ['document', 'image', 'video', 'audio'];
         for (const type of mediaTypes) {
            if (quotedMsg[type] || quotedMsg.msg?.[type + 'Message']) {
               await m.reply('*Lagi upload filenya...*');
               try {
                  const media = await quotedMsg.download();
                  if (!media) throw new Error('Gagal download media');
                  if (media.length > CONFIG.maxFileSize) return m.reply('*Filenya kegedean. Maksimal 10MB aja.*');
                  
                  const tempDir = path.join(process.cwd(), 'tmp');
                  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
                  
                  const fileName = `ds_${m.sender.split('@')[0]}_${Date.now()}`;
                  const ext = quotedMsg.mimetype?.split('/')[1] || 'bin';
                  const tempPath = path.join(tempDir, `${fileName}.${ext}`);
                  
                  fs.writeFileSync(tempPath, media);
                  const fileId = await deepseek.upload(session.token, tempPath);
                  fs.unlinkSync(tempPath);
                  
                  if (!fileId) throw new Error('Gagal upload');
                  fileIds.push(fileId);
                  await m.reply('*Upload sukses. Lagi dianalisis...*');
                  if (mode === 'search') mode = 'normal';
               } catch (error) {
                  return m.reply(`*Upload gagal:* ${error.message}`);
               }
               break;
            }
         }
      }
      
      const options = {
         stream: false,
         thinkingEnabled: mode === 'think',
         searchEnabled: mode === 'search',
         fileIds: fileIds
      };
      
      const result = await deepseek.chat(session.token, session.sessionId, prompt, options);
      if (!result || result.status === 'error') throw new Error(result?.message || 'Gak ada respon');
      
      let response = '*DEEPSEEK AI*\n\n';
      
      if (result.thinking && result.thinking.length > 0) {
         const thinkingText = convertMarkdownToWhatsApp(result.thinking);
         response += `*Proses Berpikir:*\n${thinkingText}\n\n`;
      }
      
      const formattedResponse = convertMarkdownToWhatsApp(result.response);
      response += `*Jawaban:*\n${formattedResponse}`;

      if (result.search_results && result.search_results.length > 0) {
         response += `\n\n*Sumber:*\n`;
         result.search_results.slice(0, 3).forEach((res, idx) => {
            response += `${idx + 1}. ${res.title}\n`;
            if (res.url) response += `   ${res.url}\n`;
         });
      }
      
      await m.reply(response);
      
   } catch (error) {
      console.error(error);
      let errorMsg = '*Terjadi kesalahan!*\n\n';
      if (error.message.includes('Login failed') || error.message.includes('session')) {
         errorMsg += 'Sesi bermasalah. Coba reset pake dsreset.';
      } else {
         errorMsg += error.message;
      }
      await m.reply(errorMsg);
   }
};

handler.help = ['deepseek *teks*'];
handler.tags = ['ai'];
handler.command = /^(deepseek|ds|dsreset)$/i;

export default handler;