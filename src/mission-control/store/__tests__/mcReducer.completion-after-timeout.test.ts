// ============================================================
// Mission Control — a run finished after its timeout was logged pays nothing
// ------------------------------------------------------------
// The overlay's own timer logs a run's timeout the second it ends with a task
// left (MARK_MISSION_TIMEOUT: a miss, one shield segment), but the run stays on
// screen until the scheduler's next 15 s tick ends it. A task finished in that
// gap made every task done, and the overlay's auto-collect sent
// COMPLETE_MISSION_ROUTINE: the run already charged a miss was ALSO paid as
// completed, bank +2 and the shield segment given back (PR 197 review). The
// owner decided: refuse the payout once the timeout is logged (2026-10-07).
//
// The reducer and the log ask one decision, completableRun
// (store/missionCompletion.ts). States are built by dispatching real actions.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { initialState, mcReducer } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { isEconomyLocked } from '../missionStreak';
import { STORAGE_KEY, loadPersistedState } from '../useMCStore';
import { storeFileCalls } from './decisionCalls';
import type { MCAction, MCState } from '../../types';

type Phase = 'morning' | 'evening';
type Completion = Extract<MCAction, { type: 'COMPLETE_MISSION_ROUTINE' }>;
type Sender = Pick<MCAction, 'isRemote' | 'origin'>;

const at = (day: number, hhmm: string) => `2026-10-${String(day).padStart(2, '0')}T${hhmm}:00`;
const START: Record<Phase, string> = { morning: '06:00', evening: '19:00' };
const END: Record<Phase, string> = { morning: '06:30', evening: '20:00' };

const mission = (s: MCState, phase: Phase) => {
    const m = s.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`fixture: no ${phase} mission`);
    return m;
};
/** An empty bank, so a payout reads as the bank's whole count. */
const fresh = (missedMissionStreak = 0): MCState => ({ ...initialState, bankCount: 0, missedMissionStreak });
const completedLines =(s: MCState) => s.activityLogs.filter(l => / mission completed$/.test(l.message));

/** What useMCDispatch does: the derived log line first, then the action. */
function dispatch(s: MCState, action: MCAction): MCState {
    const line = createLogEntry(action, s);
    const next = mcReducer(s, action);
    return line ? mcReducer(next, { type: 'ADD_LOG', log: line }) : next;
}

function start(s: MCState, phase: Phase, day: number): MCState {
    return dispatch(s, { type: 'SET_ACTIVE_MISSION', phase, timestamp: at(day, START[phase]), origin: 'scheduler' });
}

/** Ticks every task still open, the way the overlay's cards (or the phone's checklist) do. */
function tickAll(s: MCState, phase: Phase, timestamp: string, sender: Sender = {}): MCState {
    return mission(s, phase).tasks.filter(t => !t.completed).reduce(
        (acc, t) => dispatch(acc, { type: 'COMPLETE_TASK', missionPhase: phase, taskId: t.id, timestamp, ...sender }),
        s,
    );
}

/** The overlay's timer at the run's end, with a task left: the miss is logged, the run still shows. */
function timedOut(s: MCState, phase: Phase, day: number): MCState {
    return dispatch(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: phase, timestamp: at(day, END[phase]) });
}

const completion = (phase: Phase, timestamp: string, sender: Sender = {}): Completion =>
    ({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: phase, bonusTokens: 2, timestamp, ...sender });

/** A morning that ran out with a task left; the last tasks are then finished, still on screen. */
function finishedAfterTheTimeout(base: MCState = fresh(), day = 7): MCState {
    const s = timedOut(start(base, 'morning', day), 'morning', day);
    return tickAll(s, 'morning', at(day, '06:30'));
}

const SHAPES: Array<[string, Sender]> = [
    ["the overlay's auto-collect", { origin: 'auto' }],
    ['the Collect button', {}],
    ['a remote-shaped dispatch', { isRemote: true, origin: 'remote' }],
];

afterEach(() => localStorage.clear());

describe('happy path: a run finished before its timeout still pays', () => {
    it('pays the bonus, gives one shield back and writes the completion line', () => {
        let s = fresh(3);
        s = tickAll(start(s, 'morning', 7), 'morning', at(7, '06:20'));
        s = dispatch(s, completion('morning', at(7, '06:20'), { origin: 'auto' }));

        expect(s.bankCount).toBe(2);
        expect(s.missedMissionStreak).toBe(2);
        expect(s.activeMission).toBe('none');
        expect(completedLines(s).map(l => l.delta)).toEqual([2]);
    });

    it('is still the way out of a broken shield: 6 → 5 unlocks the bank', () => {
        let s = fresh(6);
        expect(isEconomyLocked(s)).toBe(true);
        s = tickAll(start(s, 'evening', 7), 'evening', at(7, '19:40'));
        s = dispatch(s, completion('evening', at(7, '19:40')));

        expect(s.missedMissionStreak).toBe(5);
        expect(isEconomyLocked(s)).toBe(false);
        expect(s.bankCount).toBe(2);
    });
});

describe('negative: once the timeout is logged, finishing pays nothing', () => {
    it.each(SHAPES)('%s is refused by the reducer: same state, no payout, no shield back', (_name, extra) => {
        const s = finishedAfterTheTimeout(fresh(2));
        expect(s.missedMissionStreak, 'precondition: the miss is charged').toBe(3);
        expect(mission(s, 'morning').tasks.every(t => t.completed), 'precondition: every task done').toBe(true);

        const next = mcReducer(s, completion('morning', at(7, '06:30'), extra));

        expect(next).toBe(s);
        expect(next.bankCount).toBe(0);
        expect(next.missedMissionStreak).toBe(3);
    });

    it.each(SHAPES)('%s writes no line', (_name, extra) => {
        const s = finishedAfterTheTimeout();
        expect(createLogEntry(completion('morning', at(7, '06:30'), extra), s)).toBeNull();
        expect(completedLines(dispatch(s, completion('morning', at(7, '06:30'), extra)))).toHaveLength(0);
    });

    it('a refused finish leaves the run for the scheduler to end as expired, with the miss kept', () => {
        let s = finishedAfterTheTimeout(fresh(1));
        s = dispatch(s, completion('morning', at(7, '06:30'), { origin: 'auto' }));
        s = dispatch(s, { type: 'SET_ACTIVE_MISSION', phase: 'none', timestamp: at(7, '06:30'), origin: 'scheduler' });

        expect(s.activeMission).toBe('none');
        expect(s.missedMissionStreak).toBe(2);
        expect(s.bankCount).toBe(0);
        expect(completedLines(s)).toHaveLength(0);
        expect(s.activityLogs.some(l => l.message === 'Morning mission expired')).toBe(true);
    });

    it('the timeout that breaks the shield stays broken: a late finish is no way out', () => {
        const s = finishedAfterTheTimeout(fresh(5));
        expect(isEconomyLocked(s), 'precondition: the sixth miss locked it').toBe(true);

        const next = dispatch(s, completion('morning', at(7, '06:30'), { origin: 'auto' }));

        expect(isEconomyLocked(next)).toBe(true);
        expect(next.bankCount).toBe(0);
    });

    it('a plain Reset grants no time, so it does not re-open the payout either', () => {
        let s = timedOut(start(fresh(), 'morning', 7), 'morning', 7);
        s = dispatch(s, { type: 'RESET_MISSION', missionPhase: 'morning', timestamp: at(7, '06:30') });
        s = tickAll(s, 'morning', at(7, '06:30'));

        expect(mcReducer(s, completion('morning', at(7, '06:30')))).toBe(s);
    });
});

describe('task taps after the timeout: accepted, and they pay nothing', () => {
    it('the ticks land, from the phone too, and a Cream tick still counts the application', () => {
        const withCream = mcReducer(fresh(), { type: 'SET_SETTINGS', settings: { creamTaskEnabled: true, creamTaskDaysTarget: 5 } });
        const before = timedOut(start(withCream, 'evening', 7), 'evening', 7);
        const after = tickAll(before, 'evening', at(7, '20:00'), { isRemote: true, origin: 'remote' });

        expect(mission(after, 'evening').tasks.every(t => t.completed)).toBe(true);
        expect(after.creamTaskDaysLeft, 'the cream was put on: a real record, not a reward').toBe(4);
        expect(after.bankCount).toBe(before.bankCount);
        expect(after.missedMissionStreak).toBe(before.missedMissionStreak);
        expect(mcReducer(after, completion('evening', at(7, '20:00'), { origin: 'auto' }))).toBe(after);
    });
});

describe('lifecycle', () => {
    it('after a relaunch the saved run still pays nothing', () => {
        const s = finishedAfterTheTimeout();
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
        const relaunched = loadPersistedState();
        expect(mission(relaunched, 'morning').loggedTimeoutAt, 'precondition: the stamp is saved').toBeTruthy();

        const next = dispatch(relaunched, completion('morning', at(7, '06:31'), { origin: 'auto' }));

        expect(next.bankCount).toBe(relaunched.bankCount);
        expect(next.missedMissionStreak).toBe(relaunched.missedMissionStreak);
        expect(completedLines(next)).toHaveLength(0);
    });

    it("the next occurrence's completion pays normally: its start clears loggedTimeoutAt", () => {
        let s = finishedAfterTheTimeout(fresh(2));
        s = dispatch(s, completion('morning', at(7, '06:30'), { origin: 'auto' }));
        s = dispatch(s, { type: 'SET_ACTIVE_MISSION', phase: 'none', timestamp: at(7, '06:30'), origin: 'scheduler' });
        expect(s.missedMissionStreak).toBe(3);

        s = tickAll(start(s, 'morning', 8), 'morning', at(8, '06:20'));
        s = dispatch(s, completion('morning', at(8, '06:20'), { origin: 'auto' }));

        expect(s.bankCount).toBe(2);
        expect(s.missedMissionStreak).toBe(2);
        expect(completedLines(s)).toHaveLength(1);
    });

    it('a full Reset is a fresh attempt (decided 2026-09-03), so its finish pays', () => {
        let s = timedOut(start(fresh(2), 'morning', 7), 'morning', 7);
        s = dispatch(s, { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning', timestamp: at(7, '06:31') });
        s = tickAll(s, 'morning', at(7, '06:40'));
        s = dispatch(s, completion('morning', at(7, '06:40')));

        expect(s.bankCount).toBe(2);
        expect(s.missedMissionStreak).toBe(2); // the miss charged, then given back by the second attempt
    });
});

describe('structural: one decision, asked by the reducer and by the log', () => {
    it.each(['missionStreak.ts', 'activityLog.ts'])('store/%s calls completableRun(state, action) in code', (file) => {
        expect(storeFileCalls(file, 'completableRun')).toBe(true);
    });
});
