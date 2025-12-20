<p align="center">
  <img src="https://i.ibb.co.com/23ZjypRm/IMG-20251209-135456.jpg" alt="Joy Bot Logo" width="400"/>
</p>

<h1 align="center">Joy Bot</h1>

<p align="center">
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Node.js-v20+-339933?logo=node.js" alt="Node.js"></a>
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Baileys-Latest-25D366?logo=whatsapp" alt="Baileys"></a>
  <a href="https://github.com/Futaroukun/Joy"><img src="https://img.shields.io/badge/Type-ESM-00d4ff" alt="Type"></a>
</p>

Joy adalah bot WhatsApp modern yang powerful dan memory leak-proof. Bot ini dibuat khusus untuk **ESM** dan gratis untuk dimodifikasi dan didistribusikan dengan biaya **$0**.

---

## 🔖 Features

- ☑️ Pairing Code
- ☑️ Serializer system
- ☑️ Fully types for Serializer
- ☑️ Plugin based system
- ☑️ Interactive message support
- ☑️ Case system

> **📌 Note**  
> Saya tidak sepenuhnya menggunakan TypeScript untuk beberapa kode karena sangat memakan waktu, jadi saya memutuskan untuk menggunakan aturan TypeScript.

---

## 📦 Installation

Anda perlu mengkloning repositori ini. Namun, [Bun](https://bun.sh) harus diinstal di komputer Anda.

### 1. Clone repositori:
```bash
git clone https://github.com/Futaroukun/Joy
```

### 2. Atur nomor bot Anda:
Edit file `settings.js` di bagian `global.pairing`. Kemudian ubah nama file menjadi `settings.js`.

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
bun install
# or
npm install
```

### 4. Jalankan bot:
Jalankan file utama dengan:

```bash
bun index.ts
# or
bun run index.ts
```

Selesai! Bot Anda siap digunakan!

---

## 🎯 Adding a command

Joy Bot adalah skrip berbasis plugin. Semua perintah tersedia dan akan otomatis terdeteksi di folder [plugins](./plugins). Untuk memulai, Anda perlu membuat perintah seperti ini:

```javascript
import type { PluginHandler } from '@yuki/utils';

let handler: PluginHandler = {
  name: "Say Hello World!",
  call: ["hello"],
  exec: async (m, Yuki, { args }) => {
    // You can use Regex for example /*[Hh]ello/.test(m.body)
    m.reply("Hello World!");
  }
};

// Export It
export default handler;
```

---

## 🔧 Type plugin

Saya telah membuat plugin lengkap dengan tipe Imagine() yang tersedia di file [types/plugin/type.ts](./types/plugin/type.ts). Jika Anda memiliki pertanyaan atau mengalami masalah atau bug, silakan kunjungi halaman [issue](https://github.com/Futaroukun/Joy/issues).

---

## 📄 License & Contributing

Skrip ini didistribusikan di bawah [MIT license](./LICENSE). Bebas untuk digunakan, dimodifikasi, atau didistribusikan ulang dengan biaya **$0**. Saya akan sangat menghargai jika Anda dapat membantu saya mengembangkannya!

---

<div align="center">

**Made with ❤️ by [Rafli](https://github.com/Futaroukun)**

[![GitHub](https://img.shields.io/badge/GitHub-Follow-black?logo=github)](https://github.com/Futaroukun)
[![WhatsApp](https://img.shields.io/badge/WhatsApp-Contact-25D366?logo=whatsapp)](https://wa.me/6283854551575)

</div>