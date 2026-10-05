// ============================================================
// Mission Control — a stuck run from an earlier day
// ------------------------------------------------------------
// A mission saved running with no readable duration (JSON writes NaN as null)
// never ended: the expiry check skips a null duration. Hydration gives a run
// from today its window's length (hhmm.ts hydrateMissionTimes), so it ends
// normally. A run whose window closed before today must not: its first tick
// would charge a miss, a shield segment for a data bug. (Until 2026-10-05 that
// miss was also dated on the launch day, so that day's mission never started;
// an outcome is now dated by its own occurrence, occurrenceDay.ts.)
// Hydration leaves it as saved; END_STALE_MISSION_RUN, dispatched once
// after load (useStaleMissionRunEnd), ends it with no outcome, like a Stop.
// The reducer and createLogEntry both ask isStaleIncompleteRun, so a replay or
// a second dispatch changes nothing and writes no line.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState, Mission, MissionPhase } from '../types';
import { getLocalDateString } from './behaviorSync';
import { missionDurationMins } from './hhmm';

type Phase = Exclude<MissionPhase, 'none'>;

/** Running with no readable duration, and its window (from when it started) closed before `now`'s day. */
export function isStaleIncompleteRun(m: Mission, settings: MCSettings, now: Date): boolean {
    if (!m.active || !m.startedAt || Number.isFinite(m.durationMins)) return false;
    const started = Date.parse(m.startedAt);
    if (!Number.isFinite(started) || started > now.getTime()) return false;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return started + missionDurationMins(m, settings) * 60_000 <= today.getTime();
}

export function staleIncompleteRunPhases(state: MCState, now: Date = new Date()): Phase[] {
    return state.missions
        .filter((m): m is Mission & { phase: Phase } => m.phase !== 'none' && isStaleIncompleteRun(m, state.settings, now))
        .map(m => m.phase);
}

function staleRun(state: MCState, phase: Phase, instant: string): Mission | undefined {
    const m = state.missions.find(x => x.phase === phase);
    return m && isStaleIncompleteRun(m, state.settings, new Date(instant)) ? m : undefined;
}

/**
 * No outcome: no miss, no conclusion date. The run is cleared; ending the
 * activeMission it named lets stampMissionActivity stamp lastActiveAt, so the
 * old occurrence is not restarted. Same state when the run is not stale.
 */
export function endStaleMissionRun(state: MCState, phase: Phase, instant: string): MCState {
    if (!staleRun(state, phase, instant)) return state;
    return {
        ...state,
        ...(state.activeMission === phase ? { activeMission: 'none' as const } : {}),
        missions: state.missions.map(m => (m.phase === phase
            ? { ...m, active: false, startedAt: undefined, durationMins: undefined }
            : m)),
    };
}

/** The log sentence, or null when the dispatch changes nothing. */
export function staleRunEndedMessage(state: MCState, phase: Phase, instant: string): string | null {
    const m = staleRun(state, phase, instant);
    if (!m?.startedAt) return null;
    const name = phase === 'morning' ? 'Morning' : 'Evening';
    return `${name} mission from ${getLocalDateString(new Date(m.startedAt))} ended at startup: its saved record was incomplete`;
}
