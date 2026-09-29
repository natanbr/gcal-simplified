// ============================================================
// The remote pairing's lifecycle: renewed once on the first v2 start.
// ------------------------------------------------------------
// Protocol v2 changes how the key is used, not which key. An upgraded install
// keeps the key that v1 broadcast in plain text for months, and a signature
// keyed with it proves nothing to whoever captured it. So an unmarked pairing
// is replaced once, before the renderer can read it. The store double is
// stateful and reads like store.read(): `saved` is the file on disk, update()
// merges a patch onto it through JSON (an undefined field is deleted, as in
// the real file), and a room or key that is not a non-empty string reads as
// absent, so a hand-edited config.json can be modelled too.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { RemoteBridge } from './remote-bridge';
import { openRemoteMessage, sealRemoteMessage } from './remote-auth';
import type { ConfigRead, store } from './store';

type Config = Record<string, unknown>;
type BroadcastHandler = (message: { payload?: unknown }) => void;

const OLD_ROOM = '0ld00000-1111-4222-8333-444455556666';
const OLD_KEY = 'OldLeakedKey_v1abcde';
const RENEWED = '[RemoteBridge] Pairing renewed for signed messages (protocol v2): scan the QR code again on the phone.';

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
        },
    };
}

function start(): RemoteBridge {
    const bridge = new RemoteBridge();
    bridges.push(bridge);
    bridge.init();
    return bridge;
}

function consoleLines(): string[] {
    return consoleSpies.flatMap(spy => spy.mock.calls.map(call => call.map(String).join(' ')));
}

let msgSeq = 0;
const signed = (key: string) => sealRemoteMessage(key, 'action', { action: { type: 'ADD_TOKEN' }, msgId: `m-${++msgSeq}`, timestamp: Date.now() });
const dispatches = () => mocks.rendererSend.mock.calls.filter(([ch]) => ch === 'remote-control:action').length;

beforeEach(() => {
    vi.clearAllMocks();
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
        channel: vi.fn((name: string) => { channelName = name; return channel; }),
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
    it('renews a v1 pairing (no marker) exactly once, and the old key stops working', () => {
        saved = { calendarIds: ['primary'], taskListIds: [], remoteRoomId: OLD_ROOM, remoteKey: OLD_KEY };

        const bridge = start();
        expect(mocks.storeUpdate).toHaveBeenCalledTimes(1);
        const renewed = { ...saved };
        expect(renewed.remotePairingVersion).toBe(2);
        expect(renewed.calendarIds).toEqual(['primary']);
        expect(typeof renewed.remoteRoomId).toBe('string');
        expect(typeof renewed.remoteKey).toBe('string');
        expect(renewed.remoteRoomId).not.toBe(OLD_ROOM);
        expect(renewed.remoteKey).not.toBe(OLD_KEY);
        expect(channelName).toBe(`remote-control:${String(renewed.remoteRoomId)}`);

        deliver({ payload: signed(OLD_KEY) });
        expect(dispatches()).toBe(0);
        deliver({ payload: signed(String(renewed.remoteKey)) });
        expect(dispatches()).toBe(1);

        // A re-init and a restart both find the marker: nothing renews again.
        bridge.init();
        start();
        expect(mocks.storeUpdate).toHaveBeenCalledTimes(1);
        expect(saved.remoteKey).toBe(renewed.remoteKey);

        const lines = consoleLines();
        expect(lines.filter(line => line === RENEWED)).toHaveLength(1);
        for (const secret of [OLD_ROOM, OLD_KEY, String(renewed.remoteRoomId), String(renewed.remoteKey)]) {
            expect(lines.join('\n')).not.toContain(secret);
        }
    });

    it('gives a fresh install a marked pairing, without the renewal line', () => {
        saved = { calendarIds: [], taskListIds: [] };
        start();
        expect(mocks.storeUpdate).toHaveBeenCalledTimes(1);
        expect(saved).toMatchObject({ remotePairingVersion: 2, remoteRoomId: expect.any(String), remoteKey: expect.any(String) });
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
        expect(mocks.storeUpdate).toHaveBeenCalledTimes(1);
        expect(consoleLines()).not.toContain(RENEWED);
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
