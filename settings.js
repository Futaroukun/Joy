import chalk from "chalk";
import { watchFile, unwatchFile, existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

if (existsSync(".env")) {
    if (typeof process.loadEnvFile === "function") {
        try { process.loadEnvFile(".env"); } catch (_) {}
    } else {
        try {
            const envContent = readFileSync(".env", "utf-8");
            for (const line of envContent.split(/\r?\n/)) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;
                const eqIdx = trimmed.indexOf("=");
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let val = trimmed.slice(eqIdx + 1).trim();
                    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                        val = val.slice(1, -1);
                    }
                    if (!(key in process.env)) {
                        process.env[key] = val;
                    }
                }
            }
        } catch (_) {}
    }
}

const __dir = path.dirname(fileURLToPath(import.meta.url));
const localThumb = path.join(__dir, "src", "thumbnail.jpg");

const devNumber   = process.env.DEVELOPER_NUMBER || "6283854551575";
const ownerNumber = process.env.OWNER_NUMBER || "6285722157719";
const botNumber   = process.env.BOT_NUMBER || "6285722157719";
const botName     = process.env.BOT_NAME || "Joy";
const ownerName   = process.env.OWNER_NAME || "Rafli";

global.developer = [devNumber];
global.owner     = [ownerNumber];

global.info = {
    nomorbot:   botNumber,
    namabot:    botName,
    nomorowner: devNumber,
    namaowner:  ownerName
}

global.stickpack = process.env.STICKER_PACKNAME || "Joy Bot";
global.stickauth = process.env.STICKER_AUTHOR || "Rafli";

global.thum = existsSync(localThumb) ? readFileSync(localThumb) : "https://qu.ax/NvoLP.jpg";

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

global.openrouterKeys = process.env.OPENROUTER_KEYS || "";
global.openaiKey = process.env.OPENAI_API_KEY || process.env.MODELNYAW_API_KEY || "";

global.lgh = "https://github.com/Futaroukun";
global.lwa = "https://wa.me/6283854551575";
global.lig = "https://www.instagram.com/raff_editz2";
global.lgc = "";
global.lch = "https://whatsapp.com/channel/0029VbCZyEa7NoZvaE75yY00";
let file = fileURLToPath(import.meta.url);
unwatchFile(file);
watchFile(file, () => {
    unwatchFile(file);
    console.log(`${chalk.white.bold(" [SISTEM]")} ${chalk.green.bold(`FILE DIUPDATE "settings.js"`)}`);
    import(`${file}?update=${Date.now()}`);
});
