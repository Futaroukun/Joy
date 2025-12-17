<p align="center">
  <img src="https://i.ibb.co.com/23ZjypRm/IMG-20251209-135456.jpg" alt="Joy Bot Logo" width="400"/>
</p>

<h1 align="center">Joy - WhatsApp Bot</h1>

<p align="center">
  Base Script WhatsApp Bot modern yang <b>ringan</b>, <b>cepat</b>, dan <b>mudah dikembangkan</b>.<br>
  Dibangun dengan <a href="https://github.com/Whiskeysockets/Baileys"><b>Baileys</b></a> dan menggunakan teknologi modern <b>ECMAScript Modules (ESM)</b>.
</p>

<div align="center">
  
![Node.js](https://img.shields.io/badge/Node.js-v20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Baileys](https://img.shields.io/badge/Baileys-Latest-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)
![Type](https://img.shields.io/badge/Type-ESM-00d4ff?style=for-the-badge)
![License](https://img.shields.io/badge/License-GPLv3-blue?style=for-the-badge&logo=github)
  
</div>

---

## 📋 Daftar Isi

1.  [🚀 Fitur Utama](#-fitur-utama)
2.  [⚙️ Prasyarat](#️-prasyarat)
3.  [📥 Instalasi](#-instalasi)
4.  [🔧 Konfigurasi](#-konfigurasi)
5.  [▶️ Menjalankan Bot](#️-menjalankan-bot)
6.  [🤝 Kontribusi](#-kontribusi)
7.  [📝 Lisensi](#-lisensi)

---

## 🚀 Fitur Utama

Berikut adalah keunggulan utama dari Joy Bot:

-   **Modular (Plugin System)**: Struktur kode yang rapi. Mudah menambah atau mengurangi fitur hanya melalui folder `plugins`.
-   **Pairing Code**: Metode login modern tanpa perlu scan QR code, cukup gunakan kode autentikasi 8 digit.
-   **ESM Support**: Ditulis sepenuhnya menggunakan sintaks JavaScript modern (ECMAScript Modules).
-   **Database JSON**: Menggunakan `LowDB` yang ringan untuk penyimpanan data user, grup, dan pengaturan bot.
-   **LID Support**: Sudah mendukung `LID` (Link ID) sebagai pengganti JID untuk kompatibilitas WhatsApp terbaru.
-   **Auto Reconnect**: Bot dirancang untuk terhubung kembali secara otomatis jika koneksi terputus.

---

## ⚙️ Prasyarat

Sebelum memulai, pastikan perangkat lunak berikut sudah terpasang di sistem Anda:

| Software | Deskripsi & Link Download |
| :--- | :--- |
| **Node.js** | Minimal versi v20 atau lebih tinggi. [Download di sini](https://nodejs.org/en/download/). |
| **Git** | Untuk meng-kloning repositori. [Download di sini](https://git-scm.com/downloads). |
| **FFmpeg** | Wajib untuk memproses media (stiker, video, audio). [Download di sini](https://ffmpeg.org/download.html). |
| **ImageMagick** | Diperlukan untuk manipulasi gambar tertentu. [Download di sini](https://imagemagick.org/script/download.php). |

---

## 📥 Instalasi

Ikuti langkah-langkah berikut untuk memasang bot di perangkat Anda:

1.  **Clone repositori ini:**
    ```bash
    git clone https://github.com/Futaroukun/Joy.git
    ```

2.  **Masuk ke direktori proyek:**
    ```bash
    cd Joy
    ```

3.  **Install semua dependensi yang dibutuhkan:**
    ```bash
    npm install
    ```
    *(Proses ini mungkin memakan waktu beberapa saat tergantung kecepatan internet Anda)*

---

## 🔧 Konfigurasi

Sebelum menjalankan bot, sangat penting untuk mengatur konfigurasi dasar di file `settings.js`.

Buka file `settings.js` dengan teks editor favorit Anda (VS Code, Notepad++, dll), lalu sesuaikan bagian berikut:

-   **Owner**: Masukkan nomor WhatsApp Anda sebagai pemilik bot. Format nomor harus menggunakan kode negara (contoh: 628...) tanpa tanda `+` atau spasi.
    ```javascript
    global.owner = ["6283854551575"]; // Ganti dengan nomor Anda
    ```

-   **Info Bot & Owner**: Ubah detail tampilan bot sesuai keinginan.
    ```javascript
    global.info = {
        namabot: "Joy", // Ganti dengan nama bot
        namaowner: "Rafli", // Ganti dengan nama Anda
        // ... sesuaikan info lainnya di file settings.js
    }
    ```

---

## ▶️ Menjalankan Bot

Setelah instalasi dan konfigurasi selesai, Anda siap menjalankan bot.

1.  **Jalankan perintah start:**
    ```bash
    npm start
    ```

2.  **Proses Pairing (Pertama Kali):**
    * Saat pertama kali dijalankan, terminal akan meminta Anda memasukkan **nomor WhatsApp bot** yang akan digunakan. Masukkan nomor (contoh: `628123456789`).
    * Tunggu sebentar, sebuah **Kode Pairing 8 digit** akan muncul di terminal.
    * Buka aplikasi WhatsApp di HP Anda.
    * Pergi ke **Setelan > Perangkat Tertaut > Tautkan perangkat**.
    * Pilih opsi **"Tautkan dengan nomor telepon"** saja (jangan scan QR).
    * Masukkan kode 8 digit yang muncul di terminal ke WhatsApp Anda.

Setelah berhasil terhubung, bot akan mencetak log "Connected". Bot siap digunakan! Kirim perintah `.menu` di chat pribadi atau grup untuk melihat fitur yang tersedia.

---

## 🤝 Kontribusi

Kontribusi Anda sangat kami hargai untuk membuat proyek ini lebih baik! Jika Anda ingin berkontribusi:

1.  **Fork** repositori ini.
2.  Buat branch fitur baru (`git checkout -b fitur/NamaFiturKeren`).
3.  Commit perubahan Anda (`git commit -m 'Menambahkan fitur keren X'`).
4.  Push ke branch tersebut (`git push origin fitur/NamaFiturKeren`).
5.  Buka **Pull Request** di repositori ini.

---

## 📝 Lisensi

Proyek ini dilisensikan di bawah **Lisensi GPLv3**. Lihat file [`LICENSE`](LICENSE) untuk detail lengkapnya.

---

<div align="center">

### 🌟 Jika Anda menyukai proyek ini, jangan lupa berikan Bintang (Star)! 🌟

</div>