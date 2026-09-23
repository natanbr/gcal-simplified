// ============================================================
// Mission Control — when each mission last ran
// ------------------------------------------------------------
// `Mission.lastActiveAt` is how the scheduler knows today's occurrence already
// ran. A stop records no outcome (it is not a miss and not a conclusion), so
// without it a stopped mission was started again 8 ms later (2026-09-22).
//
// Stamped on BOTH edges of a run, the start and the end, so a run covers every
// occurrence it overlapped: one started by hand at 18:30 and stopped at 19:04
// covers the 19:00 evening; one stopped at 18:45 covers none of it. Only the
// start would miss the first case, only a date would wrongly cover the second.
//
// Derived from the `activeMission` transition, whatever action caused it, so a
// new way to end a mission cannot forget to stamp. Nothing else writes the
// field and nothing clears it (activity-stamp-boundary.test.ts).
// ============================================================

import type { MCState } from '../types';

/**
 * `next` with the mission that just started or just ended stamped at `instant`
 * (the action's timestamp, so the reducer stays pure). Same reference when
 * nothing started or ended.
 */
export function stampMissionActivity(prev: MCState, next: MCState, instant: string): MCState {
    if (prev.activeMission === next.activeMission) return next;
    const edges = new Set([prev.activeMission, next.activeMission]);
    return {
        ...next,
        missions: next.missions.map(m => (edges.has(m.phase) ? { ...m, lastActiveAt: instant } : m)),
    };
}
