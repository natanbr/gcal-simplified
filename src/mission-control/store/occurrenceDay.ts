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
// the occurrence it starts; a start by hand or from the phone never belongs to
// a future day's (handStartOccurrenceDay). An outcome (missionStreak.ts) writes the
// stored day; the scheduler's occurrenceHandled compares with the day of the
// window start it is judging. Guarded by mcReducer.occurrence-day.test.ts,
// mcReducer.occurrence-dst.test.ts and
// __tests__/outcome-date-boundary.test.ts.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCAction, MCSettings, Mission } from '../types';
import { getLocalDateString } from './behaviorSync';
import { hhmmToMins, isValidHhmm, missionDurationMins, windowEndToMins } from './hhmm';

const DAY_MINS = 24 * 60;

/** A local date key as getLocalDateString writes it. */
export function isDateKey(value: unknown): value is string {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * The day a run started by hand or from the phone at `instantIso` belongs to.
 * It NEVER belongs to a future day's occurrence (decided for Nathan by the
 * review of PR 193, reversible):
 *   - at or after today's window start: today's (a make-up, a late start);
 *   - before it: whichever is nearer, today's start ahead (an early start) or
 *     the previous occurrence's END behind (a late make-up), a tie going to
 *     today; inside the previous occurrence's window (an overnight tail) it is
 *     that one.
 * Distances are real time, so a DST night counts its real length. A morning at
 * 06:00 started at 05:50 or at 19:30 is today's; an evening at 19:00–20:00
 * started at 00:20 is yesterday's, at 14:00 today's. An unreadable start time
 * keeps the instant's own day.
 */
export function handStartOccurrenceDay(m: Mission, settings: MCSettings, instantIso: string): string {
    const at = new Date(instantIso);
    const startMins = hhmmToMins(m.startsAt);
    if (startMins === null || !Number.isFinite(at.getTime())) return getLocalDateString(at);
    const todayStart = new Date(at);
    todayStart.setHours(0, startMins, 0, 0);
    if (at.getTime() >= todayStart.getTime()) return getLocalDateString(todayStart);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, startMins, 0, 0);
    const yesterdayEndMs = yesterdayStart.getTime() + missionDurationMins(m, settings) * 60_000;
    const sinceYesterdaysEnd = at.getTime() - yesterdayEndMs; // negative: still inside yesterday's window
    const untilTodaysStart = todayStart.getTime() - at.getTime();
    return getLocalDateString(sinceYesterdaysEnd < untilTodaysStart ? yesterdayStart : todayStart);
}

/** The day a run starting now belongs to: the scheduler's own target, or else the hand-start rule. */
export function startedOccurrenceDate(
    m: Mission,
    settings: MCSettings,
    action: Extract<MCAction, { type: 'SET_ACTIVE_MISSION' }>,
    nowIso: string,
): string {
    // Only the scheduler names it: a phone payload arrives with origin 'remote' whatever it says.
    if (action.origin === 'scheduler' && isDateKey(action.occurrenceDate)) return action.occurrenceDate;
    return handStartOccurrenceDay(m, settings, nowIso);
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
