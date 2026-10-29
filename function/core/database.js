/*
 * @Author      : Joy Bot
 * @Feature     : Database Engine (SQLite & WAL Manager)
 * @Description : Mengelola inisialisasi SQLite, proxy in-memory database, batch debounce flush,
 *                sinkronisasi StoreLid, dan scheduler reset limit harian.
 */

import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, statSync, copyFileSync, readdirSync } from 'fs';
import chalk from 'chalk';
import cron from 'node-cron';

let sqlite = null;
let dbClosed = false;
let checkpointInterval = null;
let saveDebounceTimer = null;
const dirtyEntries = new Map();
const saveStatements = {};

export function getSqlite() {
    return sqlite;
}

export function performCheckpoint(mode = 'PASSIVE') {
    if (dbClosed || !sqlite || !sqlite.open) return null;
    try {
        return sqlite.pragma(`wal_checkpoint(${mode})`);
    } catch (e) {
        if (!dbClosed) console.error(chalk.red(" [SQLITE ERROR]"), e.message);
        return null;
    }
}

export function flushDirtyData() {
    if (dbClosed || !sqlite || !sqlite.open || dirtyEntries.size === 0) return;
    const entries = Array.from(dirtyEntries.values());
    dirtyEntries.clear();

    try {
        const batchWrite = sqlite.transaction((items) => {
            for (const item of items) {
                let { table, jid } = item;
                if (!jid) continue;
                if (table === 'pluginSettings') jid = 'GLOBAL_CONFIG';

                let target;
                if (table === 'users' || table === 'chats' || table === 'settings' || table === 'owners') {
                    target = global.db?.data?.[table]?.[jid];
                } else if (table === 'miku') {
                    target = global.mikuDb?.data?.[jid];
                } else if (table === 'keuangan') {
                    target = global.uangDb?.data?.[jid];
                } else if (table === 'pluginSettings') {
                    target = global.db?.data?.pluginSettings;
                }

                if (!target) {
                    saveStatements[table]?.delete?.run(jid);
                } else {
                    saveStatements[table]?.insert?.run(jid, JSON.stringify(target));
                }
            }
        });
        batchWrite(entries);
    } catch (e) {
        console.error('[SQLITE BATCH ERROR]:', e.message);
    }
}

export function flushDatabase() {
    if (saveDebounceTimer) {
        clearTimeout(saveDebounceTimer);
        saveDebounceTimer = null;
    }
    flushDirtyData();
}

export function saveData(table, jid) {
    if (!table || !jid) return;
    if (table === 'pluginSettings') jid = 'GLOBAL_CONFIG';

    try {
        if (typeof jid === 'string' && global.conn) {
            if (jid.endsWith('@s.whatsapp.net')) {
                let lid = global.conn.getLid ? global.conn.getLid(jid) : null;
                if (!lid && global.conn.storeLid) {
                    lid = global.conn.storeLid[jid];
                }
                if (lid && lid !== jid) {
                    saveStatements[table]?.delete?.run(jid);
                    jid = lid;
                }
            } else if (jid.endsWith('@lid') && global.conn.storeLid) {
                const phoneJid = global.conn.storeLid[jid];
                if (phoneJid && phoneJid !== jid) {
                    saveStatements[table]?.delete?.run(phoneJid);
                }
            }
        }

        const key = `${table}:${jid}`;
        dirtyEntries.set(key, { table, jid });

        if (!saveDebounceTimer) {
            saveDebounceTimer = setTimeout(() => {
                saveDebounceTimer = null;
                flushDirtyData();
            }, 1500);
        }
    } catch (e) {
        console.error(`[SQLITE ERROR] ${table} (${jid}):`, e.message);
    }
}

function createIndexedDbProxy() {
    const target = {};
    const resolveProp = (prop) => {
        if (typeof prop !== 'string') return { resolved: prop, opposite: null };
        
        // Direction 1: JID to LID
        if (prop.endsWith('@s.whatsapp.net')) {
            let lid = global.conn?.getLid ? global.conn.getLid(prop) : null;
            if (!lid && global.conn?.storeLid) {
                lid = global.conn.storeLid[prop];
            }
            if (lid && lid !== prop) {
                return { resolved: lid, opposite: prop };
            }
        }
        
        // Direction 2: LID to JID
        if (prop.endsWith('@lid') && global.conn?.storeLid) {
            const phoneJid = global.conn.storeLid[prop];
            if (phoneJid && phoneJid !== prop) {
                return { resolved: prop, opposite: phoneJid };
            }
        }
        
        return { resolved: prop, opposite: null };
    };

    const handler = {
        get(target, prop) {
            if (typeof prop !== 'string') return target[prop];
            const { resolved, opposite } = resolveProp(prop);
            
            if (opposite) {
                if (resolved in target) {
                    if (opposite in target) {
                        const defaultsDeep = global.lodash?.defaultsDeep || ((a, b) => Object.assign({}, b, a));
                        target[resolved] = defaultsDeep(target[resolved], target[opposite]);
                        delete target[opposite];
                    }
                    return target[resolved];
                }
                if (opposite in target) {
                    target[resolved] = target[opposite];
                    delete target[opposite];
                    return target[resolved];
                }
            }
            return target[resolved];
        },
        set(target, prop, value) {
            if (typeof prop !== 'string') {
                target[prop] = value;
                return true;
            }
            const { resolved, opposite } = resolveProp(prop);
            if (opposite && (opposite in target)) {
                delete target[opposite];
            }
            target[resolved] = value;
            return true;
        },
        has(target, prop) {
            if (typeof prop !== 'string') return prop in target;
            const { resolved, opposite } = resolveProp(prop);
            if (opposite && (opposite in target)) {
                return true;
            }
            return resolved in target;
        },
        deleteProperty(target, prop) {
            if (typeof prop !== 'string') {
                delete target[prop];
                return true;
            }
            const { resolved, opposite } = resolveProp(prop);
            if (opposite) {
                delete target[opposite];
            }
            delete target[resolved];
            return true;
        }
    };
    return new Proxy(target, handler);
}

export function wrapStoreLid(conn) {
    if (!conn || !sqlite) return;
    
    if (!conn.storeNumber) conn.storeNumber = {};
    const storeLidTarget = Object.create(null);
    try {
        const rows = sqlite.prepare(`SELECT * FROM storeLid`).all();
        rows.forEach(row => {
            if (typeof row.pn === 'string' && typeof row.lid === 'string') {
                storeLidTarget[row.pn] = row.lid;
                storeLidTarget[row.lid] = row.pn; // Bidirectional cache
                
                // Populate raw phone number lookup at startup
                const rawPn = row.pn.split('@')[0];
                storeLidTarget[rawPn] = row.lid;

                // Pre-populate storeNumber in memory for immediate access
                conn.storeNumber[row.lid] = rawPn;
                conn.storeNumber[row.pn] = rawPn;
            }
        });
    } catch (e) {
        console.error(" [SQLITE ERROR] Gagal memuat storeLid pada startup:", e.message);
    }

    const insertStmt = sqlite.prepare(`INSERT OR REPLACE INTO storeLid (pn, lid) VALUES (?, ?)`);
    const deleteStmt = sqlite.prepare(`DELETE FROM storeLid WHERE pn = ? OR lid = ?`);

    const handler = {
        set(target, prop, value) {
            if (typeof prop === 'string' && typeof value === 'string') {
                let lid = null;
                let pn = null;
                if (prop.endsWith('@lid')) {
                    lid = prop;
                    pn = value;
                } else if (value.endsWith('@lid')) {
                    lid = value;
                    pn = prop;
                }
                
                if (pn && lid) {
                    const normalizedPn = pn.includes('@') ? pn : `${pn}@s.whatsapp.net`;
                    const rawPn = pn.split('@')[0];
                    
                    const oldLid = target[normalizedPn];
                    if (oldLid && oldLid !== lid && typeof oldLid === 'string') {
                        delete target[oldLid];
                        delete target[oldLid.split('@')[0]];
                        try {
                            deleteStmt.run(oldLid, oldLid);
                        } catch (e) {
                            console.error(" [SQLITE ERROR] Gagal menghapus stale oldLid:", e.message);
                        }
                    }
                    const oldPn = target[lid];
                    if (oldPn && oldPn !== normalizedPn && typeof oldPn === 'string') {
                        delete target[oldPn];
                        delete target[oldPn.split('@')[0]];
                        try {
                            deleteStmt.run(oldPn, oldPn);
                        } catch (e) {
                            console.error(" [SQLITE ERROR] Gagal menghapus stale storeLid:", e.message);
                        }
                    }
                    
                    if (target[normalizedPn] === lid && target[lid] === normalizedPn && target[rawPn] === lid) {
                        target[prop] = value;
                        if (!conn.storeNumber) conn.storeNumber = {};
                        conn.storeNumber[lid] = rawPn;
                        conn.storeNumber[normalizedPn] = rawPn;
                        return true;
                    }
                    
                    target[normalizedPn] = lid;
                    target[lid] = normalizedPn;
                    target[rawPn] = lid;

                    if (!conn.storeNumber) conn.storeNumber = {};
                    conn.storeNumber[lid] = rawPn;
                    conn.storeNumber[normalizedPn] = rawPn;
                    
                    try {
                        insertStmt.run(normalizedPn, lid);
                    } catch (e) {
                        console.error(" [SQLITE ERROR] Gagal menyimpan storeLid:", e.message);
                    }
                    
                    return true;
                }
            }
            target[prop] = value;
            return true;
        },
        get(target, prop) {
            return target[prop];
        },
        deleteProperty(target, prop) {
            if (typeof prop === 'string') {
                if (!(prop in target)) return true;
                
                const value = target[prop];
                const normalizedProp = prop.includes('@') ? prop : `${prop}@s.whatsapp.net`;
                try {
                    deleteStmt.run(normalizedProp, normalizedProp);
                } catch (e) {
                    console.error(" [SQLITE ERROR] Gagal menghapus storeLid:", e.message);
                }
                
                delete target[normalizedProp];
                const rawPn = prop.split('@')[0];
                delete target[rawPn];
                
                if (value && typeof value === 'string') {
                    delete target[value];
                    const rawPnVal = value.split('@')[0];
                    delete target[rawPnVal];
                }
                delete target[prop];
            }
            return true;
        }
    };

    const proxy = new Proxy(storeLidTarget, handler);
    Object.defineProperty(conn, 'storeLid', {
        get() {
            return proxy;
        },
        set(val) {
            if (val && typeof val === 'object') {
                Object.assign(proxy, val);
            }
        },
        configurable: true
    });
}

export function initDatabase(dataDir) {
    const dbPath = join(dataDir, 'database.db');
    const safeBakPath = join(dataDir, 'database.db.safe');
    const backupsDir = join(dataDir, 'backups');

    // Auto-Recovery: Jika database.db tidak ada atau 0 byte (misal akibat git pull), pulihkan otomatis
    try {
        if (!existsSync(dbPath) || statSync(dbPath).size === 0) {
            if (existsSync(safeBakPath) && statSync(safeBakPath).size > 0) {
                console.log(chalk.yellow(' [DATABASE AUTO-RECOVERY]') + ' Memulihkan database dari database.db.safe...');
                copyFileSync(safeBakPath, dbPath);
            } else if (existsSync(backupsDir)) {
                const bFiles = readdirSync(backupsDir)
                    .filter(f => f.startsWith('backup_') && f.endsWith('.db'))
                    .sort()
                    .reverse();
                if (bFiles.length > 0) {
                    const latest = join(backupsDir, bFiles[0]);
                    if (statSync(latest).size > 0) {
                        console.log(chalk.yellow(' [DATABASE AUTO-RECOVERY]') + ` Memulihkan database dari backup terbaru: ${bFiles[0]}...`);
                        copyFileSync(latest, dbPath);
                    }
                }
            }
        }
    } catch (e) {
        console.error(' [DATABASE AUTO-RECOVERY ERROR]', e.message);
    }

    sqlite = new Database(dbPath);
    global.sqlite = sqlite;

    // Simpan salinan database.db.safe jika database saat ini sehat
    try {
        if (existsSync(dbPath) && statSync(dbPath).size > 1024) {
            copyFileSync(dbPath, safeBakPath);
        }
    } catch (_) {}

    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = NORMAL');
    sqlite.pragma('cache_size = 2000');
    sqlite.pragma('temp_store = MEMORY');
    sqlite.pragma('mmap_size = 67108864');
    sqlite.pragma('wal_autocheckpoint = 1000');

    dbClosed = false;

    // Checkpoint berkala per 12 jam
    if (checkpointInterval) clearInterval(checkpointInterval);
    checkpointInterval = setInterval(() => {
        performCheckpoint('PASSIVE');
    }, 12 * 60 * 60 * 1000);

    // Inisialisasi tabel
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS users (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS chats (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS settings (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS miku (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS keuangan (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS pluginSettings (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS owners (jid TEXT PRIMARY KEY, data TEXT)`).run();
    sqlite.prepare(`CREATE TABLE IF NOT EXISTS storeLid (pn TEXT PRIMARY KEY NOT NULL, lid TEXT NOT NULL)`).run();
    sqlite.prepare(`CREATE INDEX IF NOT EXISTS idx_storeLid_lid ON storeLid (lid)`).run();

    for (const table of ['users', 'chats', 'settings', 'miku', 'keuangan', 'pluginSettings', 'owners']) {
        saveStatements[table] = {
            delete: sqlite.prepare(`DELETE FROM ${table} WHERE jid = ?`),
            insert: sqlite.prepare(`INSERT OR REPLACE INTO ${table} (jid, data) VALUES (?, ?)`)
        };
    }

    // Pasang struktur Proxy di memory
    global.db = {
        data: {
            users: createIndexedDbProxy(),
            chats: createIndexedDbProxy(),
            settings: createIndexedDbProxy(),
            owners: createIndexedDbProxy()
        }
    };
    global.mikuDb = { data: createIndexedDbProxy() };
    global.uangDb = { data: createIndexedDbProxy() };

    global.saveData = saveData;
    global.flushDatabase = flushDatabase;
    global.loadDatabase = loadDatabase;

    return sqlite;
}

export async function loadDatabase() {
    if (!sqlite || !sqlite.open) return;
    const tables = ['users', 'chats', 'settings', 'miku', 'keuangan', 'pluginSettings', 'owners'];
    const stmts = {};
    tables.forEach(t => { stmts[t] = sqlite.prepare(`SELECT * FROM ${t}`); });
    tables.forEach(t => {
        const rows = stmts[t].all();
        rows.forEach(row => {
            try {
                const parsed = JSON.parse(row.data);
                if (t === 'miku') global.mikuDb.data[row.jid] = parsed;
                else if (t === 'keuangan') global.uangDb.data[row.jid] = parsed;
                else if (row.jid === 'GLOBAL_CONFIG') global.db.data.pluginSettings = parsed;
                else global.db.data[t][row.jid] = parsed;
            } catch (e) {
                console.error(chalk.red(`[DB ERROR] ${t}:${row.jid}`));
            }
        });
    });
}

export function initDailyLimitResetCron() {
    cron.schedule('0 0 * * *', () => {
        try {
            console.log(chalk.blue.bold("Waktunya menjalankan reset limit harian nih"));
            const users = global.db?.data?.users;
            if (!users) return;

            let count = 0;
            const updates = [];
            const jids = Object.keys(users);
            const DAILY_LIMIT = 25;
            for (const jid of jids) {
                const user = users[jid];
                if (user && !user.premium && user.limit !== Infinity && typeof user.limit === 'number' && user.limit < DAILY_LIMIT) {
                    user.limit = DAILY_LIMIT;
                    updates.push({ jid, data: user });
                    count++;
                }
            }
            if (updates.length > 0 && sqlite && sqlite.open) {
                const stmt = sqlite.prepare("INSERT OR REPLACE INTO users (jid, data) VALUES (?, ?)");
                const deleteStmt = sqlite.prepare("DELETE FROM users WHERE jid = ?");
                sqlite.transaction((batch) => {
                    for (const item of batch) {
                        let writeJid = item.jid;
                        if (typeof writeJid === 'string' && global.conn) {
                            if (writeJid.endsWith('@s.whatsapp.net')) {
                                let lid = global.conn.getLid ? global.conn.getLid(writeJid) : null;
                                if (!lid && global.conn.storeLid) {
                                    lid = global.conn.storeLid[writeJid];
                                }
                                if (lid && lid !== writeJid) {
                                    deleteStmt.run(writeJid);
                                    writeJid = lid;
                                }
                            } else if (writeJid.endsWith('@lid') && global.conn.storeLid) {
                                const phoneJid = global.conn.storeLid[writeJid];
                                if (phoneJid && phoneJid !== writeJid) {
                                    deleteStmt.run(phoneJid);
                                }
                            }
                        }
                        stmt.run(writeJid, JSON.stringify(item.data));
                    }
                })(updates);
            }
            console.log(chalk.green.bold(`Mantap, berhasil mereset limit untuk ${count} pengguna`));
        } catch (e) {
            console.error(" [SISTEM ERROR] Gagal melakukan reset limit harian:", e.message);
        }
    }, {
        scheduled: true,
        timezone: "Asia/Jakarta"
    });
}

export function closeDatabase() {
    flushDatabase();
    dbClosed = true;
    if (checkpointInterval) {
        clearInterval(checkpointInterval);
        checkpointInterval = null;
    }
    try {
        if (sqlite && sqlite.open) {
            performCheckpoint('TRUNCATE');
            sqlite.close();
        }
    } catch (_) {}
}
