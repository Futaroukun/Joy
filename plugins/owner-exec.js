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
  const { conn, usedPrefix, noPrefix, command, args, text, groupMetadata = {} } = _2;

  const cmd = (command || '').toLowerCase();
  const pref = (usedPrefix || '').trim();

  const isShell = pref.startsWith('$') || cmd === 'exec' || cmd === 'sh';
  const isReturn = pref.startsWith('=>') || cmd === 'return';
  const isEval = pref.startsWith('>') || isReturn || cmd === 'eval';

  if (!isShell && !isEval) return;

  let rawCode = '';
  if (cmd === 'exec' || cmd === 'sh' || cmd === 'eval' || cmd === 'return') {
    rawCode = text || (args || []).join(' ') || '';
  } else {
    rawCode = (noPrefix || '').trim();
  }

  if (!rawCode) {
    return m.reply(`Masukkan perintah terminal atau kode JavaScript.\n\nContoh:\n• \`$ ls -la\`\n• \`${usedPrefix}exec ls -la\`\n• \`> 1 + 1\`\n• \`${usedPrefix}eval 1 + 1\``);
  }

  const startTime = Date.now();

  // Non-blocking react
  m.react?.('⏳').catch(() => {});

  // ── Shell Execution ($ / .exec / .sh) ─────────────────────
  if (isShell) {
    let output = '';
    let isError = false;

    const execOptions = {
      timeout: 30000,
      maxBuffer: 1024 * 1024 * 5,
      cwd: process.cwd()
    };
    if (process.env.PREFIX && fs.existsSync(`${process.env.PREFIX}/bin/sh`)) {
      execOptions.shell = `${process.env.PREFIX}/bin/sh`;
    }

    try {
      const { stdout, stderr } = await exec(rawCode, execOptions);
      const out = stdout?.trim() || '';
      const err = stderr?.trim() || '';
      output = out && err ? `${out}\n\n${err}` : out || err || '(Selesai tanpa output)';
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
      await m.reply(`\`\`\`bash\n${preview}\n\`\`\`\n*Waktu:* ${duration}ms`);
      return conn.sendMessage(m.chat, {
        document: Buffer.from(output, 'utf-8'),
        mimetype: 'text/plain',
        fileName: 'shell-output.txt',
        caption: `*Full Output:* ${(output.length / 1024).toFixed(1)} KB | *Waktu:* ${duration}ms`
      }, { quoted: m });
    }

    return m.reply(`\`\`\`bash\n${output}\n\`\`\`\n*Waktu:* ${duration}ms`);
  }

  // ── JavaScript Eval (> & => & .eval) ──────────────────────
  let _return;
  let _syntax = '';
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
        return m.reply(format(...printArgs));
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
      global.db.data?.chats?.[m.chat],
      m.sender,
      _2.isOwner
    );

    _syntax = '';
  } catch (err) {
    isError = true;
    _syntax = err?.message || String(err);
  }

  const duration = Date.now() - startTime;
  m.react?.(isError ? '❌' : '✅').catch(() => {});

  if (_syntax) {
    return m.reply(`*Error:*\n\`\`\`js\n${_syntax}\n\`\`\`\n\n*Waktu:* ${duration}ms`);
  }

  const formattedOutput = inspect(_return, { depth: 2, colors: false });
  if (formattedOutput.length > 4000) {
    const preview = formattedOutput.slice(0, 2000) + `\n\n... [Output terpotong, sisa ${formattedOutput.length - 2000} karakter dikirim sebagai file]`;
    await m.reply(`\`\`\`js\n${preview}\n\`\`\`\n*Waktu:* ${duration}ms`);
    return conn.sendMessage(m.chat, {
      document: Buffer.from(formattedOutput, 'utf-8'),
      mimetype: 'text/plain',
      fileName: 'eval-output.txt',
      caption: `*Full Output:* ${(formattedOutput.length / 1024).toFixed(1)} KB | *Waktu:* ${duration}ms`
    }, { quoted: m });
  }

  return m.reply(`\`\`\`js\n${formattedOutput}\n\`\`\`\n*Waktu:* ${duration}ms`);
};

handler.help = ['$ *terminal/sh*', '> *eval*', '=> *eval return*', 'exec *<sh>*', 'eval *<code>*'];
handler.tags = ['owner'];
handler.customPrefix = /^(=?>|\$)\s*/;
handler.command = ['exec', 'sh', 'eval', 'return'];
handler.rowner = true;
handler.owner = true;

export default handler;
