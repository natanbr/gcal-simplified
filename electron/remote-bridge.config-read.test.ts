// ============================================================
// RemoteBridge — never write over a config.json it could not read.
//
// What this protects: init() runs at every startup. With config.json locked
// (EBUSY: antivirus, backup) or corrupt, the store returned its defaults, the
// bridge saw "no pairing" and wrote defaults + a new pairing over the real file,
// destroying the user's settings and phone pairing. The same failed read left
// the stored key undefined, so a broadcast with NO key matched and dispatched.
// Contract: unreadable → no channel, offline, retry init() (5 s doubling, cap
// 5 min, forever; success resets, destroy() cancels); a paired file is never
// written; regenerateKeys() throws instead of writing; an action needs a
// non-empty stored key equal to the received one.
// Harness: real store on one temp dir (store.ts memoizes the path), subscribe()
// reports SUBSCRIBED at once so getStatus() discriminates, and an fs fault that
// throws only for config.json — every locked case asserts it fired.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteBridge } from './remote-bridge';

type SubscribeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR';
interface Broadcast { payload: { key?: string; action?: Record<string, unknown>; msgId?: string; timestamp?: number } }

const h = vi.hoisted(() => ({
    userData: '',
    joined: [] as string[],
    actionHandler: null as ((message: Broadcast) => void) | null,
    send: vi.fn<(channel: string, data: unknown) => void>(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        channel: (name: string) => {
            h.joined.push(name);
            const channel = {
                on: (_type: string, _filter: unknown, cb: (message: Broadcast) => void) => { h.actionHandler = cb; return channel; },
                subscribe: (cb: (status: SubscribeStatus) => void) => { cb('SUBSCRIBED'); return channel; },
            };
            return channel;
        },
        removeChannel: () => undefined,
    }),
}));

vi.mock('electron', () => ({
    app: { getPath: () => h.userData },
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: h.send } }] },
}));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-config-read-'));
afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

const CONFIG = path.join(h.userData, 'config.json');
const realRead = fs.readFileSync;
const SEED = { calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false, remoteRoomId: 'room-orig', remoteKey: 'key-orig' };

/** `code` set → every config.json read throws it. `armAfter` → the lock engages once that many reads succeeded. */
const lock = { code: null as string | null, armAfter: null as number | null, reads: 0, hits: 0, attempts: [] as number[] };

function lockedRead(...args: Parameters<typeof realRead>) {
    const [file] = args;
    if (typeof file !== 'number' && path.resolve(String(file)) === path.resolve(CONFIG)) {
        if (lock.armAfter !== null && lock.reads >= lock.armAfter) lock.code = 'EBUSY';
        lock.reads++;
        if (lock.code) {
            lock.hits++;
            lock.attempts.push(Date.now());
            throw Object.assign(new Error(`${lock.code}: resource busy or locked, open '${String(file)}'`), { code: lock.code });
        }
    }
    return realRead(...args);
}

const seed = (config: object | string) => fs.writeFileSync(CONFIG, typeof config === 'string' ? config : JSON.stringify(config, null, 2));
const bytes = () => realRead(CONFIG);
const onDisk = (): Record<string, unknown> => JSON.parse(realRead(CONFIG, 'utf-8'));
/** Distinct fake-clock times at which a locked read was attempted, as gaps between them. */
const attemptGaps = () => [...new Set(lock.attempts)].map((t, i, all) => (i === 0 ? 0 : t - all[i - 1])).slice(1);
const actionsSent = () => h.send.mock.calls.filter(([channel]) => channel === 'remote-control:action');

let bridge: RemoteBridge;

beforeEach(() => {
    vi.useFakeTimers();
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    vi.spyOn(fs, 'readFileSync').mockImplementation(lockedRead as typeof fs.readFileSync);
    Object.assign(process.env, { VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-anon-key' });
    fs.rmSync(CONFIG, { force: true });
    Object.assign(lock, { code: null, armAfter: null, reads: 0, hits: 0, attempts: [] });
    h.joined.length = 0;
    h.actionHandler = null;
    h.send.mockClear();
    bridge = new RemoteBridge();
});

afterEach(() => {
    bridge.destroy();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.rmSync(CONFIG, { force: true });
});

describe('RemoteBridge.init — regression: an unreadable config.json is left alone', () => {
    it('does not rewrite a locked (EBUSY) file, joins no channel and stays offline', () => {
        seed(SEED);
        const before = bytes();
        lock.code = 'EBUSY';

        bridge.init();

        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(bytes().equals(before), 'init() wrote over a config.json it could not read').toBe(true);
        expect(h.joined).toEqual([]);
        expect(bridge.getStatus()).toBe(false);
    });

    it('does not rewrite a truncated file and joins no channel', () => {
        seed('{"calendarIds": ["cal-a"], "remoteRoomId": "room-orig", "remoteKey": "key-o');
        const before = bytes();

        bridge.init();

        expect(bytes().equals(before), 'init() wrote over a corrupt config.json').toBe(true);
        expect(h.joined).toEqual([]);
        expect(bridge.getStatus()).toBe(false);
    });

    it('refuses when the lock appears between its read and its write (no pairing yet)', () => {
        seed({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });
        const before = bytes();
        lock.armAfter = 1; // the bridge's own read succeeds; update()'s fresh read does not

        bridge.init();

        expect(bytes().equals(before), 'the write trusted a read it did not repeat').toBe(true);
        expect(lock.hits, 'update() never re-read the file').toBeGreaterThan(0);
        expect(h.joined).toEqual([]);
        expect(bridge.getStatus()).toBe(false);
    });
});

describe('RemoteBridge.init — readable files (collateral guards)', () => {
    it('pairs a fresh install: an absent file gets a pairing and its room is joined', () => {
        bridge.init();

        const written = onDisk();
        expect(written.remoteRoomId).toEqual(expect.any(String));
        expect(written.remoteKey).toEqual(expect.any(String));
        expect(h.joined).toEqual([`remote-control:${String(written.remoteRoomId)}`]);
        expect(bridge.getStatus()).toBe(true);
    });

    it('adds a pairing to a file that has none and keeps every other field', () => {
        seed({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });

        bridge.init();

        const written = onDisk();
        expect(written).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false });
        expect(written.remoteKey).toEqual(expect.any(String));
        expect(h.joined).toEqual([`remote-control:${String(written.remoteRoomId)}`]);
    });

    it('joins the stored room and does not write a file that already has a pairing', () => {
        seed(SEED);
        const before = bytes();

        bridge.init();

        expect(h.joined).toEqual(['remote-control:room-orig']);
        expect(bytes().equals(before)).toBe(true);
        expect(bridge.getStatus()).toBe(true);
    });
});

describe('RemoteBridge.init — lifecycle: retry until the file can be read', () => {
    it('stays offline while the lock holds, then joins the stored room once it lifts', async () => {
        seed(SEED);
        const before = bytes();
        lock.code = 'EBUSY';

        bridge.init();
        await vi.advanceTimersByTimeAsync(60_000);
        expect(bytes().equals(before), 'init() wrote over a config.json it could not read').toBe(true);
        expect(h.joined).toEqual([]);
        expect(lock.hits, 'no retry while the lock held').toBeGreaterThan(1);

        lock.code = null;
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(h.joined).toEqual(['remote-control:room-orig']);
        expect(bridge.getStatus()).toBe(true);
        expect(bytes().equals(before), 'the retry generated a new pairing').toBe(true);
    });

    it('retries after 5 s, doubling, capped at 5 min, for as long as the lock holds', async () => {
        seed(SEED);
        lock.code = 'EBUSY';
        bridge.init();
        await vi.advanceTimersByTimeAsync(2 * 60 * 60_000);

        const gaps = attemptGaps();
        expect(gaps.slice(0, 8)).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
        expect(gaps.length).toBeGreaterThan(20);
        expect(gaps.slice(6).every(gap => gap === 300_000)).toBe(true);
    });

    it('starts the backoff again at 5 s after a successful init', async () => {
        seed(SEED);
        lock.code = 'EBUSY';
        bridge.init();
        await vi.advanceTimersByTimeAsync(75_000); // attempts at 0, 5, 15, 35, 75 s — next would wait 80 s
        lock.code = null;
        await vi.advanceTimersByTimeAsync(80_000);
        expect(h.joined).toEqual(['remote-control:room-orig']);

        lock.code = 'EBUSY';
        lock.attempts.length = 0;
        bridge.init();
        await vi.advanceTimersByTimeAsync(5_000);
        expect(attemptGaps()[0]).toBe(5_000);
    });

    it('cancels a pending retry on destroy()', async () => {
        seed(SEED);
        lock.code = 'EBUSY';
        bridge.init();
        expect(lock.hits).toBeGreaterThan(0);
        bridge.destroy();
        lock.code = null;
        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(h.joined).toEqual([]);
    });
});

describe('RemoteBridge.regenerateKeys', () => {
    it('writes a new pairing, keeps every other field and joins the new room (collateral guard)', () => {
        seed(SEED);
        bridge.init();

        const { roomId, remoteKey } = bridge.regenerateKeys();

        expect(onDisk()).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false, remoteRoomId: roomId, remoteKey });
        expect(roomId).not.toBe('room-orig');
        expect(h.joined.at(-1)).toBe(`remote-control:${roomId}`);
    });

    it('throws and writes nothing when config.json cannot be read', () => {
        seed(SEED);
        bridge.init();
        const before = bytes();
        lock.code = 'EBUSY';

        let thrown: unknown = null;
        try { bridge.regenerateKeys(); } catch (e) { thrown = e; }

        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(bytes().equals(before), 'regenerateKeys() wrote over a config.json it could not read').toBe(true);
        expect(thrown).toBeInstanceOf(Error);
        expect(String(thrown)).toMatch(/config\.json/);
        expect(h.joined).toEqual(['remote-control:room-orig']); // no re-init
    });
});

describe('RemoteBridge action handler — the pairing key gate', () => {
    const fire = (payload: Broadcast['payload']) => {
        expect(h.actionHandler, 'init() registered no action handler').not.toBeNull();
        h.actionHandler?.({ payload });
    };

    it('dispatches an action carrying the stored key (control: the harness sees a dispatch)', () => {
        seed(SEED);
        bridge.init();

        fire({ key: 'key-orig', action: { type: 'ADD_TOKEN' }, msgId: 'm0', timestamp: Date.now() });

        expect(actionsSent()).toEqual([['remote-control:action', { type: 'ADD_TOKEN' }]]);
    });

    it('rejects a key-less action while config.json cannot be read', () => {
        seed(SEED);
        bridge.init();
        lock.code = 'EBUSY';

        fire({ action: { type: 'ADD_TOKEN' }, msgId: 'm1', timestamp: Date.now() });
        fire({ key: undefined, action: { type: 'ADD_TOKEN' }, msgId: 'm2', timestamp: Date.now() });

        // Today the handler re-reads config.json per action. If a fix caches the
        // key instead, this premise no longer holds: re-seed the failure, do not delete the check.
        expect(lock.hits, 'the handler never re-read the key — the case proves nothing').toBeGreaterThan(0);
        expect(actionsSent(), 'an action with no key was dispatched').toEqual([]);
    });
});
