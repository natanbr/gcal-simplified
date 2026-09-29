// ============================================================
// Replay defences of RemoteBridge, on a fake clock.
// ------------------------------------------------------------
// Three things work together: an action is accepted while its timestamp is
// within MAX_ACTION_AGE_MS of this machine's clock (either direction), its
// msgId is remembered for the seen-id TTL, and a forgotten id leaves a floor
// (its sender's timestamp) that nothing older may pass. The floor stops a
// replay after a prune; the TTL (twice the window) keeps a fast phone's id out
// of the floor until a slower phone's genuine messages are all newer than it.
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

describe('two phones with opposite clock errors', () => {
    it('do not refuse each other: pruning the fast phone id must not floor out the slow phone', () => {
        // Just before the first cleanup tick (60 s after init), so the next one is 61 s later.
        vi.advanceTimersByTime(59_000);
        deliver(action('phone-a-1', Date.now() + 50_000)); // phone A runs 50 s fast
        deliver(action('phone-b-1', Date.now() - 50_000)); // phone B runs 50 s slow
        expect(dispatches()).toBe(2);

        // Past the 120 s tick: with a TTL of one window, A's id is pruned there and the
        // floor jumps to A's timestamp, 100 s ahead of anything B can send now.
        vi.advanceTimersByTime(62_000);
        deliver(action('phone-b-2', Date.now() - 50_000)); // B's next genuine tap
        expect(dispatches(), 'the slow phone was refused as a replay').toBe(3);
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

    it('floors on the SENDER time: an action dated ahead of the desktop clock cannot replay either', () => {
        // The phone's clock runs 30 s ahead. A floor on the desktop's arrival time (NOON) would sit
        // below this timestamp and let the replay through after the step back.
        const captured = action('captured-ahead', NOON.getTime() + 30_000);
        deliver(captured);
        expect(dispatches()).toBe(1);

        vi.advanceTimersByTime(180_000);
        vi.setSystemTime(NOON);
        deliver(captured);
        expect(dispatches()).toBe(1);
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

    it('starts again from the clock when the last stamp is further ahead than the phone accepts', async () => {
        // The desktop clock ran 5 min fast, then was corrected. The phone refuses a state more than
        // 120 s ahead of its own clock, so continuing from the fast stamp would be refused until
        // real time caught up; a stamp from now is newer than anything the phone accepted.
        vi.setSystemTime(NOON.getTime() + 5 * 60_000);
        await bridge.broadcastState({ bankCount: 1 });
        vi.setSystemTime(NOON);
        await bridge.broadcastState({ bankCount: 2 });
        await bridge.broadcastState({ bankCount: 3 }); // same millisecond: still strictly increasing

        const t = NOON.getTime();
        expect(sentStamps()).toEqual([t + 5 * 60_000, t, t + 1]);
    });

    it('keeps counting up from a stamp the phone still accepts (at most 120 s ahead)', async () => {
        vi.setSystemTime(NOON.getTime() + 120_000);
        await bridge.broadcastState({ bankCount: 1 });
        vi.setSystemTime(NOON);
        await bridge.broadcastState({ bankCount: 2 });

        const t = NOON.getTime();
        expect(sentStamps()).toEqual([t + 120_000, t + 120_001]);
    });
});
