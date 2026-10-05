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
// the phone the NEAREST occurrence of its phase (a tie goes to the upcoming
// one). Re-deriving it at the outcome failed when the window changed mid-run (a
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
// from the phone belongs to the NEAREST occurrence of its phase, in real time;
// an exact tie goes to the upcoming one. It agrees with the school bag, which
// already treats an evening started after midnight as the night before.
describe('a start by hand or from the phone belongs to the nearest occurrence', () => {
    it('the default evening started at 00:20 is the evening before, so tonight’s still runs', () => {
        const s = replay(initialState, start('evening', at(NEXT, '00:20'), 'local'), complete('evening', at(NEXT, '00:40')));
        expect(evening(s).occurrenceDate).toBe(D);
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
    });

    it('a late evening started after its window closed (00:40) is still the one before', () => {
        // 70 min after last night's 23:30, 22 h 50 before tonight's.
        const s = replay(lateEvening, start('evening', at(NEXT, '00:40'), 'local'), complete('evening', at(NEXT, '00:50')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(D);
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

    it('the morning started at 05:50 is today’s 06:00 morning (an early start, as before)', () => {
        const s = replay(initialState, start('morning', at(D, '05:50'), 'local'), complete('morning', at(D, '06:10')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(D);
    });

    it('the morning started by hand after 18:00 is TOMORROW’s morning (the rule’s consequence)', () => {
        const s = replay(initialState, start('morning', at(D, '20:00'), 'remote'), complete('morning', at(D, '20:20')));
        expect(s.lastCompletedOrFailedMorningDate).toBe(NEXT);
    });

    it.each([
        ['06:59', D],
        ['07:00', NEXT], // exactly 12 h from both evenings: the upcoming one
        ['07:01', NEXT],
    ])('a 19:00 evening started at %s belongs to %s', (hhmm, day) => {
        const s = replay(initialState, start('evening', at(NEXT, hhmm), 'local'));
        expect(evening(s).occurrenceDate).toBe(day);
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
    it('its day is stored and written, even where the nearest rule would say otherwise', () => {
        const s = replay(initialState, start('evening', at(NEXT, '19:00'), 'scheduler', '2026-09-28'), complete('evening', at(NEXT, '19:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe('2026-09-28');
    });

    it('a phone start carrying a day is not trusted: the nearest rule decides', () => {
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
