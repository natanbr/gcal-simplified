// ============================================================
// A mission time repaired at load says so in the log (2026-10-05)
// ------------------------------------------------------------
// Since v0.0.42 a cleared "Auto-trigger at" field could be saved as '', and a
// NaN duration saves as null. Hydration resets either to the default (06:00 /
// 19:00, 30 / 60 min) so the mission runs at all, but it did so silently: the
// child's evening moved to 19:00 with no line and no attribution, which is what
// CLAUDE.md → Attribution calls a bug.
//
// The same holds for the sibling repair: a mission saved RUNNING with no
// readable duration is given its window's length, which decides when the
// child's run ends.
//
// The repairs stay in hydration (the first render must already have a real
// time, window and length). What they changed, read from their own before and
// after, is handed to the provider, which writes one hand-built `system` line
// just after load, so it reaches the audit trail (a line written inside
// loadPersistedState would not: useAuditTrail treats every loaded entry as
// already written).
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
import { sanitizeMissionTimes } from './hhmm';
import { missionTimeRepairLogEntry, settingRepairs } from './missionTimeRepair';
import { DEFAULT_SETTINGS } from '../types';
import type { MCSettings, MCState } from '../types';

// The real builder, wrapped so the StrictMode case can see how often the
// provider's effect built the line. Counting lines in the log is not enough:
// with the clock frozen both runs build the same id, and ADD_LOG drops a replay
// of the newest entry, so a missing ref guard would still show one line.
vi.mock('./missionTimeRepair', async importOriginal => {
    const actual = await importOriginal<typeof import('./missionTimeRepair')>();
    return { ...actual, missionTimeRepairLogEntry: vi.fn(actual.missionTimeRepairLogEntry) };
});
const buildLine = vi.mocked(missionTimeRepairLogEntry);

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
    buildLine.mockClear();
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
            + 'the morning duration was not a real length, reset to 30 min; '
            + 'the evening start time could not be read, reset to 19:00; '
            + 'the evening duration could not be read, reset to 60 min',
        ]);
    });

    it('StrictMode double effects still write one line and one audit entry', async () => {
        seed({ ...DEFAULT_SETTINGS, eveningStartsAt: '' });
        await launch({ strict: true });

        expect(repairLines()).toHaveLength(1);
        expect(auditedRepairs()).toHaveLength(1);
        expect(buildLine, 'the ref guard: the second effect run builds nothing').toHaveBeenCalledTimes(1);
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

describe('a mission saved running with no length — the sibling repair', () => {
    it('gets its window’s length, and the startup line says so', async () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...initialState,
            _migrationVersion: 1,
            activeMission: 'evening',
            missions: initialState.missions.map(m => (m.phase === 'evening'
                ? { ...m, active: true, startedAt: new Date(2026, 9, 5, 13, 50).toISOString(), durationMins: null }
                : m)),
        }));
        await launch();

        expect(live.missions.find(m => m.phase === 'evening')?.durationMins).toBe(60);
        expect(repairLines().map(l => l.message)).toEqual([
            "Mission settings repaired at startup: the running evening mission had no length, set to its window's 60 min",
        ]);
        expect(auditedRepairs()).toHaveLength(1);
    });
});

/** What the load's sanitizer does to these saved settings, reported. */
function reportFor(saved: Record<string, unknown>) {
    const before = { ...DEFAULT_SETTINGS, ...saved } as MCSettings;
    return settingRepairs(before, sanitizeMissionTimes(before));
}

describe('settingRepairs — read from the sanitizer’s own before and after', () => {
    it('a field absent from the blob takes its default first: not a repair', () => {
        expect(reportFor({})).toEqual([]);
    });

    it.each([
        ['', 'empty'],
        [null, 'unreadable'],
        ['9:00', 'unreadable'],
        ['24:00', 'unreadable'],
    ])('a start time of %j is %s', (value, reason) => {
        expect(reportFor({ eveningStartsAt: value })).toEqual([{ kind: 'setting', field: 'eveningStartsAt', reason, reset: '19:00' }]);
    });

    it.each([[0, 'unreal'], [1440, 'unreal'], [-5, 'unreal'], [null, 'unreadable'], ['30', 'unreadable']])(
        'a duration of %j is %s', (value, reason) => {
            expect(reportFor({ morningDurationMins: value })).toEqual([{ kind: 'setting', field: 'morningDurationMins', reason, reset: 30 }]);
        });

    it('real values are kept and not reported', () => {
        expect(reportFor({ morningStartsAt: '05:45', eveningStartsAt: '23:30', morningDurationMins: 1 / 6, eveningDurationMins: 90 })).toEqual([]);
    });

    it('structural: garbage in EVERY settings key reports exactly the keys the sanitizer changed', () => {
        // Nothing keeps a second copy of the sanitizer's rules: whatever it changes,
        // in any key, now or after a later edit, is what the line names.
        const garbage = Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k => [k, '']));
        const before = { ...DEFAULT_SETTINGS, ...garbage } as MCSettings;
        const after = sanitizeMissionTimes(before);
        const changed = (Object.keys(before) as Array<keyof MCSettings>).filter(k => !Object.is(before[k], after[k]));

        expect(changed.length, 'precondition: the sanitizer changed something').toBeGreaterThan(0);
        expect(settingRepairs(before, after).map(r => (r.kind === 'setting' ? r.field : r.kind)).sort()).toEqual([...changed].sort());
    });
});
