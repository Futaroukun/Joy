import { WAMessageStubType } from "@whiskeysockets/baileys";
import { parsePhoneNumber } from "awesome-phonenumber";
import chalk from "chalk";
import stringWidth from "string-width";
import { fileURLToPath } from "url";
import { unwatchFile, watchFile } from "fs";

// ── Pastel Palette (sama dengan console.js) ───────────────────────────────────
const p = {
    pink:    chalk.hex('#F9A8D4'),
    blue:    chalk.hex('#93C5FD'),
    purple:  chalk.hex('#C4B5FD'),
    green:   chalk.hex('#6EE7B7'),
    yellow:  chalk.hex('#FDE68A'),
    peach:   chalk.hex('#FDBA74'),
    gray:    chalk.hex('#D1D5DB'),
    dimgray: chalk.hex('#6B7280'),
    white:   chalk.hex('#F9FAFB'),
    red:     chalk.hex('#FCA5A5'),
    cyan:    chalk.hex('#67E8F9'),
};

function stripAnsi(str) {
    return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function truncateWidth(str, maxWidth) {
    if (stringWidth(str) <= maxWidth) return str;
    let res = "";
    for (const char of str) {
        if (stringWidth(res + char + "..") > maxWidth) break;
        res += char;
    }
    return res + "..";
}

const W = 46;

function cardTop(badge, time) {
    const leftWidth = stringWidth(stripAnsi(badge)) + 5; // "╭── " + " "
    const rightText = ` [${time}] ──╮`;
    const rightWidth = stringWidth(rightText);
    const fillLen = (W + 2) - leftWidth - rightWidth;
    return p.dimgray('╭── ') + badge + p.dimgray(' ' + '─'.repeat(Math.max(0, fillLen)) + ' ') + p.dimgray(`[${time}] ──╮`);
}

function cardRow(content) {
    const visibleWidth = stringWidth(stripAnsi(content));
    const pad = Math.max(0, W - 2 - visibleWidth);
    return p.dimgray('│') + ' ' + content + ' '.repeat(pad) + ' ' + p.dimgray('│');
}

function cardBottom() {
    return p.dimgray('╰' + '─'.repeat(W) + '╯');
}

function buildLine1(name, phone, preview) {
    const MAX_INNER = W - 2; // 44
    const phonePart = ` (${phone})`;
    const arrowPart = preview ? ' › ' : '';
    const staticWidth = stringWidth(phonePart) + stringWidth(arrowPart);

    if (preview) {
        const maxNameWidth = 12;
        const fitName = truncateWidth(name, maxNameWidth);
        const remainingForPreview = Math.max(6, MAX_INNER - stringWidth(fitName) - staticWidth);
        const fitPreview = truncateWidth(preview, remainingForPreview);
        return p.white.bold(fitName) + p.dimgray(phonePart) + p.dimgray(arrowPart) + p.yellow.bold(fitPreview);
    } else {
        const available = Math.max(6, MAX_INNER - stringWidth(phonePart));
        const fitName = truncateWidth(name, available);
        return p.white.bold(fitName) + p.dimgray(phonePart);
    }
}

function buildLine2(typeText, typeColorFn, status) {
    const MAX_INNER = W - 2; // 44
    let statusFormatted = p.cyan('Received');
    if (status === 'Success') statusFormatted = p.green('Success');
    else if (status === 'Failed') statusFormatted = p.red('Failed');

    const statusPart = p.dimgray(' │ ') + p.gray('Status: ') + statusFormatted;
    const statusPartWidth = stringWidth(stripAnsi(statusPart));
    const availableForType = MAX_INNER - statusPartWidth - stringWidth('Type: ');

    const cleanTypeText = stripAnsi(typeText);
    const fitTypeText = truncateWidth(cleanTypeText, availableForType);
    return p.gray('Type: ') + typeColorFn(fitTypeText) + statusPart;
}

// ── Warna mtype ───────────────────────────────────────────────────────────────
function mtypeColor(mtype) {
    if (!mtype) return p.gray;
    const t = mtype.toLowerCase();
    if (t.includes('image'))    return p.green;
    if (t.includes('video'))    return p.purple;
    if (t.includes('audio') || t.includes('ptt')) return p.peach;
    if (t.includes('sticker'))  return p.cyan;
    if (t.includes('document')) return p.blue;
    if (t.includes('location')) return p.green;
    return p.peach;
}

// ── Format file size ──────────────────────────────────────────────────────────
function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Main print function ───────────────────────────────────────────────────────
export default async function (m, conn = { user: {} }) {
    if (m.fromMe) return;
    if (
        !m ||
        !m.message ||
        m.message.protocolMessage ||
        m.message.senderKeyDistributionMessage ||
        m.mtype === 'protocolMessage' ||
        m.mtype === 'senderKeyDistributionMessage'
    ) return;

    setImmediate(async () => {
        try {
            const _name   = m.pushName || 'Unknown';
            const isGroup = m.chat.endsWith('@g.us');
            const groupName = isGroup ? (conn.chats?.[m.chat]?.subject || 'Group Chat') : null;
            const sender  = m.sender
                ? await parsePhoneNumber('+' + conn.getNumber(m.sender))?.number?.international
                : null;

            if (!sender || typeof sender !== 'string') return;

            const now = m.messageTimestamp
                ? new Date(1000 * (m.messageTimestamp.low || m.messageTimestamp))
                : new Date();
            const timeStr = now.toLocaleTimeString('id', {
                timeZone: 'Asia/Jakarta',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });

            // File size
            const filesize =
                (m.msg
                    ? m.msg.vcard
                        ? m.msg.vcard.length
                        : m.msg.fileLength
                        ? m.msg.fileLength.low || m.msg.fileLength
                        : m.msg.axolotlSenderKeyDistributionMessage
                        ? m.msg.axolotlSenderKeyDistributionMessage.length
                        : m.text
                        ? m.text.length
                        : 0
                    : m.text
                    ? m.text.length
                    : 0) || 0;

            // Mtype label
            const rawMtype = m.mtype
                ? m.mtype
                    .replace(/message$/i, '')
                    .replace('audio', m.msg?.ptt ? 'PTT' : 'Audio')
                    .replace(/^./, v => v.toUpperCase())
                : 'Text';

            const typeColorFn = mtypeColor(m.mtype);
            const rawTypeWithLength = `${rawMtype} [${formatSize(filesize)}]`;

            // Command / snippet text preview
            let preview = '';
            if (m.text) {
                preview = m.text.replace(/\r?\n|\r/g, ' ').trim();
            }

            // Badge & header
            let badge;
            if (isGroup) {
                const groupTitle = truncateWidth(groupName, 18);
                badge = p.blue(`👥 ${groupTitle.toUpperCase()}`);
            } else {
                badge = p.pink('💬 PRIVATE CHAT');
            }

            // Sender phone formatted compact
            const senderPhone = sender.replace(/\s+/g, '');

            // Status: Success | Failed | Received
            const status = m.status || (m.isCommand ? 'Success' : 'Received');

            // Baris 1: Sender & Command preview (terkunci dalam W = 46)
            const line1 = buildLine1(_name, senderPhone, preview);

            // Baris 2: Type & Dynamic Status (terkunci dalam W = 46)
            const line2 = buildLine2(rawTypeWithLength, typeColorFn, status);

            // Render Model B (3 baris rapi)
            console.log(cardTop(badge, timeStr));
            console.log(cardRow(line1));
            console.log(cardRow(line2));
            console.log(cardBottom());

        } catch (e) {
            // silent fail
        }
    });
}

let file = fileURLToPath(import.meta.url);
unwatchFile(file);
watchFile(file, async () => {
    unwatchFile(file);
    console.log(
        chalk.hex('#9CA3AF').bold(' [SISTEM]') + ' ' +
        chalk.hex('#6EE7B7').bold('FILE DIUPDATE "print.js"')
    );
});