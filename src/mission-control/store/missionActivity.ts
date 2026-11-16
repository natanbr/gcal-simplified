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
// transition (a Settings save that moves it), at the same instant (or the
// last activity, if a clock set back made that later), so a save that ends
// the run is never older than the run's end, and only when the run covered its
// occurrence at the old start time (saveKeepsRun, occurrenceHandled.ts). The
// scheduler then refuses a fresh attempt at the moved time (retimedOntoItsRun,
// 2026-11-13). Nothing clears it either (activity-stamp-boundary.test.ts).
//
// `savedIntoWindowAt` is stamped here too, from the window transition (a save
// that moves the start time or changes the length), at the action's instant,
// when the save opened a window: one open at that instant that was not open at
// that same start before, or one the old settings had counted as handled and
// the new length would not (the retime rule weighs the window behind it, which
// the length changes). Unstamped, the scheduler started it at once with a full
// timer, a start on demand the phone alone may make (owner rule 2026-11-10). A
// window already open and pending (behind another running mission) that is only
// lengthened is not stamped, and still starts. Nothing clears it
// (activity-stamp-boundary.test.ts).
// ============================================================

import type { MCSettings, MCState, Mission } from '../types';
import { missionDurationMins } from './hhmm';
import { openOccurrence } from './missionOccurrence';
import { occurrenceHandled, saveKeepsRun } from './occurrenceHandled';

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
 * `m` (its run already stamped) with the save that moved its start time
 * stamped, when the run it had covered its occurrence at the old time
 * (saveKeepsRun, read in `prev`); else as it was. At `instant`, or at the last
 * activity when that is later: a save made with the clock set back must not
 * look older than the run it follows.
 */
function movedStamp(prev: MCState, m: Mission, instant: string): Mission {
    if (m.phase === 'none') return m;
    const last = m.lastActiveAt;
    const at = last !== undefined && Date.parse(last) > Date.parse(instant) ? last : instant;
    return saveKeepsRun(prev, m.phase, Date.parse(at)) ? { ...m, startsAtChangedAt: at } : m;
}

/** Whether a mission's window differs between two settings: a new start time or a new length. */
function windowDiffers(before: Mission, prevSettings: MCSettings, after: Mission, nextSettings: MCSettings): boolean {
    return before.startsAt !== after.startsAt || missionDurationMins(before, prevSettings) !== missionDurationMins(after, nextSettings);
}

/** Whether `m`'s window differs from its phase's in `prev`. */
function windowChanged(prev: MCState, next: MCState, m: Mission): boolean {
    const before = prev.missions.find(p => p.phase === m.phase);
    return before !== undefined && before !== m && windowDiffers(before, prev.settings, m, next.settings);
}

/**
 * Whether changing a mission from `before` (under `prevSettings`) to `after`
 * (under `nextSettings`) opens a window at `instant`: the window
 * changed, one is open then, and it was not open there at that same start before
 * the change (openOccurrence, read under both). Half of the stamp below (the other
 * half, a window uncovered by the save, needs the whole state).
 */
export function opensWindow(before: Mission | undefined, prevSettings: MCSettings, after: Mission, nextSettings: MCSettings, instant: string): boolean {
    if (before === undefined || !windowDiffers(before, prevSettings, after, nextSettings)) return false;
    const at = new Date(instant);
    const opened = openOccurrence(after, nextSettings, at);
    if (opened === null) return false;
    return openOccurrence(before, prevSettings, at)?.startMs !== opened.startMs;
}

/**
 * Whether the save turned a window the scheduler counted as handled into one it
 * would start: the same window (same start) is open before and after, handled in
 * `prev` and not handled with `m` and the new settings. A save never uncovers a
 * window. (Review: a duration-only save inside a window the retime rule covered
 * started it at once.)
 */
function uncoversWindow(prev: MCState, next: MCState, before: Mission | undefined, m: Mission, instant: string): boolean {
    if (before === undefined || m.phase === 'none') return false;
    const at = new Date(instant);
    const nowMs = at.getTime();
    const opened = openOccurrence(m, next.settings, at);
    const was = openOccurrence(before, prev.settings, at);
    if (opened === null || was === null || was.startMs !== opened.startMs) return false;
    const after: MCState = { ...next, missions: next.missions.map(x => (x.phase === m.phase ? m : x)) };
    return occurrenceHandled(prev, m.phase, was, nowMs) && !occurrenceHandled(after, m.phase, opened, nowMs);
}

/** `m` stamped `savedIntoWindowAt` at `instant` when its changed window opens one (opensWindow, uncoversWindow); else as it was. */
function openedStamp(prev: MCState, next: MCState, m: Mission, instant: string): Mission {
    const before = prev.missions.find(p => p.phase === m.phase);
    const stamped = opensWindow(before, prev.settings, m, next.settings, instant) || uncoversWindow(prev, next, before, m, instant);
    return stamped ? { ...m, savedIntoWindowAt: instant } : m;
}

/**
 * `next` with the mission that just started stamped at `instant` (the action's
 * timestamp, so the reducer stays pure), the one that just ended at its end, one
 * whose start time just moved stamped `startsAtChangedAt` (movedStamp), and one
 * whose window a save just put under the clock stamped `savedIntoWindowAt`
 * (openedStamp). Same reference when nothing started, ended or changed window.
 */
export function stampMissionActivity(prev: MCState, next: MCState, instant: string): MCState {
    const ran = prev.activeMission !== next.activeMission;
    if (!ran && (next.missions === prev.missions || !next.missions.some(m => windowChanged(prev, next, m)))) return next;
    // Read from `prev`: a Stop clears startedAt in `next`.
    const ended = endStamp(prev.missions.find(m => m.phase === prev.activeMission), prev, instant);
    return {
        ...next,
        missions: next.missions.map(m => {
            const runStamp = !ran ? null : m.phase === next.activeMission ? instant : m.phase === prev.activeMission ? ended : null;
            const stamped = runStamp === null ? m : { ...m, lastActiveAt: runStamp };
            const moved = startMoved(prev, m) ? movedStamp(prev, stamped, instant) : stamped;
            return windowChanged(prev, next, m) ? openedStamp(prev, next, moved, instant) : moved;
        }),
    };
}
