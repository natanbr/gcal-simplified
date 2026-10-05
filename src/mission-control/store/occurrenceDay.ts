// ============================================================
// Mission Control — the day a mission occurrence belongs to
// ------------------------------------------------------------
// `lastCompletedOrFailed{Morning,Evening}Date` says "that day's occurrence is
// done", and the scheduler skips an occurrence whose day it names. It used to
// be the date of the outcome, so an evening at 23:30 that ended at 00:30
// (finished or timed out) marked the NEXT day done, and that day's evening
// never started: no start, no miss, no line.
//
// An occurrence belongs to the day its window started. The writer (an outcome,
// missionStreak.ts) dates it here; the reader (useMissionScheduler's
// occurrenceHandled) compares with the day of the window start it is judging.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { Mission } from '../types';
import { getLocalDateString } from './behaviorSync';
import { hhmmToMins, windowEndToMins } from './hhmm';

const DAY_MINS = 24 * 60;

/**
 * When this run began. During a run `lastActiveAt` holds exactly that: its one
 * writer stamps a run's start and its end, and the end has not happened yet
 * (missionActivity.ts). `startedAt` is only the fallback, for a run saved
 * before the stamp existed: a full Reset moves it, and a full Reset is a
 * second attempt at the SAME occurrence. A stamp after `nowMs` was written
 * under a clock set ahead and is ignored, as the scheduler ignores it.
 */
function runStartMs(m: Mission, nowMs: number): number {
    for (const stamp of [m.lastActiveAt, m.startedAt]) {
        const ms = stamp === undefined ? Number.NaN : Date.parse(stamp);
        if (ms <= nowMs) return ms;
    }
    return nowMs;
}

/**
 * The local date (YYYY-MM-DD) of the occurrence a run belongs to, for an
 * outcome at `nowIso`: the day the run started, or the day before when it
 * started after midnight inside the previous day's window (an evening 23:30–
 * 00:30 started by a late timer at 00:10). A run outside every window (▶ Start
 * at 18:30 for 19:00) keeps its own day, as it always did.
 */
export function occurrenceDay(m: Mission, nowIso: string): string {
    const start = new Date(runStartMs(m, Date.parse(nowIso)));
    const windowStart = hhmmToMins(m.startsAt);
    const windowEnd = windowEndToMins(m.endsAt);
    const minsIntoDay = start.getHours() * 60 + start.getMinutes() + start.getSeconds() / 60;
    const inYesterdaysWindow = windowStart !== null && windowEnd !== null
        && windowEnd > DAY_MINS && minsIntoDay < windowEnd - DAY_MINS;
    if (inYesterdaysWindow) start.setDate(start.getDate() - 1);
    return getLocalDateString(start);
}
