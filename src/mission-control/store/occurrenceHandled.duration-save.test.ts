// ============================================================
// A duration-only Settings save never changes whether an occurrence is handled
// (review of PR 209, found by the review and by Codex)
// ------------------------------------------------------------
// A save that changes only a mission's length leaves every occurrence where it
// was (same day, same start). It may open a window that had closed (that save is
// stamped: the window it opened is covered), and must change nothing else. Two
// reads used to weigh the CURRENT length: the retime rule's "the run is nearer
// the new start than the window behind it" (2026-11-13), and "the save that
// covered a window was made inside it" (2026-11-15). So a length save made the
// minute before a covered start released it, a fresh full-timer attempt after a
// miss with no phone involved, and one that shortened the window held back a
// start that was due. Through the real reducer, with each action's own instant.
// Scheduler-level twin: hooks/useMissionScheduler.duration-save.test.tsx.
// Property version: occurrenceHandled.duration-property.test.ts.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { occurrenceOn, type Occurrence } from './missionOccurrence';
import { occurrenceHandled } from './occurrenceHandled';
import type { MCAction, MCSettings, MCState } from '../types';

const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);

/** Before any clock a test sets: a fixture save, never a save into a window. */
const LONG_AGO = new Date(0).toISOString();

const act = (s: MCState, action: MCAction, when: Date): MCState => mcReducer(s, { ...action, timestamp: when.toISOString() });
const save = (s: MCState, settings: Partial<MCSettings>, when: Date): MCState => act(s, { type: 'SET_SETTINGS', settings }, when);

/** The evening's occurrence that starts on November `day`, as `s` places it. */
function eveningOn(s: MCState, day: number): Occurrence {
    const m = s.missions.find(x => x.phase === 'evening');
    const o = m && occurrenceOn(m, s.settings, nov(day, 12, 0));
    if (!o) throw new Error('no evening occurrence');
    return o;
}

const handledAt = (s: MCState, day: number, when: Date) => occurrenceHandled(s, 'evening', eveningOn(s, day), when.getTime());

type End = 'timeout' | 'phone stop';

/** The evening at 19:00 for `durationMins`, started by the scheduler on the 10th and ended at `endedAt`. */
function eveningRan(durationMins: number, end: End, endedAt: Date): MCState {
    const fixture = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningDurationMins: durationMins }, timestamp: LONG_AGO });
    const started = act(fixture, { type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'scheduler', occurrenceDate: '2026-11-10' }, nov(10, 19, 0));
    if (end === 'phone stop') return act(started, { type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote' }, endedAt);
    // What the scheduler's expiry tick dispatches for a run with a task left.
    const missed = act(started, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'evening', origin: 'scheduler' }, endedAt);
    return act(missed, { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' }, endedAt);
}

describe('a length save cannot release an occurrence the retime rule covered', () => {
    it.each<[string, number, End, number]>([
        ['after a miss: 19:00 for 30 min, timed out at 19:30, lengthened 30 → 120 min', 30, 'timeout', 120],
        ['the default 60 min, stopped by the phone at 19:30, lengthened 60 → 120 min', 60, 'phone stop', 120],
        ['the default 60 min, stopped by the phone at 19:30, lengthened 60 → 900 min', 60, 'phone stop', 900],
    ])('%s at 06:39, the evening moved at 06:20 to 06:40 the next day: 06:40 stays handled', (_name, durationMins, end, longer) => {
        const ran = eveningRan(durationMins, end, nov(10, 19, 30));
        const moved = save(ran, { eveningStartsAt: '06:40' }, nov(11, 6, 20));
        expect(handledAt(moved, 11, nov(11, 6, 40)), 'precondition: the run covers 06:40 on the 11th (nearer it than the window behind)').toBe(true);

        const lengthened = save(moved, { eveningDurationMins: longer }, nov(11, 6, 39));
        expect(handledAt(lengthened, 11, nov(11, 6, 40)), 'the length save released 06:40: a fresh attempt with no phone').toBe(true);
        expect(handledAt(lengthened, 12, nov(12, 6, 40)), 'the night after is still a new occurrence').toBe(false);
    });
});

describe('a length save cannot hold back an occurrence the retime rule left to start', () => {
    it.each<[string, number | null]>([
        ['control: no length save', null],
        ['shortened 120 → 30 min at 06:39', 30],
        ['shortened 120 → 5 min at 06:39', 5],
    ])('a run the phone stopped at 19:01 (19:00 for 120 min), moved at 06:20 to 06:40 the next day, %s: 06:40 still starts', (_name, shorter) => {
        const ran = eveningRan(120, 'phone stop', nov(10, 19, 1));
        const moved = save(ran, { eveningStartsAt: '06:40' }, nov(11, 6, 20));
        expect(handledAt(moved, 11, nov(11, 6, 40)), 'precondition: the run is nearer the window behind, so 06:40 starts').toBe(false);

        const after = shorter === null ? moved : save(moved, { eveningDurationMins: shorter }, nov(11, 6, 39));
        expect(handledAt(after, 11, nov(11, 6, 40)), 'the length save held back a start that was due').toBe(false);
    });
});

// A later start move decides again, and decided with the CURRENT length a length
// save in between still moved the answer (review of PR 209, Opus): the window
// behind is now as long as the run was (baseDurationMins), whatever was saved since.
describe('a start move after a length save weighs the window behind with the run\'s own length', () => {
    it.each<[string, number, End, number]>([
        ['after a miss: 19:00 for 30 min, timed out at 19:30, lengthened 30 → 120 min', 30, 'timeout', 120],
        ['the default 60 min, stopped by the phone at 19:30, lengthened 60 → 120 min', 60, 'phone stop', 120],
    ])('%s at 06:25, moved at 06:20 to 06:40 and at 06:30 to 06:45: 06:45 is handled', (_name, durationMins, end, longer) => {
        const moved = save(eveningRan(durationMins, end, nov(10, 19, 30)), { eveningStartsAt: '06:40' }, nov(11, 6, 20));
        expect(handledAt(moved, 11, nov(11, 6, 40)), 'precondition: the run covers 06:40 on the 11th').toBe(true);

        const lengthened = save(moved, { eveningDurationMins: longer }, nov(11, 6, 25));
        const movedAgain = save(lengthened, { eveningStartsAt: '06:45' }, nov(11, 6, 30));
        expect(handledAt(movedAgain, 11, nov(11, 6, 45)), 'the move after the length save released 06:45: a fresh attempt').toBe(true);
        expect(handledAt(movedAgain, 12, nov(12, 6, 45)), 'the night after is still a new occurrence').toBe(false);
    });

    it.each<[string, number]>([
        ['shortened 120 → 30 min', 30],
        ['shortened 120 → 5 min', 5],
    ])('a run the phone stopped at 19:01 (19:00 for 120 min), moved at 06:20 to 06:40, %s at 06:25, moved at 06:30 to 06:45: 06:45 starts', (_name, shorter) => {
        const moved = save(eveningRan(120, 'phone stop', nov(10, 19, 1)), { eveningStartsAt: '06:40' }, nov(11, 6, 20));
        expect(handledAt(moved, 11, nov(11, 6, 40)), 'precondition: the run is nearer the window behind').toBe(false);

        const shortened = save(moved, { eveningDurationMins: shorter }, nov(11, 6, 25));
        const movedAgain = save(shortened, { eveningStartsAt: '06:45' }, nov(11, 6, 30));
        expect(handledAt(movedAgain, 11, nov(11, 6, 45)), 'the move after the length save held back a start that was due').toBe(false);
    });
});
