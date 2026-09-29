// ============================================================
// An earlier day's stuck mission is ended after load, and the audit trail
// records it (review of PR 184)
// ------------------------------------------------------------
// The first fix ended the run inside loadPersistedState. Its log line showed in
// the app but never reached the append-only audit trail: useAuditTrail treats
// every entry present at load as already written. Ending it through
// END_STALE_MISSION_RUN, dispatched once after load, sends the line through the
// interceptor like any other (the useGameTokenCapSettle pattern).
//
// Each test seeds the persisted blob and mounts the real store: loadPersistedState
// → the end dispatch → real reducer → audit trail.
// ============================================================

import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { STORAGE_KEY, useMCState, useMCDispatch } from './useMCStore';
import { initialState } from './mcReducer';
import { useStaleMissionRunEnd } from './useStaleMissionRunEnd';
import type { MCAction, MCState } from '../types';

vi.mock('./useStaleMissionRunEnd', async importOriginal => {
    const actual = await importOriginal<typeof import('./useStaleMissionRunEnd')>();
    return { ...actual, useStaleMissionRunEnd: vi.fn(actual.useStaleMissionRunEnd) };
});
const endHook = vi.mocked(useStaleMissionRunEnd);

const ENDED = /ended at startup: its saved record was incomplete/;
const NOW = new Date(2026, 8, 29, 7, 0);
const YESTERDAY_1900 = new Date(2026, 8, 28, 19, 0);

function seedStuckEvening() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        _migrationVersion: 1,
        activeMission: 'evening',
        missions: initialState.missions.map(m => (m.phase === 'evening'
            ? { ...m, active: true, startedAt: YESTERDAY_1900.toISOString(), durationMins: null }
            : m)),
    }));
}

const invoke = vi.fn<(channel: string, payload?: unknown) => Promise<unknown>>((channel: string) => {
    if (channel === 'app:info') return Promise.resolve({ version: 'test' });
    if (channel === 'settings:get') return Promise.resolve({});
    return Promise.resolve(undefined);
});

const isEntry = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const appended = () => invoke.mock.calls
    .filter(([channel]) => channel === 'audit:append')
    .flatMap(([, batch]) => (Array.isArray(batch) ? batch.filter(isEntry) : []));

let live: MCState = initialState;
let dispatch: (a: MCAction) => void = () => {};
function Probe() {
    live = useMCState();
    dispatch = useMCDispatch();
    return null;
}

async function launch({ strict = false } = {}) {
    const tree = <MCStoreProvider><Probe /></MCStoreProvider>;
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    return view;
}

const endedLines = (s: MCState = live) => s.activityLogs.filter(l => ENDED.test(l.message));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    invoke.mockClear();
    endHook.mockClear();
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('a stuck evening from yesterday, launched the next morning', () => {
    it('is ended with no outcome and one line from the system', async () => {
        seedStuckEvening();
        await launch();

        expect(live.activeMission).toBe('none');
        expect(live.missedMissionStreak).toBe(0);
        expect(live.lastCompletedOrFailedEveningDate).toBeNull();
        expect(endedLines()).toHaveLength(1);
        expect(endedLines()[0]).toMatchObject({ source: 'system', message: 'Evening mission from 2026-09-28 ended at startup: its saved record was incomplete' });
    });

    it('the line reaches the audit trail exactly once', async () => {
        seedStuckEvening();
        await launch();

        const audited = appended().filter(e => ENDED.test(String(e.msg)));
        expect(audited).toHaveLength(1);
        expect(audited[0]).toMatchObject({ src: 'system' });
    });

    it('StrictMode double effects still write one line and one audit entry', async () => {
        seedStuckEvening();
        await launch({ strict: true });

        expect(endedLines()).toHaveLength(1);
        expect(appended().filter(e => ENDED.test(String(e.msg)))).toHaveLength(1);
    });

    it('lifecycle: a relaunch after the persist writes no second line', async () => {
        seedStuckEvening();
        const first = await launch();
        first.unmount();
        invoke.mockClear();

        await launch();

        expect(endedLines()).toHaveLength(1);
        expect(appended().filter(e => ENDED.test(String(e.msg))), 'audited again on relaunch').toHaveLength(0);
    });
});

describe('a normal launch — negative', () => {
    it('never mounts the end hook, so store changes do not re-render it', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...initialState, _migrationVersion: 1 }));
        await launch();
        act(() => { dispatch({ type: 'ADD_TOKEN' }); });

        expect(endHook).not.toHaveBeenCalled();
        expect(endedLines()).toHaveLength(0);
    });
});
