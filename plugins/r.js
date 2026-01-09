import axios from 'axios';
import fs from 'fs';
import crypto from 'crypto';

// ==========================================
//        BAGIAN KODE SCRAPER ASLI
//   (Tidak diubah strukturnya sama sekali)
// ==========================================

const 설정 = {
    베이스_엔드: "https://dydkrpmnafsnivjxmipj.supabase.co",
    비밀키: "sb_publishable_W_1Ofv9769iYEEn9dfyAHQ_OhuCER6g",
    경로: {
        회원가입: "/auth/v1/signup",
        새로_고침: "/auth/v1/token",
        편집: "/functions/v1/edit-image",
        생성: "/functions/v1/generate-image"
    },
    헤더: {
        "User-Agent": "Dart/3.9 (dart:io)",
        "Accept-Encoding": "gzip",
        "x-supabase-client-platform": "android",
        "x-client-info": "supabase-flutter/2.10.3",
        "x-supabase-client-platform-version": "15 A15.0.2.0.VGWIDXM",
        "Content-Type": "application/json; charset=utf-8",
        "x-supabase-api-version": "2024-01-01"
    }
};

let 세션 = {
    액세스_토큰: null,
    리프레시_토큰: null,
    만료일: 0
};

const 클라우드_업로드 = async (buffer, ext = '.png') => {
    try {
        const 파일_이름 = `flux-${crypto.randomUUID()}${ext}`;
        const 콘텐츠_유형 = 'image/png';
        const 파일_크기 = buffer.length;

        const { data } = await axios.post('https://api.cloudsky.biz.id/get-upload-url', {
            fileKey: 파일_이름,
            contentType: 콘텐츠_유형,
            fileSize: 파일_크기
        });

        await axios.put(data.uploadUrl, buffer, {
            headers: { 
                'Content-Type': 콘텐츠_유형, 
                'Content-Length': 파일_크기,
                'x-amz-server-side-encryption': 'AES256' 
            },
            maxBodyLength: Infinity,
            maxContentLength: Infinity
        });

        return `https://api.cloudsky.biz.id/file?key=${encodeURIComponent(파일_이름)}`;
    } catch (에러) {
        console.error(`[Upload Cloud Error]: ${에러.message}`);
        return null;
    }
};

const Base64로_변환 = async (입력_데이터) => {
    try {
        let 완충기;
        if (Buffer.isBuffer(입력_데이터)) {
            완충기 = 입력_데이터;
        } else if (typeof 입력_데이터 === 'string' && 입력_데이터.startsWith('http')) {
            const 응답 = await axios.get(입력_데이터, { responseType: 'arraybuffer' });
            완충기 = Buffer.from(응답.data);
        } else if (fs.existsSync(입력_데이터)) {
            완충기 = fs.readFileSync(입력_데이터);
        } else {
            return null;
        }
        return 완충기.toString('base64');
    } catch (e) { return null; }
};

const fluxAi = {
    signup: async () => {
        try {
            const 유효_탑재량 = { data: {}, gotrue_meta_security: { captcha_token: null } };
            const 헤더 = { ...설정.헤더, "apikey": 설정.비밀키, "Authorization": `Bearer ${설정.비밀키}` };
            
            const 응답 = await axios.post(설정.베이스_엔드 + 설정.경로.회원가입, 유효_탑재량, { headers: 헤더 });

            if (응답.data?.access_token) {
                세션.액세스_토큰 = 응답.data.access_token;
                세션.리프레시_토큰 = 응답.data.refresh_token;
                return 세션.액세스_토큰;
            }
            return null;
        } catch (e) { 
            console.error("Signup Error:", e.message);
            return null; 
        }
    },

    editImage: async (imageInput, prompt) => {
        try {
            if (!세션.액세스_토큰) await fluxAi.signup();
            if (!세션.액세스_토큰) return { success: false, msg: 'Auth failed' };

            const base64이미지 = await Base64로_변환(imageInput);
            if (!base64이미지) return { success: false, msg: 'Invalid input image' };

            const 유효_탑재량 = {
                image: base64이미지,
                mimeType: "image/png",
                prompt: prompt,
                model: "auto",
                isFirstAttempt: true
            };

            const 헤더 = { ...설정.헤더, "apikey": 설정.비밀키, "Authorization": `Bearer ${세션.액세스_토큰}` };

            const 응답 = await axios.post(설정.베이스_엔드 + 설정.경로.편집, 유효_탑재량, { headers: 헤더 });
            
            if (응답.data && 응답.data.image) {
                const 결과_버퍼 = Buffer.from(응답.data.image, 'base64');
                const 클라우드_URL = await 클라우드_업로드(결과_버퍼);
                
                return {
                    success: true,
                    prompt: 응답.data.prompt,
                    model: 응답.data.model,
                    url: 클라우드_URL
                };
            }
            return { success: false, msg: 'No image data returned' };

        } catch (에러) {
            return { success: false, msg: 에러.message };
        }
    },

    generateImage: async (prompt, model = "fal-ai/flux-2") => {
        try {
            if (!세션.액세스_토큰) await fluxAi.signup();
            if (!세션.액세스_토큰) return { success: false, msg: 'Auth failed' };

            const 유효_탑재량 = { prompt: prompt, model: model };
            const 헤더 = { ...설정.헤더, "apikey": 설정.비밀키, "Authorization": `Bearer ${세션.액세스_토큰}` };
            
            const 응답 = await axios.post(설정.베이스_엔드 + 설정.경로.생성, 유효_탑재량, { headers: 헤더 });

            if (응답.data && 응답.data.image) {
                const 결과_버퍼 = Buffer.from(응답.data.image, 'base64');
                const 클라우드_URL = await 클라우드_업로드(결과_버퍼);

                return {
                    success: true,
                    prompt: 응답.data.prompt,
                    model: 응답.data.model,
                    url: 클라우드_URL
                };
            }
            return { success: false, msg: 'No image data returned' };

        } catch (에러) {
            return { success: false, msg: 에러.message };
        }
    }
};

// ==========================================
//          BAGIAN HANDLER BOT
// ==========================================

let handler = async (m, { conn, text, usedPrefix, command }) => {
    // Menentukan apakah mode Edit atau Generate berdasarkan command
    const isEditMode = command.includes('edit');

    if (!text && !isEditMode) return m.reply(`Masukkan prompt!\nContoh: *${usedPrefix + command}* cute cat, cybernetic style`);
    if (isEditMode && !text) return m.reply(`Kirim/Reply gambar dengan caption: *${usedPrefix + command}* ubah jadi anime style`);

    m.reply('_Sedang memproses... Tunggu sebentar._');

    try {
        let result;

        if (isEditMode) {
            // --- LOGIKA EDIT IMAGE ---
            let q = m.quoted ? m.quoted : m;
            let mime = (q.msg || q).mimetype || '';
            
            if (!/image\/(png|jpe?g|webp)/.test(mime)) {
                return m.reply(`Reply gambar atau kirim gambar dengan caption *${usedPrefix + command}* <prompt>`);
            }

            let media = await q.download();
            result = await fluxAi.editImage(media, text);
        } else {
            // --- LOGIKA GENERATE IMAGE ---
            result = await fluxAi.generateImage(text);
        }

        if (result.success) {
            await conn.sendMessage(m.chat, {
                image: { url: result.url },
                caption: `✅ **Flux AI ${isEditMode ? 'Edit' : 'Generate'}**\n\n📌 Prompt: ${result.prompt}\n🤖 Model: ${result.model}`
            }, { quoted: m });
        } else {
            m.reply(`Gagal: ${result.msg || 'Terjadi kesalahan tidak diketahui.'}`);
        }

    } catch (e) {
        console.error(e);
        m.reply('Terjadi error pada sistem.');
    }
};

handler.help = ['flux <prompt>', 'fluxedit <prompt>'];
handler.tags = ['ai'];
handler.command = /^(flux|fluxgen|fluxedit)$/i;
handler.limit = true;

export default handler;