// ============================================================
// Mission Control — the day a mission occurrence belongs to
// ------------------------------------------------------------
// `lastCompletedOrFailed{Morning,Evening}Date` says "that day's occurrence is
// done", and the scheduler skips an occurrence whose day it names. It used to
// be the date of the outcome, so an evening at 23:30 that ended at 00:30
// (finished or timed out) marked the NEXT day done, and that day's evening
// never started: no start, no miss, no line.
//
// The day is decided when the run STARTS and stored on it (`occurrenceDate`),
// because everything an outcome could re-derive it from can change during the
// run: a Settings save re-derives the window, the scheduler starts a run up to
// 5 min late, a DST night moves the wall clock. The scheduler names the day of
// the occurrence it starts; a start by hand or from the phone belongs to the
// NEAREST occurrence of its phase. An outcome (missionStreak.ts) writes the
// stored day; the scheduler's occurrenceHandled compares with the day of the
// window start it is judging. Guarded by mcReducer.occurrence-day.test.ts and
// __tests__/outcome-date-boundary.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, Mission } from '../types';
import { getLocalDateString } from './behaviorSync';
import { hhmmToMins, isValidHhmm, windowEndToMins } from './hhmm';

const DAY_MINS = 24 * 60;

/** A local date key as getLocalDateString writes it. */
export function isDateKey(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The day of the occurrence of a phase starting at `startsAt` that is nearest
 * to `instantIso`: yesterday's, today's or tomorrow's, measured in real time
 * (so a DST night counts its real length). A TIE goes to the later, upcoming
 * one, so a start exactly halfway counts as an early start. An evening at 19:00
 * started at 00:20 is the evening before; a morning at 06:00 started at 05:50 is
 * today's, and one started after 18:00 is tomorrow's. An unreadable start time
 * keeps the instant's own day.
 */
export function nearestOccurrenceDay(startsAt: string, instantIso: string): string {
    const at = new Date(instantIso);
    const startMins = hhmmToMins(startsAt);
    if (startMins === null || !Number.isFinite(at.getTime())) return getLocalDateString(at);
    let nearest = at;
    let gap = Number.POSITIVE_INFINITY;
    for (const dayOffset of [-1, 0, 1]) { // ascending, so `<=` hands a tie to the later one
        const candidate = new Date(at);
        candidate.setDate(candidate.getDate() + dayOffset);
        candidate.setHours(0, startMins, 0, 0);
        const candidateGap = Math.abs(candidate.getTime() - at.getTime());
        if (candidateGap <= gap) { nearest = candidate; gap = candidateGap; }
    }
    return getLocalDateString(nearest);
}

/** The day a run starting now belongs to: the scheduler's own target, or else the nearest occurrence. */
export function startedOccurrenceDate(
    m: Mission,
    action: Extract<MCAction, { type: 'SET_ACTIVE_MISSION' }>,
    nowIso: string,
): string {
    // Only the scheduler names it: a phone payload arrives with origin 'remote' whatever it says.
    if (action.origin === 'scheduler' && isDateKey(action.occurrenceDate)) return action.occurrenceDate;
    return nearestOccurrenceDay(m.startsAt, nowIso);
}

/**
 * The day an outcome at `nowIso` is dated: the day stored when the run started.
 * An outcome is only recorded for a running mission (missionStreak.ts refuses
 * the rest), so the run's own stamps describe this run. A run that started
 * after `nowIso` started under a clock set ahead, and so did its stored day:
 * the derivation below, which ignores such a stamp, dates it instead.
 */
export function occurrenceDay(m: Mission, nowIso: string): string {
    const startedLater = Date.parse(m.lastActiveAt ?? m.startedAt ?? '') > Date.parse(nowIso);
    return isDateKey(m.occurrenceDate) && !startedLater ? m.occurrenceDate : legacyOccurrenceDay(m, nowIso);
}

/**
 * For a run saved before `occurrenceDate` existed (the update arrives mid-run):
 * the day the run started, or the day before when it started after midnight
 * inside the previous day's window. During a run `lastActiveAt` is its start
 * stamp (its one writer stamps start and end, missionActivity.ts); `startedAt`
 * is the fallback, since a full Reset moves it. A stamp after `nowMs` (a clock
 * set ahead) is ignored.
 */
function legacyOccurrenceDay(m: Mission, nowIso: string): string {
    const start = new Date(runStartMs(m, Date.parse(nowIso)));
    const windowEnd = windowEndToMins(m.endsAt);
    const minsIntoDay = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
    const inYesterdaysWindow = isValidHhmm(m.startsAt) && windowEnd !== null
        && windowEnd > DAY_MINS && minsIntoDay < windowEnd - DAY_MINS;
    if (inYesterdaysWindow) start.setDate(start.getDate() - 1);
    return getLocalDateString(start);
}

function runStartMs(m: Mission, nowMs: number): number {
    for (const stamp of [m.lastActiveAt, m.startedAt]) {
        const ms = stamp === undefined ? Number.NaN : Date.parse(stamp);
        if (ms <= nowMs) return ms;
    }
    return nowMs;
}
