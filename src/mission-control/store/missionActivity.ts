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
// 2026-11-13). With it goes `retimeCoversDay`, that save's decision about the
// occurrence ahead (retimeAheadDay), weighed with the run's own length and
// stored, so a later length save cannot move it; a later move to the same
// instant keeps it (aheadDecision). Nothing clears either
// (activity-stamp-boundary.test.ts).
//
// `savedIntoWindows` gains an entry here, from the window transition (a save
// that moves the start time or changes the length), at the action's instant,
// when the save opened a window: one open at that instant that was not open at
// that same start before. Unstamped, the scheduler started it at once with a
// full timer, a start on demand the phone alone may make (owner rule
// 2026-11-10). The entry names the window by its start, so a later length save
// cannot move it out, and earlier entries stay while the scheduler can still
// look back at them, so covering the next day's window cannot uncover the
// first. A window already open and pending (behind another running mission)
// that is only lengthened is not stamped, and still starts. Nothing else
// writes it (activity-stamp-boundary.test.ts).
// ============================================================

import type { MCSettings, MCState, Mission, SavedWindow } from '../types';
import { missionDurationMins } from './hhmm';
import { nextOccurrence, openOccurrence, type Occurrence } from './missionOccurrence';
import { retimeAheadDay, saveKeepsRun } from './occurrenceHandled';

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
 * The decision about the occurrence ahead for a save that moves `m` (under
 * `settings`, the saved ones) from `before` (under `prevSettings`) onto its run:
 * the one the save before it made, when that save stamped this same run (no
 * activity since, as retimedOntoItsRun reads it) and the occurrence ahead starts
 * at the same instant under both start times; else a new one (retimeAheadDay).
 * On the spring-forward night 02:40 and 03:40 name one instant, while the
 * window behind them, the day before, is an hour apart: decided again, a move
 * from one to the other uncovered the window the first had covered, and the
 * scheduler started it at once (review of PR 209). A move to the same start
 * never changes what is covered.
 */
function aheadDecision(before: Mission, prevSettings: MCSettings, m: Mission, settings: MCSettings): string | undefined {
    const activeAt = Date.parse(m.lastActiveAt ?? '');
    const sameRun = before.startsAtChangedAt !== undefined && activeAt <= Date.parse(before.startsAtChangedAt);
    const ahead = nextOccurrence(m, settings, new Date(activeAt));
    const sameAhead = ahead !== null && nextOccurrence(before, prevSettings, new Date(activeAt))?.startMs === ahead.startMs;
    return sameRun && sameAhead ? before.retimeCoversDay : retimeAheadDay(m, settings);
}

/**
 * `m` (its run already stamped) with the save that moved its start time
 * stamped, when the run it had covered its occurrence at the old time
 * (saveKeepsRun, read in `prev`), and that save's decision about the
 * occurrence ahead (aheadDecision); else as it was. At `instant`, or at the
 * last activity when that is later: a save made with the clock set back must
 * not look older than the run it follows.
 */
function movedStamp(prev: MCState, next: MCState, m: Mission, instant: string): Mission {
    const before = prev.missions.find(p => p.phase === m.phase);
    if (m.phase === 'none' || before === undefined) return m;
    const last = m.lastActiveAt;
    const at = last !== undefined && Date.parse(last) > Date.parse(instant) ? last : instant;
    if (!saveKeepsRun(prev, m.phase, Date.parse(at))) return m;
    return { ...m, startsAtChangedAt: at, retimeCoversDay: aheadDecision(before, prev.settings, m, next.settings) };
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
 * The window that changing a mission from `before` (under `prevSettings`) to
 * `after` (under `nextSettings`) opens at `instant`: the window changed, one is
 * open then, and it was not open there at that same start before the change
 * (openOccurrence, read under both); else null.
 */
function openedWindow(before: Mission | undefined, prevSettings: MCSettings, after: Mission, nextSettings: MCSettings, instant: string): Occurrence | null {
    if (before === undefined || !windowDiffers(before, prevSettings, after, nextSettings)) return null;
    const at = new Date(instant);
    const opened = openOccurrence(after, nextSettings, at);
    if (opened === null || openOccurrence(before, prevSettings, at)?.startMs === opened.startMs) return null;
    return opened;
}

/**
 * How long a covered window is kept: the scheduler looks back two local days
 * at most (lastClosedOccurrence), so four days of windows leave a day to spare
 * on a DST night. Older ones can never be asked about again.
 */
const KEPT_FOR_MS = 4 * 24 * 60 * 60_000;

/** `windows` with `opened`, saved at `instant`, added (an earlier save of the same window replaced), less the ones too old to be asked about. */
function withSavedWindow(windows: SavedWindow[] | undefined, opened: Occurrence, instant: string): SavedWindow[] {
    const windowStart = new Date(opened.startMs).toISOString();
    const oldest = Date.parse(instant) - KEPT_FOR_MS;
    const kept = (windows ?? []).filter(w => w.windowStart !== windowStart && Date.parse(w.windowStart) >= oldest);
    return [...kept, { savedAt: instant, windowStart }];
}

/** `m` with the window its changed settings open at `instant` added to `savedIntoWindows` (openedWindow); else as it was. */
function openedStamp(prev: MCState, next: MCState, m: Mission, instant: string): Mission {
    const opened = openedWindow(prev.missions.find(p => p.phase === m.phase), prev.settings, m, next.settings, instant);
    return opened === null ? m : { ...m, savedIntoWindows: withSavedWindow(m.savedIntoWindows, opened, instant) };
}

/**
 * `next` with the mission that just started stamped at `instant` (the action's
 * timestamp, so the reducer stays pure), the one that just ended at its end, one
 * whose start time just moved stamped `startsAtChangedAt` (movedStamp), and one
 * whose window a save just put under the clock given that window in
 * `savedIntoWindows` (openedStamp). Same reference when nothing started, ended
 * or changed window.
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
            const moved = startMoved(prev, m) ? movedStamp(prev, next, stamped, instant) : stamped;
            return windowChanged(prev, next, m) ? openedStamp(prev, next, moved, instant) : moved;
        }),
    };
}
