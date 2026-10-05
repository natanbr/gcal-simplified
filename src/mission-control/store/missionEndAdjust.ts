// ============================================================
// Mission Control — how far a running mission's end may move
// ------------------------------------------------------------
// ADJUST_MISSION_END (the phone's +1 / +5 / +10 and −1 / −5 / −10, the overlay's
// ±5 bar hold) had a 1-minute floor and no ceiling. A stale or tampered phone
// payload (`deltaMinutes: 1e9` is finite, so the validator lets it through)
// gave the mission a duration it would never reach: no other mission could
// start, games stayed shut, and the 15 s expiry check ran on the idle Calendar
// for good, saved across a restart.
//
// A run may last at most its length when it started (or was fully reset,
// `baseDurationMins`) plus MAX_MISSION_EXTENSION_MINS. Measured from the run,
// not the clock, so the reducer stays pure and a run started by hand outside
// its window gets the same room as one the scheduler started; and from the
// run's own start, so a Settings save mid-run does not move it. Compared in
// whole seconds: the 10 s test window carries a float tail. A press past the
// cap is refused, not clamped; so is one that changes nothing, and a minus
// press that would lengthen a run shorter than the 1-minute floor. The log
// names the move that really happened (−10 on a 5-min run is −4).
// Which mission it may name: staleMissionAction.ts.
//
// The reducer AND createLogEntry call adjustedMissionEnd, so a refused
// adjustment changes nothing and writes no line (the canSelectReward pattern).
// Guarded by store/__tests__/mcReducer.mission-end-cap.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';
import { missionDurationMins } from './hhmm';

/** How much longer than its own length a parent may make a run. */
export const MAX_MISSION_EXTENSION_MINS = 60;

const FLOOR_MINS = 1;
const seconds = (mins: number) => Math.round(mins * 60);

/** "+10m", "-4m", or "-10s" for a move that is not whole minutes. */
function formatMove(movedMins: number): string {
    const sign = movedMins > 0 ? '+' : '-';
    const secs = Math.abs(seconds(movedMins));
    return secs % 60 === 0 ? `${sign}${secs / 60}m` : `${sign}${secs}s`;
}

/**
 * The running mission's new duration after `action` and the log sentence for
 * it, or null when it is refused: nothing to adjust, a move that changes
 * nothing or goes the wrong way, or a longer run past the cap. Shortening is
 * always allowed, even a run saved over the cap before it existed.
 */
export function adjustedMissionEnd(
    state: MCState,
    action: Extract<MCAction, { type: 'ADJUST_MISSION_END' }>,
): { durationMins: number; message: string } | null {
    const m = state.missions.find(x => x.phase === action.missionPhase);
    const current = m?.durationMins;
    if (!m || !m.active || !m.startedAt || current === undefined || !Number.isFinite(current)) return null;
    const next = Math.max(FLOOR_MINS, current + action.deltaMinutes);
    if (!Number.isFinite(next) || seconds(next) === seconds(current)) return null;
    if (Math.sign(next - current) !== Math.sign(action.deltaMinutes)) return null; // −1 on a 10 s run would lengthen it
    const base = m.baseDurationMins ?? missionDurationMins(m, state.settings); // a run saved before the field: its window
    if (next > current && seconds(next) > seconds(base + MAX_MISSION_EXTENSION_MINS)) return null;
    return { durationMins: next, message: `Mission time adjusted (${formatMove(next - current)})` };
}
