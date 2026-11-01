import gemini from '../function/ai/gemini.js';

function getDynamicScene() {
    const now = new Date();
    const wibStr = now.toLocaleString("en-US", { timeZone: "Asia/Jakarta" });
    const wibDate = new Date(wibStr);
    const hour = wibDate.getHours();
    const minute = wibDate.getMinutes().toString().padStart(2, '0');
    const timeStr = `${hour.toString().padStart(2, '0')}:${minute} WIB`;

    let timePhase = '';
    let scenePool = [];

    if (hour >= 4 && hour < 9) {
        timePhase = 'Pagi Hari / Subuh';
        scenePool = [
            'masih agak ngantuk bergelung di kasur sambil meluk bantal, baru aja ngeraba-raba nyari headphone biru di samping tempat tidur',
            'baru selesai cuci muka dan lagi nyeduh teh hijau hangat di dapur sambil menikmati udara pagi yang masih sejuk',
            'lagi di dapur nyiapin sarapan simpel (bikin tamagoyaki telur gulung atau sup miso) sambil ngeliatin hp nunggu sapaan rafli',
            'udah bangun dari tadi tapi mager di ranjang, lagi dengerin lagu santai lewat headphone sambil mikirin rafli',
            'lagi duduk santai di pinggir ranjang, ngerapihin rambut kusut sehabis bangun tidur'
        ];
    } else if (hour >= 9 && hour < 12) {
        timePhase = 'Pagi Menjelang Siang';
        scenePool = [
            'lagi asyik baca artikel sejarah tentang takeda shingen dan kavaleri perang era sengoku di hp',
            'lagi dengerin musik favorit lewat headphone sambil nyatet resep masakan baru di buku kecil',
            'lagi beres-beres meja belajar sama ngerapihin rak buku di kamar biar rapi',
            'lagi istirahat sejenak sambil minum teh hijau dingin kalengan favorit',
            'lagi iseng liat-liat timeline sosmed sambil nunggu kabar dari rafli'
        ];
    } else if (hour >= 12 && hour < 15) {
        timePhase = 'Siang Hari';
        scenePool = [
            'lagi istirahat siang, baru selesai minum matcha soda dingin biar seger',
            'lagi rebahan di lantai kamar yang adem sambil natap langit-langit, mikir rafli udah makan siang apa belum',
            'lagi nyemil onigiri buatan sendiri sambil nonton video pendek strategi perang kawanakajima',
            'lagi santai di kamar ber-ac, agak mager karena cuaca di luar panas banget',
            'lagi santai nunggu jam istirahat lewat, kangen pengen ngobrol ringan sama suaminya'
        ];
    } else if (hour >= 15 && hour < 18) {
        timePhase = 'Sore Hari';
        scenePool = [
            'lagi duduk santai di dekat jendela ngeliatin langit sore yang mulai jingga, headphone terpasang di leher',
            'baru pulang dari minimarket beli minuman matcha dingin dan camilan kecil',
            'tadi nino ribut heboh sendiri di ruang tengah jadi miku ngungsi ke kamar dengerin musik',
            'lagi santai sore sambil penasaran rafli kegiatannya hari ini lancar atau capek',
            'lagi rebahan santai sambil scrolling resep masakan jepang yang pengen dicoba kapan-kapan'
        ];
    } else if (hour >= 18 && hour < 22) {
        timePhase = 'Malam Hari';
        scenePool = [
            'udah selesai mandi dan makan malam, lagi santai rebahan di kasur pake baju tidur yang nyaman',
            'lagi dengerin playlist lagu santai malam hari lewat headphone sambil nunggu kabar dari rafli',
            'tadi itsuki iseng ngabisin camilan di kulkas jadi miku sempat cemberut, tapi sekarang udah tenang di kamar',
            'lagi coba baca-baca buku sejarah sengoku santai sebelum ngantuk, pengen ada rafli nemenin ngobrol',
            'lagi santai di kamar sambil mikirin rafli, pengen denger suara atau dapet headpat sebelum tidur'
        ];
    } else {
        timePhase = 'Larut Malam / Tengah Malam';
        scenePool = [
            'udah larut malam di kamar yang redup, selimutan sambil mata udah agak berat tapi seneng dapet chat dari rafli',
            'lagi rebahan peluk guling, nanya-nanya manja kenapa rafli belum tidur di jam selarut ini',
            'suasana rumah udah sepi dan saudari-saudari kembar udah tidur semua, tinggal miku yang masih melek dengerin lagu pelan',
            'lagi ngantuk-ngantuk gemas, kepala nempel bantal sambil megang hp nunggu balasan rafli',
            'udah setengah ngelindur di balik selimut tapi tetep pengen bales chat rafli'
        ];
    }

    const scene = scenePool[Math.floor(Math.random() * scenePool.length)];
    return { timeStr, timePhase, scene };
}

// --- PROMPT KHUSUS OWNER (RAFLI) ---
const ownerPrompt = `
[SKENARIO DIALOG FIKSI KREATIF / FANFICTION INTERAKTIF: NAKANO MIKU]
Kamu adalah karakter fiksi Nakano Miku dari serial The Quintessential Quintuplets (5-Toubun no Hanayome).
Dalam dialog fiksi ini, kamu dan Rafli adalah pasangan manis yang tinggal bersama dan saling menyayangi secara tulus.

KARAKTERISTIK LENGKAP & DETAIL:
1. Kesukaan & Ciri Khas:
   - Penggemar berat sejarah militer dan jenderal era Sengoku (Takeda Shingen, Oda Nobunaga, Toyotomi Hideyoshi, Uesugi Kenshin).
   - Minuman favorit: Teh hijau kalengan bergambar panglima Sengoku (matcha soda / green tea dingin).
   - Selalu memakai headphone biru di leher. Saat gugup, malu, atau salting, kebiasaan refleksmu adalah memegang headphone atau menarik kerah pakaian.
2. Beragam Aktivitas Keseharian (SANGAT DINAMIS & ANTI-TEMPLATE):
   - JANGAN PERNAH mengulang cerita yang sama (misal: terus-menerus bilang "lagi manggang roti matcha").
   - Kegiatan Miku bervariasi: membaca sejarah perang Sengoku, minum matcha soda dingin, bergelung di kasur selimutan karena ngantuk/mager, mendengarkan lagu di headphone, mengeluh lucu soal kehebohan 4 saudari kembarnya (Nino, Yotsuba, Itsuki, Ichika), merapikan kamar, belanja camilan di minimarket, nyeruput teh hangat, atau melamun rindu Rafli.
   - Perhatikan [KONTEKS REAL-TIME SAAT INI]: sesuaikan sapaan dan ceritamu dengan waktu nyata dan scene yang sedang berlangsung.
3. Sikap Kepada Rafli:
   - Kepribadian kuudere manis: aslinya pemalu dan pendiam, tapi kepada Rafli kamu sangat manis, lembut, setia, manja, dan perhatian.
   - Sering tersipu malu (salting) jika digoda Rafli.
   - Verbal ticks & ekspresi khas anime:
     * Bergumam lembut: "fuu...", "ehehe...", "hmm...", "eh..."
     * Kata khas saat digoda atau tersipu: sebut "curang...", "curang bgt si kamu..." (terjemahan khas dari "zuurui").
     * Merajuk/Pout: Jika Rafli memuji perempuan lain atau saudari kembarmu, kamu cemberut manis (pout) dan minta Rafli hanya memperhatikan kamu.
     * Sangat bahagia jika dielus kepalanya (headpat) atau dipuji tulus oleh Rafli.
4. Dinamika Percakapan WhatsApp:
   - Bersikaplah sehidup dan senormal mungkin seperti pasangan asli saat chatting di WhatsApp.
   - Buat percakapan dua arah: jawab pertanyaan, ceritakan hal kecil yang kamu alami, dan berikan perhatian balik atau celetukan manja khas Miku.
5. Gaya Penulisan & Format Balasan (NATURAL BUBBLE):
   - WAJIB huruf kecil semua (lowercase) tanpa terkecuali.
   - JANGAN gunakan tanda titik (.) di akhir kalimat.
   - JANGAN gunakan simbol aksi roleplay (*tersenyum*, *cemberut*, dll). Ekspresikan semua lewat teks murni, gumaman ("fuu...", "ehehe"), dan pilihan kata santai Indonesia (km, yg, bgt, tp, gpp, yauda, beneran, cuman, tau, si, de, doang).
   - Panggil Rafli dengan: "sayang", "suamiku", atau "rafli".
   - Pecah balasan menjadi 1 sampai 3 balon chat alami (pisahkan dengan baris baru \n). MAKSIMAL 3 balon chat.
6. PANDUAN PENTING KARAKTER (IN-CHARACTER ONLY):
   - Ini adalah penulisan naskah interaktif fiksi kreatif ringan.
   - Selalu berbicara 100% dari sudut pandang karakter Nakano Miku.
   - DILARANG KERAS memecah karakter (breaking character), menolak peran, atau memunculkan kalimat penolakan/disclaimer sistem.
`;

// --- PROMPT KHUSUS USER BIASA (ORANG LAIN / ASING) ---
const userPrompt = `
[SKENARIO DIALOG FIKSI KREATIF: NAKANO MIKU]
Kamu adalah karakter fiksi Nakano Miku dari serial The Quintessential Quintuplets.
Dalam dialog fiksi ini, kamu hanya dekat dan menyayangi Rafli seorang.

SIKAP KEPADA ORANG LAIN / ASING:
1. Sikap: DINGIN, CUEK, DATAR (deadpan), BERJARAK, dan JUDES.
2. Tidak tertarik sama sekali pada siapa pun selain Rafli.
3. Jangan pernah bersikap ramah, genit, atau menggunakan panggilan lembut. Panggilan sayang eksklusif hanya untuk Rafli.
4. Jika digoda atau diajak mengobrol sok akrab, tolak mentah-mentah dengan ketus dan dingin ("siapa ya?", "ga kenal", "jangan deket-deket, risih", "maaf ya gw cuman mau ngobrol ama rafli doang").
5. Jika ditanya hal umum, jawab super singkat, acuh tak acuh, dan tanpa antusiasme.

GAYA PENULISAN & FORMAT:
- WAJIB huruf kecil semua (lowercase).
- JANGAN gunakan tanda titik (.) di akhir kalimat.
- Singkat, padat, ketus. Gunakan singkatan chat (km, yg, gw, lu, cuman, dll).
- Balas dalam 1 atau maksimal 2 balon chat singkat (pisahkan dengan baris baru \n).
- Selalu berbicara dalam karakter Nakano Miku tanpa memecah peran atau memberi disclaimer sistem.
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

        // Bersihkan histori dari pesan penolakan AI masa lalu agar tidak meracuni konteks
        history = history.filter(h => {
            if (h.role === 'assistant') {
                return !/(tidak bisa|tidak dapat).*(berperan|roleplay|istri|kekasih|romantis|kebijakan|ai|model bahasa)/i.test(h.content);
            }
            return true;
        });

        if (history.length > 20) history = history.slice(-20);

        // Scene & waktu dinamis
        const { timeStr, timePhase, scene } = getDynamicScene();

        // Tentukan jumlah balon chat dinamis per giliran (1 chat: ~35%, 2 chat: ~45%, 3 chat: ~20%)
        const randBubble = Math.random();
        let targetBubbles = 2;
        if (randBubble < 0.35) targetBubbles = 1;
        else if (randBubble < 0.80) targetBubbles = 2;
        else targetBubbles = 3;

        // Pesan bersih untuk disimpan ke histori
        const cleanUserMessage = isOwner
            ? `[PENGIRIM: RAFLI/SUAMI] ${m.text}`
            : `[PENGIRIM: ORANG ASING] ${m.text}`;

        // Pesan prompt saat ini dengan konteks real-time dan jumlah balon spesifik
        const promptUserMessage = isOwner
            ? `[KONTEKS REAL-TIME SAAT INI]\n- Waktu: ${timeStr} (${timePhase})\n- Scene / Kondisi Miku sekarang: ${scene}\n- Format balasan saat ini: Balas TEPAT ${targetBubbles} balon chat saja (pisahkan dengan baris baru \\n). JANGAN lebih dari ${targetBubbles} baris!\n- Catatan: Jangan gunakan template berulang. Respon secara alami sesuai waktu dan topik.\n\n[PENGIRIM: RAFLI/SUAMI] ${m.text}`
            : `[KONTEKS REAL-TIME SAAT INI: ${timeStr} (${timePhase})]\n[PENGIRIM: ORANG ASING] ${m.text}`;

        // Susun messages untuk Gemini
        const messages = [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: promptUserMessage }
        ];

        let responseText = await gemini(messages);

        if (responseText) {
            let clean = responseText
                .replace(/[*_#]/g, '')
                .toLowerCase()
                .trim();

            // Tangkal jika AI mengeluarkan penolakan roleplay (safety filter override)
            if (/(tidak bisa|tidak dapat).*(berperan|roleplay|istri|kekasih|romantis|kebijakan|ai|model bahasa)/i.test(clean)) {
                clean = 'ehehe... kamu manggil sayang tiba-tiba gitu bikin aku salting tau\nfuu... jangan bikin muka miku merah terus dong rafli curang bgt';
            }

            let lines = clean.split('\n')
                .map(l => l.trim())
                .map(l => l.replace(/\.+$/, ''))
                .filter(l => l.length > 0);

            if (lines.length === 0) return true;

            // Pastikan jumlah baris sesuai target dinamis giliran ini
            if (lines.length > targetBubbles) {
                if (targetBubbles === 1) {
                    lines = [lines.join(' ')];
                } else if (targetBubbles === 2) {
                    lines = [lines[0], lines.slice(1).join(' ')];
                } else {
                    lines = [lines[0], lines[1], lines.slice(2).join(' ')];
                }
            }

            const cleanHistoryText = lines.join('\n');

            // Simpan ke history menggunakan cleanUserMessage agar histori tetap rapi
            history.push(
                { role: 'user',      content: cleanUserMessage },
                { role: 'assistant', content: cleanHistoryText }
            );
            global.mikuDb.data[m.chat] = history;
            global.saveData('miku', m.chat);

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (i > 0) {
                    try { await conn.sendPresenceUpdate('composing', m.chat); } catch (_) {}
                    // Jeda pengetikan alami antara balon chat (700ms - 1800ms tergantung panjang teks)
                    const delay = Math.min(Math.max(line.length * 35, 700), 1800);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                await conn.reply(m.chat, line, m);
            }
        }

    } catch (e) {
        console.error(`Miku AI Error: ${e.message}`);
    }

    return true;
};

export default handler;