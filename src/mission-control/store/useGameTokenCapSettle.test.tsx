// ============================================================
// An update that removes a game token says so in the log (2026-09-24)
// ------------------------------------------------------------
// v0.0.42 could save 5 game tokens beside an open Quick-Game goal. The cap
// counts the goal's token (a trash refunds it), so that balance is one over and
// must load as 4 — or the trash would refund to 6. Hydration used to clamp it
// silently: a token vanished at launch with no line and no attribution, which
// is exactly what CLAUDE.md → Attribution calls a bug.
//
// Each test seeds the persisted blob and mounts the real store, the relaunch
// path: loadPersistedState → the settle dispatch → real reducer → audit trail.
// ============================================================

import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { STORAGE_KEY, useMCState, useMCDispatch } from './useMCStore';
import { initialState, mcReducer } from './mcReducer';
import { summariseDay } from '../components/activity-log/logSources';
import { createLogEntry } from './activityLog';
import { MAX_GAME_TOKENS } from './moodGauge';
import { useGameTokenCapSettle } from './useGameTokenCapSettle';
import type { MCAction, MCState } from '../types';

// The real reducer, wrapped so a test can see which actions reached it.
vi.mock('./mcReducer', async importOriginal => {
    const actual = await importOriginal<typeof import('./mcReducer')>();
    return { ...actual, mcReducer: vi.fn(actual.mcReducer) };
});
const reducerSpy = vi.mocked(mcReducer);

// The real hook, wrapped so a test can see whether (and how often) it runs.
vi.mock('./useGameTokenCapSettle', async importOriginal => {
    const actual = await importOriginal<typeof import('./useGameTokenCapSettle')>();
    return { ...actual, useGameTokenCapSettle: vi.fn(actual.useGameTokenCapSettle) };
});
const settleHook = vi.mocked(useGameTokenCapSettle);
const settleDispatches = () => reducerSpy.mock.calls.filter(([, a]) => a.type === 'SETTLE_GAME_TOKEN_CAP');

const SETTLE = /removed at load/;

const goal = (n = 1) => initialState.cases.map(c =>
    c.id < n ? { ...c, status: 'active' as const, reward: 'quick-game' as const, tokenCount: 0 } : c);

function seed(blob: Record<string, unknown>) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ _migrationVersion: 1, ...blob }));
}

// Typed like the preload's invoke, so a call's payload is readable without a cast.
const invoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>((channel: string) => {
    if (channel === 'app:info') return Promise.resolve({ version: 'test' });
    if (channel === 'settings:get') return Promise.resolve({});
    return Promise.resolve(undefined);
});

const isEntry = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Everything the audit bridge sent to electron/audit-log.ts. */
const appended = () => invoke.mock.calls
    .filter(([channel]) => channel === 'audit:append')
    .flatMap(([, batch]) => (Array.isArray(batch) ? batch.filter(isEntry) : []));

let live: MCState = initialState;
/** Every distinct state object the store handed out, in order. */
let seen: MCState[] = [];
let dispatch: (a: MCAction) => void = () => {};
function Probe() {
    live = useMCState();
    if (seen[seen.length - 1] !== live) seen.push(live);
    dispatch = useMCDispatch();
    return null;
}

/** One launch: mount, let the persist and audit debounces run, return the unmount. */
async function launch({ strict = false } = {}) {
    const tree = <MCStoreProvider><Probe /></MCStoreProvider>;
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    return view;
}

const settleLines = (s: MCState = live) => s.activityLogs.filter(l => SETTLE.test(l.message));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T10:00:00.000Z'));
    invoke.mockClear();
    reducerSpy.mockClear();
    settleHook.mockClear();
    seen = [];
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('loading over the cap — happy path', () => {
    it('5 game tokens plus a Quick-Game goal load as 4, with one log line from the system', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        await launch();

        expect(live.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        const lines = settleLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ source: 'system', gameTokens: MAX_GAME_TOKENS - 1 });
        // `delta` is a BANK-token delta wherever it is read; the bank did not move.
        expect(lines[0].delta).toBeUndefined();
        expect(lines[0].message).toBe(
            '1 game token removed at load: 5 game tokens plus 1 Quick-Game goal is over the 5-token cap',
        );
    });

    it('the line reaches the audit trail, like every other log entry', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        await launch();

        const audited = appended().filter(e => SETTLE.test(String(e.msg)));
        expect(audited).toHaveLength(1);
        expect(audited[0]).toMatchObject({ src: 'system', game: MAX_GAME_TOKENS - 1 });
        expect(audited[0], 'the audit file keeps d as a bank-token delta for good').not.toHaveProperty('d');
    });

    it("leaves the log's earned / spent sums alone: no bank token moved", async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        await launch();

        expect(settleLines()).toHaveLength(1);
        expect(summariseDay(live.activityLogs, new Date())).toMatchObject({ earned: 0, spent: 0, net: 0 });
    });

    it('StrictMode double effects still write one line and one audit entry', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        await launch({ strict: true });

        expect(live.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        expect(settleLines()).toHaveLength(1);
        expect(appended().filter(e => SETTLE.test(String(e.msg)))).toHaveLength(1);
    });

    it('counts every goal: 5 tokens plus 2 Quick-Game goals load as 3, one line for both', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal(2) });
        await launch();

        expect(live.gameTokens).toBe(3);
        expect(settleLines()).toHaveLength(1);
        expect(settleLines()[0].delta).toBeUndefined();
        expect(settleLines()[0].message).toMatch(/^2 game tokens removed at load: 5 game tokens plus 2 Quick-Game goals/);
    });
});

describe('loading within the cap — negative', () => {
    it.each([
        ['4 tokens plus a goal', { gameTokens: 4, cases: goal() }, 4],
        ['5 tokens and no goal', { gameTokens: MAX_GAME_TOKENS }, MAX_GAME_TOKENS],
        ['0 tokens', { gameTokens: 0, cases: goal() }, 0],
        ['a corrupt balance (NaN saves as null)', { gameTokens: null, cases: goal() }, 0],
    ])('%s: loads unchanged and writes no line', async (_label, blob, expected) => {
        seed(blob);
        await launch();

        expect(live.gameTokens).toBe(expected);
        expect(settleLines()).toHaveLength(0);
        expect(appended().filter(e => SETTLE.test(String(e.msg)))).toHaveLength(0);
    });

    it('a launch within the cap dispatches nothing and keeps the loaded state object', async () => {
        seed({ gameTokens: 4, cases: goal() });
        await launch();

        expect(settleDispatches()).toHaveLength(0);
        expect(seen, 'no new state object after the load').toHaveLength(1);
    });

    it('a launch within the cap never mounts the settle, so store changes do not re-render it', async () => {
        // It subscribes to the whole store; mounted for the app's lifetime it re-rendered
        // on every change of the always-mounted provider for a job done once at load.
        seed({ gameTokens: 4, cases: goal() });
        await launch();
        act(() => { dispatch({ type: 'ADD_TOKEN' }); });
        act(() => { dispatch({ type: 'ADD_TOKEN' }); });

        expect(settleHook).not.toHaveBeenCalled();
    });

    it('the settle is a no-op on a state within the cap: same reference, no log entry', () => {
        const within: MCState = { ...initialState, gameTokens: 4, cases: goal() };
        // No timestamp: a stamped action also runs the mood-gauge sync, which is not under test.
        const action: MCAction = { type: 'SETTLE_GAME_TOKEN_CAP', origin: 'system' };
        expect(mcReducer(within, action)).toBe(within);
        expect(createLogEntry(action, within)).toBeNull();
    });
});

describe('loading over the cap — lifecycle', () => {
    it('a relaunch after the settle writes no second line', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        (await launch()).unmount();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).gameTokens).toBe(MAX_GAME_TOKENS - 1);

        invoke.mockClear();
        await launch();
        expect(live.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        expect(settleLines(), 'only the restored line from the first launch').toHaveLength(1);
        expect(appended().filter(e => SETTLE.test(String(e.msg)))).toHaveLength(0);
    });

    it('trashing the goal afterwards refunds to 5, never 6, and stays 5 across a relaunch', async () => {
        seed({ gameTokens: MAX_GAME_TOKENS, cases: goal() });
        const first = await launch();
        act(() => { dispatch({ type: 'REFUND_CASE', caseId: 0 }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(600); }); // the 500 ms persist debounce
        expect(live.gameTokens).toBe(MAX_GAME_TOKENS);
        first.unmount();

        await launch();
        expect(live.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(settleLines()).toHaveLength(1);
    });
});
