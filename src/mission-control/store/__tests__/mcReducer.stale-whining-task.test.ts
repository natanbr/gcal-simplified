// ============================================================
// Mission Control — a whining toggle or task tap for a mission that is not running
// ------------------------------------------------------------
// The phone draws each mission card from its last broadcast, so its "Whining?"
// button and task checklist can name a mission that has just been stopped or
// has ended. TOGGLE_WHINING and COMPLETE_TASK act on the mission they NAME:
//  - an "un-mark whining" tapped right behind the phone's own Stop found the
//    flag already cleared by the Stop, so it MARKED it: −10 on the gauge instead
//    of +2, and an ended mission left saying "Whining";
//  - a Cream tap after a Stop ticked it again on the ended mission and counted
//    a second application (the Stop clears the tick, not the day count).
// Both are now refused through `isStaleMissionAction`, the reducer and the log
// alike (store/staleMissionAction.ts). Neither action has ever written a log
// line, so the log half here pins that a refusal keeps it that way.
// TOGGLE_WHINING with phase 'none' is the global whining flag: it names no
// mission, so it is not refused (no app sends it today).
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import type { MCAction, MCState, Mission } from '../../types';

type Phase = 'morning' | 'evening';
type Origin = { origin: 'local' } | { origin: 'remote'; isRemote: true };
const LOCAL: Origin = { origin: 'local' };
const PHONE: Origin = { origin: 'remote', isRemote: true };

const mission = (s: MCState, phase: Phase): Mission => {
    const m = s.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
};
const task = (s: MCState, phase: Phase, id: string) => mission(s, phase).tasks.find(t => t.id === id);

// The phone always sends lockedFromUI: true (mc-remote MissionsSection.tsx); the overlay never does.
const whine = (missionPhase: Phase | 'none', by: Origin = PHONE): MCAction =>
    ({ type: 'TOGGLE_WHINING', missionPhase, ...(by.origin === 'remote' ? { lockedFromUI: true } : {}), ...by });
const tap = (missionPhase: Phase, taskId: string, by: Origin = PHONE): MCAction =>
    ({ type: 'COMPLETE_TASK', missionPhase, taskId, ...by });

/** A gauge with room both ways, so a −10 or a +2 shows. */
const base: MCState = { ...initialState, behaviorProgress: 50 };
const run = (s: MCState, phase: Phase) => mcReducer(s, { type: 'SET_ACTIVE_MISSION', phase });
const stop = (s: MCState, phase: Phase) => mcReducer(s, { type: 'CANCEL_MISSION', missionPhase: phase, ...PHONE });
/** The scheduler's expiry: the miss, then the end (useMissionScheduler.ts). */
const expire = (s: MCState, phase: Phase) =>
    mcReducer(mcReducer(s, { type: 'MARK_MISSION_TIMEOUT', missionPhase: phase, origin: 'scheduler' }),
        { type: 'SET_ACTIVE_MISSION', phase: 'none', origin: 'scheduler' });
const withCream = (s: MCState) => mcReducer(s, { type: 'SET_SETTINGS', settings: { creamTaskEnabled: true, creamTaskDaysTarget: 3 } });

/** Refused: the very same state, and no line. */
function expectRefused(s: MCState, action: MCAction) {
    expect(mcReducer(s, action), `${action.type} changed the state`).toBe(s);
    expect(createLogEntry(action, s)).toBeNull();
}

describe('the running mission still takes whining and task taps', () => {
    const eveningRunning = run(base, 'evening');

    it.each([['the overlay', LOCAL], ['the phone', PHONE]] as const)('%s marks whining (−10) and un-marks it (+2)', (_by, by) => {
        const marked = mcReducer(eveningRunning, whine('evening', by));
        expect(mission(marked, 'evening').whiningDetected).toBe(true);
        expect(marked.behaviorProgress).toBe(40);

        const cleared = mcReducer(marked, whine('evening', by));
        expect(mission(cleared, 'evening').whiningDetected).toBe(false);
        expect(cleared.behaviorProgress).toBe(42);
    });

    it.each([['the overlay', LOCAL], ['the phone', PHONE]] as const)('%s ticks and unticks a task', (_by, by) => {
        const ticked = mcReducer(eveningRunning, tap('evening', 'shower', by));
        expect(task(ticked, 'evening', 'shower')?.completed).toBe(true);
        expect(task(mcReducer(ticked, tap('evening', 'shower', by)), 'evening', 'shower')?.completed).toBe(false);
    });

    it('a Cream tick on the running mission counts one day', () => {
        const ticked = mcReducer(run(withCream(base), 'evening'), tap('evening', 'cream'));
        expect(ticked.creamTaskDaysLeft).toBe(2);
    });
});

describe.each([['the overlay', LOCAL], ['the phone', PHONE]] as const)('%s naming a mission that is not running is refused', (_by, by) => {
    it('with nothing running', () => {
        expectRefused(base, whine('evening', by));
        expectRefused(base, tap('evening', 'shower', by));
    });

    it('naming the other mission while one runs', () => {
        const eveningRunning = run(base, 'evening');
        expectRefused(eveningRunning, whine('morning', by));
        expectRefused(eveningRunning, tap('morning', 'tshirt', by));
    });

    it('for a mission stuck active with nothing running (the Stop is the way out)', () => {
        const stuck: MCState = { ...run(base, 'evening'), activeMission: 'none' };
        expect(mission(stuck, 'evening').active, 'fixture: a desynced save').toBe(true);
        expectRefused(stuck, whine('evening', by));
        expectRefused(stuck, tap('evening', 'shower', by));
    });
});

describe('lifecycle: a stale card after its mission ended', () => {
    it('an un-mark right behind the Stop does not mark it: no −10 instead of +2', () => {
        const marked = mcReducer(run(base, 'evening'), whine('evening'));
        expect(marked.behaviorProgress, 'fixture: marked from the phone').toBe(40);
        const stopped = stop(marked, 'evening');
        expect(mission(stopped, 'evening').whiningDetected, 'the Stop clears the flag').toBe(false);

        // Before: nowDetected = !false → −10 (to 30), and the ended evening said "Whining".
        expectRefused(stopped, whine('evening'));
    });

    it('a Cream tap right behind the Stop does not count a second application', () => {
        const ticked = mcReducer(run(withCream(base), 'evening'), tap('evening', 'cream'));
        const stopped = stop(ticked, 'evening');
        expect(stopped.creamTaskDaysLeft, 'the Stop keeps the day counted').toBe(2);

        expectRefused(stopped, tap('evening', 'cream')); // before: ticked again → 1
    });

    it('after the mission expired, a whining toggle and a task tap change nothing', () => {
        const marked = mcReducer(mcReducer(run(withCream(base), 'evening'), whine('evening')), tap('evening', 'cream'));
        const expired = expire(marked, 'evening');
        expect(expired.activeMission, 'fixture: it ended').toBe('none');
        expect(mission(expired, 'evening').whiningDetected, 'expiry leaves the flag as it was').toBe(true);

        expectRefused(expired, whine('evening')); // before: +2 for an ended mission
        expectRefused(expired, tap('evening', 'cream')); // before: unticked, the day handed back
        expectRefused(expired, tap('evening', 'shower'));
    });

    it('with the next mission running, a tap naming the previous one leaves both alone', () => {
        const morningDone = stop(mcReducer(run(base, 'morning'), tap('morning', 'tshirt')), 'morning');
        const eveningRunning = run(morningDone, 'evening');
        expect(eveningRunning.activeMission, 'fixture: evening runs').toBe('evening');

        expectRefused(eveningRunning, whine('morning'));
        expectRefused(eveningRunning, tap('morning', 'tshirt'));
        expect(mission(mcReducer(eveningRunning, whine('evening')), 'evening').whiningDetected, 'the running one still takes it').toBe(true);
    });
});

describe('the global whining flag (phase none) names no mission and is not refused', () => {
    it.each([['nothing running', base], ['a mission running', run(base, 'evening')]] as const)('with %s it still toggles', (_label, s) => {
        const after = mcReducer(s, whine('none', LOCAL));
        expect(after.whiningActive).toBe(true);
        expect(after.behaviorProgress).toBe(40);
    });
});
