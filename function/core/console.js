import "../../settings.js";
import os from "os";
import chalk from "chalk";
import cp from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { createRequire } from "module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);
const { dependencies } = require(join(__dirname, "../../package.json"));

// ── Pastel Color Palette ──────────────────────────────────────────────────────
const p = {
    pink:    chalk.hex('#F9A8D4'),
    blue:    chalk.hex('#93C5FD'),
    purple:  chalk.hex('#C4B5FD'),
    green:   chalk.hex('#6EE7B7'),
    yellow:  chalk.hex('#FDE68A'),
    red:     chalk.hex('#FCA5A5'),
    gray:    chalk.hex('#D1D5DB'),
    dimgray: chalk.hex('#6B7280'),
    white:   chalk.hex('#F9FAFB'),
    peach:   chalk.hex('#FDBA74'),
    cyan:    chalk.hex('#67E8F9'),
};

// ── Strip ANSI for accurate terminal length calculation ───────────────────────
function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

// ── Format Bytes ──────────────────────────────────────────────────────────────
function formatBytes(bytes) {
    const gb = bytes / (1024 ** 3);
    return `${gb.toFixed(1)} GB`;
}

// ── Format Phone Number ───────────────────────────────────────────────────────
function formatPhone(num) {
    if (!num) return '-';
    const clean = String(num).replace(/\D/g, '');
    if (clean.startsWith('62') && clean.length >= 11) {
        return `+62 ${clean.slice(2, 5)}-${clean.slice(5, 9)}-${clean.slice(9)}`;
    }
    return `+${clean}`;
}

// ── Frame Configuration (Optimized for Termux & VPS Web Consoles) ─────────────
const W = 46;

function top(title = '') {
    if (!title) return p.dimgray('╭' + '─'.repeat(W) + '╮');
    const visible = stripAnsi(title).length;
    const right = Math.max(0, W - 4 - visible);
    return p.dimgray('╭── ') + title + p.dimgray(' ' + '─'.repeat(right) + '╮');
}

function divider(label = '') {
    if (!label) return p.dimgray('├' + '─'.repeat(W) + '┤');
    const visible = stripAnsi(label).length;
    const right = Math.max(0, W - 4 - visible);
    return p.dimgray('├── ') + label + p.dimgray(' ' + '─'.repeat(right) + '┤');
}

function bottom() {
    return p.dimgray('╰' + '─'.repeat(W) + '╯');
}

function row(content = '') {
    const visible = stripAnsi(content).length;
    const pad = Math.max(0, W - 2 - visible);
    return p.dimgray('│') + ' ' + content + ' '.repeat(pad) + ' ' + p.dimgray('│');
}

function renderBar(pct, totalBlocks = 8) {
    const filled = Math.min(totalBlocks, Math.max(0, Math.round((pct / 100) * totalBlocks)));
    const empty = totalBlocks - filled;
    return p.yellow('▰'.repeat(filled)) + p.dimgray('▱'.repeat(empty));
}

// ── Quick Dependency Test ─────────────────────────────────────────────────────
const quickTest = async () => {
    const [ffmpeg, ffmpegWebp, convert, magick] = await Promise.all([
        cp.spawn('ffmpeg'),
        cp.spawn('ffmpeg', [
            '-hide_banner', '-loglevel', 'error',
            '-filter_complex', 'color',
            '-frames:v', '1', '-f', 'webp', '-'
        ]),
        cp.spawn('convert'),
        cp.spawn('magick'),
    ].map(proc =>
        Promise.race([
            new Promise(r => proc.on('close',  code => r(code !== 127))),
            new Promise(r => proc.on('error',  ()   => r(false))),
        ])
    ));

    return { ffmpeg, ffmpegWebp, imagemagick: convert || magick };
};

// ── Main Header ───────────────────────────────────────────────────────────────
export async function headerLog() {
    console.clear();

    const totalMem = os.totalmem();
    const usedMem  = totalMem - os.freemem();
    const memPct   = Math.round((usedMem / totalMem) * 100);
    const memStr   = `${formatBytes(usedMem)} / ${formatBytes(totalMem)} (${memPct}%)`;

    // Multi-environment detection (Termux / Pterodactyl Container / Linux VPS)
    const isTermux = Boolean(process.env.TERMUX_VERSION) || os.platform() === 'android';
    const isContainer = Boolean(process.env.P_SERVER_UUID) || Boolean(process.env.CONTAINER);
    const envLabel = isTermux ? 'Termux Android' : (isContainer ? 'Linux Container' : `${os.platform()} (${os.arch()})`);

    const rawBaileys = dependencies?.['@whiskeysockets/baileys'] || '0.3.18';
    const baileysVer = rawBaileys.includes('@') ? rawBaileys.split('@').pop().replace('^', '') : rawBaileys.replace('^', '');
    const botNumberFormatted = formatPhone(global.info?.nomorbot || '6285722157719');

    const tools = await quickTest();
    const ffmpegBadge = tools.ffmpeg ? p.green('✓') : p.red('✗');
    const webpBadge   = tools.ffmpegWebp ? p.green('✓') : p.red('✗');
    const magickBadge = tools.imagemagick ? p.green('✓') : p.red('✗');

    console.log('');
    console.log(top(p.pink.bold('✦ JOY AUTOMATION ✦')));
    console.log(row(p.pink.bold('  ___   _____   __')));
    console.log(row(p.pink.bold(' |_  | / _ \\ \\ / /')));
    console.log(row(p.purple.bold('   | || (_) |\\ V /   ') + p.cyan.bold('v3.1.0 • ESM Core')));
    console.log(row(p.blue.bold(' \\__/  \\___/  |_|    ') + p.gray(envLabel)));
    console.log(row(''));

    // ── Bot Profile Section ───────────────────────────────────────────────────
    console.log(divider(p.peach('✦ BOT PROFILE ✦')));
    console.log(row(p.gray(' • Name    : ') + p.white.bold(global.info?.namabot || 'Joy')));
    console.log(row(p.gray(' • Number  : ') + p.yellow.bold(botNumberFormatted)));
    console.log(row(p.gray(' • Engine  : ') + p.peach(`Baileys v${baileysVer}`)));
    console.log(row(p.gray(' • Mode    : ') + p.blue('Multi-Device (Public)')));
    console.log(row(''));

    // ── Watermark Hardcoded ───────────────────────────────────────────────────
    console.log(divider(p.purple('✦ AUTHOR & CREATOR ✦')));
    console.log(row(p.gray(' • Creator : ') + p.white.bold('Rafli')));
    console.log(row(p.gray(' • Contact : ') + p.cyan.bold('+62 838-5455-1575')));
    console.log(row(''));

    // ── System Telemetry Section ──────────────────────────────────────────────
    console.log(divider(p.cyan('✦ SYSTEM TELEMETRY ✦')));
    console.log(row(p.gray(' • Status  : ') + p.green('● Connected ') + p.dimgray('(Online)')));
    console.log(row(p.gray(' • Memory  : ') + renderBar(memPct) + ' ' + p.white(memStr)));
    console.log(row(p.gray(' • Tools   : ') + p.white('FFmpeg ') + ffmpegBadge + p.dimgray(' │ ') + p.white('WebP ') + webpBadge + p.dimgray(' │ ') + p.white('Magick ') + magickBadge));
    console.log(bottom());
    console.log(p.green('  Ready for interactions. Listening events...\n'));
}

export default headerLog;
