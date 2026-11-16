// ============================================================
// A settings save that changes a start time says so in the log
// ------------------------------------------------------------
// Owner decision 2026-11-16 (found reviewing PR 209): a Settings save that moves
// a mission's start time to an EARLIER window that has already closed left no
// trace at all: no start, no miss, no "skipped" line. Now every change of a
// start time writes one attributed line, "Evening start changed 19:00 → 17:00",
// so a start can never be moved with no trace.
//
// createLogEntry returns ONE entry per action, and a save may already write the
// "ended" line (a running mission's start moved) or the "not started" line (a
// window put under the clock). The design (startTimeChangeLog.ts): the change
// line is the base line; when one of those lines also applies it keeps its
// wording and the change is appended after " — ", so no change is lost and no
// save writes two lines. The "ended" line gets the same fold, so it names the
// times it moved between too (owner decision 2026-11-16).
// A save that changes no start time (a duration, the Cream task, the renewal
// marker, a time the reducer refuses, the same time again) writes nothing here.
// Every instant is the action's own timestamp: no test reads the wall clock.
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

const CHANGED = /start changed/;
const COVERED_EVENING = 'Evening mission not started: its 19:00 window was already open when Settings was saved (start it from the phone)';
/** Local clock times on a day with no DST change. */
const day = (d: number, h: number, m: number) => new Date(2026, 10, d, h, m, 0, 0).toISOString();
const at = (h: number, m: number) => day(16, h, m);
/** Noon opens no window with the default times (06:00, 19:00), so nothing but the change is under test. */
const NOON = at(12, 0);
const save = (settings: Partial<MCSettings>, timestamp: string = NOON): MCAction => ({ type: 'SET_SETTINGS', settings, timestamp });

describe('createLogEntry for a save that changes a start time', () => {
    it('the evening, in the owner\'s words', () => {
        expect(createLogEntry(save({ eveningStartsAt: '17:00' }), initialState)).toMatchObject({
            icon: '✏️',
            message: 'Evening start changed 19:00 → 17:00',
            type: 'mission',
            colorKey: 'evening',
            source: 'local',
            timestamp: NOON, // the action's own instant, never the wall clock
        });
    });

    it('the morning, with its phase', () => {
        expect(createLogEntry(save({ morningStartsAt: '07:15' }), initialState)).toMatchObject({
            message: 'Morning start changed 06:00 → 07:15',
            colorKey: 'morning',
        });
    });

    it('both phases in one save: both changes in one line, morning first, no single phase colour', () => {
        const entry = createLogEntry(save({ eveningStartsAt: '17:00', morningStartsAt: '07:15' }), initialState);
        expect(entry?.message).toBe('Morning start changed 06:00 → 07:15; Evening start changed 19:00 → 17:00');
        expect(entry?.colorKey).toBeUndefined();
    });

    it('names the time it really had, not the time of the first save of the day (the state after an earlier change)', () => {
        const after = mcReducer(initialState, save({ eveningStartsAt: '17:00' }));
        expect(createLogEntry(save({ eveningStartsAt: '18:30' }), after)?.message).toBe('Evening start changed 17:00 → 18:30');
    });

    it('the whole Settings draft: only the field that differs is named', () => {
        const draft: MCSettings = { ...initialState.settings, eveningStartsAt: '17:00', creamTaskDaysTarget: 9 };
        expect(createLogEntry(save(draft), initialState)?.message).toBe('Evening start changed 19:00 → 17:00');
    });

    it('a start moved to an earlier window that has already closed leaves a trace (the case PR 209 left silent)', () => {
        // 17:00 for 60 min closed at 18:00; saved at 18:30: no stamp, no start, no miss, no skipped line.
        const action = save({ eveningStartsAt: '17:00' }, at(18, 30));
        expect(mcReducer(initialState, action).missions.find(m => m.phase === 'evening')?.savedIntoWindowAt, 'precondition: nothing is stamped').toBeUndefined();
        expect(createLogEntry(action, initialState)?.message).toBe('Evening start changed 19:00 → 17:00');
    });
});

describe('createLogEntry for a save that changes nothing about a start time', () => {
    it.each<[string, Partial<MCSettings>]>([
        ['the same start time', { morningStartsAt: initialState.settings.morningStartsAt, eveningStartsAt: initialState.settings.eveningStartsAt }],
        ['a start time that is not a time (the reducer keeps the stored one)', { morningStartsAt: '999:00' }],
        ['a cleared start time', { eveningStartsAt: '' }],
        ['a duration only', { eveningDurationMins: 45, morningDurationMins: 20 }],
        ['an unreal duration', { eveningDurationMins: 0 }],
        ['the Cream task', { creamTaskEnabled: true }],
        ['the renewal marker the provider saves at startup', { remotePairingRenewalLogged: '2026-09-28T09:00:00.000Z' }],
        ['the whole draft, unchanged', { ...initialState.settings }],
    ])('writes nothing for %s', (_label, settings) => {
        expect(createLogEntry(save(settings), initialState)).toBeNull();
    });

    it('an invalid time next to a valid one names only the valid change', () => {
        expect(createLogEntry(save({ morningStartsAt: '25:99', eveningStartsAt: '17:00' }), initialState)?.message).toBe('Evening start changed 19:00 → 17:00');
    });

    it('costs no reducer pass to decide it writes nothing', () => {
        reducerSpy.mockClear();
        expect(createLogEntry(save({ eveningDurationMins: 45, creamTaskEnabled: true, morningStartsAt: initialState.settings.morningStartsAt }), initialState)).toBeNull();
        expect(reducerSpy).not.toHaveBeenCalled();
    });

    it('a change that opens no window costs one pass: the snapshot every attributed line takes', () => {
        reducerSpy.mockClear();
        expect(createLogEntry(save({ morningStartsAt: '09:15' }), initialState)).not.toBeNull();
        expect(reducerSpy).toHaveBeenCalledTimes(1);
    });
});

describe('the change is folded into the line a save already writes', () => {
    it('a start moved into an open window: the "not started" line keeps its words, the change follows', () => {
        const entry = createLogEntry(save({ morningStartsAt: '07:50' }, at(8, 0)), initialState);
        expect(entry).toMatchObject({
            icon: '⏭️',
            message: 'Morning mission not started: its 07:50 window was already open when Settings was saved (start it from the phone) — Morning start changed 06:00 → 07:50',
            colorKey: 'morning',
            source: 'local',
            timestamp: at(8, 0),
        });
    });

    it('a duration-only save that opens a window writes the "not started" line alone, as before', () => {
        expect(createLogEntry(save({ eveningDurationMins: 120 }, at(20, 30)), initialState)?.message).toBe(COVERED_EVENING);
    });

    it('a window opened by a duration, and the OTHER phase\'s start changed: both are said', () => {
        const entry = createLogEntry(save({ eveningDurationMins: 120, morningStartsAt: '07:00' }, at(20, 30)), initialState);
        expect(entry?.message).toBe(`${COVERED_EVENING} — Morning start changed 06:00 → 07:00`);
        expect(entry?.colorKey).toBe('evening');
    });

    it('past midnight: a start moved onto last night\'s window', () => {
        const entry = createLogEntry(save({ eveningStartsAt: '23:30' }, day(17, 0, 10)), initialState);
        expect(entry?.message).toBe('Evening mission not started: its 23:30 window was already open when Settings was saved (start it from the phone) — Evening start changed 19:00 → 23:30');
    });

    it('both phases opened by one save: the joint line keeps its words and carries both changes', () => {
        const state = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: 30, eveningDurationMins: 60 }, timestamp: at(3, 0) });
        const entry = createLogEntry(save({ morningStartsAt: '12:00', eveningStartsAt: '11:50' }, at(12, 5)), state);
        expect(entry?.message).toBe('Morning and evening missions not started: their windows were already open when Settings was saved (start them from the phone) — Morning start changed 06:00 → 12:00; Evening start changed 19:00 → 11:50');
        expect(entry?.colorKey).toBeUndefined();
    });

    it('a mission that already ran is not "not started", but its start change is still said', () => {
        const state: MCState = {
            ...initialState,
            lastCompletedOrFailedEveningDate: '2026-11-16',
            missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, lastActiveAt: at(19, 20) } : m)),
        };
        expect(createLogEntry(save({ eveningStartsAt: '19:20' }, at(19, 30)), state)?.message).toBe('Evening start changed 19:00 → 19:20');
    });

    describe('the "ended" line wins and keeps its words, the changes follow', () => {
        const running: MCState = { ...initialState, activeMission: 'evening' };

        it('the running mission moved: its own words, then the times it moved between', () => {
            const entry = createLogEntry(save({ eveningStartsAt: '20:30' }), running);
            expect(entry).toMatchObject({ icon: '⏹️', message: 'Evening mission ended: its start time was changed in Settings — Evening start changed 19:00 → 20:30', colorKey: 'evening' });
        });

        it('the other phase moved in the same save: both changes are said, morning first', () => {
            const entry = createLogEntry(save({ eveningStartsAt: '20:30', morningStartsAt: '07:00' }), running);
            expect(entry?.message).toBe('Evening mission ended: its start time was changed in Settings — Morning start changed 06:00 → 07:00; Evening start changed 19:00 → 20:30');
            expect(entry?.colorKey).toBe('evening');
        });

        it('only the other phase moved: the mission is not ended, so the plain change line', () => {
            expect(createLogEntry(save({ morningStartsAt: '07:00' }), running)?.message).toBe('Morning start changed 06:00 → 07:00');
        });
    });
});

describe('through the store: one line per save, none for a refused or empty save', () => {
    let live: MCState = initialState;
    let dispatch: (a: MCAction) => void = () => {};
    function Probe() {
        live = useMCState();
        dispatch = useMCDispatch();
        return null;
    }
    const lines = () => live.activityLogs.filter(l => CHANGED.test(l.message));
    const evening = () => live.missions.find(m => m.phase === 'evening');

    beforeEach(() => { localStorage.clear(); render(<MCStoreProvider><Probe /></MCStoreProvider>); });
    afterEach(() => { localStorage.clear(); });

    it('a move to an earlier closed window: exactly one line, and nothing else is written (no stamp, no other line)', () => {
        const before = live.activityLogs.length;
        act(() => { dispatch(save({ eveningStartsAt: '17:00' }, at(18, 30))); });
        expect(lines()).toHaveLength(1);
        expect(lines()[0]).toMatchObject({ icon: '✏️', message: 'Evening start changed 19:00 → 17:00', colorKey: 'evening', source: 'local' });
        expect(live.activityLogs.length - before, 'no other line').toBe(1);
        expect(evening()?.savedIntoWindowAt).toBeUndefined();
        expect(live.activeMission).toBe('none');
    });

    it('both phases in one save: one entry, not two', () => {
        act(() => { dispatch(save({ morningStartsAt: '07:15', eveningStartsAt: '17:00' })); });
        expect(lines()).toHaveLength(1);
        expect(lines()[0].message).toBe('Morning start changed 06:00 → 07:15; Evening start changed 19:00 → 17:00');
    });

    it('two saves in a row: the second names the time the first left, and an identical third writes nothing', () => {
        act(() => { dispatch(save({ eveningStartsAt: '17:00' })); });
        act(() => { dispatch(save({ eveningStartsAt: '18:00' }, at(12, 1))); });
        act(() => { dispatch(save({ eveningStartsAt: '18:00' }, at(12, 2))); });
        expect(lines().map(l => l.message).reverse()).toEqual(['Evening start changed 19:00 → 17:00', 'Evening start changed 17:00 → 18:00']);
    });

    it('two saves dispatched in one batch: the second names the time the first left', () => {
        act(() => {
            dispatch(save({ eveningStartsAt: '17:00' }));
            dispatch(save({ eveningStartsAt: '18:00' }, at(12, 1)));
        });
        expect(lines().map(l => l.message).reverse()).toEqual(['Evening start changed 19:00 → 17:00', 'Evening start changed 17:00 → 18:00']);
    });

    it('a move back to the original time is a change too', () => {
        act(() => { dispatch(save({ eveningStartsAt: '17:00' })); });
        act(() => { dispatch(save({ eveningStartsAt: '19:00' }, at(12, 1))); });
        expect(lines()[0].message).toBe('Evening start changed 17:00 → 19:00');
    });

    it('a save into an open window writes one line that carries the stamp\'s story and the change', () => {
        act(() => { dispatch(save({ morningStartsAt: '07:50' }, at(8, 0))); });
        expect(live.activityLogs.filter(l => /not started/.test(l.message))).toHaveLength(1);
        expect(lines()).toHaveLength(1);
        expect(lines()[0].icon).toBe('⏭️');
    });

    it('a duration-only save and the renewal marker write no change line', () => {
        act(() => { dispatch(save({ eveningDurationMins: 45 })); });
        act(() => { dispatch(save({ remotePairingRenewalLogged: '2026-09-28T09:00:00.000Z' }, at(12, 1))); });
        expect(lines()).toEqual([]);
    });
});
