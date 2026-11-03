import axios from 'axios';
import FormData from 'form-data';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { fileTypeFromBuffer } from 'file-type';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================
// DeepSeekHashV1 — Uint32 Implementation (Pure JS PoW Solver)
// ============================================================
const [RC_LO, RC_HI] = [[
  0x00008082, 0x0000808a, 0x80008000, 0x0000808b,
  0x80000001, 0x80008081, 0x00008009, 0x0000008a,
  0x00000088, 0x80008009, 0x8000000a, 0x8000808b,
  0x0000008b, 0x00008089, 0x00008003, 0x00008002,
  0x00000080, 0x0000800a, 0x8000000a, 0x80008081,
  0x00008080, 0x80000001, 0x80008008,
], [
  0x00000000, 0x80000000, 0x80000000, 0x00000000,
  0x00000000, 0x80000000, 0x80000000, 0x00000000,
  0x00000000, 0x00000000, 0x00000000, 0x00000000,
  0x80000000, 0x80000000, 0x80000000, 0x80000000,
  0x80000000, 0x00000000, 0x80000000, 0x80000000,
  0x80000000, 0x00000000, 0x80000000,
]];

function evenBits(x) {
  x &= 0x55555555;
  x = (x | (x >>> 1)) & 0x33333333;
  x = (x | (x >>> 2)) & 0x0f0f0f0f;
  x = (x | (x >>> 4)) & 0x00ff00ff;
  return (x | (x >>> 8)) & 0x0000ffff;
}
const ilE = (lo, hi) => evenBits(lo) | (evenBits(hi) << 16);
const ilO = (lo, hi) => evenBits(lo >>> 1) | (evenBits(hi >>> 1) << 16);
const RCE = new Int32Array(23), RC_O = new Int32Array(23);

class DeepSeekHash {
  static keccakF8(s) {
    const B = new Int32Array(50);
    for (let r = 0; r < 23; r++) {
      RCE[r] = ilE(RC_LO[r], RC_HI[r]); RC_O[r] = ilO(RC_LO[r], RC_HI[r]);
    }
    for (let r = 0; r < 22; r++) {
      const cE0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40], cO0 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      const cE1 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42], cO1 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      const cE2 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44], cO2 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      const cE3 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46], cO3 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      const cE4 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48], cO4 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
      const dE0 = cE4 ^ ((cO1 << 1) | (cO1 >>> 31)), dO0 = cO4 ^ cE1;
      const dE1 = cE0 ^ ((cO2 << 1) | (cO2 >>> 31)), dO1 = cO0 ^ cE2;
      const dE2 = cE1 ^ ((cO3 << 1) | (cO3 >>> 31)), dO2 = cO1 ^ cE3;
      const dE3 = cE2 ^ ((cO4 << 1) | (cO4 >>> 31)), dO3 = cO2 ^ cE4;
      const dE4 = cE3 ^ ((cO0 << 1) | (cO0 >>> 31)), dO4 = cO3 ^ cE0;
      const tE00 = s[0] ^ dE0, tO00 = s[1] ^ dO0;
      B[0] = tE00; B[1] = tO00;
      const tE01 = s[10] ^ dE0, tO01 = s[11] ^ dO0;
      B[32] = ((tE01 << 18) | (tE01 >>> 14)); B[33] = ((tO01 << 18) | (tO01 >>> 14));
      const tE02 = s[20] ^ dE0, tO02 = s[21] ^ dO0;
      B[14] = ((tO02 << 2) | (tO02 >>> 30)); B[15] = ((tE02 << 1) | (tE02 >>> 31));
      const tE03 = s[30] ^ dE0, tO03 = s[31] ^ dO0;
      B[46] = ((tO03 << 21) | (tO03 >>> 11)); B[47] = ((tE03 << 20) | (tE03 >>> 12));
      const tE04 = s[40] ^ dE0, tO04 = s[41] ^ dO0;
      B[28] = ((tE04 << 9) | (tE04 >>> 23)); B[29] = ((tO04 << 9) | (tO04 >>> 23));
      const tE10 = s[2] ^ dE1, tO10 = s[3] ^ dO1;
      B[20] = ((tO10 << 1) | (tO10 >>> 31)); B[21] = tE10;
      const tE11 = s[12] ^ dE1, tO11 = s[13] ^ dO1;
      B[2] = ((tE11 << 22) | (tE11 >>> 10)); B[3] = ((tO11 << 22) | (tO11 >>> 10));
      const tE12 = s[22] ^ dE1, tO12 = s[23] ^ dO1;
      B[34] = ((tE12 << 5) | (tE12 >>> 27)); B[35] = ((tO12 << 5) | (tO12 >>> 27));
      const tE13 = s[32] ^ dE1, tO13 = s[33] ^ dO1;
      B[16] = ((tO13 << 23) | (tO13 >>> 9)); B[17] = ((tE13 << 22) | (tE13 >>> 10));
      const tE14 = s[42] ^ dE1, tO14 = s[43] ^ dO1;
      B[48] = ((tE14 << 1) | (tE14 >>> 31)); B[49] = ((tO14 << 1) | (tO14 >>> 31));
      const tE20 = s[4] ^ dE2, tO20 = s[5] ^ dO2;
      B[40] = ((tE20 << 31) | (tE20 >>> 1)); B[41] = ((tO20 << 31) | (tO20 >>> 1));
      const tE21 = s[14] ^ dE2, tO21 = s[15] ^ dO2;
      B[22] = ((tE21 << 3) | (tE21 >>> 29)); B[23] = ((tO21 << 3) | (tO21 >>> 29));
      const tE22 = s[24] ^ dE2, tO22 = s[25] ^ dO2;
      B[4] = ((tO22 << 22) | (tO22 >>> 10)); B[5] = ((tE22 << 21) | (tE22 >>> 11));
      const tE23 = s[34] ^ dE2, tO23 = s[35] ^ dO2;
      B[36] = ((tO23 << 8) | (tO23 >>> 24)); B[37] = ((tE23 << 7) | (tE23 >>> 25));
      const tE24 = s[44] ^ dE2, tO24 = s[45] ^ dO2;
      B[18] = ((tO24 << 31) | (tO24 >>> 1)); B[19] = ((tE24 << 30) | (tE24 >>> 2));
      const tE30 = s[6] ^ dE3, tO30 = s[7] ^ dO3;
      B[10] = ((tE30 << 14) | (tE30 >>> 18)); B[11] = ((tO30 << 14) | (tO30 >>> 18));
      const tE31 = s[16] ^ dE3, tO31 = s[17] ^ dO3;
      B[42] = ((tO31 << 28) | (tO31 >>> 4)); B[43] = ((tE31 << 27) | (tE31 >>> 5));
      const tE32 = s[26] ^ dE3, tO32 = s[27] ^ dO3;
      B[24] = ((tO32 << 13) | (tO32 >>> 19)); B[25] = ((tE32 << 12) | (tE32 >>> 20));
      const tE33 = s[36] ^ dE3, tO33 = s[37] ^ dO3;
      B[6] = ((tO33 << 11) | (tO33 >>> 21)); B[7] = ((tE33 << 10) | (tE33 >>> 22));
      const tE34 = s[46] ^ dE3, tO34 = s[47] ^ dO3;
      B[38] = ((tE34 << 28) | (tE34 >>> 4)); B[39] = ((tO34 << 28) | (tO34 >>> 4));
      const tE40 = s[8] ^ dE4, tO40 = s[9] ^ dO4;
      B[30] = ((tO40 << 14) | (tO40 >>> 18)); B[31] = ((tE40 << 13) | (tE40 >>> 19));
      const tE41 = s[18] ^ dE4, tO41 = s[19] ^ dO4;
      B[12] = ((tE41 << 10) | (tE41 >>> 22)); B[13] = ((tO41 << 10) | (tO41 >>> 22));
      const tE42 = s[28] ^ dE4, tO42 = s[29] ^ dO4;
      B[44] = ((tO42 << 20) | (tO42 >>> 12)); B[45] = ((tE42 << 19) | (tE42 >>> 13));
      const tE43 = s[38] ^ dE4, tO43 = s[39] ^ dO4;
      B[26] = ((tE43 << 4) | (tE43 >>> 28)); B[27] = ((tO43 << 4) | (tO43 >>> 28));
      const tE44 = s[48] ^ dE4, tO44 = s[49] ^ dO4;
      B[8] = ((tE44 << 7) | (tE44 >>> 25)); B[9] = ((tO44 << 7) | (tO44 >>> 25));
      const r00E = B[0], r00O = B[1], r01E = B[2], r01O = B[3], r02E = B[4], r02O = B[5], r03E = B[6], r03O = B[7], r04E = B[8], r04O = B[9];
      s[0] = r00E ^ (~r01E & r02E); s[1] = r00O ^ (~r01O & r02O);
      s[2] = r01E ^ (~r02E & r03E); s[3] = r01O ^ (~r02O & r03O);
      s[4] = r02E ^ (~r03E & r04E); s[5] = r02O ^ (~r03O & r04O);
      s[6] = r03E ^ (~r04E & r00E); s[7] = r03O ^ (~r04O & r00O);
      s[8] = r04E ^ (~r00E & r01E); s[9] = r04O ^ (~r00O & r01O);
      const r10E = B[10], r10O = B[11], r11E = B[12], r11O = B[13], r12E = B[14], r12O = B[15], r13E = B[16], r13O = B[17], r14E = B[18], r14O = B[19];
      s[10] = r10E ^ (~r11E & r12E); s[11] = r10O ^ (~r11O & r12O);
      s[12] = r11E ^ (~r12E & r13E); s[13] = r11O ^ (~r12O & r13O);
      s[14] = r12E ^ (~r13E & r14E); s[15] = r12O ^ (~r13O & r14O);
      s[16] = r13E ^ (~r14E & r10E); s[17] = r13O ^ (~r14O & r10O);
      s[18] = r14E ^ (~r10E & r11E); s[19] = r14O ^ (~r10O & r11O);
      const r20E = B[20], r20O = B[21], r21E = B[22], r21O = B[23], r22E = B[24], r22O = B[25], r23E = B[26], r23O = B[27], r24E = B[28], r24O = B[29];
      s[20] = r20E ^ (~r21E & r22E); s[21] = r20O ^ (~r21O & r22O);
      s[22] = r21E ^ (~r22E & r23E); s[23] = r21O ^ (~r22O & r23O);
      s[24] = r22E ^ (~r23E & r24E); s[25] = r22O ^ (~r23O & r24O);
      s[26] = r23E ^ (~r24E & r20E); s[27] = r23O ^ (~r24O & r20O);
      s[28] = r24E ^ (~r20E & r21E); s[29] = r24O ^ (~r20O & r21O);
      const r30E = B[30], r30O = B[31], r31E = B[32], r31O = B[33], r32E = B[34], r32O = B[35], r33E = B[36], r33O = B[37], r34E = B[38], r34O = B[39];
      s[30] = r30E ^ (~r31E & r32E); s[31] = r30O ^ (~r31O & r32O);
      s[32] = r31E ^ (~r32E & r33E); s[33] = r31O ^ (~r32O & r33O);
      s[34] = r32E ^ (~r33E & r34E); s[35] = r32O ^ (~r33O & r34O);
      s[36] = r33E ^ (~r34E & r30E); s[37] = r33O ^ (~r34O & r30O);
      s[38] = r34E ^ (~r30E & r31E); s[39] = r34O ^ (~r30O & r31O);
      const r40E = B[40], r40O = B[41], r41E = B[42], r41O = B[43], r42E = B[44], r42O = B[45], r43E = B[46], r43O = B[47], r44E = B[48], r44O = B[49];
      s[40] = r40E ^ (~r41E & r42E); s[41] = r40O ^ (~r41O & r42O);
      s[42] = r41E ^ (~r42E & r43E); s[43] = r41O ^ (~r42O & r43O);
      s[44] = r42E ^ (~r43E & r44E); s[45] = r42O ^ (~r43O & r44O);
      s[46] = r43E ^ (~r44E & r40E); s[47] = r43O ^ (~r44O & r40O);
      s[48] = r44E ^ (~r40E & r41E); s[49] = r44O ^ (~r40O & r41O);
      s[0] ^= RCE[r]; s[1] ^= RC_O[r];
    }
    {
      const cE0 = s[0] ^ s[10] ^ s[20] ^ s[30] ^ s[40], cO0 = s[1] ^ s[11] ^ s[21] ^ s[31] ^ s[41];
      const cE1 = s[2] ^ s[12] ^ s[22] ^ s[32] ^ s[42], cO1 = s[3] ^ s[13] ^ s[23] ^ s[33] ^ s[43];
      const cE2 = s[4] ^ s[14] ^ s[24] ^ s[34] ^ s[44], cO2 = s[5] ^ s[15] ^ s[25] ^ s[35] ^ s[45];
      const cE3 = s[6] ^ s[16] ^ s[26] ^ s[36] ^ s[46], cO3 = s[7] ^ s[17] ^ s[27] ^ s[37] ^ s[47];
      const cE4 = s[8] ^ s[18] ^ s[28] ^ s[38] ^ s[48], cO4 = s[9] ^ s[19] ^ s[29] ^ s[39] ^ s[49];
      const dE0 = cE4 ^ ((cO1 << 1) | (cO1 >>> 31)), dO0 = cO4 ^ cE1;
      const dE1 = cE0 ^ ((cO2 << 1) | (cO2 >>> 31)), dO1 = cO0 ^ cE2;
      const dE2 = cE1 ^ ((cO3 << 1) | (cO3 >>> 31)), dO2 = cO1 ^ cE3;
      const dE3 = cE2 ^ ((cO4 << 1) | (cO4 >>> 31)), dO3 = cO2 ^ cE4;
      const dE4 = cE3 ^ ((cO0 << 1) | (cO0 >>> 31)), dO4 = cO3 ^ cE0;
      const tE0 = s[0] ^ dE0, tO0 = s[1] ^ dO0;
      const qE0 = tE0, qO0 = tO0;
      const tE1 = s[12] ^ dE1, tO1 = s[13] ^ dO1;
      const qE1 = ((tE1 << 22) | (tE1 >>> 10)), qO1 = ((tO1 << 22) | (tO1 >>> 10));
      const tE2 = s[24] ^ dE2, tO2 = s[25] ^ dO2;
      const qE2 = ((tO2 << 22) | (tO2 >>> 10)), qO2 = ((tE2 << 21) | (tE2 >>> 11));
      const tE3 = s[36] ^ dE3, tO3 = s[37] ^ dO3;
      const qE3 = ((tO3 << 11) | (tO3 >>> 21)), qO3 = ((tE3 << 10) | (tE3 >>> 22));
      const tE4 = s[48] ^ dE4, tO4 = s[49] ^ dO4;
      const qE4 = ((tE4 << 7) | (tE4 >>> 25)), qO4 = ((tO4 << 7) | (tO4 >>> 25));
      s[0] = qE0 ^ (~qE1 & qE2) ^ RCE[22]; s[1] = qO0 ^ (~qO1 & qO2) ^ RC_O[22];
      s[2] = qE1 ^ (~qE2 & qE3); s[3] = qO1 ^ (~qO2 & qO3);
      s[4] = qE2 ^ (~qE3 & qE4); s[5] = qO2 ^ (~qO3 & qO4);
      s[6] = qE3 ^ (~qE4 & qE0); s[7] = qO3 ^ (~qO4 & qO0);
      s[8] = qE4 ^ (~qE0 & qE1); s[9] = qO4 ^ (~qO0 & qO1);
    }
  }

  static solve(challenge, prefix, maxNonce) {
    const tb = Buffer.from(challenge, 'hex');
    const t0 = ilE(tb.readInt32LE(0),  tb.readInt32LE(4)),  t1 = ilO(tb.readInt32LE(0),  tb.readInt32LE(4));
    const t2 = ilE(tb.readInt32LE(8),  tb.readInt32LE(12)), t3 = ilO(tb.readInt32LE(8),  tb.readInt32LE(12));
    const t4 = ilE(tb.readInt32LE(16), tb.readInt32LE(20)), t5 = ilO(tb.readInt32LE(16), tb.readInt32LE(20));
    const t6 = ilE(tb.readInt32LE(24), tb.readInt32LE(28)), t7 = ilO(tb.readInt32LE(24), tb.readInt32LE(28));
    const base = new Int32Array(50);
    const S = new Int32Array(50);
    const RATE = 136;
    const PAD  = 0x06;
    const solvePad = Buffer.alloc(RATE);

    const pre = Buffer.from(prefix, 'utf8');
    const pl = pre.length;
    solvePad.fill(0);
    pre.copy(solvePad, 0);
    solvePad[RATE - 1] = 0x80;
    base.fill(0);
    for (let l = 0; l < RATE >> 3; l++) {
      const lo = solvePad.readInt32LE(l * 8), hi = solvePad.readInt32LE(l * 8 + 4);
      if ((lo | hi) === 0) continue;
      base[2 * l] = ilE(lo, hi);
      base[2 * l + 1] = ilO(lo, hi);
    }
    const firstLane = pl >> 3;

    let digits = 1, limit = 10;
    for (let n = 0; n < maxNonce; n++) {
      if (n === limit) { digits++; limit *= 10; }
      const len = pl + digits;
      if (len > RATE - 2) return undefined;

      let m = n;
      for (let p = len - 1; p >= pl; p--) {
        const d = m % 10;
        solvePad[p] = 48 + d;
        m = (m - d) / 10;
      }
      solvePad[len] = PAD;
    
      S.set(base);
      for (let l = firstLane, last = len >> 3; l <= last; l++) {
        const lo = solvePad.readInt32LE(l * 8), hi = solvePad.readInt32LE(l * 8 + 4);
        S[2 * l] = ilE(lo, hi);
        S[2 * l + 1] = ilO(lo, hi);
      }
      DeepSeekHash.keccakF8(S);

      if (S[0] === t0 && S[1] === t1 && S[2] === t2 && S[3] === t3 &&
          S[4] === t4 && S[5] === t5 && S[6] === t6 && S[7] === t7) return n;
    }
    return undefined;
  }
}

function dsSolve(challenge, prefix, maxNonce) {
  return DeepSeekHash.solve(challenge, prefix, maxNonce);
}

// ============================================================
// Chat Session Wrapper
// ============================================================
class ChatSession {
  constructor(client, { id, parentMessageId = null } = {}) {
    this.client = client;
    this.id = id;
    this.parentMessageId = parentMessageId;
  }

  async chat({ prompt, parent_message_id, ref_file_urls = [], thinking_enabled = false, search_enabled = false } = {}) {
    const result = await this.client.chatCompletions({
      prompt,
      chat_session_id: this.id,
      parent_message_id: parent_message_id ?? this.parentMessageId,
      ref_file_urls,
      thinking_enabled,
      search_enabled
    });

    if (result && !result.error && Number.isInteger(result.message_id) && result.message_id > 0) {
      this.parentMessageId = result.message_id;
    }

    return result;
  }
}

// ============================================================
// DeepSeek Client dengan Auto-Relogin & Token Cache
// ============================================================
class DeepSeek {
  constructor({
    email = null,
    password = null,
    deviceId = null,
    auth = null,
    accountFile = null,
    tokenFile = null,
    clientVersion = '2.3.0',
    headers = {}
  } = {}) {
    this.accountFile = accountFile || path.join(__dirname, '../../data/deepseek-account.json');
    this.tokenFile = tokenFile || path.join(__dirname, '../../data/deepseek-token.json');

    const acc = this.loadSavedAccount();
    this.email = email || process.env.DEEPSEEK_EMAIL || acc.email || "";
    this.password = password || process.env.DEEPSEEK_PASSWORD || acc.password || "";
    this.deviceId = deviceId || process.env.DEEPSEEK_DEVICE_ID || acc.deviceId || "7865329968002107661";
    this.clientVersion = clientVersion;
    this.customHeaders = headers;

    // Inisialisasi token
    this.auth = auth || this.loadSavedToken();
    this.initHeaders();
  }

  loadSavedAccount() {
    try {
      if (fs.existsSync(this.accountFile)) {
        const data = JSON.parse(fs.readFileSync(this.accountFile, 'utf8'));
        if (data && (data.email || data.password || data.deviceId)) {
          const exampleFile = this.accountFile.replace(/\.json$/, '.example.json');
          if (fs.existsSync(exampleFile)) {
            try { fs.unlinkSync(exampleFile); } catch {}
          }
        }
        return data;
      }
    } catch {}
    return {};
  }

  loadSavedToken() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        const raw = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        if (raw?.token) return raw.token;
      }
    } catch {}
    return process.env.DEEPSEEK_TOKEN || null;
  }

  saveToken(token) {
    this.auth = token;
    this.initHeaders();
    try {
      const dir = path.dirname(this.tokenFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.tokenFile, JSON.stringify({
        token,
        email: this.email,
        updatedAt: new Date().toISOString()
      }, null, 2));
    } catch {}
  }

  initHeaders() {
    this.headers = {
      'User-Agent': `DeepSeek/${this.clientVersion} Android/31`,
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'Content-Type': 'application/json',
      'x-client-platform': 'android',
      'x-client-version': this.clientVersion,
      'x-client-locale': 'en_US',
      'x-rangers-id': this.deviceId,
      'accept-charset': 'UTF-8',
      ...(this.auth ? { 'authorization': `Bearer ${this.auth}` } : {}),
      ...this.customHeaders
    };
  }

  async login() {
    if (!this.email || !this.password) {
      throw new Error("DeepSeek: Email dan password diperlukan untuk login otomatis.");
    }

    const res = await axios.post("https://chat.deepseek.com/api/v0/users/login", {
      email: this.email,
      password: this.password,
      device_id: this.deviceId,
      os: "android"
    }, {
      headers: {
        'User-Agent': `DeepSeek/${this.clientVersion} Android/31`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-client-platform': 'android',
        'x-client-version': this.clientVersion,
        'x-client-locale': 'en_US',
        'x-rangers-id': this.deviceId,
        'accept-charset': 'UTF-8'
      },
      validateStatus: () => true
    });

    const body = res.data;
    if (body.code === 0 && body.data?.biz_code === 0 && body.data?.biz_data?.token) {
      const token = body.data.biz_data.token;
      this.saveToken(token);
      return token;
    }

    const bizMsg = body.data?.biz_msg || body.msg || 'UNKNOWN_ERROR';
    throw new Error(`Auto-Login DeepSeek gagal: ${bizMsg}`);
  }

  calculateHash(algorithm, challenge, salt, difficulty, expireAt) {
    if (algorithm !== 'DeepSeekHashV1') {
      throw new Error('Unsupported algorithm: ' + algorithm);
    }
    const prefix = `${salt}_${expireAt}_`;
    const answer = dsSolve(challenge, prefix, difficulty);
    return answer;
  }

  async generateSignature(path) {
    let pow = await axios.post("https://chat.deepseek.com/api/v0/chat/create_pow_challenge", {
      target_path: path
    }, {
      headers: this.headers,
      validateStatus: () => true
    });

    // Tangani token expired / missing token
    if (pow.data?.code === 40002 || pow.data?.code === 40003) {
      await this.login();
      pow = await axios.post("https://chat.deepseek.com/api/v0/chat/create_pow_challenge", {
        target_path: path
      }, {
        headers: this.headers
      });
    }

    if (pow.status !== 200) return null;
    if (pow.data?.code && pow.data.code !== 0) {
      throw new Error(`PoW Challenge Error [${pow.data.code}]: ${pow.data.msg}`);
    }

    const response = pow?.data?.data?.biz_data?.challenge;
    if (!response) throw new Error("Gagal memperoleh PoW challenge.");

    const { algorithm, challenge, salt, difficulty, expire_at, signature, target_path } = response;
    const answer = this.calculateHash(algorithm, challenge, salt, difficulty, expire_at);
    if (answer === undefined) throw new Error("PoW failed: nonce tidak ditemukan.");

    return Buffer.from(JSON.stringify({
      algorithm,
      challenge,
      salt,
      answer,
      signature,
      target_path
    })).toString('base64');
  }

  async create({ agent = "chat" } = {}) {
    if (!this.auth) await this.login();

    let res = await axios.post("https://chat.deepseek.com/api/v0/chat_session/create", {
      agent
    }, {
      headers: this.headers,
      validateStatus: () => true
    });

    if (res.data?.code === 40002 || res.data?.code === 40003) {
      await this.login();
      res = await axios.post("https://chat.deepseek.com/api/v0/chat_session/create", {
        agent
      }, {
        headers: this.headers
      });
    }

    if (res.data?.code && res.data.code !== 0) {
      throw new Error(`Create Chat Error [${res.data.code}]: ${res.data.msg}`);
    }

    const id = res?.data?.data?.biz_data?.chat_session?.id;
    if (!id) throw new Error("Gagal membuat sesi chat baru: ID tidak ditemukan.");

    return new ChatSession(this, { id });
  }

  async chatCompletions({ prompt, chat_session_id, parent_message_id = null, ref_file_urls = [], thinking_enabled = false, search_enabled = false }) {
    if (!this.auth) await this.login();

    let ref_file_ids = [];
    if (ref_file_urls && ref_file_urls.length > 0) {
      for (const item of ref_file_urls) {
        const file_id = await this.uploadFile(item);
        if (file_id) ref_file_ids.push(file_id);
      }
    }

    const signature = await this.generateSignature("/api/v0/chat/completion");

    let response = await axios.post("https://chat.deepseek.com/api/v0/chat/completion", {
      chat_session_id,
      parent_message_id,
      prompt,
      ref_file_ids,
      thinking_enabled,
      search_enabled,
      legacy_format: true
    }, {
      headers: {
        ...this.headers,
        'x-ds-pow-response': signature,
      },
      validateStatus: () => true
    });

    // Tangani token expired di completion
    if (response.data?.code === 40002 || response.data?.code === 40003) {
      await this.login();
      const retrySig = await this.generateSignature("/api/v0/chat/completion");
      response = await axios.post("https://chat.deepseek.com/api/v0/chat/completion", {
        chat_session_id,
        parent_message_id,
        prompt,
        ref_file_ids,
        thinking_enabled,
        search_enabled,
        legacy_format: true
      }, {
        headers: {
          ...this.headers,
          'x-ds-pow-response': retrySig,
        }
      });
    }

    if (response.status !== 200) return null;

    if (typeof response.data !== 'string') {
      const biz = response.data?.data;
      if (biz && biz.biz_code) throw new Error(`DeepSeek error [${biz.biz_code}]: ${biz.biz_msg}`);
      return null;
    }

    return this.parseEventStream(response.data);
  }

  async uploadFile(url) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    if (response.status !== 200) throw new Error("Gagal mengunduh buffer file.");

    const mimetype = response.headers["content-type"] || "";
    const allowedTypes = ["application/json", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];

    if (!(mimetype.startsWith("image/") || mimetype.startsWith("text/") || allowedTypes.includes(mimetype))) return null;

    const buffer = Buffer.from(response.data);
    const type = await fileTypeFromBuffer(buffer);
    const ext = type ? type.ext : 'bin';

    let data = new FormData();
    data.append('file', buffer, `${crypto.randomUUID()}.${ext}`);

    const signature = await this.generateSignature("/api/v0/file/upload_file");

    const res = await axios.post("https://chat.deepseek.com/api/v0/file/upload_file", data, {
      headers: {
        ...this.headers,
        'Content-Type': undefined,
        'x-ds-pow-response': signature,
        ...data.getHeaders()
      }
    });

    if (res.status !== 200) return null;

    const file_id = res.data.data.biz_data.id;
    for (let attempt = 1; attempt <= 5; attempt++) {
      const { data } = await axios.get(`https://chat.deepseek.com/api/v0/file/fetch_files?file_ids=${file_id}`, {
        headers: this.headers
      });

      const file = data?.data?.biz_data?.files?.[0];
      if (file?.status === "SUCCESS") return file_id;
      if (file?.status === "FAILED") throw new Error(`Proses file gagal: ${file_id}`);

      if (attempt < 5) await new Promise(resolve => setTimeout(resolve, 3000));
    }
    throw new Error(`Timeout memproses file: ${file_id}`);
  }

  parseEventStream(data) {
    const lines = data.split('\n');
    let response = '';
    let thinking = '';
    let search_queries = [];
    let search_results = [];
    let search_indexes = [];
    let message_id = -1;
    let parent_id = -1;
    let error = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('data:')) {
        const jsonStr = line.substring(5).trim();
        try {
          if (jsonStr && jsonStr !== '{}') {
            const doc = JSON.parse(jsonStr);

            if (doc?.type === "error") error = doc.content || doc.finish_reason || "unknown error";
            if (doc?.choices?.[0]?.delta?.type === "text" && doc?.choices?.[0]?.delta?.content) response += doc.choices[0].delta.content;
            if (doc?.choices?.[0]?.delta?.type === "thinking" && doc?.choices?.[0]?.delta?.content) thinking += doc.choices[0].delta.content;
            if (doc?.choices?.[0]?.delta?.type === "search_query" && doc?.choices?.[0]?.delta?.search_queries) search_queries = doc.choices[0].delta.search_queries;
            if (doc?.choices?.[0]?.delta?.type === "search_result" && doc?.choices?.[0]?.delta?.search_results) search_results = doc.choices[0].delta.search_results;
            if (doc?.choices?.[0]?.delta?.type === "search_index" && doc?.choices?.[0]?.delta?.search_indexes) search_indexes = doc.choices[0].delta.search_indexes;

            if (doc.message_id) message_id = doc.message_id;
            if (doc.parent_id) parent_id = doc.parent_id;
            if (doc.response_message_id) message_id = doc.response_message_id;
            if (doc.request_message_id) parent_id = doc.request_message_id;

            if (doc?.v?.response?.fragments) {
              for (const frag of doc.v.response.fragments) {
                if (frag.type === "RESPONSE" && frag.content) response += frag.content;
              }
            }

            if (doc?.v && typeof doc.v === 'string' && doc?.p === "response/content") response += doc.v;
            else if (doc?.v && typeof doc.v === 'string' && doc?.p === "response/fragments/-1/content") response += doc.v;
            else if (doc?.v && typeof doc.v === 'string' && !doc?.p) response += doc.v;

            if (doc?.v?.response?.message_id) message_id = doc.v.response.message_id;
            if (doc?.v?.response?.parent_id) parent_id = doc.v.response.parent_id;
          }
        } catch {}
      }
    }

    return { message: response, thoughts: thinking, search_queries, search_results, search_indexes, message_id, parent_id, error };
  }

  // Helper sekali panggil untuk bot/script
  async chat({ prompt, thinking_enabled = false, search_enabled = false } = {}) {
    const session = await this.create();
    return await session.chat({ prompt, thinking_enabled, search_enabled });
  }
}

// Instance singleton bawaan
const defaultClient = new DeepSeek();

export { DeepSeek, ChatSession, DeepSeekHash, dsSolve };
export default defaultClient;
