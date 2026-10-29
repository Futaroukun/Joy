/*
 * @Author      : Joy Bot
 * @Feature     : Database Entity Schema & Sanitizer
 * @Description : Memvalidasi serta menetapkan nilai default skema entitas database
 *                (User, Chat, Setting) agar konsisten, terisolasi, dan terhindar dari runtime error.
 */

const isNumber = x => typeof x === 'number' && !isNaN(x);

/**
 * Validasi dan inisialisasi default skema user
 */
export function initUserSchema(user, resolvedName = '') {
    if (!user || typeof user !== 'object') {
        return {
            name: resolvedName,
            age: -1,
            level: 0,
            exp: 0,
            limit: 25,
            money: 0,
            badge: '',
            badgeExpire: -1,
            birthdate: '',
            afk: false,
            afkReason: '',
            register: false,
            premium: false,
            banned: false,
            afkTime: -1,
            regTime: -1,
            premiumDate: -1,
            bannedDate: -1,
            lastdaily: 0,
            lastChatExp: 0,
            dailyChatExp: 0,
            lastChatExpDay: ''
        };
    }

    if ((!user.name || typeof user.name === 'object') && !user.register) {
        user.name = resolvedName;
    }
    if (!isNumber(user.age)) user.age = -1;
    if (!isNumber(user.level)) user.level = 0;
    if (!isNumber(user.exp)) user.exp = 0;
    if (!isNumber(user.limit)) user.limit = 25;
    if (!isNumber(user.money)) user.money = 0;

    if (!('birthdate' in user)) user.birthdate = '';
    if (!('badge' in user)) {
        user.badge = user.register ? '🌱 Early Adventurer' : '';
    }
    if (!isNumber(user.badgeExpire)) user.badgeExpire = -1;
    if (!('afk' in user)) user.afk = false;
    if (!('afkReason' in user)) user.afkReason = '';
    if (!('register' in user)) user.register = false;
    if (!('premium' in user)) user.premium = false;
    if (!('banned' in user)) user.banned = false;

    if (!isNumber(user.afkTime)) user.afkTime = -1;
    if (!isNumber(user.regTime)) user.regTime = -1;
    if (!isNumber(user.premiumDate)) user.premiumDate = -1;
    if (!isNumber(user.bannedDate)) user.bannedDate = -1;
    if (!isNumber(user.lastdaily)) user.lastdaily = 0;
    if (!isNumber(user.lastChatExp)) user.lastChatExp = 0;
    if (!isNumber(user.dailyChatExp)) user.dailyChatExp = 0;
    if (!('lastChatExpDay' in user)) user.lastChatExpDay = '';

    return user;
}

/**
 * Sinkronisasi umur user berdasarkan tanggal lahir (Asia/Jakarta timezone)
 */
export function syncUserAge(user) {
    if (!user || !user.register || typeof user.birthdate !== 'string') return;
    const parts = user.birthdate.split('-');
    if (parts.length === 3) {
        const [d, m, y] = parts.map(Number);
        if (!isNaN(d) && !isNaN(m) && !isNaN(y) && y >= 1000 && d >= 1 && d <= 31 && m >= 1 && m <= 12) {
            const jakartaTime = new Date(Date.now() + 7 * 60 * 60 * 1000);
            const yToday = jakartaTime.getUTCFullYear();
            const mToday = jakartaTime.getUTCMonth() + 1;
            const dToday = jakartaTime.getUTCDate();

            let age = yToday - y;
            const monthDiff = mToday - m;
            if (monthDiff < 0 || (monthDiff === 0 && dToday < d)) {
                age--;
            }

            if (!isNaN(age) && user.age !== age) {
                user.age = age;
            }
        }
    }
}

/**
 * Validasi dan inisialisasi default skema chat grup
 */
export function initChatSchema(chat) {
    if (!chat || typeof chat !== 'object') {
        return {
            antilink: false,
            antidelete: false,
            antivirtex: false,
            mute: false,
            detect: true,
            sambutan: true,
            autogempa: false,
            sewa: false,
            sWelcome: '',
            sBye: '',
            sPromote: '',
            sDemote: '',
            sewaDate: -1,
            jualan: false,
            jualanItems: {},
            autoOpenClose: false,
            openTime: '06:00',
            closeTime: '21:00',
            lastAutoAction: ''
        };
    }

    if (!('antilink' in chat)) chat.antilink = false;
    if (!('antidelete' in chat)) chat.antidelete = false;
    if (!('antivirtex' in chat)) chat.antivirtex = false;
    if (!('mute' in chat)) chat.mute = false;
    if (!('detect' in chat)) chat.detect = true;
    if (!('sambutan' in chat)) chat.sambutan = true;
    if (!('autogempa' in chat)) chat.autogempa = false;
    if (!('sewa' in chat)) chat.sewa = false;
    if (!('sWelcome' in chat)) chat.sWelcome = '';
    if (!('sBye' in chat)) chat.sBye = '';
    if (!('sPromote' in chat)) chat.sPromote = '';
    if (!('sDemote' in chat)) chat.sDemote = '';
    if (!isNumber(chat.sewaDate)) chat.sewaDate = -1;
    if (!('jualan' in chat)) chat.jualan = false;
    if (!('jualanItems' in chat)) chat.jualanItems = {};
    if (!('autoOpenClose' in chat)) chat.autoOpenClose = false;
    if (!('openTime' in chat)) chat.openTime = '06:00';
    if (!('closeTime' in chat)) chat.closeTime = '21:00';
    if (!('lastAutoAction' in chat)) chat.lastAutoAction = '';

    return chat;
}

/**
 * Validasi dan inisialisasi default skema konfigurasi bot
 */
export function initSettingSchema(setting) {
    if (!setting || typeof setting !== 'object') {
        return {
            chatMode: '',
            antiCall: true,
            autoupdate: false,
            autoread: true,
            autobackup: true,
            backupDate: -1,
            prefixMode: 'global',
            customPrefix: '.'
        };
    }

    if (!('chatMode' in setting)) setting.chatMode = '';
    if (!('antiCall' in setting)) setting.antiCall = true;
    if (!('autoupdate' in setting)) setting.autoupdate = false;
    if (!('autoread' in setting)) setting.autoread = true;
    if (!('autobackup' in setting)) setting.autobackup = true;
    if (!isNumber(setting.backupDate)) setting.backupDate = -1;
    if (!('prefixMode' in setting)) setting.prefixMode = 'global';
    if (!('customPrefix' in setting)) setting.customPrefix = '.';

    return setting;
}
