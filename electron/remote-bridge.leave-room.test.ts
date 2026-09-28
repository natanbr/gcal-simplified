// ============================================================
// RemoteBridge — "offline" means out of every room, and an unsaved pairing
// is never joined.
//
// What this protects (review of the config.json fix, 2026-09-28):
//   - regenerateKeys() saves pairing B, then init() re-reads config.json. If
//     antivirus locks the file in that instant, init() used to return before
//     leaving room A: the bridge stayed subscribed there, still reported
//     online, and broadcast state under key B into the room the parent was
//     revoking.
//   - A pairing whose write failed must not be joined: the phone can never
//     learn a room that was never saved. store.update() returns false for a
//     failed write, and nothing else in the suites makes a write fail.
// Harness: real store on one temp dir (store.ts memoizes the path); read and
// write faults that throw only for config.json, each asserted to have fired.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteBridge } from './remote-bridge';

type SubscribeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR';
interface FakeChannel { name: string; on: () => FakeChannel; subscribe: (cb: (status: SubscribeStatus) => void) => FakeChannel }

const h = vi.hoisted(() => ({
    userData: '',
    joined: [] as string[],
    removed: [] as string[],
    send: vi.fn<(channel: string, data: unknown) => void>(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        channel: (name: string) => {
            h.joined.push(name);
            const channel: FakeChannel = {
                name,
                on: () => channel,
                subscribe: (cb) => { cb('SUBSCRIBED'); return channel; },
            };
            return channel;
        },
        removeChannel: (channel: FakeChannel) => { h.removed.push(channel.name); },
    }),
}));

vi.mock('electron', () => ({
    app: { getPath: () => h.userData },
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: h.send } }] },
}));

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-leave-room-'));
afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

const CONFIG = path.join(h.userData, 'config.json');
const realRead = fs.readFileSync;
const realWrite = fs.writeFileSync;
const SEED = { calendarIds: ['cal-a'], taskListIds: ['list-1'], remoteRoomId: 'room-orig', remoteKey: 'key-orig' };
const isConfig = (file: unknown) => typeof file !== 'number' && path.resolve(String(file)) === path.resolve(CONFIG);
const busy = () => Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });

/** `readsBeforeLock`: the read lock engages once that many config.json reads have succeeded. */
const fault = { readsBeforeLock: null as number | null, reads: 0, readHits: 0, writeLocked: false, writeHits: 0 };

const seed = (config: object) => realWrite(CONFIG, JSON.stringify(config, null, 2));
const bytes = () => realRead(CONFIG);
const statusSent = () => h.send.mock.calls.filter(([channel]) => channel === 'remote:status-changed').map(([, online]) => online);

let bridge: RemoteBridge;

beforeEach(() => {
    vi.useFakeTimers();
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof realRead>) => {
        if (isConfig(args[0])) {
            if (fault.readsBeforeLock !== null && fault.reads >= fault.readsBeforeLock) { fault.readHits++; throw busy(); }
            fault.reads++;
        }
        return realRead(...args);
    }) as typeof fs.readFileSync);
    vi.spyOn(fs, 'writeFileSync').mockImplementation((...args: Parameters<typeof realWrite>) => {
        if (fault.writeLocked && isConfig(args[0])) { fault.writeHits++; throw busy(); }
        realWrite(...args);
    });
    Object.assign(process.env, { VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-anon-key' });
    fs.rmSync(CONFIG, { force: true });
    Object.assign(fault, { readsBeforeLock: null, reads: 0, readHits: 0, writeLocked: false, writeHits: 0 });
    h.joined.length = 0;
    h.removed.length = 0;
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

describe('RemoteBridge — a pairing that could not be saved is never joined', () => {
    it('stays offline when the first-run pairing cannot be written, then pairs once it can', async () => {
        seed({ calendarIds: ['cal-a'], taskListIds: ['list-1'] });
        const before = bytes();
        fault.writeLocked = true;

        bridge.init();

        expect(fault.writeHits, 'the write fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(h.joined, 'joined a room that was never saved').toEqual([]);
        expect(bridge.getStatus()).toBe(false);
        expect(bytes().equals(before)).toBe(true);

        fault.writeLocked = false;
        await vi.advanceTimersByTimeAsync(5_000);
        const saved = JSON.parse(realRead(CONFIG, 'utf-8')) as Record<string, unknown>;
        expect(saved).toMatchObject({ calendarIds: ['cal-a'], taskListIds: ['list-1'] });
        expect(h.joined).toEqual([`remote-control:${String(saved.remoteRoomId)}`]);
    });

    it('regenerateKeys() throws when the new pairing cannot be written, and stays in the saved room', () => {
        seed(SEED);
        bridge.init();
        const before = bytes();
        fault.writeLocked = true;

        expect(() => bridge.regenerateKeys()).toThrow(/config\.json/);
        expect(fault.writeHits).toBeGreaterThan(0);
        expect(bytes().equals(before)).toBe(true);
        expect(h.joined).toEqual(['remote-control:room-orig']);
        expect(h.removed).toEqual([]);
    });
});

describe('RemoteBridge — going offline leaves the room it was in', () => {
    it('leaves the old room when the re-read after a regenerate fails, and joins the new one once it reads', async () => {
        seed(SEED);
        bridge.init();
        expect(h.joined).toEqual(['remote-control:room-orig']);
        expect(bridge.getStatus()).toBe(true);
        // update()'s own read succeeds and saves pairing B; init()'s re-read right after it is locked.
        fault.readsBeforeLock = fault.reads + 1;

        const { roomId } = bridge.regenerateKeys();

        expect(fault.readHits, 'the re-read fault never fired — the case proves nothing').toBeGreaterThan(0);
        expect(h.removed, 'still subscribed to the room the parent is revoking').toEqual(['remote-control:room-orig']);
        expect(bridge.getStatus()).toBe(false);
        expect(statusSent().at(-1)).toBe(false);

        fault.readsBeforeLock = null;
        await vi.advanceTimersByTimeAsync(5_000);
        expect(h.joined.at(-1)).toBe(`remote-control:${roomId}`);
        expect(bridge.getStatus()).toBe(true);
    });

    it('does not announce a status change when it was never online', () => {
        seed(SEED);
        fault.readsBeforeLock = 0;

        bridge.init();

        expect(fault.readHits).toBeGreaterThan(0);
        expect(h.removed).toEqual([]);
        expect(statusSent()).toEqual([]);
    });
});
