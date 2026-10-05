// ============================================================
// Mission Control — an outcome is dated by the day its window started
// ------------------------------------------------------------
// `lastCompletedOrFailed{Morning,Evening}Date` is how the scheduler knows an
// occurrence already concluded. It was written from the clock at the outcome,
// so an evening at 23:30 for 60 min that timed out at 00:30 (or was finished at
// 00:15) recorded the NEXT day as done, and that day's evening never started:
// no start, no miss, no line (the "older, open follow-up" in requirements).
//
// The date is now the day the run's occurrence began: the day the run started,
// or the day before when it started after midnight inside the previous
// evening's window. A full Reset is a second attempt at the same occurrence,
// so it does not move the date either.
//
// Timestamps carry no offset, so they are local times, like the app's clock.
// Rule for this file (the streak-lifecycle rule): state is built only by
// dispatching real actions.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import type { MCAction, MCState, MissionPhase } from '../../types';

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

const start = (phase: Phase, when: string, origin: MCAction['origin'] = 'scheduler'): MCAction =>
    ({ type: 'SET_ACTIVE_MISSION', phase, timestamp: when, origin });
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

    it('a run started after the overnight window closed belongs to its own day', () => {
        // 00:40 is past the 00:30 end of the evening that began the day before.
        const s = replay(lateEvening, start('evening', at(NEXT, '00:40'), 'local'), complete('evening', at(NEXT, '00:50')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(NEXT);
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

describe('a clock that jumps', () => {
    it('a run stamped in the future (the clock was set back mid-run) is dated by the outcome', () => {
        // Started while the clock read the 3rd; corrected to the 2nd before it ended.
        // A future start must not mark a day that has not happened yet.
        const s = replay(initialState, start('evening', at('2026-10-03', '19:00')), complete('evening', at(NEXT, '19:30')));
        expect(s.lastCompletedOrFailedEveningDate).toBe(NEXT);
    });
});
