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
// A run may last at most its own length (its window, as Settings set it) plus
// MAX_MISSION_EXTENSION_MINS. Measured from the run, not the clock, so the
// reducer stays pure and a run started by hand outside its window gets the same
// room as one the scheduler started. An adjustment past the cap is refused, not
// clamped, so the log line always says what really moved; one that changes
// nothing is refused too. Which mission it may name: staleMissionAction.ts.
//
// The reducer AND createLogEntry call adjustedMissionDuration, so a refused
// adjustment changes nothing and writes no line (the canSelectReward pattern).
// Guarded by store/__tests__/mcReducer.mission-end-cap.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCState } from '../types';
import { missionDurationMins } from './hhmm';

/** How much longer than its own length a parent may make a run. */
export const MAX_MISSION_EXTENSION_MINS = 60;

/**
 * The running mission's new duration after `action`, or null when it is refused:
 * nothing to adjust, a move that changes nothing, or a longer run past the cap.
 * Shortening is always allowed, even a run saved over the cap before it existed.
 */
export function adjustedMissionDuration(
    state: MCState,
    action: Extract<MCAction, { type: 'ADJUST_MISSION_END' }>,
): number | null {
    const m = state.missions.find(x => x.phase === action.missionPhase);
    const current = m?.durationMins;
    if (!m || !m.active || !m.startedAt || current === undefined || !Number.isFinite(current)) return null;
    const next = Math.max(1, current + action.deltaMinutes);
    if (!Number.isFinite(next) || next === current) return null;
    if (next > current && next > missionDurationMins(m, state.settings) + MAX_MISSION_EXTENSION_MINS) return null;
    return next;
}
