import chalk from "chalk";
import { isJidStatusBroadcast } from '@whiskeysockets/baileys';

export async function handleAutoReadChat(conn, m) {
  try {
    if (!conn || !m || !m.key) return;
    if (m.key.fromMe) return;
    if (isJidStatusBroadcast(m.chat) || m.chat?.endsWith('@broadcast') || m.chat?.endsWith('@newsletter')) return;
    
    // Cek pengaturan autoread global (default aktif kecuali di-set false)
    if (global.autoRead === false) return;
    
    // Tandai pesan sebagai terbaca via API utama Baileys
    if (typeof conn.readMessages === 'function') {
      await conn.readMessages([m.key]);
    }
  } catch (error) {
    // Silent fail agar tidak mengganggu alur pesan utama
  }
}

export function autoReadHandler(conn, m) {
  handleAutoReadChat(conn, m).catch(() => {});
}

export default {
  handleAutoReadChat,
  autoReadHandler
};