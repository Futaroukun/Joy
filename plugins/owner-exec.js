import syntaxerror from 'syntax-error';
import util, { format, inspect, promisify } from 'util';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { createRequire } from 'module';
import cp, { exec as _exec } from 'child_process';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import fetch from 'node-fetch';
import axios from 'axios';
import chalk from 'chalk';
import * as baileys from '@whiskeysockets/baileys';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(__dirname);
const exec = promisify(_exec).bind(cp);

class CustomArray extends Array {
  constructor(...args) {
    if (typeof args[0] === 'number') return super(Math.min(args[0], 10000));
    else return super(...args);
  }
}

let handler = async (m, _2) => {
  const { conn, usedPrefix, noPrefix, args, groupMetadata, isOwner } = _2;

  const rawCode = (noPrefix || '').trim();
  if (!rawCode) return;

  const isShell = /^\$/.test(usedPrefix);
  const isEval = /^(=?>)/.test(usedPrefix);
  if (!isShell && !isEval) return;
  const startTime = Date.now();

  // Non-blocking react
  m.react?.('⏳').catch(() => {});

  // ── Shell Execution ($) ──────────────────────────────────
  if (isShell) {
    const globalBotId = global.conn?.user?.id?.split(':')[0] || global.conn?.user?.jid;
    const currentBotId = conn?.user?.id?.split(':')[0] || conn?.user?.jid;
    if (globalBotId && currentBotId && globalBotId !== currentBotId) return;

    let output = '';
    let isError = false;
    const fastShell = process.env.PREFIX ? `${process.env.PREFIX}/bin/sh` : '/bin/sh';

    try {
      const { stdout, stderr } = await exec(rawCode, {
        timeout: 30000,
        maxBuffer: 1024 * 1024 * 5,
        shell: fastShell,
        cwd: process.cwd()
      });

      const out = stdout?.trim() || '';
      const err = stderr?.trim() || '';
      output = out && err ? `${out}\n\n${err}` : out || err || '(Done / No output)';
    } catch (e) {
      const errOut = e.stdout?.trim() || '';
      const errStderr = e.stderr?.trim() || '';
      isError = !errOut && !!(errStderr || e.message);
      if (e.killed || e.signal === 'SIGTERM') {
        output = `Command timed out after 30s: ${rawCode}`;
        isError = true;
      } else {
        output = errOut && errStderr ? `${errOut}\n\n${errStderr}` : errOut || errStderr || e.message || String(e);
      }
    }

    const duration = Date.now() - startTime;
    m.react?.(isError ? '❌' : '✅').catch(() => {});

    if (output.length > 4000) {
      const preview = output.slice(0, 2000) + `\n\n... [Output terpotong, sisa ${output.length - 2000} karakter dikirim sebagai file]`;
      await conn.reply(m.chat, `\`\`\`bash\n${preview}\n\`\`\`\n*Waktu:* ${duration}ms`, m);
      return conn.sendMessage(m.chat, {
        document: Buffer.from(output, 'utf-8'),
        mimetype: 'text/plain',
        fileName: 'shell-output.txt',
        caption: `*Full Output:* ${(output.length / 1024).toFixed(1)} KB | *Waktu:* ${duration}ms`
      }, { quoted: m });
    }

    return conn.reply(m.chat, `\`\`\`bash\n${output}\n\`\`\`\n*Waktu:* ${duration}ms`, m);
  }

  // ── JavaScript Eval (> & =>) ─────────────────────────────
  let _return;
  let _syntax = '';
  const isReturn = /^=/.test(usedPrefix);
  const codeToRun = isReturn ? `return (${rawCode})` : rawCode;
  const oldExp = m.exp * 1;
  let isError = false;

  try {
    let printCount = 20;
    const f = { exports: {} };

    const scopeKeys = [
      'print', 'm', 'quoted', 'handler', 'require', 'conn',
      'Array', 'process', 'args', 'groupMetadata',
      'module', 'exports', 'argument', 'fs', 'path', 'util',
      'os', 'crypto', 'fetch', 'axios', 'chalk', 'baileys',
      'db', 'plugins', 'chat', 'sender', 'isOwner'
    ];

    const execFn = new (async () => {}).constructor(...scopeKeys, codeToRun);

    _return = await execFn.call(
      conn,
      (...printArgs) => {
        if (--printCount < 1) return;
        return conn.reply(m.chat, format(...printArgs), m);
      },
      m,
      m.quoted,
      handler,
      require,
      conn,
      CustomArray,
      process,
      args,
      groupMetadata,
      f,
      f.exports,
      [conn, _2],
      fs,
      path,
      util,
      os,
      crypto,
      fetch,
      axios,
      chalk,
      baileys,
      global.db,
      global.plugins,
      m.chat,
      m.sender,
      isOwner
    );

    // Auto-await promise jika hasil belum resolved
    if (_return instanceof Promise || (_return && typeof _return.then === 'function')) {
      _return = await _return;
    }
  } catch (e) {
    isError = true;
    const err = syntaxerror(codeToRun, 'Execution Function', {
      allowReturnOutsideFunction: true,
      allowAwaitOutsideFunction: true,
      sourceType: 'module'
    });
    if (err) _syntax = '```' + err + '```\n\n';
    _return = e;
  }

  const duration = Date.now() - startTime;
  m.react?.(isError ? '❌' : '✅').catch(() => {});

  let formattedOutput = _return;

  if (formattedOutput instanceof Error) {
    formattedOutput = formattedOutput.stack || formattedOutput.message || String(formattedOutput);
  } else if (formattedOutput !== null && typeof formattedOutput === 'object') {
    try {
      const cleanObj = {};
      for (const key in formattedOutput) {
        try {
          cleanObj[key] = formattedOutput[key];
        } catch (e) {
          cleanObj[key] = `[Getter Error: ${e.message}]`;
        }
      }
      formattedOutput = inspect(cleanObj, { depth: 2, maxArrayLength: 50, colors: false });
    } catch (e) {
      formattedOutput = inspect(formattedOutput, { depth: 2, maxArrayLength: 50, colors: false });
    }
  } else {
    formattedOutput = format(formattedOutput);
  }

  if (isError) {
    const errorText = _syntax ? `${_syntax}${formattedOutput}` : formattedOutput;
    conn.reply(m.chat, `*Error:*\n${errorText}\n\n*Waktu:* ${duration}ms`, m);
  } else if (formattedOutput.length > 4000) {
    const preview = formattedOutput.slice(0, 2000) + `\n\n... [Output terpotong, sisa ${formattedOutput.length - 2000} karakter dikirim sebagai file]`;
    await conn.reply(m.chat, `\`\`\`js\n${preview}\n\`\`\`\n*Waktu:* ${duration}ms`, m);
    conn.sendMessage(m.chat, {
      document: Buffer.from(formattedOutput, 'utf-8'),
      mimetype: 'text/plain',
      fileName: 'eval-output.txt',
      caption: `*Full Output:* ${(formattedOutput.length / 1024).toFixed(1)} KB | *Waktu:* ${duration}ms`
    }, { quoted: m });
  } else {
    conn.reply(m.chat, `\`\`\`js\n${formattedOutput}\n\`\`\`\n*Waktu:* ${duration}ms`, m);
  }

  m.exp = oldExp;
};

handler.help = ['$ *terminal/sh*', '> *eval*', '=> *eval return*'];
handler.tags = ['owner'];
handler.customPrefix = /^(=?>|\$)\s*/;
handler.rowner = true;

export default handler;
