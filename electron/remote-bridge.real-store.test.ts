// ============================================================
// Pairing renewal through the REAL store, on a temporary config.json.
// ------------------------------------------------------------
// The other bridge suites use a store double, and a loose one can hand the
// bridge a key the real store.read() would never return. Here the file on disk
// is the input: a hand-edited key that is not a string must end in a fresh,
// marked pairing and the renewal notice, not a key createHmac cannot use. And
// the notice must never be on disk without the pairing it describes: it is
// written in the same store.update() as the new room and key, so what
// settings:get hands the QR code is that new room, joined or not. A renewal
// that can never be saved keeps remote control offline, retrying, and never
// falls back to the leaked pairing.
// Harness: one temp userData dir (store.ts memoizes the path); the Supabase
// channel records every join, the action handler and every state it sends.
// ============================================================

import { describe, it, expect, vi, afterAll, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteBridge } from './remote-bridge';
import { sealRemoteMessage } from './remote-auth';
import { loadSettingsForDialog } from './settings-dialog';
import { store } from './store';

type BroadcastHandler = (message: { payload?: unknown }) => void;

const h = vi.hoisted(() => ({
    userData: '',
    joined: [] as string[],
    actionHandler: null as BroadcastHandler | null,
    channelSent: [] as unknown[],
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
                send: async (message: unknown) => { h.channelSent.push(message); return 'ok'; },
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
    h.channelSent.length = 0;
    h.send.mockClear();
    bridge = new RemoteBridge();
});

afterEach(() => {
    bridge.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
});

describe('a hand-edited config.json whose key is not a string', () => {
    // Already marked as v2, so only the unreadable key can trigger the renewal.
    for (const badKey of [123, {}]) {
        it(`is renewed into a fresh, marked pairing with the notice (${JSON.stringify(badKey)})`, () => {
            seed({ calendarIds: ['primary'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: badKey, remotePairingVersion: 2 });

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

describe('a v1 pairing whose renewal can never be saved', () => {
    it('never joins or trusts the old key, and tries one new pairing per retry; once a write lands it joins the NEW room', async () => {
        vi.useFakeTimers();
        Object.assign(process.env, { VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-anon-key' });
        seed({ calendarIds: ['cal-a'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY });
        const before = fs.readFileSync(CONFIG);
        // store.update writes config.json.tmp and renames it over config.json. The fault is on the
        // temp write: a refused rename sleeps between attempts (Atomics.wait), which fake timers do not cover.
        const realWrite = fs.writeFileSync;
        const fault = { on: true, hits: 0 };
        vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof realWrite>) => {
            if (fault.on && typeof args[0] === 'string' && path.resolve(args[0]) === path.resolve(`${CONFIG}.tmp`)) {
                fault.hits++;
                throw Object.assign(new Error('EPERM: operation not permitted'), { code: 'EPERM' });
            }
            realWrite(...args);
        });
        const update = vi.spyOn(store, 'update');

        bridge.init();
        const hitsAfterEachStart = [fault.hits];
        for (const delay of [5_000, 10_000, 20_000, 40_000, 80_000]) {
            await vi.advanceTimersByTimeAsync(delay);
            hitsAfterEachStart.push(fault.hits);
        }

        expect(hitsAfterEachStart, 'one write attempt per start and per retry (5 s, doubling)').toEqual([1, 2, 3, 4, 5, 6]);
        const attempted = update.mock.calls.map(([patch]) => patch.remoteRoomId);
        expect(attempted, 'each attempt is one update carrying a fresh random pairing').toHaveLength(6);
        expect(new Set(attempted).size).toBe(6);
        expect(attempted).not.toContain(OLD_ROOM);
        expect(h.joined, 'joined a room while the renewal could not be saved').toEqual([]);
        // Nothing to dispatch through: no channel was ever joined, so no action handler exists.
        expect(h.actionHandler).toBeNull();
        expect(bridge.getStatus()).toBe(false);
        await bridge.broadcastState({ bankCount: 1 });
        expect(h.channelSent).toEqual([]);
        expect(fs.readFileSync(CONFIG).equals(before), 'the v1 file changed without the renewal').toBe(true);

        // The write lands at the next retry (160 s): the NEW pairing is joined, never the old one.
        fault.on = false;
        await vi.advanceTimersByTimeAsync(160_000);
        const disk = onDisk();
        expect(disk.remoteRoomId).not.toBe(OLD_ROOM);
        expect(h.joined).toEqual([`remote-control:${String(disk.remoteRoomId)}`]);
        const deliver = (payload: unknown) => h.actionHandler?.({ payload });
        const action = (msgId: string) => ({ action: { type: 'ADD_TOKEN' }, msgId, timestamp: Date.now() });
        deliver(sealRemoteMessage(OLD_KEY, 'action', action('old-key')));
        deliver({ key: OLD_KEY, ...action('v1') });
        deliver(sealRemoteMessage(String(disk.remoteKey), 'action', action('new-key')));
        expect(h.send.mock.calls.filter(([channel]) => channel === 'remote-control:action')).toEqual([['remote-control:action', { type: 'ADD_TOKEN' }]]);
    });
});
