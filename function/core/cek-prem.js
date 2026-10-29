import chalk from 'chalk';

let schedulerTime = null;

export function startPremiumScheduler(conn) {
  if (schedulerTime) clearInterval(schedulerTime);
  schedulerTime = setInterval(() => checkExpiredPremium(conn), 60 * 1000);
};

export function stopPremiumScheduler() {
  if (schedulerTime) {
    clearInterval(schedulerTime);
    schedulerTime = null;
  };
};

async function checkExpiredPremium(conn) {
  try {
    if (!global.sqlite?.open) return;
    
    const now = Date.now();
    
    const rows = global.sqlite.prepare(`
      SELECT jid, data FROM users
      WHERE json_extract(data, '$.premium') = 1
      AND json_extract(data, '$.premiumDate') > 0
      AND json_extract(data, '$.premiumDate') <= ?
    `).all(now);
      
    if (!rows.length) return;
    
    for (const row of rows) {
      let user
      try {
        user = JSON.parse(row.data);
      } catch {
        continue
      };
      
      user.premium = false;
      user.premiumDate = -1;
      user.limit = 25;
      
      global.sqlite.prepare(`
        INSERT OR REPLACE INTO users (jid, data) VALUES (?, ?)
      `).run(row.jid, JSON.stringify(user));
      
      if (global.db?.data?.users?.[row.jid]) {
        global.db.data.users[row.jid].premium = false;
        global.db.data.users[row.jid].premiumDate = -1;
        global.db.data.users[row.jid].limit = 25;
      };
      
      try {
        await conn.sendMessage(row.jid, {
          text:
            `*PREMIUM HABIS*\n\n` +
            `Masa premium kamu sudah berakhir.\n\n` +
            `Hubungi owner untuk perpanjang:\n` +
            `wa.me/${(global.info?.nomorowner || global.owner?.[0] || '').toString().replace(/\D/g, '')}`
        });
      } catch (e) {
        console.log(`${chalk.white.bold(' [PREMIUM]')} ${chalk.red(`Gagal kirim notif ke ${row.jid}: ${e.message}`)}`);
      };
      await new Promise(r => setTimeout(r, 1000));
  };
  } catch (e) {
    console.error(e.message);
  };
};