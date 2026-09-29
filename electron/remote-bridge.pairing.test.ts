// ============================================================
// The remote pairing's lifecycle: renewed once on the first v2 start.
// ------------------------------------------------------------
// Protocol v2 changes how the key is used, not which key. An upgraded install
// keeps the key that v1 broadcast in plain text for months, and a signature
// keyed with it proves nothing to whoever captured it. So an unmarked pairing
// is replaced once, before the renderer can read it, and the Remote tab shows
// a re-scan notice until the phone's first verified message. The store double
// is stateful and reads like store.read(): `saved` is the file on disk,
// update() merges a patch onto it through JSON (an undefined field is deleted,
// as in the real file), and a room or key that is not a non-empty string reads
// as absent, so a hand-edited config.json can be modelled too.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { inspect } from 'node:util';
import { RemoteBridge } from './remote-bridge';
import { openRemoteMessage, sealRemoteMessage } from './remote-auth';
import type { ConfigRead, StoreFailure, store } from './store';

type Config = Record<string, unknown>;
type BroadcastHandler = (message: { payload?: unknown }) => void;

const OLD_ROOM = '0ld00000-1111-4222-8333-444455556666';
const OLD_KEY = 'OldLeakedKey_v1abcde';
const RENEWED = '[RemoteBridge] Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone.';
const OFFLINE = '[RemoteBridge] Remote control offline: the settings file could not be read or saved.';
const NOT_CLEARED = '[RemoteBridge] The phone answered, but the re-scan notice could not be cleared: the next start tries again.';
const RENEWED_AT = '2026-09-28T09:00:00.000Z';
const REFUSED: StoreFailure = { ok: false, reason: 'locked', code: 'EBUSY', file: 'C:\\settings-under-test' };

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    storeRead: vi.fn<typeof store.read>(),
    storeUpdate: vi.fn<typeof store.update>(),
    rendererSend: vi.fn<(channel: string, ...args: unknown[]) => void>(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ webContents: { send: mocks.rendererSend } }] } }));
vi.mock('./store', () => ({ store: { read: mocks.storeRead, update: mocks.storeUpdate } }));

let saved: Config;
let deliver!: BroadcastHandler;
let channelName = '';
let joins = 0;
let channelSend: Mock<(message: unknown) => Promise<string>>;
let consoleSpies: MockInstance[];
const bridges: RemoteBridge[] = [];

const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : undefined);

/** What store.read() returns for `saved`: the remote fields read the way readConfig reads them. */
function readSaved(): ConfigRead {
    return {
        kind: 'loaded',
        raw: { ...saved },
        config: {
            calendarIds: [],
            taskListIds: [],
            remoteRoomId: text(saved.remoteRoomId),
            remoteKey: text(saved.remoteKey),
            remotePairingVersion: typeof saved.remotePairingVersion === 'number' ? saved.remotePairingVersion : undefined,
            remotePairingRenewedAt: text(saved.remotePairingRenewedAt),
        },
    };
}

function start(): RemoteBridge {
    const bridge = new RemoteBridge();
    bridges.push(bridge);
    bridge.init();
    return bridge;
}

/** inspect, as Node's console does: an object argument carrying a secret shows up too. */
function consoleLines(): string[] {
    return consoleSpies.flatMap(spy => spy.mock.calls.map(call =>
        call.map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 10 }))).join(' ')));
}

const writes = (): Array<Partial<Config>> => mocks.storeUpdate.mock.calls.map(([patch]) => patch);
/** A store whose every write is refused, the way update() reports a locked or read-only file. */
const failWrites = () => mocks.storeUpdate.mockImplementation(() => REFUSED);
let msgSeq = 0;
const signed = (key: string, type = 'ADD_TOKEN') => sealRemoteMessage(key, 'action', { action: { type }, msgId: `m-${++msgSeq}`, timestamp: Date.now() });
const dispatches = () => mocks.rendererSend.mock.calls.filter(([ch]) => ch === 'remote-control:action').length;

beforeEach(() => {
    vi.clearAllMocks();
    channelName = '';
    joins = 0;
    process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';
    mocks.storeRead.mockImplementation(readSaved);
    mocks.storeUpdate.mockImplementation(patch => {
        saved = JSON.parse(JSON.stringify({ ...saved, ...patch }));
        return { ok: true };
    });

    channelSend = vi.fn<(message: unknown) => Promise<string>>().mockResolvedValue('ok');
    const channel = {
        on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => { deliver = handler; return channel; }),
        subscribe: vi.fn(() => channel),
        send: channelSend,
    };
    mocks.createClient.mockReturnValue({
        channel: vi.fn((name: string) => { channelName = name; joins++; return channel; }),
        removeChannel: vi.fn(),
    });
    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const)
        .map(level => vi.spyOn(console, level).mockImplementation(() => undefined));
});

afterEach(() => {
    bridges.splice(0).forEach(b => b.destroy());
    vi.restoreAllMocks();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
});

describe('first start on protocol v2', () => {
    it('renews a v1 pairing (no marker) exactly once, with a notice, and the old key stops working', () => {
        saved = { calendarIds: ['primary'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY };

        const bridge = start();
        expect(writes()).toHaveLength(1);
        const renewed = { ...saved };
        expect(renewed.remotePairingVersion).toBe(2);
        expect(Number.isFinite(Date.parse(String(renewed.remotePairingRenewedAt)))).toBe(true);
        expect(renewed.calendarIds).toEqual(['primary']);
        expect(typeof renewed.remoteRoomId).toBe('string');
        expect(typeof renewed.remoteKey).toBe('string');
        expect(renewed.remoteRoomId).not.toBe(OLD_ROOM);
        expect(renewed.remoteKey).not.toBe(OLD_KEY);
        expect(channelName).toBe(`remote-control:${String(renewed.remoteRoomId)}`);

        deliver({ payload: signed(OLD_KEY) });
        expect(dispatches()).toBe(0);
        expect(writes()).toHaveLength(1);
        deliver({ payload: signed(String(renewed.remoteKey)) });
        expect(dispatches()).toBe(1);
        // The phone answered under the new key: the notice is deleted, the pairing untouched.
        expect(writes()).toHaveLength(2);
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
        expect(saved).toMatchObject({ remoteRoomId: renewed.remoteRoomId, remoteKey: renewed.remoteKey, remotePairingVersion: 2 });

        // A re-init and a restart both find the marker: nothing renews again.
        bridge.init();
        start();
        expect(writes()).toHaveLength(2);
        expect(saved.remoteKey).toBe(renewed.remoteKey);

        const lines = consoleLines();
        expect(lines.filter(line => line === RENEWED)).toHaveLength(1);
        for (const secret of [OLD_ROOM, OLD_KEY, String(renewed.remoteRoomId), String(renewed.remoteKey)]) {
            expect(lines.join('\n')).not.toContain(secret);
        }
    });

    it('gives a fresh install a marked pairing, without the renewal line or the notice', () => {
        saved = { calendarIds: [], taskListIds: [] };
        start();
        expect(writes()).toHaveLength(1);
        expect(saved).toMatchObject({ remotePairingVersion: 2, remoteRoomId: expect.any(String), remoteKey: expect.any(String) });
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
        expect(consoleLines()).not.toContain(RENEWED);
    });

    it('leaves a pairing that already carries the marker alone', () => {
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2 };
        start();
        expect(mocks.storeUpdate).not.toHaveBeenCalled();
        expect(channelName).toBe(`remote-control:${OLD_ROOM}`);
    });

    it('Regenerate Keys stores the new pairing with the marker', () => {
        // Unmarked on purpose: the marker must come from regenerateKeys itself,
        // not survive from the stored config (its own init() would renew again).
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY };
        const bridge = new RemoteBridge();
        bridges.push(bridge);
        const result = bridge.regenerateKeys();
        if (!result.ok) throw new Error(`regenerateKeys refused: ${result.reason}`);
        expect(saved).toMatchObject({ remoteRoomId: result.roomId, remoteKey: result.remoteKey, remotePairingVersion: 2 });
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
        expect(writes()).toHaveLength(1);
        expect(consoleLines()).not.toContain(RENEWED);
    });
});

describe('the renewal notice (remotePairingRenewedAt)', () => {
    it('is cleared by the first verified message, a sync request included, in one write', () => {
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2, remotePairingRenewedAt: RENEWED_AT };
        start();

        deliver({ payload: signed('not-the-key-000000000') });
        deliver({ payload: { key: OLD_KEY, action: { type: 'ADD_TOKEN' }, msgId: 'v1', timestamp: Date.now() } });
        expect(writes(), 'an unverified message must not write').toHaveLength(0);

        deliver({ payload: signed(OLD_KEY, 'SYNC_REQUEST') });
        expect(writes()).toEqual([{ remotePairingRenewedAt: undefined }]);
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
        expect(saved).toMatchObject({ remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2 });

        deliver({ payload: signed(OLD_KEY) });
        expect(writes(), 'no write per message once the notice is gone').toHaveLength(1);
    });

    it('is tried once per join: a refused clear is not retried on every message, and logs one line without room or key', () => {
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2, remotePairingRenewedAt: RENEWED_AT };
        const bridge = start();
        failWrites();

        for (let i = 0; i < 3; i++) deliver({ payload: signed(OLD_KEY) });
        expect(dispatches(), 'a refused clear must not block the action').toBe(3);
        expect(writes(), 'a locked file turned every phone message into a write').toHaveLength(1);
        expect(saved.remotePairingRenewedAt).toBe(RENEWED_AT);
        const lines = consoleLines();
        expect(lines.filter(line => line === NOT_CLEARED)).toHaveLength(1);
        for (const secret of [OLD_ROOM, OLD_KEY]) expect(lines.join('\n')).not.toContain(secret);

        // The next join (a retry or a restart) finds the notice on disk and tries once more.
        mocks.storeUpdate.mockImplementation(patch => {
            saved = JSON.parse(JSON.stringify({ ...saved, ...patch }));
            return { ok: true };
        });
        bridge.init();
        deliver({ payload: signed(OLD_KEY) });
        expect(writes()).toHaveLength(2);
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
    });

    it('survives Regenerate Keys: the first message under the new key clears it', () => {
        // The notice asks the parent to scan the QR code, which a regenerate replaces: the
        // phone's first verified message under the new key is the answer it waits for.
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2, remotePairingRenewedAt: RENEWED_AT };
        const bridge = start();

        const result = bridge.regenerateKeys();
        if (!result.ok) throw new Error(`regenerateKeys refused: ${result.reason}`);
        expect(saved.remotePairingRenewedAt, 'Regenerate Keys does not touch the notice').toBe(RENEWED_AT);

        deliver({ payload: signed(OLD_KEY) });
        expect(saved.remotePairingRenewedAt, 'the revoked key cleared the notice').toBe(RENEWED_AT);
        deliver({ payload: signed(result.remoteKey) });
        expect(saved).not.toHaveProperty('remotePairingRenewedAt');
    });
});

describe('a pairing write that does not reach the disk', () => {
    it('stays offline, retrying, when there was no pairing to keep', () => {
        saved = { calendarIds: [], taskListIds: [] };
        failWrites();
        const bridge = start();
        expect(joins).toBe(0);
        expect(bridge.getStatus()).toBe(false);
        expect(consoleLines().some(line => line.startsWith(OFFLINE))).toBe(true);
    });

    it('Regenerate Keys returns the refusal, keeps the current pairing and does not re-join', () => {
        saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY, remotePairingVersion: 2 };
        const bridge = start();
        failWrites();

        expect(bridge.regenerateKeys()).toEqual(REFUSED);
        expect(joins).toBe(1);
        expect(saved).toMatchObject({ remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY });
        deliver({ payload: signed(OLD_KEY) });
        expect(dispatches(), 'the current pairing stopped working').toBe(1);
    });
});

describe('a key that is not a string (hand-edited config.json)', () => {
    // The store reads it as absent (store.test.ts); marked v2 on purpose, so only the
    // unreadable key can trigger the renewal. The real-store path is remote-bridge.real-store.test.ts.
    for (const badKey of [987654321, { k: 'v' }]) {
        it(`is renewed: no message throws, nothing is signed with it or logs it (${JSON.stringify(badKey)})`, async () => {
            saved = { calendarIds: [], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: badKey, remotePairingVersion: 2 };
            const bridge = start();

            expect(channelName).not.toBe(`remote-control:${OLD_ROOM}`);
            expect(() => deliver({ payload: signed('987654321') })).not.toThrow();
            expect(() => deliver({ payload: { key: badKey, action: { type: 'ADD_TOKEN' } } })).not.toThrow();
            expect(dispatches()).toBe(0);

            await bridge.broadcastState({ bankCount: 1 });
            const sent = channelSend.mock.calls.map(([message]) => (message as { payload: unknown }).payload);
            expect(sent.map(payload => openRemoteMessage(String(saved.remoteKey), 'state-update', payload) !== null)).toEqual([true]);
            expect(consoleLines().join('\n')).not.toContain('987654321');
        });
    }
});
