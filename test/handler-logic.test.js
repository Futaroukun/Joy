import test, { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
    getDevSet,
    getStaticOwnerSet,
    resolveSenderPermissions,
    resolveParticipantAdmin,
    initUserSchema,
    syncUserAge,
    initChatSchema,
    initSettingSchema
} from '../function/core/handler/auth.js';

import {
    extractExactCommands,
    getPluginIndex,
    rebuildPluginIndex,
    matchPluginCommand,
    checkPermissionGuards
} from '../function/core/handler/dispatcher.js';

import {
    getCommandCooldown,
    checkCooldown,
    setCooldown,
    resetUserCooldown,
    resetAllCooldown,
    updateActiveConfig
} from '../function/events/cooldown.js';

describe('Handler Auth & Permission Logic', () => {
    beforeEach(() => {
        global.developer = ['6281111111111'];
        global.owner = ['6282222222222'];
        global.info = {
            nomorowner: '6283333333333',
            nomorbot: '6284444444444'
        };
        global.db = {
            data: {
                users: {},
                chats: {},
                settings: {},
                owners: {
                    '6285555555555': true
                }
            }
        };
    });

    it('getDevSet & getStaticOwnerSet harus menormalkan dan mengekstrak nomor secara bersih', () => {
        const devSet = getDevSet();
        assert.ok(devSet.has('6281111111111'), 'Harus menyertakan developer');
        assert.ok(devSet.has('6283333333333'), 'Harus menyertakan info.nomorowner');

        const ownerSet = getStaticOwnerSet();
        assert.ok(ownerSet.has('6282222222222'), 'Harus menyertakan global.owner');
        assert.strictEqual(ownerSet.has('6289999999999'), false);
    });

    it('resolveSenderPermissions: m.fromMe memberikan akses penuh', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: true, sender: '6289999999999@s.whatsapp.net' }
        });
        assert.strictEqual(res.isROwner, true);
        assert.strictEqual(res.isOwner, true);
        assert.strictEqual(res.isPremium, true);
    });

    it('resolveSenderPermissions: developer utama dikenali sebagai isROwner, isOwner, isPremium', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: false, sender: '6281111111111@s.whatsapp.net' },
            senderRaw: '6281111111111'
        });
        assert.strictEqual(res.isROwner, true);
        assert.strictEqual(res.isOwner, true);
        assert.strictEqual(res.isPremium, true);
    });

    it('resolveSenderPermissions: static owner dikenali sebagai isOwner & isPremium, bukan isROwner', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: false, sender: '6282222222222@s.whatsapp.net' },
            senderRaw: '6282222222222'
        });
        assert.strictEqual(res.isROwner, false);
        assert.strictEqual(res.isOwner, true);
        assert.strictEqual(res.isPremium, true);
    });

    it('resolveSenderPermissions: dynamic database owner dikenali sebagai isOwner & isPremium', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: false, sender: '6285555555555@s.whatsapp.net' },
            senderRaw: '6285555555555',
            ownersDb: { '6285555555555': true }
        });
        assert.strictEqual(res.isROwner, false);
        assert.strictEqual(res.isOwner, true);
        assert.strictEqual(res.isPremium, true);
    });

    it('resolveSenderPermissions: user premium biasa hanya memiliki isPremium = true', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: false, sender: '6287777777777@s.whatsapp.net' },
            senderRaw: '6287777777777',
            userDb: { premium: true }
        });
        assert.strictEqual(res.isROwner, false);
        assert.strictEqual(res.isOwner, false);
        assert.strictEqual(res.isPremium, true);
    });

    it('resolveSenderPermissions: user reguler tidak memiliki permissions khusus', () => {
        const res = resolveSenderPermissions({
            m: { fromMe: false, sender: '6288888888888@s.whatsapp.net' },
            senderRaw: '6288888888888',
            userDb: {}
        });
        assert.strictEqual(res.isROwner, false);
        assert.strictEqual(res.isOwner, false);
        assert.strictEqual(res.isPremium, false);
    });

    it('resolveParticipantAdmin: membedakan superadmin, admin, dan bot admin', () => {
        const participants = [
            { id: '111@s.whatsapp.net', admin: 'superadmin' },
            { id: '222@s.whatsapp.net', admin: 'admin' },
            { id: '333@s.whatsapp.net', admin: null },
            { id: 'bot@s.whatsapp.net', admin: 'admin' }
        ];

        const superRes = resolveParticipantAdmin(participants, '111@s.whatsapp.net', 'bot@s.whatsapp.net');
        assert.strictEqual(superRes.isRAdmin, true);
        assert.strictEqual(superRes.isAdmin, true);
        assert.strictEqual(superRes.isBotAdmin, 'admin');

        const adminRes = resolveParticipantAdmin(participants, '222@s.whatsapp.net', 'bot@s.whatsapp.net');
        assert.strictEqual(adminRes.isRAdmin, false);
        assert.strictEqual(adminRes.isAdmin, true);

        const memberRes = resolveParticipantAdmin(participants, '333@s.whatsapp.net', 'bot@s.whatsapp.net');
        assert.strictEqual(memberRes.isRAdmin, false);
        assert.strictEqual(memberRes.isAdmin, false);
    });

    it('initUserSchema: menginisialisasi skema user default dengan sanitasi yang benar', () => {
        const fresh = initUserSchema(null, 'JoyUser');
        assert.strictEqual(fresh.name, 'JoyUser');
        assert.strictEqual(fresh.limit, 25);
        assert.strictEqual(fresh.level, 0);
        assert.strictEqual(fresh.exp, 0);
        assert.strictEqual(fresh.register, false);

        const partial = initUserSchema({ limit: 'invalid', exp: 100 }, 'JoyUser');
        assert.strictEqual(partial.limit, 25, 'Limit non-number harus di-reset ke default 25');
        assert.strictEqual(partial.exp, 100, 'Exp valid harus dipertahankan');
    });

    it('syncUserAge: menghitung umur dengan akurat dari format birthdate DD-MM-YYYY untuk user terdaftar', () => {
        const user = { birthdate: '15-06-2000', register: true, age: -1 };
        syncUserAge(user);
        assert.ok(user.age >= 24, `Umur terhitung harus wajar (>= 24 tahun), hasil: ${user.age}`);
    });

    it('initChatSchema & initSettingSchema: membuat struktur chat dan setting default', () => {
        const chat = initChatSchema(null);
        assert.strictEqual(chat.mute, false);
        assert.strictEqual(chat.sewa, false);

        const setting = initSettingSchema(null);
        assert.strictEqual(setting.autoread, true);
        assert.strictEqual(setting.chatMode, '');
    });
});

describe('Dispatcher Command Matching & Guard Logic', () => {
    it('extractExactCommands: mengekstrak array perintah dari berbagai format input', () => {
        assert.deepStrictEqual(extractExactCommands('menu'), ['menu']);
        assert.deepStrictEqual(extractExactCommands(['ping', 'PING', 'Speed']), ['ping', 'ping', 'speed']);
        assert.deepStrictEqual(extractExactCommands(/^(menu|help|bantuan)$/), ['menu', 'help', 'bantuan']);
        assert.deepStrictEqual(extractExactCommands(/^menu$/), ['menu']);
        assert.strictEqual(extractExactCommands(/^menu.*$/), null, 'Wildcard regex harus menghasilkan null');
        assert.strictEqual(extractExactCommands(12345), null);
    });

    it('getPluginIndex & matchPluginCommand: membangun indeks dan mencocokkan perintah secara presisi', () => {
        const mockPlugins = {
            'ping.js': {
                command: ['ping', 'p'],
                run: async () => 'pong'
            },
            'regex-test.js': {
                command: /^(info|status)$/i,
                run: async () => 'info'
            },
            'disabled.js': {
                command: 'bad',
                disable: true,
                run: async () => 'nope'
            }
        };

        const index = rebuildPluginIndex(mockPlugins);
        assert.ok(index.commandMap.has('ping'), 'commandMap harus memuat ping');
        assert.ok(index.commandMap.has('p'), 'commandMap harus memuat p');
        assert.strictEqual(index.commandMap.has('bad'), false, 'Plugin disabled tidak boleh masuk indeks');

        const foundPing = matchPluginCommand('ping', index);
        assert.ok(foundPing, 'Harus menemukan plugin ping');
        assert.strictEqual(foundPing.name, 'ping.js');

        const foundRegex = matchPluginCommand('info', index);
        assert.ok(foundRegex, 'Harus menemukan plugin regex');
        assert.strictEqual(foundRegex.name, 'regex-test.js');

        const notFound = matchPluginCommand('unknown', index);
        assert.strictEqual(notFound, null, 'Perintah tidak dikenal harus null');
    });

    it('checkPermissionGuards: memvalidasi hak akses (rowner, owner, admin, limit, group)', () => {
        let lastFailReason = null;
        global.dFail = (type) => { lastFailReason = type; };

        // Test rowner guard
        const rownerPlugin = { rowner: true };
        const rownerFail = checkPermissionGuards(rownerPlugin, {}, {}, { isROwner: false });
        assert.strictEqual(rownerFail.passed, false);
        assert.strictEqual(lastFailReason, 'rowner');

        const rownerPass = checkPermissionGuards(rownerPlugin, {}, {}, { isROwner: true });
        assert.strictEqual(rownerPass.passed, true);

        // Test owner guard
        const ownerPlugin = { owner: true };
        const ownerFail = checkPermissionGuards(ownerPlugin, {}, {}, { isOwner: false, isROwner: false });
        assert.strictEqual(ownerFail.passed, false);
        assert.strictEqual(lastFailReason, 'owner');

        const ownerPass = checkPermissionGuards(ownerPlugin, {}, {}, { isOwner: true });
        assert.strictEqual(ownerPass.passed, true);

        // Test admin guard
        const adminPlugin = { admin: true };
        const adminFail = checkPermissionGuards(adminPlugin, {}, {}, { isAdmin: false });
        assert.strictEqual(adminFail.passed, false);
        assert.strictEqual(lastFailReason, 'admin');

        const adminPass = checkPermissionGuards(adminPlugin, {}, {}, { isAdmin: true });
        assert.strictEqual(adminPass.passed, true);

        // Test botAdmin guard
        const botAdminPlugin = { botAdmin: true };
        const botAdminFail = checkPermissionGuards(botAdminPlugin, {}, {}, { isBotAdmin: false });
        assert.strictEqual(botAdminFail.passed, false);
        assert.strictEqual(lastFailReason, 'botAdmin');

        // Test group only guard
        const groupPlugin = { group: true };
        const groupFail = checkPermissionGuards(groupPlugin, { isGroup: false }, {}, {});
        assert.strictEqual(groupFail.passed, false);
        assert.strictEqual(lastFailReason, 'group');

        const groupPass = checkPermissionGuards(groupPlugin, { isGroup: true }, {}, {});
        assert.strictEqual(groupPass.passed, true);

        // Test limit guard
        const limitPlugin = { limit: 5 };
        const limitFail = checkPermissionGuards(limitPlugin, {}, {}, { user: { limit: 2 } });
        assert.strictEqual(limitFail.passed, false);
        assert.strictEqual(lastFailReason, 'limit');

        const limitPass = checkPermissionGuards(limitPlugin, {}, {}, { user: { limit: 10 } });
        assert.strictEqual(limitPass.passed, true);

        // Owner bypasses limit
        const limitOwnerPass = checkPermissionGuards(limitPlugin, {}, {}, { user: { limit: 0 }, isOwner: true });
        assert.strictEqual(limitOwnerPass.passed, true);
    });
});

describe('Cooldown Rate Limiter Logic', () => {
    beforeEach(() => {
        resetAllCooldown();
        updateActiveConfig({
            enabled: true,
            global: 4000,
            categories: {
                ai: 6000,
                tools: 2000
            },
            commands: {
                slowcmd: 10000
            },
            nonPremiumPenalty: 1000
        });
    });

    it('getCommandCooldown: mengambil cooldown berjenjang (command > category > global)', () => {
        assert.strictEqual(getCommandCooldown('slowcmd', 'tools'), 10000, 'Command specific harus diutamakan');
        assert.strictEqual(getCommandCooldown('gpt', 'ai'), 6000, 'Kategori ai harus 6000');
        assert.strictEqual(getCommandCooldown('inspect', 'tools'), 2000, 'Kategori tools harus 2000');
        assert.strictEqual(getCommandCooldown('random', 'unknown'), 4000, 'Fallback ke global default');
    });

    it('checkCooldown: pemilik (isOwner) kebal terhadap cooldown', () => {
        const jid = 'user-owner@s.whatsapp.net';
        setCooldown(jid, 'ping');
        const res = checkCooldown(jid, 'ping', 5000, true, false);
        assert.strictEqual(res.canUse, true);
        assert.strictEqual(res.remaining, 0);
    });

    it('checkCooldown: membatasi spam user reguler dan menghitung remaining detik', () => {
        const jid = 'user-normal@s.whatsapp.net';
        const resInitial = checkCooldown(jid, 'ping', 3000, false, false);
        assert.strictEqual(resInitial.canUse, true, 'Panggilan pertama harus lolos');

        setCooldown(jid, 'ping');
        const resAfter = checkCooldown(jid, 'ping', 3000, false, false);
        assert.strictEqual(resAfter.canUse, false, 'Panggilan langsung kedua harus terblokir cooldown');
        assert.ok(resAfter.remaining > 0, 'Sisa waktu cooldown harus lebih dari 0');
    });

    it('checkCooldown: user premium mendapatkan durasi cooldown yang dipersingkat 50%', () => {
        const jid = 'user-premium@s.whatsapp.net';
        setCooldown(jid, 'ping');
        const premRes = checkCooldown(jid, 'ping', 10000, false, true);
        assert.strictEqual(premRes.canUse, false);
        // Durasi standar: 10000 + 1000 penalty = 11s. Durasi premium: 50% dari 10000 = 5000ms = 5s
        assert.ok(premRes.remaining <= 5, `Sisa waktu premium harus <= 5 detik, hasil: ${premRes.remaining}`);
    });

    it('resetUserCooldown: menghapus cooldown user sehingga dapat menggunakan fitur kembali', () => {
        const jid = 'user-test@s.whatsapp.net';
        setCooldown(jid, 'ping');
        assert.strictEqual(checkCooldown(jid, 'ping', 5000, false, false).canUse, false);

        resetUserCooldown(jid, 'ping');
        assert.strictEqual(checkCooldown(jid, 'ping', 5000, false, false).canUse, true);
    });
});
