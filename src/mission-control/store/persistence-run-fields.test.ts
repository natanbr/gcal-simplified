// ============================================================
// Mission Control — a saved run's own fields across a restart, when damaged
// (review of PR 209, Codex)
// ------------------------------------------------------------
// A run stores the day it counts for (occurrenceDate) when it starts. Kept by
// its shape, a damaged one ('2026-02-30') dates the outcome with a day no
// occurrence has, so nothing real is marked done; dropped, the outcome falls
// back to the run's calendar date, and a phone start after midnight (yesterday's
// evening, made up) marks TODAY's evening done before it ran. A round-trip day
// check belongs only to the decision a start-time save stores (retimeCoversDay).
// The run's length (baseDurationMins) is kept only when it is at least one
// second: 5e-324 let the phone's +1 cap work from an empty run.
// (Separate file: persistence-time.test.ts is near the 300-line limit.)
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { MCAction, MCState, Mission } from '../types';

const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);
const act = (s: MCState, action: MCAction, when: Date): MCState => mcReducer(s, { ...action, timestamp: when.toISOString() });

function evening(s: MCState): Mission {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening mission');
    return m;
}

/** `state` with the evening's fields replaced as given, written as the persist effect writes it. */
function persistEvening(state: MCState, fields: Record<string, unknown>): void {
    const missions = state.missions.map(m => (m.phase === 'evening' ? { ...m, ...fields } : m));
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, missions }));
}

describe('a saved run’s day (occurrenceDate), damaged', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    /** The default 19:00 evening started from the phone at 00:30 on Tuesday the 10th: Monday's, made up. Persisted with
     *  `occurrenceDate` as given, reloaded at 00:40, timed out at 01:30. Is Tuesday's 19:00 then handled? */
    function tuesdayEveningHandled(occurrenceDate: string | undefined): { handled: boolean; concluded: string | null } {
        const started = act(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'remote' }, nov(10, 0, 30));
        expect(evening(started).occurrenceDate, 'precondition: the hand-start rule names Monday').toBe('2026-11-09');
        persistEvening(started, occurrenceDate === undefined ? {} : { occurrenceDate });
        vi.setSystemTime(nov(10, 0, 40));
        const loaded = loadPersistedState();
        const timedOut = act(loaded, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'evening', origin: 'scheduler' }, nov(10, 1, 30));
        const ended = act(timedOut, { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' }, nov(10, 1, 30));
        const tuesday = occurrenceOn(evening(ended), ended.settings, nov(10, 12, 0));
        if (!tuesday) throw new Error('no occurrence');
        return { handled: occurrenceHandled(ended, 'evening', tuesday, nov(10, 19, 0).getTime()), concluded: ended.lastCompletedOrFailedEveningDate };
    }

    it('control: undamaged, the miss is Monday’s and Tuesday 19:00 is due', () => {
        expect(tuesdayEveningHandled(undefined)).toEqual({ handled: false, concluded: '2026-11-09' });
    });

    it('an impossible day is kept by its shape: Tuesday 19:00 is still due (Codex)', () => {
        const { handled, concluded } = tuesdayEveningHandled('2026-02-30');
        expect(concluded, 'dropped, the outcome was dated by the calendar: Tuesday').not.toBe('2026-11-10');
        expect(handled, 'Tuesday 19:00 was suppressed before it ran').toBe(false);
    });

    it('a leap day survives a restart, as the run’s day and as a start-time save’s decision', () => {
        vi.setSystemTime(new Date(2028, 2, 1, 12, 0));
        persistEvening(initialState, { occurrenceDate: '2028-02-29', startsAtChangedAt: new Date(2028, 2, 1, 8, 0).toISOString(), retimeCoversDay: '2028-02-29' });
        expect(evening(loadPersistedState())).toMatchObject({ occurrenceDate: '2028-02-29', retimeCoversDay: '2028-02-29' });
    });
});

describe('a saved run’s length (baseDurationMins), damaged', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    /** The default 60-min evening, started at 19:00, persisted with `baseDurationMins` as given, reloaded at 19:10; then the phone's +1. */
    function afterPhonePlusOne(baseDurationMins: number | undefined): { base: number | undefined; durationMins: number | undefined } {
        const running = act(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-11-10' }, nov(10, 19, 0));
        expect(evening(running).baseDurationMins, 'precondition: the run stores its 60 min').toBe(60);
        persistEvening(running, baseDurationMins === undefined ? {} : { baseDurationMins });
        vi.setSystemTime(nov(10, 19, 10));
        const loaded = loadPersistedState();
        const pressed = act(loaded, { type: 'ADJUST_MISSION_END', missionPhase: 'evening', deltaMinutes: 1, origin: 'remote', isRemote: true }, nov(10, 19, 10));
        return { base: evening(loaded).baseDurationMins, durationMins: evening(pressed).durationMins };
    }

    it('control: undamaged, the +1 reaches 61', () => {
        expect(afterPhonePlusOne(undefined)).toEqual({ base: 60, durationMins: 61 });
    });

    it.each([5e-324, 1e-10])('%s is dropped, so the cap counts from the mission’s length and the +1 reaches 61 (Codex)', damaged => {
        expect(afterPhonePlusOne(damaged), 'kept, the cap was 0 + 60 and the +1 was refused').toEqual({ base: undefined, durationMins: 61 });
    });
});
