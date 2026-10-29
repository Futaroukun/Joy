import chalk from "chalk";
import { watchFile, unwatchFile, existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

// Auto-load environment variables jika ada berkas .env
if (existsSync(".env") && typeof process.loadEnvFile === "function") {
    try { process.loadEnvFile(".env"); } catch (_) {}
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const localThumb = path.join(__dir, "src", "thumbnail.jpg");

// ===== CONFIG =====
const devNumber   = process.env.DEVELOPER_NUMBER || "6283854551575";
const ownerNumber = process.env.OWNER_NUMBER || "6285722157719";
const botNumber   = process.env.BOT_NUMBER || "6285722157719";
const botName     = process.env.BOT_NAME || "Joy";
const ownerName   = process.env.OWNER_NAME || "Rafli";

global.developer = [devNumber]; // Developer Utama (Akses Penuh / Dev Only)
global.owner     = [ownerNumber]; // Owner Tambahan / Admin Bot (Akses Terbatas)

global.info = {
    nomorbot:   botNumber,
    namabot:    botName,
    nomorowner: devNumber,
    namaowner:  ownerName
}

// ===== THUMBNAIL =====
global.thum = existsSync(localThumb) ? readFileSync(localThumb) : "https://api.cloudsky.biz.id/file?key=kurumi-bot/1766671505860.jpg";

// ===== PIXIV =====
const pixivJsonPath = path.join(__dir, "data", "pixiv.json");
let savedPixiv = {};
if (existsSync(pixivJsonPath)) {
    try { savedPixiv = JSON.parse(readFileSync(pixivJsonPath, "utf-8")); } catch (_) {}
}
global.pixiv = {
    cookie: process.env.PIXIV_COOKIE || savedPixiv.cookie || "",
    userId: savedPixiv.userId || "",
    isPremium: !!savedPixiv.isPremium
};

// ===== AI AGENT API KEYS =====
global.openrouterKeys = process.env.OPENROUTER_KEYS || "";
global.openaiKey = process.env.OPENAI_API_KEY || process.env.MODELNYAW_API_KEY || "";

// ===== LINK ====
global.lgh = "https://github.com/Futaroukun"; // Github
global.lwa = "https://wa.me/6283854551575"; // Whatsapp
global.lig = "https://www.instagram.com/raff_editz2"; // Instagram
global.lgc = ""; // Group Chat Whatsapp
global.lch = "https://whatsapp.com/channel/0029VbCZyEa7NoZvaE75yY00"; // Channels Whatsapp 
let file = fileURLToPath(import.meta.url);
unwatchFile(file);
watchFile(file, () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "settings.js"`)}`);
    import(`${file}?update=${Date.now()}`);
});
