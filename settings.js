/* XRDHZ-MD
  Script ini tidak untuk diperjual-belikan atau gratis.
  Script masih dalam tahap pengembangan mungkin akan ada bug, error dan lain sebagainya.
*/

import chalk from "chalk";
import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";
import moment from "moment-timezone";

// ===== CONFIG =====
global.owner = ["6283854551575", "6285722157719"];

global.info = {
    nomorbot: "6285722157719",
    namabot: "Joy",
    nomorowner: "6283854551575",
    namaowner: "Rafli"
}

// ===== THUMBNAIL =====
global.thum = "https://qu.ax/NvoLP.jpg";

// ===== OPTIONS =====
global.autoRead = true; // OPSIONAL
global.stage = {
    wait: "*Memproses permintaan!!*",
    error: "*Gagal Memproses permintaan*"
}

// ===== LINK ====
global.lgh = "https://github.com/Futaroukun"; // Github
global.lwa = "https://wa.me/6283854551575"; // Whatsapp
global.lig = ""; // Instagram
global.lgc = ""; // Group Chat Whatsapp
global.lch = ""; // Channels Whatsapp 
let file = fileURLToPath(import.meta.url);
watchFile(file, async () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "settings.js"`)}`);
    import(`${file}?update=${Date.now()}`);
});