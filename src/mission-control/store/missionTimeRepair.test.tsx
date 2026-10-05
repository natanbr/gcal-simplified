// ============================================================
// A mission time repaired at load says so in the log (2026-10-05)
// ------------------------------------------------------------
// Since v0.0.42 a cleared "Auto-trigger at" field could be saved as '', and a
// NaN duration saves as null. Hydration resets either to the default (06:00 /
// 19:00, 30 / 60 min) so the mission runs at all, but it did so silently: the
// child's evening moved to 19:00 with no line and no attribution, which is what
// CLAUDE.md → Attribution calls a bug.
//
// The repair itself stays in hydration (the first render must already have a
// real time and window). What it changed is handed to the provider, which
// writes one hand-built `system` line just after load, so it reaches the audit
// trail (a line written inside loadPersistedState would not: useAuditTrail
// treats every loaded entry as already written).
//
// Each launch test seeds the persisted blob and mounts the real store.
// ============================================================

import { StrictMode } from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCStoreProvider } from './MCStoreProvider';
import { STORAGE_KEY, useMCState } from './useMCStore';
import { initialState } from './mcReducer';
import { isEconomyLocked } from './missionStreak';
import { missionTimeRepairs, type MissionTimeRepair } from './missionTimeRepair';
import { DEFAULT_SETTINGS } from '../types';
import type { MCSettings, MCState } from '../types';

const REPAIRED = /^Mission settings repaired at startup/;
const NOW = new Date(2026, 9, 5, 14, 0);

function seed(settings: Record<string, unknown> | undefined, top: Record<string, unknown> = {}) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        _migrationVersion: 1,
        ...top,
        settings,
        // What an affected profile holds: the window derived from the cleared time.
        missions: initialState.missions.map(m => ({ ...m, startsAt: '', endsAt: 'NaN:NaN' })),
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
const auditedRepairs = () => appended().filter(e => REPAIRED.test(String(e.msg)));

let live: MCState = initialState;
/** Every distinct state object the store handed out, in order. */
let seen: MCState[] = [];
function Probe() {
    live = useMCState();
    if (seen[seen.length - 1] !== live) seen.push(live);
    return null;
}

async function launch({ strict = false } = {}) {
    const tree = <MCStoreProvider><Probe /></MCStoreProvider>;
    const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    return view;
}

const repairLines = (s: MCState = live) => s.activityLogs.filter(l => REPAIRED.test(l.message));

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    invoke.mockClear();
    seen = [];
    window.ipcRenderer = { invoke, on: vi.fn(() => vi.fn()) };
});

afterEach(() => {
    vi.useRealTimers();
    delete window.ipcRenderer;
    localStorage.clear();
});

describe('a cleared start time at load — happy path', () => {
    it('is reset to 19:00 and says so in one line from the system', async () => {
        seed({ ...DEFAULT_SETTINGS, eveningStartsAt: '' });
        await launch();

        expect(live.settings.eveningStartsAt).toBe('19:00');
        expect(live.missions.find(m => m.phase === 'evening')?.startsAt).toBe('19:00');
        const lines = repairLines();
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({
            message: 'Mission settings repaired at startup: the evening start time was empty, reset to 19:00',
            source: 'system',
            type: 'system',
        });
    });

    it('the line reaches the audit trail', async () => {
        seed({ ...DEFAULT_SETTINGS, morningStartsAt: '' });
        await launch();

        expect(auditedRepairs()).toHaveLength(1);
        expect(auditedRepairs()[0]).toMatchObject({ src: 'system' });
    });

    it('names every field it reset, and why, in one line', async () => {
        seed({ ...DEFAULT_SETTINGS, morningStartsAt: '', eveningStartsAt: '25:00', eveningDurationMins: null, morningDurationMins: 0 });
        await launch();

        expect(repairLines().map(l => l.message)).toEqual([
            'Mission settings repaired at startup: the morning start time was empty, reset to 06:00; '
            + 'the evening start time could not be read, reset to 19:00; '
            + 'the morning duration was not a real length, reset to 30 min; '
            + 'the evening duration could not be read, reset to 60 min',
        ]);
    });

    it('StrictMode double effects still write one line and one audit entry', async () => {
        seed({ ...DEFAULT_SETTINGS, eveningStartsAt: '' });
        await launch({ strict: true });

        expect(repairLines()).toHaveLength(1);
        expect(auditedRepairs()).toHaveLength(1);
    });
});

describe('nothing to repair — negative', () => {
    it.each([
        ['real custom times', { ...DEFAULT_SETTINGS, morningStartsAt: '05:45', eveningDurationMins: 45 }],
        ['a blob from before the time fields existed', { creamTaskEnabled: false }],
        ['no saved settings at all', undefined],
    ])('%s: no line, no new state object', async (_label, settings) => {
        seed(settings);
        await launch();

        expect(repairLines()).toHaveLength(0);
        expect(auditedRepairs()).toHaveLength(0);
        expect(seen, 'no dispatch after the load').toHaveLength(1);
    });
});

describe('a cleared start time at load — lifecycle', () => {
    it('a relaunch after the repair writes no second line', async () => {
        seed({ ...DEFAULT_SETTINGS, eveningStartsAt: '' });
        (await launch()).unmount();
        expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').settings.eveningStartsAt).toBe('19:00');

        invoke.mockClear();
        await launch();
        expect(repairLines(), 'only the line restored from the first launch').toHaveLength(1);
        expect(auditedRepairs()).toHaveLength(0);
    });

    it('is written while the shield is broken: the lock refuses actions, and this line logs none', async () => {
        seed({ ...DEFAULT_SETTINGS, eveningStartsAt: '' }, { missedMissionStreak: 6 });
        await launch();

        expect(isEconomyLocked(live), 'precondition: locked').toBe(true);
        expect(repairLines()).toHaveLength(1);
    });
});

describe('missionTimeRepairs — which saved fields were reset', () => {
    const repaired = (saved: Partial<MCSettings>): MissionTimeRepair[] =>
        missionTimeRepairs(saved, { ...DEFAULT_SETTINGS });

    it('a field absent from the blob is a default, not a repair', () => {
        expect(repaired({})).toEqual([]);
    });

    it.each([
        ['', 'empty'],
        [null, 'unreadable'],
        ['9:00', 'unreadable'],
        ['24:00', 'unreadable'],
    ])('a start time of %j is %s', (value, reason) => {
        expect(repaired({ eveningStartsAt: value as string })).toEqual([{ field: 'eveningStartsAt', reason, reset: '19:00' }]);
    });

    it.each([[0, 'unreal'], [1440, 'unreal'], [-5, 'unreal'], [null, 'unreadable'], ['30', 'unreadable']])(
        'a duration of %j is %s', (value, reason) => {
            expect(repaired({ morningDurationMins: value as number })).toEqual([{ field: 'morningDurationMins', reason, reset: 30 }]);
        });

    it('real values are kept and not reported', () => {
        expect(repaired({ morningStartsAt: '05:45', eveningStartsAt: '23:30', morningDurationMins: 1 / 6, eveningDurationMins: 90 })).toEqual([]);
    });
});
