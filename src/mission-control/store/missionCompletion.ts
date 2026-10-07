// ============================================================
// Mission Control — which run a completion pays
// ------------------------------------------------------------
// COMPLETE_MISSION_ROUTINE pays the bonus and gives one shield back. The
// overlay's timer logs a run's timeout (`loggedTimeoutAt`: a miss, one shield
// segment) the second it ends with a task left, but the run stays on screen
// until the scheduler's next 15 s tick ends it. A task finished in that gap made
// every task done and the overlay auto-collected: the run charged a miss was
// paid as completed too, bank +2 and the segment given back (PR 197 review).
// The owner decided: once the timeout is logged, the payout is refused
// (2026-10-07). Task taps stay accepted: a tick is a record (a Cream tick
// counts the application), not a payment.
//
// This is not the shield lock: COMPLETE_MISSION_ROUTINE stays off the locked
// set, and a run finished before its timeout is still the way out of it.
// A full Reset clears the stamp (missionAttempt.ts): a second attempt, paid.
//
// The reducer (applyMissionRoutineComplete) AND createLogEntry call
// completableRun, so a refused completion pays nothing and writes no line; the
// overlay asks it before it shows "Mission Complete!". Guarded by
// store/__tests__/mcReducer.completion-after-timeout.test.ts and
// components/MissionOverlay.late-finish.test.tsx.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState, Mission } from '../types';

/**
 * The run this completion pays, or null when it is refused: no such mission,
 * not running (a second completion: the overlay's and its timer's expiry
 * effects can both fire), or its timeout is already logged.
 */
export function completableRun(
    state: MCState,
    action: Extract<MCAction, { type: 'COMPLETE_MISSION_ROUTINE' }>,
): Mission | null {
    const run = state.missions.find(m => m.phase === action.missionPhase);
    if (!run || !run.active || run.loggedTimeoutAt) return null;
    return run;
}
