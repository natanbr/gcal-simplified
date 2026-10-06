// ============================================================
// Mission Control — an outcome is dated by the day its window started
// ------------------------------------------------------------
// `lastCompletedOrFailed{Morning,Evening}Date` is how the scheduler knows an
// occurrence already concluded. It was written from the clock at the outcome,
// so an evening at 23:30 for 60 min that timed out at 00:30 (or was finished at
// 00:15) recorded the NEXT day as done, and that day's evening never started:
// no start, no miss, no line (the "older, open follow-up" in requirements).
//
// The date is now decided when the run STARTS and stored on it: the day the
// scheduler names for the occurrence it starts, or for a start by hand or from
// the phone never a future day's occurrence (the rule below, with its tie).
// Re-deriving it at the outcome failed when the window changed mid-run (a
// duration-only Settings save) or the run began minutes off its window (the
// scheduler's 5 min late-fire tolerance). A full Reset is a second attempt at
// the same occurrence and keeps the day. A run saved before the field existed
// is dated the old way (its start, or the evening before inside an overnight
// window).
//
// Timestamps carry no offset, so they are local times, like the app's clock.
// Rule for this file (the streak-lifecycle rule): state is built only by
// dispatching real actions.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import type { MCAction, MCState, Mission, MissionPhase } from '../../types';

type Phase = Exclude<MissionPhase, 'none'>;

const D = '2026-10-01';
const NEXT = '2026-10-02';
const at = (day: string, hhmm: string) => `${day}T${hhmm}:00`;

/** Evening 23:30 for 60 min (window 23:30–00:30), saved the way Settings saves it. */
const lateEvening = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30', eveningDurationMins: 60 } });
/** Morning 23:50 for 30 min (window 23:50–00:20): the same rule holds for either phase. */
const lateMorning = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningStartsAt: '23:50', morningDurationMins: 30 } });

function replay(state: MCState, ...actions: MCAction[]): MCState {
    return actions.reduce(mcReducer, state);
}

const start = (phase: Phase, when: string, origin: MCAction['origin'] = 'scheduler', occurrenceDate?: string): MCAction =>
    ({ type: 'SET_ACTIVE_MISSION', phase, timestamp: when, origin, occurrenceDate });
const evening = (s: MCState): Mission => {
    const m = s.missions.find(x => x.phase === 'evening');
    if (!m) throw new Error('no evening');
    return m;
};
const complete = (phase: Phase, when: string): MCAction =>
    ({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 2, timestamp: when });
const timeout = (phase: Phase, when: string): MCAction =>
    ({ type: 'MARK_MISSION_TIMEOUT', missionPhase: phase, timestamp: when, origin: 'scheduler' });
const expire = (when: string): MCAction =>
    ({ type: 'SET_ACTIVE_MISSION', phase: 'none', timestamp: when, origin: 'scheduler' });

describe('an evening whose window crosses midnight', () => {
    it('finished after midnight, it is dated the day it started', () => {
        const s = replay(lateEvening, start('evening', at(D, '23:30')), complete('evening', at(NEXT, '00:15')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('timed out after midnight, the miss is dated the day it started', () => {
        const s = replay(lateEvening, start('evening', at(D, '23:30')), timeout('evening', at(NEXT, '00:30')), expire(at(NEXT, '00:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
        expect(s.missedMissionStreak, 'the miss still counts').toBe(1);
    });

    it('started after midnight inside that window (a late timer or ▶ Start), it is still that evening', () => {
        const s = replay(lateEvening, start('evening', at(NEXT, '00:10'), 'local'), complete('evening', at(NEXT, '00:20')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('a full Reset after the window closed is the same occurrence: still the day it started', () => {
        // RESET_MISSION_WITH_TIMER moves startedAt to 00:40, outside the window.
        // Dating by startedAt would record the next day again.
        const s = replay(
            lateEvening,
            start('evening', at(D, '23:30')),
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'evening', timestamp: at(NEXT, '00:40'), origin: 'remote' },
            timeout('evening', at(NEXT, '01:40')),
        );
        expect(s.missions.find(m => m.phase === 'evening')?.startedAt, 'precondition: the reset moved startedAt').toBe(at(NEXT, '00:40'));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('two nights in a row: each miss is dated its own night and both count', () => {
        let s = replay(lateEvening, start('evening', at(D, '23:30')), timeout('evening', at(NEXT, '00:30')), expire(at(NEXT, '00:30')));
        s = replay(s, start('evening', at(NEXT, '23:30')), timeout('evening', at('2026-10-03', '00:30')), expire(at('2026-10-03', '00:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(NEXT);
        expect(s.missedMissionStreak).toBe(2);
    });
});

describe('what the rule must not change', () => {
    it('a daytime evening finished the same day keeps that day', () => {
        const s = replay(initialState, start('evening', at(D, '19:00')), complete('evening', at(D, '19:40')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('a daytime evening started by hand before midnight and finished after it keeps the day it started', () => {
        // Window 19:00–20:00: no overnight tail, so the run's own start decides.
        const s = replay(initialState, start('evening', at(D, '23:50'), 'local'), complete('evening', at(NEXT, '00:10')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('an early start completed before the window keeps covering that day (unchanged)', () => {
        const s = replay(initialState, start('evening', at(D, '18:30'), 'local'), complete('evening', at(D, '18:50')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });
});

describe('the morning follows the same rule', () => {
    it('a morning window crossing midnight, finished after it, is dated the day it started', () => {
        const s = replay(lateMorning, start('morning', at(D, '23:50')), complete('morning', at(NEXT, '00:10')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });

    it('timed out after midnight, the morning miss is dated the day it started', () => {
        const s = replay(lateMorning, start('morning', at(D, '23:50')), timeout('morning', at(NEXT, '00:20')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });
});

// Decided for Nathan by the review of PR 193 (reversible): a start by hand or
// from the phone NEVER belongs to a future day's occurrence. At or after today's
// window start it is today's (a make-up, a late start). Before it, it is
// whichever is nearer in real time: today's start ahead (an early start) or the
// END of the previous occurrence behind (a late make-up), a tie going to today;
// inside the previous occurrence's window (an overnight tail) it is that one.
// The first version took the nearest occurrence of either day, so a morning
// made up at 19:30 cancelled tomorrow's morning and opened games at midnight.
describe('a start by hand or from the phone never belongs to a future day', () => {
    it('a morning made up at 19:30 is today’s, and tomorrow’s morning still runs', () => {
        const s = replay(initialState, start('morning', at(D, '19:30'), 'local'), complete('morning', at(D, '19:50')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });

    it('a morning started by hand at 23:00 is still today’s', () => {
        const s = replay(initialState, start('morning', at(D, '23:00'), 'remote'), complete('morning', at(D, '23:20')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });

    it('the morning started at 05:50 is today’s 06:00 morning (10 min ahead vs ~23 h since)', () => {
        const s = replay(initialState, start('morning', at(D, '05:50'), 'local'), complete('morning', at(D, '06:10')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });

    it('a morning started at 00:20 is today’s (5 h 40 ahead vs 17 h 50 since yesterday’s 06:30 end)', () => {
        expect(replay(initialState, start('morning', at(NEXT, '00:20'), 'local')).missions[0].occurrenceDate).toBe(NEXT);
    });

    it('an evening started late at 21:00 is today’s', () => {
        expect(evening(replay(initialState, start('evening', at(D, '21:00'), 'local'))).occurrenceDate).toBe(D);
    });

    it('an evening started early at 14:00 is today’s (5 h ahead vs 18 h since yesterday’s 20:00 end)', () => {
        expect(evening(replay(initialState, start('evening', at(D, '14:00'), 'local'))).occurrenceDate).toBe(D);
    });

    it('the default evening started at 00:20 is yesterday’s (4 h 20 since its end vs 18 h 40 ahead), so tonight’s still runs', () => {
        const s = replay(initialState, start('evening', at(NEXT, '00:20'), 'local'), complete('evening', at(NEXT, '00:40')));
        expect(evening(s).occurrenceDate).toBe(D);
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('a start at 00:10 inside last night’s 23:30–00:30 window is last night’s', () => {
        expect(evening(replay(lateEvening, start('evening', at(NEXT, '00:10'), 'local'))).occurrenceDate).toBe(D);
    });

    it('a start at 00:40, just after that window closed, is still last night’s (10 min since vs 22 h 50 ahead)', () => {
        const s = replay(lateEvening, start('evening', at(NEXT, '00:40'), 'local'), complete('evening', at(NEXT, '00:50')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    // 19:00–20:00: yesterday's end and today's start are 23 h apart, so 07:30 is exactly halfway.
    it.each([
        ['07:29', D],
        ['07:30', NEXT], // a tie: today
        ['07:31', NEXT],
    ])('a 19:00–20:00 evening started at %s belongs to %s', (hhmm, day) => {
        expect(evening(replay(initialState, start('evening', at(NEXT, hhmm), 'local'))).occurrenceDate).toBe(day);
    });

    // The 10 s test duration: yesterday's end is 19:00:10, so halfway is 07:00:05.
    it.each([
        ['06:59', D],
        ['07:01', NEXT],
    ])('a 10 s evening at 19:00 started at %s belongs to %s', (hhmm, day) => {
        const tenSeconds = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningDurationMins: 1 / 6 } });
        expect(evening(replay(tenSeconds, start('evening', at(NEXT, hhmm), 'local'))).occurrenceDate).toBe(day);
    });

    it('a full Reset keeps the day its run started with', () => {
        const s = replay(
            initialState,
            start('evening', at(NEXT, '00:20'), 'remote'),
            { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'evening', timestamp: at(NEXT, '00:30'), origin: 'remote' },
            complete('evening', at(NEXT, '00:50')),
        );
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('a Settings save that shortens the window mid-run does not move the run to the next day', () => {
        // Started at 00:10 inside 23:30–00:30; Duration 20 makes the window 23:30–23:50.
        const s = replay(
            lateEvening,
            start('evening', at(NEXT, '00:10'), 'local'),
            { type: 'SET_SETTINGS', settings: { eveningDurationMins: 20 }, timestamp: at(NEXT, '00:12') },
            complete('evening', at(NEXT, '00:20')),
        );
        expect(evening(s).endsAt, 'precondition: the window moved').toBe('23:50');
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });
});

describe('the scheduler names the occurrence it starts', () => {
    it('its day is stored and written, even where the hand-start rule would say otherwise', () => {
        const s = replay(initialState, start('evening', at(NEXT, '19:00'), 'scheduler', '2026-09-28'), complete('evening', at(NEXT, '19:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe('2026-09-28');
    });

    it('a phone start carrying a day is not trusted: the hand-start rule decides', () => {
        const s = replay(initialState, start('evening', at(NEXT, '19:00'), 'remote', '2026-09-28'));
        expect(evening(s).occurrenceDate).toBe(NEXT);
    });

    it('a day that is not a date key is ignored', () => {
        const s = replay(initialState, start('evening', at(NEXT, '19:00'), 'scheduler', 'tomorrow'));
        expect(evening(s).occurrenceDate).toBe(NEXT);
    });
});

describe('a run saved before the stored day existed (the update arrives mid-run)', () => {
    /** The run as an older build saved it: no occurrenceDate. */
    function savedByOlderBuild(s: MCState): MCState {
        return { ...s, missions: s.missions.map(m => ({ ...m, occurrenceDate: undefined })) };
    }

    it('an overnight evening started at 23:30 and finished at 00:15 is dated the night it started', () => {
        const running = savedByOlderBuild(replay(lateEvening, start('evening', at(D, '23:30'))));
        expect(evening(running).occurrenceDate, 'precondition').toBeUndefined();
        expect(replay(running, complete('evening', at(NEXT, '00:15'))).lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('one started after midnight inside the window is the evening before', () => {
        const running = savedByOlderBuild(replay(lateEvening, start('evening', at(NEXT, '00:10'), 'local')));
        expect(replay(running, complete('evening', at(NEXT, '00:20'))).lastCompletedOrFailedEveningDate).toBe(D);
    });
});

describe('a clock that jumps', () => {
    it('a run stamped in the future (the clock was set back mid-run) is dated by the outcome', () => {
        // Started while the clock read the 3rd; corrected to the 2nd before it ended.
        // A future start must not mark a day that has not happened yet.
        const s = replay(initialState, start('evening', at('2026-10-03', '19:00')), complete('evening', at(NEXT, '19:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(NEXT);
    });
});
