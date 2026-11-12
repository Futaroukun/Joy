<div align="center">

  <img src="https://files.catbox.moe/5vgu1o.jpg" alt="Joy Bot Banner" width="680" style="border-radius: 12px; margin-bottom: 15px;"/>

  # ✦ J O Y ✦
  ### *Next-Gen Modular WhatsApp Assistant & AI Automation*

  <p align="center">
    Bot WhatsApp modern berbasis <strong>Node.js (ESM)</strong> dengan engine persistensi <strong>SQLite WAL</strong>, arsitektur sub-modul terisolasi, dan integrasi multi-model kecerdasan buatan.
  </p>

  <p align="center">
    <a href="./package.json"><img src="https://img.shields.io/badge/Version-3.1.0-6366F1?style=for-the-badge&logo=git&logoColor=white" alt="Version"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-v20.12+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"></a>
    <a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Baileys-v0.4.1-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys"></a>
    <a href="https://sqlite.org"><img src="https://img.shields.io/badge/Database-SQLite%20WAL-0284C7?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-SCPU--NC-EF4444?style=for-the-badge" alt="License SCPU-NC"></a>
    <img src="https://img.shields.io/badge/Platform-Termux%20%7C%20Linux%20%7C%20VPS-F59E0B?style=for-the-badge&logo=linux&logoColor=white" alt="Platform">
  </p>

  <p align="center">
    <a href="#-fitur-unggulan"><strong>Fitur</strong></a> •
    <a href="#-arsitektur--keunggulan"><strong>Arsitektur</strong></a> •
    <a href="#-panduan-instalasi"><strong>Instalasi</strong></a> •
    <a href="#️-konfigurasi-environment-env"><strong>Konfigurasi</strong></a> •
    <a href="#-memperbarui-bot"><strong>Update</strong></a> •
    <a href="#-struktur-proyek"><strong>Struktur</strong></a> •
    <a href="#️-troubleshooting"><strong>Troubleshooting</strong></a> •
    <a href="#-lisensi--ketentuan-penggunaan"><strong>Lisensi</strong></a>
  </p>

</div>

---

## 🌟 Arsitektur & Keunggulan

Joy dibangun dengan fokus pada **efisiensi memori, ketahanan runtime, dan keterbacaan kode**:

| Komponen | Penjelasan Teknis |
| --- | --- |
| ⚡ **Zero-Heap Buildup** | Pencarian data berbasis cache real-time $O(1)$ untuk mencegah memory leak di runtime terbatas seperti Android Termux. |
| 💾 **SQLite WAL Engine** | `better-sqlite3` dengan Write-Ahead Logging (`WAL`), `synchronous = NORMAL`, dan batch debounce write (1500ms) untuk melindungi data dari korupsi saat proses terhenti mendadak. |
| 🏗️ **Modular Handler** | Pemrosesan pesan dipecah ke `function/core/handler/` (`auth`, `chat-state`, `dispatcher`, `diagnostics`) dengan lookup perintah O(1) dan fallback regex. |
| 🔄 **Modern WhatsApp Protocol** | Dukungan identitas ganda nomor telepon & **LID (Linked ID)**, cache LRU anti-resend loop, dan **Atomic Auth State** untuk melindungi berkas kredensial sesi. |
| 🧩 **Hot-Reloadable Plugins** | Plugin di `plugins/` dimuat dinamis dengan pengecekan sintaks otomatis, sehingga fitur bisa ditambah atau diubah tanpa restart. |
| 🚦 **Task Queue & Watchdog** | Antrian pembatas konkurensi untuk task CPU-bound (FFmpeg, WebP, scraper) serta timeout kill otomatis untuk mencegah *zombie process*. |
| 🩹 **Auto-Repair & Backup** | `start.js` merebuild modul native yang rusak secara otomatis; database dicadangkan berkala dan snapshot-nya dikirim ke chat owner. |

---

## 📋 Fitur Unggulan

| Kategori | Fitur & Integrasi Utama | Contoh Perintah |
| --- | --- | --- |
| **🤖 Artificial Intelligence** | Google Gemini (multi-turn, vision, file), ChatGPT, DeepSeek, DeepChat (multi-model), Qwen, Pi AI, Persona Elin, AI Agent (owner) | `.ai`, `.chatgpt`, `.ds`, `.deepchat`, `.qwen`, `.pi`, `.elin`, `.agent` |
| **📥 Media Downloader** | TikTok, Douyin, Instagram, Facebook, YouTube (audio & music), Pixiv, Sfile, Auto Download | `.tiktok`, `.douyin`, `.ig`, `.fb`, `.play`, `.ytmp3`, `.pixivdl`, `.sfile`, `.autodl` |
| **🛡️ Grup & Keamanan** | Info grup, hidetag, kick, buka/tutup grup terjadwal, AFK, Antilink, Antidelete, Anticall, pengaturan grup | `.infogc`, `.hidetag`, `.kick`, `.group`, `.autogrup`, `.afk`, `.enable` |
| **👑 Otoritas & Manajemen** | Hirarki Developer vs Owner, Premium, mode Publik/Self/Private/Group, backup database, session cleaner, cooldown, iklan | `.addowner`, `.addprem`, `.mode`, `.backup`, `.clearsession`, `.cooldown`, `.ads`, `.restart` |
| **🎨 Media & Sticker Tools** | Stiker WebP, watermark pack/author, stiker meme, brat, quote chat, converter VN/PTT/MP3, upscale HD, BGM video, info video | `.s`, `.wm`, `.smeme`, `.brat`, `.qc`, `.tomp3`, `.hd`, `.addmusic`, `.cekvideo` |
| **🔍 Search & Scraper** | Cuaca, gempa, dan info BMKG, spek HP GSMArena, lirik, Pinterest, Pixiv, YouTube search, Roblox, Fandom, npm | `.bmkg`, `.gempa`, `.cuaca`, `.spekhp`, `.lirik`, `.pin`, `.yts`, `.pixiv` |
| **💰 RPG, Ekonomi & Toko** | Registrasi, leveling & EXP, dompet koin, daily reward, transfer, toko item, redeem code, catatan keuangan, etalase jualan | `.daftar`, `.profile`, `.daily`, `.wallet`, `.pay`, `.shop`, `.redeem`, `.uang`, `.jualan` |
| **🧰 Utilitas** | Cek nomor WhatsApp, gacha nomor, translate, speedtest, generator password, pencari preset, baca view-once | `.ceknomor`, `.gachanomor`, `.translate`, `.speedtest`, `.genpass`, `.preset`, `.rvo` |

Ketik `.menu` di WhatsApp untuk daftar perintah lengkap.

---

## 🚀 Panduan Instalasi

### Persyaratan

- Node.js **v20.12 atau lebih baru**
- `git`, `ffmpeg`, `imagemagick`
- Toolchain build untuk modul native (`better-sqlite3`, `canvas`): `python`, `make`, dan compiler C/C++

### 📱 Android (Termux)

```bash
# 1. Perbarui paket dan pasang dependensi wajib
pkg update -y && pkg upgrade -y
pkg install -y git nodejs ffmpeg imagemagick python make clang

# 2. Kloning repositori
git clone https://github.com/Futaroukun/Joy.git
cd Joy

# 3. Pasang dependensi (setup.js otomatis menangani konflik ERESOLVE)
npm run setup

# 4. Salin dan sesuaikan konfigurasi
cp .env.example .env
nano .env

# 5. Jalankan bot
npm start
```

### 🖥️ Linux / VPS (Ubuntu & Debian)

```bash
# 1. Update sistem dan pasang perangkat build dasar
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ffmpeg imagemagick build-essential python3

# 2. Pasang Node.js v20+ via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Kloning dan pasang dependensi
git clone https://github.com/Futaroukun/Joy.git
cd Joy
npm run setup          # atau: npm install

# 4. Salin dan konfigurasi .env
cp .env.example .env
nano .env

# 5. Jalankan langsung
npm start

# (Opsional) Jalankan permanen di background dengan PM2
sudo npm install -g pm2
pm2 start start.js --name "joy"
pm2 save && pm2 startup
```

> [!NOTE]
> `npm start` menjalankan `start.js`, yaitu launcher yang memantau proses `main.js`, merestartnya saat crash, dan merebuild modul native bila terdeteksi rusak.

---

## ⚙️ Konfigurasi Environment (`.env`)

Joy memakai berkas `.env` untuk nomor owner, API key, dan kredensial akun. Berkas ini diabaikan Git (`.gitignore`), sehingga **aman dari kebocoran publik** dan **tidak tertimpa saat `git pull`**.

```bash
cp .env.example .env
nano .env
```

### Wajib diisi

| Variabel | Keterangan | Contoh |
| --- | --- | --- |
| `DEVELOPER_NUMBER` | Nomor pengembang utama (akses penuh dev-only) | `6281234567890` |
| `OWNER_NUMBER` | Nomor owner tambahan / admin bot | `6289876543210` |
| `BOT_NUMBER` | Nomor WhatsApp yang dipakai bot | `6281234567890` |
| `BOT_NAME` | Nama identitas bot | `Joy` |
| `OWNER_NAME` | Nama pemilik bot | `Rafli` |

### Opsional (hanya untuk fitur terkait)

Bot tetap berjalan tanpa variabel di bawah ini; hanya fitur yang bersangkutan yang tidak aktif.

| Variabel | Dipakai untuk | Contoh |
| --- | --- | --- |
| `GEMINI_API_KEY` | Gemini ([Google AI Studio](https://aistudio.google.com/)) | `AIzaSy...` |
| `OPENROUTER_KEYS` | Multi-model via [OpenRouter](https://openrouter.ai) (multi-key dipisah koma, rotasi otomatis) | `sk-or-v1-...` |
| `MODELNYAW_API_KEY` | Endpoint kustom kompatibel OpenAI | `sk-...` |
| `OPENAI_API_KEY` | API OpenAI | `sk-...` |
| `PIXIV_COOKIE` | Download dan pencarian karya Pixiv (cookie sesi login) | `117268539_...` |
| `ELIN_USERNAME` / `ELIN_PASSWORD` | Persona Elin AI | `user@email.com` / `password123` |
| `QWEN_EMAIL` / `QWEN_PASSWORD` | Qwen Web Chat | `user@email.com` / `password123` |
| `SFILE_EMAIL` / `SFILE_PASSWORD` | Sfile | `user@email.com` / `password123` |

### Berkas kredensial tambahan (`data/`)

Beberapa fitur memakai berkas JSON di folder `data/`. Templatenya tersedia sebagai `*.example.json`; salin dan hapus akhiran `.example` untuk mengaktifkannya:

```bash
cp data/gemini-cookies.example.json data/gemini-cookies.json
```

| Template | Untuk |
| --- | --- |
| `gemini-cookies.example.json` | Gemini Web (cookie akun) |
| `deepseek-account.example.json` | Akun DeepSeek |
| `pixiv.example.json` | Kredensial Pixiv |
| `sfile.example.json` | Akun Sfile |
| `gacha-pool.example.json` | Pool nomor untuk `.gachanomor` |

Semua `data/*.json` (kecuali `*.example.json` dan `wilayah_kota.json`) otomatis diabaikan Git.

> [!TIP]
> Link media sosial dan tampilan thumbnail bot bisa diubah di [`settings.js`](./settings.js). Nomor telepon dan token rahasia sebaiknya hanya disimpan di `.env`.

> [!WARNING]
> Jangan pernah membagikan atau meng-commit `.env`, folder `sessions/`, dan berkas di `data/` (`database.db`, cookie, akun). Isinya adalah sesi WhatsApp dan kredensial; siapa pun yang memilikinya bisa mengambil alih akun bot kamu.

---

## 🔗 Menautkan Perangkat (Pairing Code)

1. Jalankan `npm start` di terminal.
2. Ketik nomor WhatsApp bot (format internasional tanpa `+`, contoh: `6281234567890`).
3. Di ponsel, buka **Setelan** > **Perangkat Tertaut** > **Tautkan Perangkat**.
4. Pilih **Tautkan dengan nomor telepon saja**.
5. Masukkan **kode 8 karakter** yang tampil di terminal.
6. Selesai. Bot akan sinkronisasi awal lalu siap menerima pesan. Sesi tersimpan di folder `sessions/`.

---

## 🔄 Memperbarui Bot

```bash
cd Joy
git pull
npm install
npm start        # atau: pm2 restart joy
```

`.env`, `sessions/`, dan `data/` tidak ikut tertimpa. Jika `git pull` menolak karena ada perubahan lokal, simpan dulu dengan `git stash`, lalu `git pull` dan `git stash pop`.

Untuk memastikan semuanya sehat setelah update:

```bash
npm test         # cek sintaks seluruh file + tes logika handler
```

---

## 🧩 Template Pembuatan Plugin

Letakkan fitur baru di `plugins/` (konvensi penamaan: `kategori-nama.js`, misalnya `tools-umur.js`); tidak perlu mendaftarkan file secara manual.

```js
// plugins/tools-contoh.js

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`Format salah! Gunakan: *${usedPrefix + command} <teks>*`)
    await m.reply(`Halo @${m.sender.split('@')[0]}, pesanmu: "${text}"`, null, {
        mentions: [m.sender]
    })
}

handler.help    = ['contoh <teks>']
handler.tags    = ['tools']
handler.command = /^(contoh|testcmd)$/i
// handler.rowner = true   // khusus Developer / Real Owner
// handler.owner  = true   // khusus Owner

export default handler
```

---

## 📁 Struktur Proyek

```
Joy/
├── 📂 data/                      # Database SQLite, backup, dan berkas kredensial (JANGAN di-commit)
│   ├── *.example.json            # Template kredensial (aman di-commit)
│   └── wilayah_kota.json         # Data wilayah untuk fitur cuaca/BMKG
├── 📂 function/                  # Modul fungsional
│   ├── 📂 ai/                    # Klien AI: Gemini (API & Web), ChatGPT, DeepSeek, DeepChat, Pi, Qwen, agent-tools
│   ├── 📂 core/                  # Engine sistem
│   │   ├── 📂 handler/           # Router pesan: auth, chat-state, dispatcher, diagnostics
│   │   ├── auth.js               # Atomic auth state manager
│   │   ├── backup.js             # Auto-backup database & kirim snapshot ke owner
│   │   ├── connection.js         # Lifecycle koneksi & pairing code
│   │   ├── database.js           # SQLite WAL engine & batch debounce flush
│   │   ├── schema.js             # Sanitizer skema database
│   │   ├── simple.js             # Serializer pesan & perpanjangan prototipe Baileys
│   │   ├── patch-baileys.js      # Hotfix upstream Baileys (dijalankan saat postinstall)
│   │   ├── queue.js              # Antrian & pembatas konkurensi task berat
│   │   ├── levelling.js          # Formula EXP, level, dan role
│   │   ├── redeem.js             # Engine kode redeem
│   │   ├── gacha-pool.js         # Pool nomor untuk gacha nomor
│   │   ├── session-cleaner.js    # Pembersih pre-key sesi usang
│   │   ├── store.js, cek-prem.js, safe-tmp.js, console.js
│   ├── 📂 events/                # Event & middleware: group-events, antidelete, anticall,
│   │                             #   cooldown, autoread, autogroup, didyoumean, guard, ads, print
│   ├── 📂 media/                 # converter (FFmpeg), exif (stiker), profile-picture, button, uploader
│   ├── 📂 scrapers/              # cuaca, gempa, spekhp, ytmusic, tiktok, pinterest, pixiv, sfile,
│   │                             #   elin, convert1s, currency, speedtest.py
│   └── test.js                   # Tes sintaks & integritas seluruh file
├── 📂 plugins/                   # Fitur mandiri (ai, down, group, info, int, owner, rpg, sticker, store, tools)
├── 📂 src/                       # Aset statis (font, thumbnail, QRIS)
├── 📂 test/
│   └── handler-logic.test.js     # Tes logika handler (cooldown, dll.)
├── .env.example                  # Template konfigurasi
├── AGENTS.md                     # Panduan untuk AI coding agent
├── handler.js                    # Entry handler pesan masuk
├── main.js                       # Entry bot: inisialisasi socket & event loop
├── settings.js                   # Konfigurasi developer, owner, & bot
├── setup.js                      # Instalasi dependensi dengan penanganan error otomatis
├── start.js                      # Launcher: restart otomatis & auto-rebuild modul native
└── package.json                  # Manifest dependensi & script
```

Folder `sessions/` dibuat otomatis setelah pairing dan berisi kredensial sesi WhatsApp.

---

## 🛠️ Troubleshooting

| Masalah | Solusi |
| --- | --- |
| `npm install` gagal saat membangun `better-sqlite3` atau `canvas` | Pastikan `python`, `make`, dan compiler C/C++ terpasang, lalu jalankan ulang `npm run setup`. |
| Error `ERESOLVE` / konflik dependensi | Gunakan `npm run setup`, yang menambahkan flag yang diperlukan secara otomatis. |
| Bot logout / sesi rusak | Hentikan bot, hapus folder `sessions/`, jalankan ulang, dan lakukan pairing ulang. |
| Fitur stiker/audio/video error | Cek `ffmpeg -version` dan `convert -version`; pasang ulang jika belum ada. |
| Fitur AI/downloader tidak merespons | Periksa API key, cookie, atau berkas akun terkait di `.env` dan `data/`. |
| Perubahan plugin tidak terbaca | Cek terminal untuk pesan `syntax-error`; perbaiki sintaks plugin tersebut. |
| Ingin memastikan instalasi sehat | Jalankan `npm test`. |

---

## 📜 Lisensi & Ketentuan Penggunaan

Proyek ini berada di bawah [**SCPU-NC (Source Code Protection & Usage Policy - Non-Commercial)**](./LICENSE):

1. **Modifikasi terbatas:** Boleh mengubah konfigurasi atau menambah plugin untuk penggunaan pribadi. Dilarang merombak total kode untuk diklaim sebagai karya sendiri (*re-branding / plagiarisme*).
2. **Kredit wajib dipertahankan:** Dilarang menghapus, mengubah, atau menyamarkan identitas pencipta asli (**Rafli / Futaroukun**) di berkas kode, watermark, maupun respons bot.
3. **Non-komersial:** Script ini gratis. Dilarang memperjualbelikan, menyewakan, atau memonetisasi dalam bentuk apa pun.
4. **Bebas penyalahgunaan:** Dilarang dipakai untuk spam, penipuan, peretasan, atau tindakan yang merugikan pihak lain.

---

<div align="center">

Crafted with passion & dedication by **[Rafli (Futaroukun)](https://github.com/Futaroukun)**

[![GitHub](https://img.shields.io/badge/GitHub-Futaroukun-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Futaroukun)
[![Instagram](https://img.shields.io/badge/Instagram-raff__editz2-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/raff_editz2)

</div>
