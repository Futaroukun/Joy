<div align="center">

  <img src="https://files.catbox.moe/5vgu1o.jpg" alt="Joy Bot Banner" width="680" style="border-radius: 12px; margin-bottom: 15px;"/>

  # ✦ J O Y ✦
  ### *Next-Gen Modular WhatsApp Assistant & AI Automation*

  <p align="center">
    Bot WhatsApp modern berbasis <strong>Node.js (ESM)</strong> dengan performa tinggi, engine persistensi <strong>SQLite WAL</strong>, arsitektur sub-modul terisolasi, dan integrasi multi-model kecerdasan buatan.
  </p>

  <p align="center">
    <a href="https://github.com/Futaroukun/Joy/releases"><img src="https://img.shields.io/badge/Version-3.1.0-6366F1?style=for-the-badge&logo=git&logoColor=white" alt="Version"></a>
    <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node.js-v20+-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js"></a>
    <a href="https://github.com/WhiskeySockets/Baileys"><img src="https://img.shields.io/badge/Baileys-v0.4.1-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="Baileys"></a>
    <a href="https://sqlite.org"><img src="https://img.shields.io/badge/Database-SQLite%20WAL-0284C7?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite"></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/License-Non--Commercial-EF4444?style=for-the-badge&logo=open-source-initiative&logoColor=white" alt="License"></a>
    <img src="https://img.shields.io/badge/Platform-Termux%20%7C%20Linux%20%7C%20VPS-F59E0B?style=for-the-badge&logo=linux&logoColor=white" alt="Platform">
  </p>

  <p align="center">
    <a href="#-fitur-unggulan"><strong>Fitur</strong></a> •
    <a href="#-arsitektur--keunggulan"><strong>Arsitektur</strong></a> •
    <a href="#-panduan-instalasi"><strong>Instalasi</strong></a> •
    <a href="#-konfigurasi-awal"><strong>Konfigurasi</strong></a> •
    <a href="#-struktur-proyek"><strong>Struktur</strong></a> •
    <a href="#-lisensi--ketentuan"><strong>Lisensi</strong></a>
  </p>

</div>

---

## 🌟 Arsitektur & Keunggulan

Joy dibangun dari nol dengan fokus utama pada **efisiensi memori, ketahanan runtime, dan keterbacaan kode**:

| Komponen | Penjelasan Teknis |
| :--- | :--- |
| ⚡ **Zero-Heap Buildup** | Eksekusi pencarian data berbasis $O(1)$ real-time cache yang mencegah kebocoran memori (memory leak) di runtime terbatas seperti Android Termux. |
| 💾 **SQLite WAL Engine** | Menggunakan `better-sqlite3` dengan mode Write-Ahead Logging (`WAL`), `synchronous = NORMAL`, serta batch debounce write (1500ms) untuk proteksi total dari korupsi data saat proses terhenti tiba-tiba. |
| 🏗️ **Modular Subsystems** | Memisahkan sistem ke domain independen: `core/` (lifecycle & socket), `events/` (middleware), `media/` (FFmpeg converter), dan `scrapers/` (ekstraksi data). |
| 🔄 **Modern WhatsApp Protocol** | Mendukung identitas ganda nomor telepon & **LID (Linked ID)** simetris, cache LRU anti-resend loop, dan **Atomic Auth State** untuk proteksi berkas kredensial sesi. |
| 🧩 **Hot-Reloadable Plugins** | Fitur pada direktori `plugins/` dimuat secara dinamis dengan pengecekan sintaks otomatis (`syntax-error`), memungkinkan penambahan atau modifikasi fitur tanpa perlu restart proses. |
| ⏱️ **Process Watchdog** | Pengaman batas waktu (timeout kill) otomatis pada task berat seperti FFmpeg dan scraper untuk mencegah *zombie process* yang membebani CPU. |

---

## 📋 Fitur Unggulan

<div align="center">

| Kategori | Fitur & Integrasi Utama | Contoh Perintah |
| :--- | :--- | :--- |
| **🤖 Artificial Intelligence** | Google Gemini (Multi-turn & Vision), Copilot, DeepSeek, Qwen, Mistral, Pi AI, Persona Elin | `.ai`, `.copilot`, `.deepseek`, `.qwen`, `.pi`, `.elin` |
| **📥 Media Downloader** | TikTok HD (No-Watermark & Sound), Instagram (Reels & Story), Facebook HD, YouTube Music, Pixiv Art, Sfile Mobi | `.tiktok`, `.ig`, `.fb`, `.play`, `.ytmp3`, `.pixivdl`, `.sfile` |
| **🛡️ Grup & Keamanan** | Deteksi Info Grup, Sambutan Masuk/Keluar, Antilink, Antidelete (Anti-Tarik), Antivirtex, Auto Mute, Sewa Grup | `.infogrup`, `.hidetag`, `.kick`, `.group`, `.sambutan`, `.sewa` |
| **👑 Otoritas & Manajemen** | Hirarki Developer vs Owner, Mode Publik/Self/Private/Group, Backup Otomatis ke Chat Owner, Session Cleaner | `.owner`, `.mode`, `.backup`, `.clearsession`, `.restart` |
| **🎨 Media & Sticker Tools** | Generator Stiker WebP, Watermark kustom (Pack/Author), Stiker Meme Text, Converter VN/PTT, Audio Waveform | `.s`, `.wm`, `.smeme`, `.tovn`, `.tomp3`, `.hd` |
| **🔍 Search & Scraper** | Prakiraan Cuaca BMKG Seluruh Indonesia, Pantauan Gempa Terkini + Shakemap BMKG, GSMArena Spek HP, Lirik Lagu | `.cuaca`, `.gempa`, `.spekhp`, `.lirik`, `.pin` |
| **💰 RPG & Virtual Economy** | Sistem Registrasi Akun, Leveling & EXP Harian, Dompet Koin, Daily Reward, Transfer Uang, Toko Item | `.daftar`, `.profile`, `.daily`, `.wallet`, `.pay`, `.shop` |

</div>

---

## 🚀 Panduan Instalasi

<details open>
<summary><b>📱 Instalasi di Android (Termux)</b></summary>

<br>

Jalankan perintah berikut pada terminal Termux secara berurutan:

```bash
# 1. Perbarui repositori paket dan instal dependensi wajib
pkg update -y && pkg upgrade -y
pkg install -y git nodejs ffmpeg imagemagick

# 2. Kloning repositori Joy
git clone https://github.com/Futaroukun/Joy.git
cd Joy

# 3. Pasang seluruh dependensi proyek
npm install

# 4. Jalankan bot
npm start
```

</details>

<details>
<summary><b>🖥️ Instalasi di Linux / VPS (Ubuntu & Debian)</b></summary>

<br>

```bash
# 1. Update sistem dan pasang perangkat build dasar
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ffmpeg imagemagick build-essential

# 2. Pasang Node.js v20+ via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Kloning dan pasang dependensi
git clone https://github.com/Futaroukun/Joy.git
cd Joy
npm install

# 4. Jalankan secara langsung atau menggunakan process manager (PM2)
npm start

# (Opsional) Menggunakan PM2 agar bot berjalan di background secara permanen:
sudo npm install -g pm2
pm2 start start.js --name "joy"
pm2 save && pm2 startup
```

</details>

---

## ⚙️ Konfigurasi Awal

Buka dan sesuaikan data nomor WhatsApp di file [`settings.js`](./settings.js):

```javascript
// ===== KONFIGURASI OTORITAS =====
global.developer = ["628xxxxxxxxxx"]; // Nomor Developer Utama (Hak Akses Penuh Sistem)
global.owner     = ["628xxxxxxxxxx"]; // Nomor Owner Tambahan

// ===== IDENTITAS BOT =====
global.info = {
    nomorbot:   "628xxxxxxxxxx",
    namabot:    "Joy",
    nomorowner: "628xxxxxxxxxx",
    namaowner:  "Developer"
};
```

---

## 🔗 Menautkan Perangkat (Pairing Code)

1. Jalankan `npm start` pada terminal.
2. Ketikkan nomor WhatsApp yang akan digunakan (format internasional tanpa tanda `+`, contoh: `6281234567890`).
3. Pada ponsel WhatsApp Anda, buka **Setelan** > **Perangkat Tertaut** > **Tautkan Perangkat**.
4. Pilih opsi **Tautkan dengan nomor telepon saja**.
5. Masukkan **8 digit kode alfanumerik** yang tertera di terminal Anda.
6. Selesai! Bot akan melakukan sinkronisasi awal dan siap menerima pesan.

---

## 🧩 Template Pembuatan Plugin

Semua fitur baru ditempatkan di direktori `plugins/` secara instan tanpa perlu mendaftarkan file manual:

```javascript
// plugins/contoh-fitur.js

let handler = async (m, { conn, text, usedPrefix, command }) => {
    if (!text) return m.reply(`Format salah! Gunakan: *${usedPrefix + command} <teks>*`);
    await m.reply(`Halo @${m.sender.split('@')[0]}, pesanmu: "${text}"`, null, {
        mentions: [m.sender]
    });
};

handler.help    = ['contoh <teks>'];
handler.tags    = ['main'];
handler.command = /^(contoh|testcmd)$/i;

export default handler;
```

---

## 📁 Struktur Proyek

```text
Joy/
├── 📂 data/                   # Database SQLite (database.db) & penyimpanan sesi lokal
├── 📂 function/               # Modul fungsional terstruktur
│   ├── 📂 ai/                 # Integrasi model AI (Gemini, ChatGPT, Pi, Qwen)
│   ├── 📂 core/               # Engine sistem & Baileys socket
│   │   ├── auth.js            # Atomic auth state manager
│   │   ├── database.js        # SQLite WAL engine & batch debounce flush
│   │   ├── connection.js      # Lifecycle koneksi & pairing code
│   │   ├── schema.js          # Sanitizer skema database & sinkronisasi umur
│   │   ├── simple.js          # Serializer (smsg) & perpanjangan prototipe Baileys
│   │   └── patch-baileys.js   # Upstream hotfixer Baileys
│   ├── 📂 events/             # Penanganan event & middleware WhatsApp
│   │   ├── group-events.js    # Sambutan & deteksi perubahan pengaturan grup
│   │   ├── antidelete.js      # Pemantau & penyimpan pesan terhapus
│   │   ├── anticall.js        # Penolak panggilan suara/video otomatis
│   │   ├── cooldown.js        # Rate limiter & cooldown command
│   │   └── print.js           # Formatter & logger pesan masuk di terminal
│   ├── 📂 media/              # Utilitas konversi & manipulasi media
│   │   ├── converter.js       # Konversi audio/video FFmpeg dengan safety timeout
│   │   ├── exif.js            # Generator metadata & watermark stiker WebP
│   │   ├── profile-picture.js # Pemrosesan & cropping foto profil WhatsApp
│   │   └── button.js          # Generator pesan interaktif & tombol WhatsApp
│   ├── 📂 scrapers/           # Layanan ekstraksi data & API pihak ketiga
│   │   ├── cuaca.js           # Prakiraan cuaca BMKG seluruh kota Indonesia
│   │   ├── gempa.js           # Data & peta shakemap gempa BMKG real-time
│   │   ├── ytmusic.js         # Scraper & downloader YouTube Music
│   │   └── spekhp.js          # Spesifikasi perangkat & benchmark GSMArena
│   └── test.js                # Automated syntax & integrity test suite
├── 📂 plugins/                # Modul fitur mandiri (AI, Downloader, Group, RPG, Store, Tools)
├── 📂 src/                    # Aset statis bot (font, thumbnail, QRIS)
├── handler.js                 # Router perintah & pengawas permission pesan masuk
├── main.js                    # Entry point bot, inisialisasi socket, & event loop
├── settings.js                # Konfigurasi nomor developer, owner, & bot
└── package.json               # Manifest dependensi & script runner
```

---

## 📜 Lisensi & Ketentuan Penggunaan

Proyek ini dilindungi oleh hak cipta di bawah ketentuan resmi [**SOURCE CODE PROTECTION & USAGE POLICY**](./LICENSE):

> [!IMPORTANT]
> 1. **Modifikasi Terbatas (Minor Modifications Only):** Anda hanya diperkenankan mengubah konfigurasi atau menambah plugin untuk penggunaan pribadi. Dilarang merombak total kode sumber untuk diklaim sebagai karya pribadi (*re-branding / plagiarisme*).
> 2. **Kredit Wajib Dipertahankan:** DILARANG KERAS menghapus, mengubah, atau menyamarkan identitas pencipta asli (**Rafli / Futaroukun**) di seluruh berkas kode, watermark, maupun respons bot.
> 3. **Non-Komersial (Gratis):** Script ini disediakan secara terbuka dan cuma-cuma. Dilarang keras memperjualbelikan, menyewakan, atau memonetisasi kode ini dalam bentuk apa pun.
> 4. **Bebas Penyalahgunaan:** Dilarang menggunakan script ini untuk aktivitas spamming, penipuan, peretasan, atau tindakan merugikan pihak lain.

---

<div align="center">

  <sub>Crafted with passion & dedication by</sub><br>
  **[Rafli (Futaroukun)](https://github.com/Futaroukun)**

  <br>

  [![GitHub](https://img.shields.io/badge/GitHub-Futaroukun-181717?style=flat-square&logo=github&logoColor=white)](https://github.com/Futaroukun)
  [![Instagram](https://img.shields.io/badge/Instagram-raff__editz2-E4405F?style=flat-square&logo=instagram&logoColor=white)](https://www.instagram.com/raff_editz2)

</div>
