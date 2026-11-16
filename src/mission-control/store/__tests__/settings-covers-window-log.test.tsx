// ============================================================
// A settings save that covers an open window says so in the log
// ------------------------------------------------------------
// A save that opens a window that was not open before is never a start
// (savedIntoWindowAt, missionActivity.ts): the scheduler counts that window as
// handled. Left silent, a child could skip an unstarted mission with no trace
// at all: no start, no miss, no "skipped" line. Owner decision 2026-11-16: the
// save writes one attributed line for each mission it stamped, less a mission
// that already ran in the window, read from the state the reducer produces
// (savedIntoWindowLog.ts). A save that cannot open a window costs no reducer pass.
// ============================================================

import { render, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCStoreProvider } from '../MCStoreProvider';
import { useMCDispatch, useMCState } from '../useMCStore';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCSettings, MCState } from '../../types';

// The real reducer, wrapped so a test can count the passes the log line costs.
vi.mock('../mcReducer', async importOriginal => {
    const actual = await importOriginal<typeof import('../mcReducer')>();
    return { ...actual, mcReducer: vi.fn(actual.mcReducer) };
});
const reducerSpy = vi.mocked(mcReducer);

const NOT_STARTED = /mission not started/;
/** A save that changes a start time writes the change line (settings-start-change-log.test.tsx): what is asked here is only whether the "not started" line is written. */
const notStarted = (entry: ReturnType<typeof createLogEntry>) => NOT_STARTED.test(entry?.message ?? '');
/** Local clock times: the unit tests pass them as the action's instant, so no real clock is read. */
const at = (h: number, m: number) => new Date(2026, 10, 16, h, m, 0, 0).toISOString();
const save = (settings: Partial<MCSettings>, timestamp: string): MCAction => ({ type: 'SET_SETTINGS', settings, timestamp });

describe('createLogEntry for a save that puts a window under the clock', () => {
    it('writes one attributed line: a morning that had not run, saved to start 10 min ago', () => {
        const entry = createLogEntry(save({ morningStartsAt: '07:50' }, at(8, 0)), initialState);
        expect(entry).toMatchObject({
            icon: '⏭️',
            message: 'Morning mission not started: its 07:50 window was already open when Settings was saved (start it from the phone) — Morning start changed 06:00 → 07:50',
            type: 'mission',
            colorKey: 'morning',
            source: 'local',
        });
    });

    it('names the evening, and the phase it is for', () => {
        const entry = createLogEntry(save({ eveningStartsAt: '19:50' }, at(20, 0)), initialState);
        expect(entry?.message).toMatch(/^Evening mission not started: its 19:50 window/);
        expect(entry?.colorKey).toBe('evening');
    });

    it('a duration-only save that reopens a window that closed unseen', () => {
        // Evening 19:00 for 60 min is closed at 20:30; 120 min puts 19:00–21:00 under the clock.
        const entry = createLogEntry(save({ eveningDurationMins: 120 }, at(20, 30)), initialState);
        expect(entry?.message).toMatch(/^Evening mission not started: its 19:00 window/);
    });

    it('both phases opened by one save: one line naming both', () => {
        const state = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: 30, eveningDurationMins: 60 }, timestamp: at(3, 0) });
        const entry = createLogEntry(save({ morningStartsAt: '12:00', eveningStartsAt: '11:50' }, at(12, 5)), state);
        expect(entry?.message).toMatch(/^Morning and evening missions not started/);
        expect(entry?.colorKey).toBeUndefined();
    });

    it.each<[string, Partial<MCSettings>, number, number]>([
        ['a start still ahead at the save', { morningStartsAt: '08:30' }, 8, 0],
        ['no window change (the Cream task)', { creamTaskEnabled: true }, 8, 0],
        ['the same start time', { morningStartsAt: initialState.settings.morningStartsAt }, 8, 0],
        ['a start time that is not a time (the reducer keeps the stored one)', { morningStartsAt: '999:00' }, 8, 0],
        ['a start moved to a window that has already closed', { morningStartsAt: '07:00' }, 8, 0],
        ['a shorter duration that opens nothing', { eveningDurationMins: 45 }, 8, 0],
        ['the renewal marker the provider saves at startup', { remotePairingRenewalLogged: '2026-09-28T09:00:00.000Z' }, 6, 10],
    ])('writes no "not started" line for %s', (_label, settings, h, m) => {
        expect(notStarted(createLogEntry(save(settings, at(h, m)), initialState))).toBe(false);
    });

    it('a window already open and pending that is only lengthened writes nothing', () => {
        // Morning 06:00 for 30 min is open at 06:10; 45 min keeps that same window.
        expect(createLogEntry(save({ morningDurationMins: 45 }, at(6, 10)), initialState)).toBeNull(); // a duration only: no change line either
    });

    describe('a mission that already ran is not "not started"', () => {
        const withEvening = (patch: Partial<MCState>, lastActiveAt?: string): MCState => ({
            ...initialState,
            ...patch,
            missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, lastActiveAt } : m)),
        });

        it('an evening completed at 19:20 and lengthened at 20:30 writes nothing', () => {
            const state = withEvening({ lastCompletedOrFailedEveningDate: '2026-11-16' }, at(19, 20));
            expect(createLogEntry(save({ eveningDurationMins: 120 }, at(20, 30)), state)).toBeNull();
        });

        it('an evening that ran (its last activity after the start) and was moved onto an open start writes no "not started" line', () => {
            const state = withEvening({}, at(19, 25));
            expect(notStarted(createLogEntry(save({ eveningStartsAt: '19:20' }, at(19, 30)), state))).toBe(false);
        });

        it('an evening stopped from the phone at 19:10 and moved at 19:30 onto 19:20 writes no "not started" line: the retime rule counts the run', () => {
            const started = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'remote', timestamp: at(19, 0) });
            const stopped = mcReducer(started, { type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote', timestamp: at(19, 10) });
            expect(notStarted(createLogEntry(save({ eveningStartsAt: '19:20' }, at(19, 30)), stopped))).toBe(false);
        });

        it('only the phase that did not run is named when both opened', () => {
            const base = withEvening({ lastCompletedOrFailedEveningDate: '2026-11-16' }, at(11, 50));
            const state = mcReducer(base, { type: 'SET_SETTINGS', settings: { morningDurationMins: 30, eveningDurationMins: 60 }, timestamp: at(3, 0) });
            const entry = createLogEntry(save({ morningStartsAt: '12:00', eveningStartsAt: '11:50' }, at(12, 5)), { ...state, lastCompletedOrFailedEveningDate: '2026-11-16' });
            expect(entry?.message).toMatch(/^Morning mission not started/);
        });
    });

    it('a save that ends the running mission writes its own line, not this one', () => {
        const running: MCState = { ...initialState, activeMission: 'evening' };
        const entry = createLogEntry(save({ eveningStartsAt: '19:50' }, at(20, 0)), running);
        expect(entry?.message).toBe('Evening mission ended: its start time was changed in Settings');
    });

    it('costs no reducer pass to decide it writes nothing', () => {
        reducerSpy.mockClear();
        expect(createLogEntry(save({ eveningDurationMins: 45, creamTaskEnabled: true }, at(8, 0)), initialState)).toBeNull();
        expect(reducerSpy).not.toHaveBeenCalled();
    });
});

describe('the line follows the stamp (saveIntoWindow.test.ts rows, on a profile where nothing ran)', () => {
    const day = (d: number, h: number, m: number, s = 0, ms = 0) => new Date(2026, 10, d, h, m, s, ms).toISOString();
    it.each<[string, Partial<MCSettings>, string, boolean]>([
        ['a start a minute in the past', { morningStartsAt: '06:59' }, day(16, 7, 0), true],
        ['a start at the very instant of the save', { morningStartsAt: '07:00' }, day(16, 7, 0), true],
        ['a longer duration that reopens a closed window', { morningDurationMins: 90 }, day(16, 7, 0), true],
        ["past midnight, onto last night's window", { eveningStartsAt: '23:30' }, day(17, 0, 10), true],
        ['a start moved within the open window it was in', { morningStartsAt: '06:05' }, day(16, 6, 10), true],
        ['a start still ahead', { morningStartsAt: '07:10' }, day(16, 7, 0), false],
        ['a start 1 ms ahead', { morningStartsAt: '07:00' }, day(16, 6, 59, 59, 999), false],
        ['a longer duration for the window already open', { morningDurationMins: 60 }, day(16, 6, 10), false],
        ['a shorter duration that closes the open window', { morningDurationMins: 5 }, day(16, 6, 10), false],
        ['a duration that leaves the window closed', { morningDurationMins: 45 }, day(16, 7, 0), false],
        ['no window change (the Cream task)', { creamTaskEnabled: true }, day(16, 6, 10), false],
        ['a cleared start time', { morningStartsAt: '' }, day(16, 6, 10), false],
        ['the same start time', { morningStartsAt: '06:00' }, day(16, 6, 10), false],
    ])('%s', (_label, settings, timestamp, stamped) => {
        const saved = mcReducer(initialState, save(settings, timestamp));
        expect(saved.missions.some(m => m.savedIntoWindowAt !== undefined), 'the stamp').toBe(stamped);
        expect(notStarted(createLogEntry(save(settings, timestamp), initialState)), 'the line').toBe(stamped);
    });

    it('known gap, pinned: a save that ends the running mission writes the "ended" line, and the other phase it opened is stamped with no "not started" line (its start change is still said)', () => {
        const running = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning', origin: 'remote', timestamp: at(19, 10) });
        const action = save({ morningStartsAt: '19:15', eveningStartsAt: '19:05' }, at(19, 20));
        expect(createLogEntry(action, running)?.message).toBe('Morning mission ended: its start time was changed in Settings — Evening start changed 19:00 → 19:05');
        expect(mcReducer(running, action).missions.find(m => m.phase === 'evening')?.savedIntoWindowAt).toBe(at(19, 20));
    });
});

describe('through the store: the line is written once, with the stamp', () => {
    let live: MCState = initialState;
    let dispatch: (a: MCAction) => void = () => {};
    function Probe() {
        live = useMCState();
        dispatch = useMCDispatch();
        return null;
    }
    const lines = () => live.activityLogs.filter(l => NOT_STARTED.test(l.message));

    beforeEach(() => { localStorage.clear(); render(<MCStoreProvider><Probe /></MCStoreProvider>); });
    afterEach(() => { localStorage.clear(); });

    it('a save into an open window stamps the mission and writes exactly one line', () => {
        act(() => { dispatch(save({ morningStartsAt: '07:50' }, at(8, 0))); });
        expect(live.missions.find(m => m.phase === 'morning')?.savedIntoWindowAt).toBe(at(8, 0));
        expect(lines()).toHaveLength(1);
        expect(lines()[0]).toMatchObject({ icon: '⏭️', colorKey: 'morning', source: 'local' });
    });

    it('a save that opens nothing writes none and stamps nothing', () => {
        act(() => { dispatch(save({ morningStartsAt: '08:30' }, at(8, 0))); });
        expect(live.missions.find(m => m.phase === 'morning')?.savedIntoWindowAt).toBeUndefined();
        expect(lines()).toEqual([]);
    });
});
