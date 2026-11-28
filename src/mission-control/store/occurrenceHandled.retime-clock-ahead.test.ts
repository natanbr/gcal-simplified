// ============================================================
// A later start move made with the clock AHEAD keeps the coverage an earlier
// save gave the same run (review of PR 209, Opus; on main since PR 207)
// ------------------------------------------------------------
// The save that moves a start time onto the run is stamped (startsAtChangedAt,
// missionActivity.ts), and the scheduler counts the stamp only once its time
// has come (retimedOntoItsRun). A later move wrote its own instant over the
// earlier stamp, so one made with the clock ahead left a stamp in the future:
// once the clock was put right the window the first save covered started with
// a full timer, and a restart before the clock caught up lost the coverage for
// good (hydration keeps only past stamps). The earlier stamp of the same run
// is kept. Through the real reducer, with each action's own instant.
// ============================================================

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import { loadPersistedStateWithRepairs, STORAGE_KEY } from './useMCStore';
import type { MCAction, MCState, Mission } from '../types';

const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);
const HOUR_MS = 3_600_000;

/** Before any clock a test sets: a fixture save, never a save into a window. */
const LONG_AGO = new Date(0).toISOString();

const act = (s: MCState, action: MCAction, when: Date): MCState => mcReducer(s, { ...action, timestamp: when.toISOString() });

function evening(s: MCState): Mission {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening mission');
    return m;
}

/** The evening at 23:30, started by the scheduler on the 10th, moved at 23:50 (a correct clock) to 00:10: the save ends the run. */
function coveredPastMidnight(): MCState {
    const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' }, timestamp: LONG_AGO });
    const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-11-10' }, nov(10, 23, 30));
    return act(started, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:10' } }, nov(10, 23, 50));
}

/** Moved again to 00:20 at what the clock reads 23:55 plus `aheadMs`. */
const movedAgainAhead = (s: MCState, aheadMs: number) =>
    act(s, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:20' } }, new Date(nov(10, 23, 55).getTime() + aheadMs));

/** Whether the evening's occurrence on the 11th, as `s` places it, is handled at `when`. */
function handledOn11th(s: MCState, when: Date): boolean {
    const o = occurrenceOn(evening(s), s.settings, nov(11, 12, 0));
    if (!o) throw new Error('no occurrence on the 11th');
    return occurrenceHandled(s, 'evening', o, when.getTime());
}

const AHEAD: [string, number][] = [['1 h', HOUR_MS], ['1 day', 24 * HOUR_MS], ['3 days', 72 * HOUR_MS]];

describe('a later start move made with the clock ahead', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('precondition: the first save, with no stamp before it, is stamped at its own instant and covers the 11th', () => {
        const first = coveredPastMidnight();
        expect(evening(first).startsAtChangedAt).toBe(nov(10, 23, 50).toISOString());
        expect(handledOn11th(first, nov(11, 0, 11))).toBe(true);
    });

    it.each(AHEAD)('%s ahead, 00:10 → 00:20; the clock put right at 00:21: the 00:20 window stays covered', (_name, aheadMs) => {
        const ahead = movedAgainAhead(coveredPastMidnight(), aheadMs);
        expect(handledOn11th(ahead, nov(11, 0, 21)), 'the stamp in the future was ignored: a fresh full-timer attempt').toBe(true);
        expect(evening(ahead).startsAtChangedAt, 'the earlier stamp of the same run is kept').toBe(nov(10, 23, 50).toISOString());
    });

    it.each(AHEAD)('%s ahead, then a restart once the clock is put right: still covered', (_name, aheadMs) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(movedAgainAhead(coveredPastMidnight(), aheadMs)));
        vi.setSystemTime(nov(11, 0, 21));
        const { state } = loadPersistedStateWithRepairs();
        expect(handledOn11th(state, nov(11, 0, 21)), 'the coverage was lost for good').toBe(true);
        expect(evening(state).startsAtChangedAt, 'hydration dropped the stamp in the future').toBe(nov(10, 23, 50).toISOString());
    });
});

describe('the stamp kept is only an older one of the same run', () => {
    it('a stamp in the future is not kept: a later move with the clock put right is stamped at its own instant', () => {
        // The 23:30 evening stopped from the phone at 23:40, then moved to 00:10 with the clock a day ahead.
        const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' }, timestamp: LONG_AGO });
        const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-11-10' }, nov(10, 23, 30));
        const stopped = act(started, { type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote' }, nov(10, 23, 40));
        const fast = act(stopped, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:10' } }, nov(11, 23, 50));
        expect(evening(fast).startsAtChangedAt, 'precondition: no stamp before it, so its own instant').toBe(nov(11, 23, 50).toISOString());

        const putRight = act(fast, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '00:20' } }, nov(10, 23, 55));
        expect(handledOn11th(putRight, nov(11, 0, 21)), 'kept, the stamp in the future hid the coverage').toBe(true);
        expect(evening(putRight).startsAtChangedAt).toBe(nov(10, 23, 55).toISOString());
    });

    it("an earlier run's stamp is not kept: a save after a later phone run is stamped at its own instant", () => {
        // The 11th: the phone runs the evening (at 00:10 since the first save) from 18:00 to 18:30, then it is moved to 23:00.
        const phoneRun = act(coveredPastMidnight(), { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'remote' }, nov(11, 18, 0));
        const stopped = act(phoneRun, { type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote' }, nov(11, 18, 30));
        const moved = act(stopped, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:00' } }, nov(11, 18, 40));
        expect(handledOn11th(moved, nov(11, 23, 1)), 'kept, the stamp older than the run covered nothing: 23:00 started again').toBe(true);
        expect(evening(moved).startsAtChangedAt).toBe(nov(11, 18, 40).toISOString());
    });
});
