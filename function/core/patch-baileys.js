/*
 * @Author      : Rafli / Joy Bot
 * @Feature     : Baileys Upstream Hotfixer
 * @Description : Menerapkan patch upstream kritis (PR #2866, #2864, #2856, #2847, #2837) secara otomatis ke @whiskeysockets/baileys.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let isPatched = false;

export function applyBaileysPatches() {
    if (isPatched) return;
    isPatched = true;
    let pkgDir = path.join(process.cwd(), 'node_modules', '@whiskeysockets', 'baileys');
    if (!fs.existsSync(pkgDir)) {
        pkgDir = path.join(__dirname, '..', '..', 'node_modules', '@whiskeysockets', 'baileys');
    }
    if (!fs.existsSync(pkgDir)) return;

    // 1. Patch messages-recv.js
    const recvPath = path.join(pkgDir, 'lib', 'Socket', 'messages-recv.js');
    if (fs.existsSync(recvPath)) {
        let content = fs.readFileSync(recvPath, 'utf8');
        let modified = false;

        // PR #2864: Skip retry receipt for undecryptable fromMe messages
        if (!content.includes('undecryptable fromMe message: acking without a retry receipt')) {
            const target = "else {\n                        // Skip retry for expired status messages";
            const replacement = `else {\n                        if (msg.key.fromMe) {\n                            logger.debug({ key: msg.key }, 'undecryptable fromMe message: acking without a retry receipt');\n                            acked = true;\n                            return sendMessageAck(node);\n                        }\n\n                        // Skip retry for expired status messages`;
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
            }
        }

        // PR #2866: Auto-ack <status> stanzas
        if (!content.includes("ws.on('CB:status'")) {
            const target = "ws.on('CB:notification', async (node) => {\n        await processNode('notification', node, 'handling notification', handleNotification);\n    });";
            const replacement = `${target}\n    ws.on('CB:status', (node) => {\n        sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status'));\n    });`;
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(recvPath, content, 'utf8');
        }
    }

    // 2. Patch messages-send.js
    const sendPath = path.join(pkgDir, 'lib', 'Socket', 'messages-send.js');
    if (fs.existsSync(sendPath)) {
        let content = fs.readFileSync(sendPath, 'utf8');
        let modified = false;

        // PR #2856: Retry addressing to own LID device
        if (!content.includes('const isParticipantLid = isLidUser(participant.jid);')) {
            const target = `else if (areJidsSameUser(participant.jid, meId)) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }`;
            const replacement = `else if ((isLidUser(participant.jid) ? (meLid && areJidsSameUser(participant.jid, meLid)) : areJidsSameUser(participant.jid, meId))) {\n                    stanza.attrs.to = participant.jid;\n                    stanza.attrs.recipient = destinationJid;\n                }`;
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
            }
        }

        // PR #2847: Get correct media type for wrapped messages like viewOnce
        if (!content.includes('getMediaType(normalizeMessageContent(message) || message)')) {
            const target = "if (getMediaType(message) !== '') {\n            return 'media';\n        }";
            const replacement = "if (getMediaType(normalizeMessageContent(message) || message) !== '') {\n            return 'media';\n        }";
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
            }
        }

        // PR #2837: Tag view once sends with meta node at stanza level
        if (!content.includes("stanza.content.push({ tag: 'meta', attrs: { view_once: 'true' } });")) {
            const target = `logger.debug({ jid }, 'adding device identity');\n            }`;
            const replacement = `${target}\n            const isVO = Boolean((message?.viewOnceMessage || message?.viewOnceMessageV2 || message?.viewOnceMessageV2Extension)?.message);\n            if (isVO) {\n                stanza.content.push({ tag: 'meta', attrs: { view_once: 'true' } });\n            }`;
            if (content.includes(target)) {
                content = content.replace(target, replacement);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(sendPath, content, 'utf8');
        }
    }

    // 3. Patch messages-media.js (Auto-retry getHttpStream on fetch failed / network glitches)
    const mediaPath = path.join(pkgDir, 'lib', 'Utils', 'messages-media.js');
    if (fs.existsSync(mediaPath)) {
        let content = fs.readFileSync(mediaPath, 'utf8');
        let modified = false;

        const enhancedGetHttpStream = `export const getHttpStream = async (url, options = {}) => {\n    // Patched: auto-retry getHttpStream v3\n    let response;\n    let lastError;\n    for (let attempt = 1; attempt <= 3; attempt++) {\n        try {\n            const reqHeaders = { ...(options.headers || {}) };\n            if (attempt > 1) reqHeaders['Connection'] = 'close';\n            response = await fetch(url.toString(), {\n                dispatcher: options.dispatcher,\n                method: 'GET',\n                headers: reqHeaders,\n                signal: options.signal || AbortSignal.timeout(60000)\n            });\n            break;\n        } catch (err) {\n            lastError = err;\n            if (attempt < 3 && (/fetch failed|timeout|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|abort|terminated/i.test(err?.message || '') || err?.name === 'TypeError' || err?.name === 'TimeoutError')) {\n                await new Promise(res => setTimeout(res, attempt * 600));\n                continue;\n            }\n            throw err;\n        }\n    }\n    if (!response && lastError) throw lastError;\n    if (!response.ok) {\n        throw new Boom(\`Failed to fetch stream from \${url}\`, { statusCode: response.status, data: { url } });\n    }\n    // @ts-ignore Node18+ Readable.fromWeb exists\n    return response.body instanceof Readable ? response.body : Readable.fromWeb(response.body);\n};`;

        if (!content.includes('// Patched: auto-retry getHttpStream v3')) {
            const regex = /export const getHttpStream = async \([\s\S]*?\n\};/;
            if (regex.test(content)) {
                content = content.replace(regex, enhancedGetHttpStream);
                modified = true;
            }
        }

        if (modified) {
            fs.writeFileSync(mediaPath, content, 'utf8');
        }
    }

    // 4. Re-export Addon (getAudioWaveform, detectMediaInfo, etc.) in lib/index.js
    const indexPath = path.join(pkgDir, 'lib', 'index.js');
    if (fs.existsSync(indexPath)) {
        let content = fs.readFileSync(indexPath, 'utf8');
        if (!content.includes("./Addon/index.js")) {
            content += "\nexport * from './Addon/index.js';\n";
            fs.writeFileSync(indexPath, content, 'utf8');
        }
    }
}

applyBaileysPatches();
export default applyBaileysPatches;
