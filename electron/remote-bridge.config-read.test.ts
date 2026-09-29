// ============================================================
// RemoteBridge — never write over a config.json it could not read.
//
// What this protects: init() runs at every startup. With config.json locked
// (EBUSY: antivirus, backup) or corrupt, the store returned its defaults, the
// bridge saw "no pairing" and wrote defaults + a new pairing over the real file,
// destroying the user's settings and phone pairing. The same failed read left
// the stored key undefined, so a broadcast with NO key matched and dispatched.
// Contract: locked → no channel, offline, retry init() (5 s doubling, cap
// 5 min, forever; success resets, destroy() cancels); content that can never
// parse is moved aside by the store and the bridge pairs afresh; a paired file
// is never written; regenerateKeys() returns a refusal instead of writing. The
// key gate itself lives in remote-bridge.memory-pairing.test.ts.
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
/** Marked as protocol v2: an unmarked pairing is renewed at the first v2 start (remote-bridge.pairing.test.ts). */
const SEED = { calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false, remoteRoomId: 'room-orig', remoteKey: 'key-orig', remotePairingVersion: 2 };

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

    it('keeps the bytes of a truncated file (moved aside by the store) and pairs afresh', () => {
        seed('{"calendarIds": ["cal-a"], "remoteRoomId": "room-orig", "remoteKey": "key-o');
        const before = bytes();

        bridge.init();

        const aside = fs.readdirSync(h.userData).filter(name => name.startsWith('config.json.corrupt-'));
        expect(aside).toHaveLength(1);
        expect(realRead(path.join(h.userData, aside[0])).equals(before), 'the corrupt bytes were lost').toBe(true);
        const fresh = onDisk();
        expect(fresh.remoteRoomId).not.toBe('room-orig');
        expect(h.joined).toEqual([`remote-control:${String(fresh.remoteRoomId)}`]);
        fs.rmSync(path.join(h.userData, aside[0]), { force: true });
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

        const result = bridge.regenerateKeys();
        if (!result.ok) throw new Error(`regenerateKeys refused: ${result.reason}`);
        const { roomId, remoteKey } = result;

        expect(onDisk()).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'], sleepEnabled: false, remoteRoomId: roomId, remoteKey });
        expect(roomId).not.toBe('room-orig');
        expect(h.joined.at(-1)).toBe(`remote-control:${roomId}`);
    });

    it('refuses, writes nothing and stays in the saved room when config.json cannot be read', () => {
        seed(SEED);
        bridge.init();
        const before = bytes();
        lock.code = 'EBUSY';

        const result = bridge.regenerateKeys();

        expect(lock.hits, 'the fs fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(bytes().equals(before), 'regenerateKeys() wrote over a config.json it could not read').toBe(true);
        expect(result).toEqual({ ok: false, reason: 'locked', code: 'EBUSY', file: CONFIG });
        expect(h.joined).toEqual(['remote-control:room-orig']); // no re-init
        expect(bridge.getStatus()).toBe(true);
    });
});
