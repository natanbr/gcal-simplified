// ============================================================
// Pairing renewal through the REAL store, on a temporary config.json.
// ------------------------------------------------------------
// The other bridge suites use a store double, and a loose one can hand the
// bridge a key the real store.read() would never return. Here the file on disk
// is the input: a hand-edited key that is not a string must end in a fresh,
// marked pairing and the renewal notice, not a key createHmac cannot use. And
// the notice must never be on disk without the pairing it describes: it is
// written in the same store.update() as the new room and key, so what
// settings:get hands the QR code is that new room, joined or not.
// Harness: one temp userData dir (store.ts memoizes the path); the Supabase
// channel records every join and the action handler.
// ============================================================

import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteBridge } from './remote-bridge';
import { loadSettingsForDialog } from './settings-dialog';
import { store } from './store';

type BroadcastHandler = (message: { payload?: unknown }) => void;

const h = vi.hoisted(() => ({
    userData: '',
    joined: [] as string[],
    actionHandler: null as BroadcastHandler | null,
    send: vi.fn<(channel: string, data: unknown) => void>(),
}));

vi.mock('electron', () => ({
    app: { getPath: () => h.userData },
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: h.send } }] },
}));
vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        channel: (name: string) => {
            h.joined.push(name);
            const channel = {
                on: (_type: string, _filter: unknown, cb: BroadcastHandler) => { h.actionHandler = cb; return channel; },
                subscribe: (cb: (status: string) => void) => { cb('SUBSCRIBED'); return channel; },
                send: async () => 'ok',
            };
            return channel;
        },
        removeChannel: () => undefined,
    }),
}));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gcal-bridge-store-test-'));
afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

const OLD_ROOM = '0ld00000-1111-4222-8333-444455556666';
const OLD_KEY = 'OldLeakedKey_v1abcde';
const CONFIG = path.join(h.userData, 'config.json');
const seed = (config: Record<string, unknown>) => fs.writeFileSync(CONFIG, JSON.stringify(config), 'utf-8');
const onDisk = (): Record<string, unknown> => JSON.parse(fs.readFileSync(CONFIG, 'utf-8'));

let bridge: RemoteBridge;

beforeEach(() => {
    // No Supabase credentials unless a case sets them: init() renews the pairing, then stops before the network.
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    fs.rmSync(CONFIG, { force: true });
    h.joined.length = 0;
    h.actionHandler = null;
    h.send.mockClear();
    bridge = new RemoteBridge();
});

afterEach(() => {
    bridge.destroy();
    vi.restoreAllMocks();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
});

describe('a hand-edited config.json whose key is not a string', () => {
    for (const badKey of [123, { k: 'v' }]) {
        it(`is renewed into a fresh, marked pairing with the notice (${JSON.stringify(badKey)})`, () => {
            seed({ calendarIds: ['primary'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: badKey });

            bridge.init();

            const config = onDisk();
            expect(config.calendarIds).toEqual(['primary']);
            expect(config.remotePairingVersion).toBe(2);
            expect(typeof config.remoteRoomId).toBe('string');
            expect(config.remoteRoomId).not.toBe(OLD_ROOM);
            expect(typeof config.remoteKey).toBe('string');
            expect(String(config.remoteKey)).toMatch(/^[A-Za-z0-9_-]{20}$/);
            expect(Number.isFinite(Date.parse(String(config.remotePairingRenewedAt)))).toBe(true);
        });
    }
});

describe('the renewal notice is written with the pairing it describes', () => {
    it('in ONE update with the new room, key and marker, and settings:get hands out that room even though no join followed', () => {
        seed({ calendarIds: ['cal-a'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY });
        const update = vi.spyOn(store, 'update');

        bridge.init();

        expect(h.joined, 'no credentials: the renewal is saved, no room is joined').toEqual([]);
        expect(update).toHaveBeenCalledTimes(1);
        const [patch] = update.mock.calls[0];
        expect(Object.keys(patch).sort()).toEqual(['remoteKey', 'remotePairingRenewedAt', 'remotePairingVersion', 'remoteRoomId']);
        expect(patch.remoteRoomId).not.toBe(OLD_ROOM);
        expect(patch.remoteKey).not.toBe(OLD_KEY);

        const disk = onDisk();
        expect(disk).toMatchObject({ ...patch, calendarIds: ['cal-a'] });
        // What the Remote tab's QR code is built from (settings:get): the new room, never the leaked one.
        expect(loadSettingsForDialog()).toMatchObject({
            remoteRoomId: patch.remoteRoomId, remoteKey: patch.remoteKey, remotePairingVersion: 2, remotePairingRenewedAt: patch.remotePairingRenewedAt,
        });
    });
});
