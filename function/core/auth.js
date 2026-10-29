/*
 * @Author      : Rafli / Joy Bot
 * @Feature     : Atomic Multi-File Auth State
 * @Description : Penyimpanan sesi Baileys berbasis atomic write dan auto-recovery backup untuk mencegah kerusakan sesi (0 byte) di Termux.
 * @Reference   : WhiskeySockets/Baileys PR #2855
 */

import { Mutex } from 'async-mutex';
import { mkdir, readFile, stat, unlink, writeFile, rename } from 'fs/promises';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { proto, initAuthCreds, BufferJSON } from '@whiskeysockets/baileys';

const fileLocks = new Map();

const getFileLock = (path) => {
    let mutex = fileLocks.get(path);
    if (!mutex) {
        mutex = new Mutex();
        fileLocks.set(path, mutex);
    }
    return mutex;
};

const fixFileName = (file) => file?.replace(/\//g, '__')?.replace(/:/g, '-');

/**
 * Multi-file auth state dengan atomic write dan backup auto-recovery.
 * Menjamin file creds.json tidak pernah terpotong (0 byte) saat Termux dimatikan mendadak.
 *
 * @param {string} folder Direktori folder sesi
 */
export const useAtomicAuthState = async (folder) => {
    const writeData = async (data, file) => {
        const filePath = join(folder, fixFileName(file));
        const mutex = getFileLock(filePath);

        return mutex.acquire().then(async (release) => {
            try {
                const tempPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
                await writeFile(tempPath, JSON.stringify(data, BufferJSON.replacer));
                await rename(tempPath, filePath);
                if (file === 'creds.json') {
                    try { copyFileSync(filePath, `${filePath}.bak`); } catch (_) {}
                }
            } finally {
                release();
            }
        });
    };

    const readData = async (file) => {
        try {
            const filePath = join(folder, fixFileName(file));
            const mutex = getFileLock(filePath);

            return await mutex.acquire().then(async (release) => {
                try {
                    const data = await readFile(filePath, { encoding: 'utf-8' });
                    return JSON.parse(data, BufferJSON.reviver);
                } catch (error) {
                    // Jika creds.json rusak/kosong, coba pulihkan dari backup
                    if (file === 'creds.json') {
                        const bakPath = `${filePath}.bak`;
                        if (existsSync(bakPath)) {
                            try {
                                const bakData = await readFile(bakPath, { encoding: 'utf-8' });
                                const parsed = JSON.parse(bakData, BufferJSON.reviver);
                                await writeFile(filePath, bakData, { encoding: 'utf-8' });
                                console.warn('[AUTH] creds.json corrupt/kosong, berhasil dipulihkan dari creds.json.bak!');
                                return parsed;
                            } catch (_) {}
                        }
                    }
                    return null;
                } finally {
                    release();
                }
            });
        } catch {
            return null;
        }
    };

    const removeData = async (file) => {
        try {
            const filePath = join(folder, fixFileName(file));
            const mutex = getFileLock(filePath);

            return mutex.acquire().then(async (release) => {
                try {
                    await unlink(filePath);
                } catch {
                } finally {
                    release();
                }
            });
        } catch {}
    };

    const folderInfo = await stat(folder).catch(() => {});
    if (folderInfo) {
        if (!folderInfo.isDirectory()) {
            throw new Error(`found something that is not a directory at ${folder}, either delete it or specify a different location`);
        }
    } else {
        await mkdir(folder, { recursive: true });
    }

    const creds = (await readData('creds.json')) || initAuthCreds();

    // Buat initial backup jika creds.json sudah ada dan valid
    if (creds?.me?.id) {
        try {
            const credsPath = join(folder, 'creds.json');
            const bakPath = join(folder, 'creds.json.bak');
            if (existsSync(credsPath)) copyFileSync(credsPath, bakPath);
        } catch (_) {}
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(ids.map(async (id) => {
                        let value = await readData(`${type}-${id}.json`);
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }));
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const file = `${category}-${id}.json`;
                            tasks.push(value ? writeData(value, file) : removeData(file));
                        }
                    }
                    const BATCH_SIZE = 30;
                    for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
                        await Promise.all(tasks.slice(i, i + BATCH_SIZE));
                    }
                }
            }
        },
        saveCreds: async () => {
            return writeData(creds, 'creds.json');
        }
    };
};

export default useAtomicAuthState;
