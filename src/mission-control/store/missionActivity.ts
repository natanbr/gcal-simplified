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
// The end is stamped when the run ended, or at its DUE end (start + duration)
// when it was only noticed later: a run left going overnight and expired by
// the tick inside the same phase's next window had its end stamped then, so
// the scheduler read that window's occurrence as run and it never started
// (review of PR 193). That covers END_STALE_MISSION_RUN too, whose duration is
// unreadable: its window's length stands in, as it does for the stale check.
//
// Derived from the `activeMission` transition, whatever action caused it, so a
// new way to end a mission cannot forget to stamp. Nothing else writes the
// field and nothing clears it (activity-stamp-boundary.test.ts).
//
// `startsAtChangedAt` is stamped here the same way, from the `startsAt`
// transition (a Settings save that moves it), at the same instant: a save
// that ends the run is then never older than the run's end, which
// retimedOntoItsRun (occurrenceDay.ts) relies on to refuse the scheduler a
// fresh attempt at the moved time (2026-11-13). Nothing clears it either.
// ============================================================

import type { MCState, Mission } from '../types';
import { missionDurationMins } from './hhmm';

/** `instant`, or the run's due end when that came earlier. */
function endStamp(ended: Mission | undefined, prev: MCState, instant: string): string {
    if (!ended?.startedAt) return instant;
    const length = Number.isFinite(ended.durationMins) ? Number(ended.durationMins) : missionDurationMins(ended, prev.settings);
    const due = Date.parse(ended.startedAt) + length * 60_000;
    return Number.isFinite(due) && due < Date.parse(instant) ? new Date(due).toISOString() : instant;
}

/** Whether `m`'s start time differs from its phase's in `prev`. */
function startMoved(prev: MCState, m: Mission): boolean {
    const before = prev.missions.find(p => p.phase === m.phase);
    return before !== undefined && before.startsAt !== m.startsAt;
}

/**
 * `next` with the mission that just started stamped at `instant` (the action's
 * timestamp, so the reducer stays pure), the one that just ended at its end, and
 * one whose start time just moved stamped `startsAtChangedAt` at `instant`.
 * Same reference when nothing started, ended or moved.
 */
export function stampMissionActivity(prev: MCState, next: MCState, instant: string): MCState {
    const ran = prev.activeMission !== next.activeMission;
    if (!ran && (next.missions === prev.missions || !next.missions.some(m => startMoved(prev, m)))) return next;
    // Read from `prev`: a Stop clears startedAt in `next`.
    const ended = endStamp(prev.missions.find(m => m.phase === prev.activeMission), prev, instant);
    return {
        ...next,
        missions: next.missions.map(m => {
            const runStamp = !ran ? null : m.phase === next.activeMission ? instant : m.phase === prev.activeMission ? ended : null;
            const moved = startMoved(prev, m);
            if (runStamp === null && !moved) return m;
            return { ...m, ...(runStamp === null ? {} : { lastActiveAt: runStamp }), ...(moved ? { startsAtChangedAt: instant } : {}) };
        }),
    };
}
