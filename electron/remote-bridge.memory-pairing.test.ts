// ============================================================
// RemoteBridge — the pairing it joined with is the one it checks and signs with.
//
// What this protects (code review of PR 182, 2026-09-28): the action handler and
// broadcastState used to re-read config.json for every message, while only
// init() could go offline. So a file that became unreadable mid-session (a lock,
// a deletion) rejected every action and skipped every broadcast while the status
// still said "connected" — and a failed read left the key undefined, which a
// broadcast without a key matched. The main process is the pairing's only owner
// (settings:save never writes it), so the bridge keeps what it joined with:
//   - a lock or a deletion mid-session changes nothing on the wire;
//   - an unsigned or wrong-key action is rejected (protocol v2, remote-auth.ts);
//   - after regenerateKeys() the old key is rejected at once, with no disk read.
// Harness: real store on one temp dir; a read fault for config.json only; the
// Supabase channel captures the action handler and every send().
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RemoteBridge } from './remote-bridge';
import { openRemoteMessage, sealRemoteMessage } from './remote-auth';

interface Broadcast { payload?: unknown }
type SubscribeStatus = 'SUBSCRIBED' | 'CLOSED' | 'CHANNEL_ERROR';

const h = vi.hoisted(() => ({
    userData: '',
    actionHandler: null as ((message: Broadcast) => void) | null,
    sent: [] as Array<{ event: string; payload: unknown }>,
    send: vi.fn<(channel: string, data: unknown) => void>(),
}));

vi.mock('@supabase/supabase-js', () => ({
    createClient: () => ({
        channel: () => {
            const channel = {
                on: (_type: string, _filter: unknown, cb: (message: Broadcast) => void) => { h.actionHandler = cb; return channel; },
                subscribe: (cb: (status: SubscribeStatus) => void) => { cb('SUBSCRIBED'); return channel; },
                send: async (message: { event: string; payload: unknown }) => { h.sent.push(message); return 'ok'; },
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

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'remote-bridge-memory-pairing-'));
afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

const CONFIG = path.join(h.userData, 'config.json');
const realRead = fs.readFileSync;
const SEED = { calendarIds: ['cal-a'], remoteRoomId: 'room-orig', remoteKey: 'key-orig' };
const fault = { readLocked: false, readHits: 0 };

const fire = (payload: Broadcast['payload']) => {
    expect(h.actionHandler, 'init() registered no action handler').not.toBeNull();
    h.actionHandler?.({ payload });
};
let msg = 0;
/** Signed with `key` (protocol v2); no key â†’ an unsigned v1-style payload. */
const action = (key?: string): Broadcast['payload'] => {
    const content = { action: { type: 'ADD_TOKEN' }, msgId: `m${++msg}`, timestamp: Date.now() };
    return key === undefined ? content : sealRemoteMessage(key, 'action', content);
};
const dispatched = () => h.send.mock.calls.filter(([channel]) => channel === 'remote-control:action').length;
/** Which of `keys` signed each state-update sent, in order. */
const signedWith = (...keys: string[]) => h.sent.map(m => keys.find(k => openRemoteMessage(k, 'state-update', m.payload) !== null));

let bridge: RemoteBridge;

beforeEach(() => {
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((...args: Parameters<typeof realRead>) => {
        if (fault.readLocked && typeof args[0] !== 'number' && path.resolve(String(args[0])) === path.resolve(CONFIG)) {
            fault.readHits++;
            throw Object.assign(new Error('EBUSY: resource busy or locked'), { code: 'EBUSY' });
        }
        return realRead(...args);
    }) as typeof fs.readFileSync);
    Object.assign(process.env, { VITE_SUPABASE_URL: 'https://mock.supabase.co', VITE_SUPABASE_ANON_KEY: 'mock-anon-key' });
    fs.writeFileSync(CONFIG, JSON.stringify(SEED));
    Object.assign(fault, { readLocked: false, readHits: 0 });
    h.actionHandler = null;
    h.sent.length = 0;
    h.send.mockClear();
    bridge = new RemoteBridge();
    bridge.init();
});

afterEach(() => {
    bridge.destroy();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
    vi.restoreAllMocks();
    fs.rmSync(CONFIG, { force: true });
});

describe('RemoteBridge — the key gate uses the pairing it joined with', () => {
    it('dispatches an action signed with the joined key, and rejects an unsigned or wrong-key one', () => {
        fire(action('key-orig'));
        fire(action());
        fire(action('key-other'));

        expect(dispatched()).toBe(1);
    });

    it('keeps working while config.json is locked mid-session: the valid key still passes, an unsigned action still fails', async () => {
        fault.readLocked = true;

        fire(action('key-orig'));
        fire(action());
        await bridge.broadcastState({ tokens: 3 });

        expect(dispatched(), 'a lock mid-session cut the phone off, or let an unsigned action in').toBe(1);
        expect(signedWith('key-orig')).toEqual(['key-orig']);
        expect(bridge.getStatus()).toBe(true);
    });

    it('keeps working when config.json is deleted while the app runs', async () => {
        fs.rmSync(CONFIG, { force: true });

        fire(action('key-orig'));
        await bridge.broadcastState({ tokens: 3 });

        expect(dispatched()).toBe(1);
        expect(h.sent).toHaveLength(1);
    });

    it('rejects the old key at once after regenerateKeys(), with every later read failing', () => {
        const result = bridge.regenerateKeys();
        if (!result.ok) throw new Error(`regenerateKeys refused: ${result.reason}`);
        fault.readLocked = true;

        fire(action('key-orig'));
        fire(action(result.remoteKey));

        expect(dispatched(), 'the revoked key still worked, or the new one did not').toBe(1);
        expect(h.send.mock.calls.filter(([channel]) => channel === 'remote-control:action')).toHaveLength(1);
    });
});

describe('RemoteBridge — never joined, never speaks', () => {
    it('broadcasts nothing when init() could not read the file', async () => {
        bridge.destroy();
        h.sent.length = 0;
        fault.readLocked = true;
        bridge = new RemoteBridge();

        bridge.init();
        await bridge.broadcastState({ tokens: 3 });

        expect(fault.readHits).toBeGreaterThan(0);
        expect(h.sent).toEqual([]);
        expect(bridge.getStatus()).toBe(false);
    });
});
