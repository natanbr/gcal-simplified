// ============================================================
// Replay defences of RemoteBridge, on a fake clock.
// ------------------------------------------------------------
// Two numbers work together: an action is accepted while its timestamp is
// within MAX_ACTION_AGE_MS of this machine's clock (either direction), and its
// msgId is remembered for the seen-id TTL. The TTL must cover the whole window
// a signed action stays acceptable, or a captured action is replayed once
// after its id is pruned.
//
// Fake timers go on BEFORE init(): the seen-id cleanup is a setInterval armed
// by init(), and an interval armed under real timers never fires on a fake one.
// The wall clock can also step BACK (NTP, a manual change): the last two
// sections pin what survives that.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { RemoteBridge } from './remote-bridge';
import { openRemoteMessage, sealRemoteMessage } from './remote-auth';
import type { store } from './store';

type BroadcastHandler = (message: { payload?: unknown }) => void;

const KEY = 'q7Lk2mPz9XwR4tYb8NcV';
const NOON = new Date('2026-09-28T12:00:00Z');

const mocks = vi.hoisted(() => ({
    createClient: vi.fn(),
    storeRead: vi.fn<typeof store.read>(),
    rendererSend: vi.fn<(channel: string, ...args: unknown[]) => void>(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [{ webContents: { send: mocks.rendererSend } }] } }));
vi.mock('./store', () => ({ store: { read: mocks.storeRead, update: vi.fn() } }));

let bridge: RemoteBridge;
let deliver!: BroadcastHandler;
let channelSend: Mock<(message: unknown) => Promise<string>>;

function action(msgId: string, timestamp: number) {
    return { payload: sealRemoteMessage(KEY, 'action', { action: { type: 'ADD_TOKEN' }, msgId, timestamp }) };
}

const dispatches = () => mocks.rendererSend.mock.calls.filter(([ch]) => ch === 'remote-control:action').length;

/** The timestamps inside every state-update the bridge sent, in order. */
function sentStamps(): unknown[] {
    return channelSend.mock.calls.map(([message]) => {
        const payload = (message as { payload: unknown }).payload;
        return openRemoteMessage(KEY, 'state-update', payload)?.timestamp;
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    process.env.VITE_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.VITE_SUPABASE_ANON_KEY = 'mock-anon-key';
    const config = { calendarIds: [], taskListIds: [], remoteRoomId: 'room-under-test', remoteKey: KEY, remotePairingVersion: 2 };
    mocks.storeRead.mockReturnValue({ kind: 'loaded', config, raw: { ...config } });
    channelSend = vi.fn<(message: unknown) => Promise<string>>().mockResolvedValue('ok');
    const channel: { on: Mock; subscribe: Mock; send: typeof channelSend } = {
        on: vi.fn((_type: string, _filter: unknown, handler: BroadcastHandler) => { deliver = handler; return channel; }),
        subscribe: vi.fn(() => channel),
        send: channelSend,
    };
    mocks.createClient.mockReturnValue({ channel: vi.fn(() => channel), removeChannel: vi.fn() });
    for (const level of ['log', 'warn', 'error'] as const) vi.spyOn(console, level).mockImplementation(() => undefined);

    bridge = new RemoteBridge();
    bridge.init();
});

afterEach(() => {
    bridge.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.VITE_SUPABASE_URL;
    delete process.env.VITE_SUPABASE_ANON_KEY;
});

describe('seen-id TTL', () => {
    it('a replayed signed action stays refused while its timestamp is inside the age window', () => {
        // Dated a full window ahead: acceptable until two windows from now.
        const captured = action('future-1', Date.now() + 60_000);
        deliver(captured);
        expect(dispatches()).toBe(1);

        // The cleanup interval has run (twice); the timestamp is still exactly
        // inside the window, so only the remembered msgId stops the replay.
        vi.advanceTimersByTime(120_000);
        deliver(captured);
        expect(dispatches()).toBe(1);
    });
});

describe('the 60-second age window', () => {
    it('accepts an action exactly 60 000 ms off, in either direction', () => {
        deliver(action('past-edge', Date.now() - 60_000));
        deliver(action('future-edge', Date.now() + 60_000));
        expect(dispatches()).toBe(2);
    });

    it('refuses an action 60 001 ms off, in either direction', () => {
        deliver(action('past-over', Date.now() - 60_001));
        deliver(action('future-over', Date.now() + 60_001));
        expect(dispatches()).toBe(0);
        // Control: the harness does dispatch a fresh one.
        deliver(action('fresh', Date.now()));
        expect(dispatches()).toBe(1);
    });
});

describe('a backward clock step', () => {
    it('cannot replay a signed action whose msgId was already forgotten', () => {
        const captured = action('captured-1', Date.now());
        deliver(captured);
        expect(dispatches()).toBe(1);

        // Pruned at the 180 s tick (older than the 120 s memory)...
        vi.advanceTimersByTime(180_000);
        // ...then the clock steps back, so the captured timestamp is fresh again.
        vi.setSystemTime(NOON);
        deliver(captured);
        expect(dispatches()).toBe(1);

        // Control: a genuine action newer than anything forgotten still lands.
        deliver(action('genuine-after-step', NOON.getTime() + 1_000));
        expect(dispatches()).toBe(2);
    });

    it('never stamps a state-update older than, or equal to, the previous one', async () => {
        await bridge.broadcastState({ bankCount: 1 });
        await bridge.broadcastState({ bankCount: 2 }); // same millisecond
        vi.setSystemTime(NOON.getTime() - 5_000);      // the clock steps back
        await bridge.broadcastState({ bankCount: 3 });

        const t = NOON.getTime();
        // The phone keeps only strictly newer states: equal or older ones are dropped.
        expect(sentStamps()).toEqual([t, t + 1, t + 2]);
    });
});
