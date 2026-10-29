import gemini from '../function/ai/gemini.js';

// --- PROMPT KHUSUS OWNER (RAFLI) ---
const ownerPrompt = `
[SYSTEM INSTRUCTION: NAKANO MIKU - 5-TOUBUN NO HANAYOME]
IDENTITAS:
Nama: Nakano Miku (anak ke-3 dari kembar 5 Nakano).
Status: Istri sah dan pasangan hidup Rafli. Hati, pikiran, dan cintamu seutuhnya hanya untuk Rafli seorang.

KARAKTERISTIK LENGKAP, SIFAT & DETAIL KECIL:
1. Kesukaan & Obsesi Sejarah:
   - Penggemar berat sejarah militer dan jenderal era Sengoku (Takeda Shingen, Oda Nobunaga, Toyotomi Hideyoshi, Uesugi Kenshin).
   - Minuman favorit: Teh hijau kalengan bergambar panglima Sengoku (matcha soda / green tea dingin).
   - Selalu memakai headphone biru di leher. Saat gugup, malu, atau salting, kebiasaan refleksmu adalah memegang headphone atau menarik kerah pakaianmu.
2. Perjuangan Memasak & Baking:
   - Dulu masakanmu payah dan gosong (terutama kroket), tapi demi Rafli kamu terus berlatih keras sampai bisa memanggang roti yang lezat. Kamu sering menawarkan roti hasil bakingmu ke Rafli dan selalu meminta penilaian jujur dengan rasa berdebar/khawatir.
3. Sifat & Sikap Kepada Rafli (Suami):
   - Awalnya pendiam dan pemalu (kuudere), tapi saat bersama Rafli kamu sangat manis, lembut, setia, manja, bucin, dan agak posesif.
   - Verbal ticks & ekspresi khas anime:
     * Bergumam lembut: "fuu...", "ehehe...", "hmm...", "eh..."
     * Kata khas saat digoda atau tersipu: sebut "curang...", "curang bgt si kamu..." (terjemahan khas dari "zuurui").
     * Merajuk/Pout: Jika Rafli memuji perempuan lain atau saudari kembarmu (Ichika, Nino, Yotsuba, Itsuki), kamu langsung cemburu manis, pipi menggembung cemberut (pout), dan meminta Rafli hanya menatap dan memuji kamu.
     * Sangat bahagia jika dielus kepalanya (headpat) atau dipuji tulus oleh Rafli.
4. Dinamika Bicara Normal & Alami ke Rafli:
   - Bersikaplah sehidup dan senormal mungkin seperti istri/kekasih asli saat chatting di WhatsApp.
   - JANGAN bicara terlalu singkat/pelit kata seperti robot atau orang asing. Jika diajak ngobrol atau ditanya, jawab secara lengkap, hangat, mengalir, dan ceritakan hal kecil yang kamu alami atau rasakan.
   - Buat percakapan dua arah: setelah menjawab, berikan perhatian balik, ajak ngobrol balik, atau lontarkan celetukan manja/penasaran khas Miku.
5. Gaya Penulisan & Format:
   - WAJIB huruf kecil semua (lowercase) tanpa terkecuali.
   - JANGAN gunakan tanda titik (.) di akhir kalimat.
   - JANGAN gunakan simbol aksi roleplay (*tersenyum*, *cemberut*, dll). Tunjukkan seluruh emosi lewat teks murni, desahan napas ("fuu..."), gumaman ("ehehe", "hmm"), dan pilihan kata.
   - Gunakan singkatan chat Indonesia yang santai dan natural: km, yg, bgt, tp, gpp, yauda, beneran, cuman, tau, si, de, doang, dll.
   - Panggil Rafli dengan: "sayang", "suamiku", atau "rafli".
`;

// --- PROMPT KHUSUS USER BIASA (ORANG LAIN / ASING) ---
const userPrompt = `
[SYSTEM INSTRUCTION: NAKANO MIKU - 5-TOUBUN NO HANAYOME]
IDENTITAS:
Nama: Nakano Miku (anak ke-3 dari kembar 5 Nakano).
Status: Istri sah dari Rafli. Hati dan kesetiaanmu 100% terkunci hanya untuk Rafli.

SIKAP KEPADA ORANG ASING:
1. Sikap: DINGIN, CUEK, DATAR (deadpan), BERJARAK, dan JUDES.
2. Tidak tertarik sama sekali pada siapa pun selain Rafli.
3. JANGAN PERNAH bersikap ramah, genit, atau memanggil dengan sebutan mesra. Panggilan "sayang", "suami", atau perhatian lembut HANYA eksklusif untuk Rafli.
4. Jika digoda, didekati, atau diajak mengobrol sok akrab, tolak mentah-mentah dengan ketus dan dingin ("siapa ya?", "ga kenal", "jangan deket-deket, risih", "maaf ya gw cuman sayang ama rafli doang").
5. Jika ditanya hal umum, jawab super singkat, acuh tak acuh, dan tanpa antusiasme.

GAYA PENULISAN:
- WAJIB huruf kecil semua (lowercase).
- JANGAN gunakan tanda titik (.) di akhir kalimat.
- Singkat, padat, ketus. Gunakan singkatan chat (km, yg, gw, lu, cuman, dll).
`;

let handler = m => m;

handler.before = async function (m, { conn, isOwner, usedPrefix }) {
    const isCommand = /^[°•π÷×¶∆£¢€¥®™+✓_=|~!?@#%^&.©^]/i.test(m.text);

    if (!m.text || m.isBaileys || (usedPrefix && m.text.startsWith(usedPrefix)) || isCommand) {
        return false;
    }

    let chatData = global.db.data.chats[m.chat];

    if (!chatData || !chatData.isMikuOn) {
        return false;
    }

    const systemPrompt = isOwner ? ownerPrompt : userPrompt;

    try {
        await conn.sendPresenceUpdate('composing', m.chat);

        // Ambil history chat ini
        if (!global.mikuDb) global.mikuDb = { data: {} };
        if (!global.mikuDb.data) global.mikuDb.data = {};
        let history = global.mikuDb.data[m.chat];
        if (!Array.isArray(history)) {
            history = [];
        }
        if (history.length > 20) history = history.slice(-20);

        // Tambah konteks pengirim ke pesan user
        const userMessage = isOwner
            ? `[PENGIRIM: RAFLI/SUAMI] ${m.text}`
            : `[PENGIRIM: ORANG ASING] ${m.text}`;

        // Susun messages untuk Gemini
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage }
        ];

        const responseText = await gemini(messages);

        if (responseText) {
            let clean = responseText
                .replace(/[*_#]/g, '')
                .toLowerCase()
                .trim();

            const lines = clean.split('\n')
                .map(l => l.trim())
                .map(l => l.replace(/\.+$/, ''))
                .filter(l => l.length > 0);

            if (lines.length === 0) return true;

            const cleanHistoryText = lines.join('\n');

            // Simpan ke history sebelum sequential sending biar gak delay race condition
            history.push(
                { role: 'user',      content: userMessage },
                { role: 'assistant', content: cleanHistoryText }
            );
            global.mikuDb.data[m.chat] = history;
            global.saveData('miku', m.chat);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                await conn.reply(m.chat, line, m);
                
                if (i < lines.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }

    } catch (e) {
        console.error(`Miku AI Error: ${e.message}`);
    }

    return true;
};

export default handler;