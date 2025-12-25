<p align="center">
  <img src="https://api.cloudsky.biz.id/file?key=kurumi-bot/1766640592653.jpg" alt="Joy Bot Logo" width="600" height="400"/>
</p>

<h1 align="center">Joy Bot</h1>

<p align="center">
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js" alt="Node.js"></a>
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Baileys-Latest-25D366?logo=whatsapp" alt="Baileys"></a>
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Type-ESM-00d4ff" alt="Type"></a>
</p>

Joy adalah bot WhatsApp modern yang powerful dan memory leak-proof. Bot ini dibuat menggunakan **Node.js ESM** dan gratis untuk dimodifikasi dan didistribusikan dengan biaya **$0**.

---

## Features

- [x] Pairing Code
- [x] NodeJs ESM Sytem
- [x] Simpel Menu
- [x] Auto Reconnect
- [x] Plugins Sytem

> [!NOTE]
> Bot ini menggunakan ECMAScript Modules (ESM), bukan CommonJS. Pastikan menggunakan `import/export` bukan `require()`.

---

## Installation

Anda perlu mengkloning repositori ini. Pastikan [Node.js v20+](https://nodejs.org) sudah terinstal di komputer Anda.

### 1. Clone repositori:
```bash
git clone https://github.com/Futaroukun/Joy
```

### 2. Atur nomor bot Anda:
Edit file `settings.js` di bagian `global.info`. Kemudian ubah nomor owner dan bot.

```javascript
global.owner = ["6283854551575"]

global.info = {
    nomorbot: "6285722157719",
    namabot: "Joy",
    nomorowner: "6283854551575", 
    namaowner: "Rafli"
}
```

### 3. Install modules:
Untuk menginstal modul, Anda dapat langsung menjalankan perintah:

```bash
npm install
```

### 4. Jalankan bot:
Jalankan file utama dengan:

```bash
npm start
# or
node main.js
```

Selesai! Bot Anda siap digunakan!

---

## Adding a command

Joy Bot adalah skrip berbasis plugin. Semua perintah tersedia dan akan otomatis terdeteksi di folder [plugins](./plugins). Untuk memulai, Anda perlu membuat perintah seperti ini:

```javascript
let handler = async (m, { conn, text, usedPrefix, command }) => {
    // You can use Regex for example /^hello$/i.test(command)
    m.reply("Hello World!");
}

handler.help = ['hello']
handler.tags = ['main']
handler.command = /^(hello|hai)$/i

// Export It
export default handler;
```

---

## Plugin System

Joy Bot menggunakan sistem plugin modular. Semua plugin berada di folder [plugins](./plugins) dan akan otomatis terdeteksi. Jika Anda memiliki pertanyaan atau mengalami masalah atau bug, silakan kunjungi halaman [issue](https://github.com/Futaroukun/Joy/issues).

---

## License & Contributing

Skrip ini didistribusikan di bawah [MIT license](./LICENSE). Bebas untuk digunakan, dimodifikasi, atau didistribusikan ulang dengan biaya **$0**. Saya akan sangat menghargai jika Anda dapat membantu saya mengembangkannya!

---

<div align="center">

**Made with ❤️ by [Rafli](https://github.com/Futaroukun)**

[![GitHub](https://img.shields.io/badge/GitHub-Follow-black?logo=github)](https://github.com/Futaroukun)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Contact-25D366?logo=whatsapp)](https://wa.me/6283854551575)

</div>