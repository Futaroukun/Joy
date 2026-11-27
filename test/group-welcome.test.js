import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import groupWelcomeHandler from '../plugins/group-welcome.js';
import { participantsUpdate } from '../function/events/group-events.js';
import { checkPermissionGuards } from '../function/core/handler/dispatcher.js';

const firstGroup = 'first@g.us';
const secondGroup = 'second@g.us';
const member = '123456@s.whatsapp.net';

describe('Group welcome and leave templates', () => {
    let savedChats;

    beforeEach(() => {
        String.prototype.decodeJid = function () { return this.toString(); };
        savedChats = [];
        global.db = {
            data: {
                chats: {
                    [firstGroup]: { sambutan: true },
                    [secondGroup]: { sambutan: true }
                }
            }
        };
        global.saveData = (table, id) => savedChats.push([table, id]);
    });

    it('stores a custom welcome message only for the current group', async () => {
        const replies = [];
        await groupWelcomeHandler({ chat: firstGroup, isGroup: true, reply: async text => replies.push(text) }, {
            text: 'Welcome @user to @subject',
            args: [],
            command: 'setwelcome',
            usedPrefix: '.'
        });

        assert.equal(global.db.data.chats[firstGroup].sWelcome, 'Welcome @user to @subject');
        assert.equal(global.db.data.chats[secondGroup].sWelcome, undefined);
        assert.deepEqual(savedChats, [['chats', firstGroup]]);
        assert.match(replies[0], /welcome/);
    });

    it('resets the leave message to its default for the current group', async () => {
        global.db.data.chats[firstGroup].sBye = 'Custom @user';
        global.db.data.chats[secondGroup].sBye = 'Keep @user';

        await groupWelcomeHandler({ chat: firstGroup, isGroup: true, reply: async () => {} }, {
            text: 'reset',
            args: [],
            command: 'setleave',
            usedPrefix: '.'
        });

        assert.equal(global.db.data.chats[firstGroup].sBye, '');
        assert.equal(global.db.data.chats[secondGroup].sBye, 'Keep @user');
        assert.deepEqual(savedChats, [['chats', firstGroup]]);
    });

    it('stores a custom leave message for the current group', async () => {
        await groupWelcomeHandler({ chat: secondGroup, isGroup: true, reply: async () => {} }, {
            text: 'Goodbye @user from @subject',
            args: [],
            command: 'setleave',
            usedPrefix: '.'
        });

        assert.equal(global.db.data.chats[secondGroup].sBye, 'Goodbye @user from @subject');
        assert.equal(global.db.data.chats[firstGroup].sBye, undefined);
        assert.deepEqual(savedChats, [['chats', secondGroup]]);
    });

    it('restricts template changes to group admins', () => {
        assert.deepEqual(checkPermissionGuards(groupWelcomeHandler, { isGroup: true }, {}, { isAdmin: false }), {
            passed: false,
            reason: 'admin'
        });
        assert.deepEqual(checkPermissionGuards(groupWelcomeHandler, { isGroup: true }, {}, { isAdmin: true }), {
            passed: true,
            reason: null
        });
    });

    it('uses each group template and substitutes user and group subject on add and remove', async () => {
        global.db.data.chats[firstGroup].sWelcome = 'Welcome @user to @subject';
        global.db.data.chats[secondGroup].sBye = 'Goodbye @user from @subject';
        const sent = [];
        const conn = {
            user: { jid: 'bot@s.whatsapp.net' },
            chats: {},
            groupMetadata: async id => ({ subject: id === firstGroup ? 'First Group' : 'Second Group', desc: '' }),
            getName: async id => id === firstGroup ? 'First Group' : 'Second Group',
            profilePictureUrl: async () => { throw new Error('no profile picture'); },
            sendMessage: async (id, content) => sent.push([id, content])
        };

        await participantsUpdate.call(conn, { id: firstGroup, participants: [member], action: 'add' });
        await participantsUpdate.call(conn, { id: secondGroup, participants: [member], action: 'remove' });

        assert.equal(sent[0][1].text, 'Welcome @123456 to First Group');
        assert.equal(sent[1][1].text, 'Goodbye @123456 from Second Group');
    });

    it('uses the shared welcome switch to suppress both add and remove messages', async () => {
        global.db.data.chats[firstGroup].sambutan = false;
        const sent = [];
        const conn = { user: { jid: 'bot@s.whatsapp.net' }, chats: {}, sendMessage: async (...args) => sent.push(args) };

        await participantsUpdate.call(conn, { id: firstGroup, participants: [member], action: 'add' });
        await participantsUpdate.call(conn, { id: firstGroup, participants: [member], action: 'remove' });

        assert.equal(sent.length, 0);
    });
});
