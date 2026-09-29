// ============================================================
// Remote protocol v2 on the wire — what RemoteBridge sends and accepts.
// ------------------------------------------------------------
// v1 put the pairing key in every state-update and trusted any action whose
// payload repeated it, on a channel anyone with the room id can join. These
// cases pin the fix: the key never leaves this process, and only a message
// signed with it (remote-auth.ts) reaches the renderer.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, type Mock, type MockInstance } from 'vitest';
import { inspect } from 'node:util';
import { RemoteBridge } from './remote-bridge';
import { sealRemoteMessage, verifyRemoteMessage, type RemoteEvent } from './remote-auth';
import type { store } from './store';

interface WindowSlice { webContents: { send: (channel: string, ...args: unknown[]) => void } }
type BroadcastHandler = (message: { payload?: unknown }) => void;
type StatusHandler = (status: string, err?: Error) => void;

const ROOM_ID = '5f0c2a9e-7b1d-4c3e-9a8f-2d6b4e1c7a90';
const REMOTE_KEY = 'q7Lk2mPz9XwR4tYb8NcV';

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    getAllWindows: vi.fn<() => WindowSlice[]>(),
    storeRead: vi.fn<typeof store.read>(),
    storeUpdate: vi.fn<typeof store.update>(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: mocks.getAllWindows } }));
vi.mock('./store', () => ({ store: { read: mocks.storeRead, update: mocks.storeUpdate } }));

let bridge: RemoteBridge;
let deliver!: BroadcastHandler;
let reportStatus!: StatusHandler;
let rendererSend: Mock<(channel: string, ...args: unknown[]) => void>;
let channelSend: Mock<(message: unknown) => Promise<string>>;
let consoleSpies: MockInstance[];
let msgCounter = 0;

function seal(event: RemoteEvent, content: unknown, key = REMOTE_KEY) {
    return sealRemoteMessage(key, event, content);
}

/** A genuine phone action: signed, fresh, with a unique msgId unless given one. */
function signedAction(action: Record<string, unknown>, extra: Record<string, unknown> = {}) {
    return seal('action', { action, msgId: `msg-${++msgCounter}`, timestamp: Date.now(), ...extra });
}

function dispatchedActions(): unknown[] {
    return rendererSend.mock.calls.filter(([ch]) => ch === 'remote-control:action').map(([, a]) => a);
}

function syncRequests(): number {
    return rendererSend.mock.calls.filter(([ch]) => ch === 'remote:request-sync').length;
}

/** Control: after a rejection, a genuine action still gets through — so the
 *  rejection was specific, not a dead harness. */
function expectGenuineStillDispatched() {
    const before = dispatchedActions().length;
    deliver({ payload: signedAction({ type: 'CONTROL_PROBE' }) });
    expect(dispatchedActions()).toHaveLength(before + 1);
}

/** config.json as the store reads it: this room, `remoteKey`, already marked as protocol v2. */
function storeHolds(remoteKey: string) {
    const config = { calendarIds: [], taskListIds: [], remoteRoomId: ROOM_ID, remoteKey, remotePairingVersion: 2 };
    mocks.storeRead.mockReturnValue({ kind: 'loaded', config, raw: { ...config } });
}

function consoleText(): string {
    return consoleSpies
        .flatMap(spy => spy.mock.calls.flat())
        // inspect, as Node's console does: an Error prints its message AND its cause.
        .map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 10 })))
        .join('\n');
}

beforeEach(() => {
    vi.clearAllMocks();
    process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';
    storeHolds(REMOTE_KEY);
    mocks.storeUpdate.mockReturnValue({ ok: true });

    rendererSend = vi.fn();
    mocks.getAllWindows.mockReturnValue([{ webContents: { send: rendererSend } }]);
    channelSend = vi.fn<(message: unknown) => Promise<string>>().mockResolvedValue('ok');
    const channel = {
        on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => {
            deliver = handler;
            return channel;
        }),
        subscribe: vi.fn((onStatus: StatusHandler) => {
            reportStatus = onStatus;
            return channel;
        }),
        send: channelSend,
    };
    mocks.createClient.mockReturnValue({ channel: vi.fn(() => channel), removeChannel: vi.fn() });

    consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const)
        .map(level => vi.spyOn(console, level).mockImplementation(() => undefined));

    bridge = new RemoteBridge();
    bridge.init();
});

afterEach(() => {
    // Across every case: the pairing secret never reaches a log line.
    expect(consoleText()).not.toContain(REMOTE_KEY);
    bridge.destroy();
    vi.restoreAllMocks();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
});

describe('broadcastState — desktop → phone', () => {
    it('sends a signed v2 envelope and never the pairing key', async () => {
        const state = { bankCount: 3, gameTokens: 1 };
        const before = Date.now();
        await bridge.broadcastState(state);

        expect(channelSend).toHaveBeenCalledTimes(1);
        const message = channelSend.mock.calls[0][0] as { type: string; event: string; payload: Record<string, unknown> };
        expect(message.type).toBe('broadcast');
        expect(message.event).toBe('state-update');
        expect(JSON.stringify(message)).not.toContain(REMOTE_KEY);
        expect(message.payload).not.toHaveProperty('key');
        expect(Object.keys(message.payload).sort()).toEqual(['body', 'sig', 'v']);
        expect(message.payload.v).toBe(2);

        const { body, sig } = message.payload;
        expect(typeof body).toBe('string');
        expect(verifyRemoteMessage(REMOTE_KEY, 'state-update', body as string, sig)).toBe(true);
        expect(verifyRemoteMessage(REMOTE_KEY, 'action', body as string, sig)).toBe(false);

        const content = JSON.parse(body as string) as { state: unknown; timestamp: unknown };
        expect(content.state).toEqual(state);
        expect(typeof content.timestamp).toBe('number');
        expect(content.timestamp).toBeGreaterThanOrEqual(before);
    });
});

describe('incoming actions — phone → desktop', () => {
    it('dispatches a correctly signed action to the renderer', () => {
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }) });
        expect(dispatchedActions()).toEqual([{ type: 'ADD_TOKEN' }]);
    });

    it('REJECTS a v1 payload that carries the correct key in plain text', () => {
        // The core regression: v1 accepted exactly this.
        deliver({ payload: { key: REMOTE_KEY, action: { type: 'ADD_TOKEN' }, msgId: 'v1-msg', timestamp: Date.now() } });
        expect(dispatchedActions()).toEqual([]);
        const logged = consoleText();
        expect(logged).toContain('Rejected unsigned action (protocol v1). A phone still in legacy mode sends one per connect');
        // Nothing from an unverified payload is echoed.
        expect(logged).not.toContain('v1-msg');
        expectGenuineStillDispatched();
    });

    it('rejects a tampered body under the original signature, and logs neither body nor sig', () => {
        const genuine = signedAction({ type: 'ADD_TOKEN' });
        const tamperedBody = genuine.body.replace('ADD_TOKEN', 'CLEAR_LOGS');
        deliver({ payload: { ...genuine, body: tamperedBody } });
        expect(dispatchedActions()).toEqual([]);
        const logged = consoleText();
        for (const secret of [genuine.sig, genuine.body, tamperedBody]) expect(logged).not.toContain(secret);
        expectGenuineStillDispatched();
    });

    it('rejects an action signed with the wrong key', () => {
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'w', timestamp: Date.now() }, 'not-the-key-000000000') });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('rejects a captured state-update replayed on the action event', () => {
        deliver({ payload: seal('state-update', { action: { type: 'ADD_TOKEN' }, msgId: 'r', timestamp: Date.now() }) });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('rejects a signed action with no msgId', () => {
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, timestamp: Date.now() }) });
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: '', timestamp: Date.now() }) });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('rejects a signed action with no timestamp (v1 skipped the staleness check then)', () => {
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'no-ts' }) });
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'str-ts', timestamp: String(Date.now()) }) });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('rejects a signed action whose action has no type', () => {
        deliver({ payload: signedAction({}) });
        deliver({ payload: signedAction({ type: '' }) });
        deliver({ payload: seal('action', { action: 'ADD_TOKEN', msgId: 'flat', timestamp: Date.now() }) });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('rejects a signed action older or newer than 60 seconds', () => {
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }, { timestamp: Date.now() - 70_000 }) });
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }, { timestamp: Date.now() + 70_000 }) });
        expect(dispatchedActions()).toEqual([]);
        expectGenuineStillDispatched();
    });

    it('dispatches the same signed msgId only once', () => {
        const once = signedAction({ type: 'ADD_TOKEN' }, { msgId: 'dup-1' });
        deliver({ payload: once });
        deliver({ payload: once });
        expect(dispatchedActions()).toHaveLength(1);
    });

    it('turns a signed SYNC_REQUEST into remote:request-sync, de-duplicated too', () => {
        const sync = signedAction({ type: 'SYNC_REQUEST' }, { msgId: 'sync-1' });
        deliver({ payload: sync });
        deliver({ payload: sync });
        expect(syncRequests()).toBe(1);
        expect(dispatchedActions()).toEqual([]);
    });

    it('does not let an unauthenticated message claim a msgId', () => {
        // A forged message must not add to the seen-id map, or anyone could
        // pre-burn the next genuine msgId and silently drop the parent's tap.
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'X', timestamp: Date.now() }, 'forger-key-0000000000') });
        deliver({ payload: { key: 'guess', action: { type: 'ADD_TOKEN' }, msgId: 'X', timestamp: Date.now() } });
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }, { msgId: 'X' }) });
        expect(dispatchedActions()).toEqual([{ type: 'ADD_TOKEN' }]);
    });

    it('ignores a message with no payload at all without throwing', () => {
        expect(() => deliver({})).not.toThrow();
        expect(() => deliver({ payload: null })).not.toThrow();
        expect(dispatchedActions()).toEqual([]);
    });
});

describe('a changed pairing key', () => {
    /** The key inside the state-update the bridge sent last. */
    async function broadcastKey(...keys: string[]): Promise<string | undefined> {
        await bridge.broadcastState({ bankCount: 2 });
        const { body, sig } = (channelSend.mock.calls.at(-1)?.[0] as { payload: { body: string; sig: string } }).payload;
        return keys.find(key => verifyRemoteMessage(key, 'state-update', body, sig));
    }

    it('Regenerate Keys applies the new key to the next message, in both directions', async () => {
        // The old key works first, so a key cached anywhere but the joined pairing shows up.
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }) });
        expect(dispatchedActions()).toHaveLength(1);

        const renewed = bridge.regenerateKeys();
        if (!renewed.ok) throw new Error(`regenerateKeys refused: ${renewed.reason}`);

        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }) });
        expect(dispatchedActions(), 'the revoked key still dispatched').toHaveLength(1);
        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'new-key', timestamp: Date.now() }, renewed.remoteKey) });
        expect(dispatchedActions()).toHaveLength(2);
        expect(await broadcastKey(REMOTE_KEY, renewed.remoteKey)).toBe(renewed.remoteKey);
        expect(consoleText()).not.toContain(renewed.remoteKey);
    });

    it('a key changed on disk without a join changes nothing: the bridge keeps the pairing it joined', async () => {
        // The main process owns the pairing (settings:save never writes it), so only
        // regenerateKeys() or the next start changes the key the bridge trusts.
        const NEW_KEY = 'Nw3PairingKey_after0';
        storeHolds(NEW_KEY);

        deliver({ payload: seal('action', { action: { type: 'ADD_TOKEN' }, msgId: 'disk-key', timestamp: Date.now() }, NEW_KEY) });
        expect(dispatchedActions()).toEqual([]);
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }) });
        expect(dispatchedActions()).toHaveLength(1);
        expect(await broadcastKey(REMOTE_KEY, NEW_KEY)).toBe(REMOTE_KEY);
        expect(mocks.storeRead, 'a per-message re-read of the file').toHaveBeenCalledTimes(1);
    });
});

describe('logging', () => {
    it('logs the room id — now the one thing a listener needs — only as an 8-character prefix', async () => {
        deliver({ payload: { key: REMOTE_KEY, action: { type: 'ADD_TOKEN' }, msgId: 'a', timestamp: Date.now() } });
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }, { timestamp: Date.now() - 70_000 }) });
        deliver({ payload: signedAction({ type: 'ADD_TOKEN' }) });
        await bridge.broadcastState({ bankCount: 1 });

        const logged = consoleText();
        expect(logged).toContain(`${ROOM_ID.slice(0, 8)}…`);
        expect(logged).not.toContain(ROOM_ID);
    });

    it('does not print the room id when a join error quotes the channel topic', () => {
        // supabase-js builds this Error from the server's reply and keeps the
        // reply as its cause; a join denial names the topic, room id included.
        const reply = { reason: `Unauthorized: cannot join topic realtime:remote-control:${ROOM_ID}` };
        reportStatus('CHANNEL_ERROR', new Error(reply.reason, { cause: reply }));
        reportStatus('SUBSCRIBED');

        const logged = consoleText();
        expect(logged).toContain('CHANNEL_ERROR');
        expect(logged).toContain('Unauthorized');
        expect(logged).not.toContain(ROOM_ID);
    });
});
