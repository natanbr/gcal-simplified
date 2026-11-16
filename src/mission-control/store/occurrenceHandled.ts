// ============================================================
// Mission Control — whether an occurrence still needs a scheduler start
// ------------------------------------------------------------
// The scheduler's one question (useMissionScheduler.ts asks it at every arm and
// fire), and the question a Settings save asks before it is stamped
// (missionActivity.ts): has this occurrence of the mission been handled? Pure,
// with the clock passed in, so the reducer can ask it with its action's instant.
//
// A Settings save that moves a start time is never a fresh attempt (owner
// decision 2026-11-13): the run the phase already had keeps covering the
// occurrence. Saving a new start time for the RUNNING mission ends it with no
// outcome (missionReschedule.ts) and its end stamp lies before the new time, so
// the occurrence there looked unrun, and the scheduler started a full timer,
// as often as a child at the touchscreen saved.
//
// Nor is a save a start on demand (owner rule 2026-11-10: only the phone starts
// a mission out of schedule). A mission that had not run could be saved to
// start a minute ago, or lengthened so a closed window opened again: the window
// was open at once, its occurrence unrun, and the scheduler started it with a
// full timer. Such a save is stamped (savedIntoWindowAt, missionActivity.ts) and
// covers the window it opened (savedIntoItsWindow). That stamp records no run,
// so the question a save asks (saveKeepsRun) never reads it.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState, Mission, MissionPhase } from '../types';
import { hasClosed, nearerToStartOf, occurrenceOn, type Occurrence } from './missionOccurrence';

export type Phase = Exclude<MissionPhase, 'none'>;

/** A stamp in ms; NaN for none or an unreadable one, which fails every comparison. */
const stampMs = (stamp: string | undefined): number => (stamp === undefined ? Number.NaN : Date.parse(stamp));

/**
 * Whether a Settings save moved `m`'s start time onto the run it already had
 * for `o`. Only a save stamped at or after the phase last ran (a phone start
 * after the save is judged as if no save had been made: a run that ended
 * before its window covers none of it, 2026-09-22), and not one in the future
 * (a clock set ahead), as the scheduler ignores such a lastActiveAt. A save is
 * stamped only when the run covered its occurrence at the OLD time
 * (saveKeepsRun). Then the run covers the occurrence of its own day (a move
 * the same day, however far) and the next occurrence when its last activity is
 * nearer that start than the window behind, in real time (nearerToStartOf): an
 * evening at 23:30 moved at 23:50 to 00:10 covers that night's 00:10, and the
 * night after starts as normal. Known gap: a move made long after the run, to
 * a time early the next day, is covered the same way (an evening missed at
 * 00:30 and moved at 08:00 to 08:30 skips that 08:30); the phone can start it.
 */
export function retimedOntoItsRun(m: Mission, settings: MCSettings, o: Occurrence, nowMs: number): boolean {
    const activeAt = stampMs(m.lastActiveAt);
    const movedAt = stampMs(m.startsAtChangedAt);
    if (!(activeAt <= movedAt && movedAt <= nowMs)) return false;
    return m.occurrenceDate === o.day || nearerToStartOf(o, m, settings, activeAt);
}

/**
 * Whether a Settings save put `o`'s window under the clock: the save
 * (savedIntoWindowAt) was made while `o` was open, at or after its start (a
 * save at the very instant it starts counts) and before it closed. Only that
 * window: an earlier one, closed by the save, keeps its "skipped" line, and a
 * later one starts as scheduled. A stamp after `nowMs` (a clock set ahead) is
 * ignored, as a lastActiveAt is.
 */
function savedIntoItsWindow(m: Mission, o: Occurrence, nowMs: number): boolean {
    const savedAt = stampMs(m.savedIntoWindowAt);
    return o.startMs <= savedAt && savedAt <= nowMs && !hasClosed(o, new Date(savedAt));
}

/**
 * What the phase's runs did for `o`: it concluded (completed or failed; the
 * outcome is dated by the day its window started, occurrenceDay.ts, so a timer
 * firing after midnight is judged against the evening that began before it), it
 * is running now, it last started or ended at or after `o`'s start (what covers
 * a STOP, which records no outcome: without it a stopped mission was restarted
 * 8 ms later), or a Settings save moved the start time onto the run it had
 * (retimedOntoItsRun). A last activity after `nowMs` is ignored: written under a
 * clock set ahead, trusting it would skip every occurrence, silently, until the
 * clock caught up.
 */
function ranOrConcluded(s: MCState, phase: Phase, m: Mission | undefined, o: Occurrence, nowMs: number): boolean {
    const concluded = phase === 'morning'
        ? s.lastCompletedOrFailedMorningDate === o.day
        : s.lastCompletedOrFailedEveningDate === o.day;
    const activeAt = stampMs(m?.lastActiveAt);
    return concluded
        || s.activeMission === phase
        || (activeAt >= o.startMs && activeAt <= nowMs)
        || (m !== undefined && retimedOntoItsRun(m, s.settings, o, nowMs));
}

/**
 * True when the occurrence `o` of `phase` needs no scheduler start: a run
 * handled it (ranOrConcluded), or a Settings save put its window under the
 * clock (savedIntoItsWindow), which would otherwise start at once with a full
 * timer: a start on demand, the phone's alone.
 */
export function occurrenceHandled(s: MCState, phase: Phase, o: Occurrence, nowMs: number): boolean {
    const m = s.missions.find(x => x.phase === phase);
    return ranOrConcluded(s, phase, m, o, nowMs) || (m !== undefined && savedIntoItsWindow(m, o, nowMs));
}

/**
 * The occurrence `m`'s last run belonged to: its stored day, found near its
 * last activity (a run ends at most a day after its occurrence's day; two days
 * back leaves room for a window that crosses midnight). Null with no last
 * activity or no stored day (a run from before occurrenceDate, 2026-10-05).
 */
function lastRunOccurrence(m: Mission, settings: MCSettings): Occurrence | null {
    const near = new Date(stampMs(m.lastActiveAt));
    for (const days of [0, -1, -2]) {
        const o = occurrenceOn(m, settings, near, days);
        if (o && o.day === m.occurrenceDate) return o;
    }
    return null;
}

/**
 * Whether a save at `atMs` that moves `phase`'s start time keeps the run the
 * phase had, read in `prev` (the old start time): the run covered its
 * occurrence there (ranOrConcluded: it is running, it ran at or after the old
 * start, it concluded, or an earlier save kept it). A phone run that ended
 * before the old window covered none of it, so the save covers nothing either.
 * Nor does a save that put the old window under the clock (savedIntoWindowAt):
 * it is no run, and kept here it would cover the run's whole day, so a second
 * save moving the start ahead would never start there.
 */
export function saveKeepsRun(prev: MCState, phase: Phase, atMs: number): boolean {
    const m = prev.missions.find(x => x.phase === phase);
    const o = m === undefined ? null : lastRunOccurrence(m, prev.settings);
    return o !== null && ranOrConcluded(prev, phase, m, o, atMs);
}

/**
 * Whether `passed`, a window that closed without the mission running, is the
 * scheduler's to report: it started while this session was up (the machine
 * slept through it), or after the mission last ran (the app was closed through
 * it). A profile on which the mission never ran says nothing about the app
 * existing at that window, so it gets no line.
 */
export function skipOwed(s: MCState, phase: Phase, passed: Occurrence, sessionStartMs: number, nowMs: number): boolean {
    const lastActive = stampMs(s.missions.find(m => m.phase === phase)?.lastActiveAt);
    return !occurrenceHandled(s, phase, passed, nowMs)
        && (passed.startMs >= sessionStartMs || lastActive <= nowMs);
}

/** Names the occurrence, so its "skipped" line is written once: a later launch finds it in the log. */
export const skippedLineId = (phase: Phase, o: Occurrence) => `mission-skipped-${phase}-${o.day}`;
