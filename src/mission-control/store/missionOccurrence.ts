// ============================================================
// Mission Control — which occurrence of a mission is open
// ------------------------------------------------------------
// A mission recurs every day. An occurrence starts at `startsAt` on a day,
// belongs to that day, and its window lasts as long as a run started then
// would (missionDurationMins), in real time: the run's expiry, its due end
// (missionActivity.ts) and the hand-start rule (occurrenceDay.ts) measure it
// that way too, so a DST night counts its real length. An evening at 23:30 for
// 60 min is open from 23:30 to 00:30 and belongs to the day it started.
//
// One answer to "which occurrence is open now". The scheduler's arm (launch,
// a wake from sleep, a mission ending, a Settings save), its fire (start or
// skip) and the day a hand start or a legacy run is dated by all ask here. The
// scheduler used to place the start on today's date itself, so a relaunch at
// 00:10 aimed at tonight's 23:30 while last night's window was still open
// (fixed 2026-10-06). Only this file places a time of day on a date
// (occurrence-arithmetic-boundary.test.ts).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, Mission } from '../types';
import { getLocalDateString } from './behaviorSync';
import { hhmmToMins, missionDurationMins } from './hhmm';

/**
 * How late a scheduler start may be and still count as on time. A timer is
 * never exact, and one armed for 06:00 does not survive a machine suspend: on
 * resume it fires at once, hours late. A window shorter than this (the
 * 10-second test duration) stays open this long, so a start 4 min late is
 * still that occurrence's.
 */
export const LATE_FIRE_TOLERANCE_MS = 5 * 60 * 1000;

/** One occurrence: the local day it belongs to (the day its window starts) and its window, in ms. */
export interface Occurrence {
    day: string;
    startMs: number;
    endMs: number;
}

type MissionWindow = Pick<Mission, 'phase' | 'startsAt' | 'endsAt'>;

/** `instant`'s local date `days` later, `mins` after its midnight (a DST night's missing hour moves forward). */
function onDay(instant: Date, days: number, mins: number): Date {
    const d = new Date(instant);
    d.setDate(d.getDate() + days);
    d.setHours(0, mins, 0, 0);
    return d;
}

/** The first instant after `instant` that is `mins` after a midnight: today's or tomorrow's (a task lock). */
export function nextTimeOfDay(mins: number, instant: Date): Date {
    const today = onDay(instant, 0, mins);
    return today.getTime() > instant.getTime() ? today : onDay(instant, 1, mins);
}

/**
 * The occurrence that starts on `instant`'s local day, `days` later. Null for a
 * start time that is not a real HH:MM (a cleared Settings field): every reader
 * fails closed on it.
 */
export function occurrenceOn(m: MissionWindow, settings: MCSettings, instant: Date, days = 0): Occurrence | null {
    const startMins = hhmmToMins(m.startsAt);
    if (startMins === null || !Number.isFinite(instant.getTime())) return null;
    const start = onDay(instant, days, startMins);
    const startMs = start.getTime();
    return { day: getLocalDateString(start), startMs, endMs: startMs + missionDurationMins(m, settings) * 60_000 };
}

/** Whether `o` has closed by `instant`: its window ended, and a start would be more than the tolerance late. */
export function hasClosed(o: Occurrence, instant: Date): boolean {
    return instant.getTime() >= Math.max(o.endMs, o.startMs + LATE_FIRE_TOLERANCE_MS);
}

/**
 * THE decision: the occurrence open at `instant`, which a scheduler start then
 * belongs to. Today's, or yesterday's while its window runs past midnight (at
 * 00:10 the 23:30 evening that began last night), or null between windows.
 */
export function openOccurrence(m: MissionWindow, settings: MCSettings, instant: Date): Occurrence | null {
    for (const days of [0, -1]) {
        const o = occurrenceOn(m, settings, instant, days);
        if (o && o.startMs <= instant.getTime() && !hasClosed(o, instant)) return o;
    }
    return null;
}

/** The first occurrence that starts after `instant`. */
export function nextOccurrence(m: MissionWindow, settings: MCSettings, instant: Date): Occurrence | null {
    for (const days of [0, 1]) {
        const o = occurrenceOn(m, settings, instant, days);
        if (o && o.startMs > instant.getTime()) return o;
    }
    return null;
}

/** The latest occurrence that has closed by `instant` (the day before yesterday's while yesterday's is still open). */
export function lastClosedOccurrence(m: MissionWindow, settings: MCSettings, instant: Date): Occurrence | null {
    for (const days of [0, -1, -2]) {
        const o = occurrenceOn(m, settings, instant, days);
        if (o && hasClosed(o, instant)) return o;
    }
    return null;
}
