// ============================================================
// Mission Control — school days, from the family calendar
//
// A school day is Monday to Friday AND not a date the calendar says has no
// school. The calendar answer is stored as a slice (`MCState.schoolCalendar`)
// covering a date range; a date outside that range, or no slice at all (no
// calendar connected), falls back to plain Monday to Friday.
//
// Each no-school date keeps a short REASON for the mission-start log line. The
// log rides the broadcast to the phone, so a reason is never the raw title of
// someone's event: it is a canonical label, or a statutory holiday's public
// name. All dates are LOCAL `YYYY-MM-DD` strings, so they compare as strings.
// Pure module: no clock reads — the caller passes the instant.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MissionPhase } from '../types';
import { getLocalDateString } from './behaviorSync';

export interface NoSchoolDay {
    date: string;
    /** What the log shows: a canonical label, or a statutory holiday's name. */
    reason: string;
}

export interface SchoolCalendar {
    /** First date the calendar was read for (YYYY-MM-DD, local). */
    from: string;
    /** Last date the calendar was read for, inclusive. */
    to: string;
    /** Dates inside [from, to] with no school, sorted, once each. */
    noSchool: NoSchoolDay[];
}

/**
 * All-day event titles that mean "no school that day", and the label the log
 * shows for each — never the title itself. Case-insensitive; edit freely.
 * Never add the `g` flag: it makes `.test()` stateful and skip matches.
 * Statutory holidays need no entry — they are recognised by their id.
 * Dashes: hyphen or U+2010–U+2014 (phones type en dashes and non-breaking
 * hyphens). "Pro-D" needs a dash or space, or a following "day": "prod" on
 * its own is a software release, not a closure.
 * `vetoable`: an announcement word (NOT_A_CLOSURE) cancels this keyword.
 */
export const NO_SCHOOL_KEYWORDS: ReadonlyArray<{ pattern: RegExp; label: string; vetoable: boolean }> = [
    { pattern: /\bpro(?:[\s\-‐-—]+d\b|d\s*day\b)/i, label: 'Pro-D day', vetoable: false }, // Pro-D, Pro–D, Pro D, ProD Day
    { pattern: /\bprofessional\s+development\b/i, label: 'Pro-D day', vetoable: false },
    { pattern: /\bno\s+school\b/i, label: 'no school', vetoable: true },
    { pattern: /\bschools?\s+(?:closed|closure)\b/i, label: 'school closed', vetoable: true },
    { pattern: /\bnon[\s\-‐-—]?instructional\b/i, label: 'non-instructional day', vetoable: false },
    { pattern: /\b(?:spring|winter|summer|christmas|mid-winter)\s+(?:break|vacation|holidays?)\b/i, label: 'school break', vetoable: true },
];

/**
 * A title with one of these words is an announcement ABOUT a break or a
 * closure ("Classes resume after Spring Break", "No school bus today", "Early
 * dismissal - no school in the afternoon"), on a day that has school. It
 * vetoes only the `vetoable` keywords: "Pro-D Day camp" is still a Pro-D day.
 * Statutory holidays are not affected.
 */
export const NOT_A_CLOSURE = /\b(?:before|after|reopens?|resumes?|starts?|begins?|camp|concert|registration|bus|fair|dismissal|report\s+cards?)\b/i;

/**
 * electron/api.ts builds BC statutory holidays (nager.at) with this id prefix.
 * A Google event id cannot collide: Google ids are base32hex, no hyphen.
 */
const STATUTORY_HOLIDAY_ID_PREFIX = 'holiday-';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_REASON_LENGTH = 40;
const FALLBACK_REASON = 'no school';
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Longest range the classifier walks — a guard against a runaway loop, not a policy. */
const MAX_RANGE_DAYS = 366;

function parseLocalDate(date: string): Date {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Calendar-day arithmetic in local time: DST nights are 23 or 25 hours long. */
function addLocalDays(day: Date, days: number): Date {
    return new Date(day.getFullYear(), day.getMonth(), day.getDate() + days);
}

/** `Date` via structured clone, or a string if it was ever serialised. */
function toMs(value: unknown): number {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string') return Date.parse(value);
    return Number.NaN;
}

/** Log-safe text: no control characters, one space between words, at most 40 characters. */
function cleanReason(value: unknown): string {
    if (typeof value !== 'string') return FALLBACK_REASON;
    const text = value.replace(/[\p{Cc}\p{Cf}]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_REASON_LENGTH).trim();
    return text || FALLBACK_REASON;
}

/**
 * Why an event means no school, or null. A statutory holiday gives its public
 * name; an ALL-DAY event whose title matches a keyword gives that keyword's
 * label. Timed events never count ("Pro-D planning meeting 15:00"). The
 * event's `isHoliday` flag is ignored on purpose: api.ts sets it for every
 * transparent all-day event — birthdays — and for observances like Halloween.
 */
function noSchoolReason(event: Record<string, unknown>): { reason: string; statutory: boolean } | null {
    const { id, title } = event;
    if (typeof id === 'string' && id.startsWith(STATUTORY_HOLIDAY_ID_PREFIX)) return { reason: cleanReason(title), statutory: true };
    if (event.allDay !== true || typeof title !== 'string') return null;
    const announcement = NOT_A_CLOSURE.test(title);
    const keyword = NO_SCHOOL_KEYWORDS.find(k => k.pattern.test(title) && !(k.vetoable && announcement));
    return keyword ? { reason: keyword.label, statutory: false } : null;
}

/**
 * Which dates in [from, to] have no school, and why. A date D is covered by an
 * event when D's local midnight is at or after its start and strictly before
 * its end: Google's all-day end is the EXCLUSIVE next midnight, a statutory
 * holiday ends at 23:59:59 the same day. A statutory name beats a keyword
 * label on the same day. Malformed entries are skipped.
 */
export function classifySchoolCalendar(events: readonly unknown[], from: string, to: string): SchoolCalendar {
    const spans = events
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .flatMap(e => {
            const why = noSchoolReason(e);
            return why ? [{ ...why, start: toMs(e.start), end: toMs(e.end) }] : [];
        })
        .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end))
        .sort((a, b) => Number(b.statutory) - Number(a.statutory));

    const noSchool: NoSchoolDay[] = [];
    let day = parseLocalDate(from);
    for (let i = 0; i < MAX_RANGE_DAYS && getLocalDateString(day) <= to; i++, day = addLocalDays(day, 1)) {
        const midnight = day.getTime();
        const span = spans.find(s => midnight >= s.start && midnight < s.end);
        if (span) noSchool.push({ date: getLocalDateString(day), reason: span.reason });
    }
    return { from, to, noSchool };
}

type DayVerdict =
    | { kind: 'weekend'; dayName: string }
    | { kind: 'no-school'; reason: string }
    | { kind: 'school'; calendarRead: boolean };

function judgeDay(date: string, calendar?: SchoolCalendar): DayVerdict {
    const weekday = parseLocalDate(date).getDay();
    if (weekday === 0 || weekday === 6) return { kind: 'weekend', dayName: WEEKDAY_NAMES[weekday] };
    if (!calendar || date < calendar.from || date > calendar.to) return { kind: 'school', calendarRead: false };
    const closed = calendar.noSchool.find(d => d.date === date);
    return closed ? { kind: 'no-school', reason: closed.reason } : { kind: 'school', calendarRead: true };
}

/** Monday–Friday, minus the calendar's no-school dates where it has data. */
export function isSchoolDay(date: string, calendar?: SchoolCalendar): boolean {
    return judgeDay(date, calendar).kind === 'school';
}

export type SchoolBagDecision =
    | { due: true; calendarRead: boolean }
    | { due: false; reason: string };

/** Minutes after midnight for a valid "HH:MM", else null. */
function minutesOfDay(hhmm: string): number | null {
    const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
    if (!match) return null;
    const [h, m] = [Number(match[1]), Number(match[2])];
    return h < 24 && m < 60 ? h * 60 + m : null;
}

/**
 * The evening packs the night BEFORE a day. Started after midnight but before
 * the morning mission's start (Fri 00:20, by ▶ Start or the phone), it is
 * still that night, so it packs for the same calendar day. A start time it
 * cannot read keeps the plain rule: the next calendar day.
 */
function eveningPacksForToday(now: Date, morningStartsAt: string): boolean {
    const morning = minutesOfDay(morningStartsAt);
    return morning !== null && now.getHours() * 60 + now.getMinutes() < morning;
}

/**
 * Whether a mission started at `instantIso` carries the school bag, and why.
 * The morning packs for TODAY; the evening packs the night before, for
 * TOMORROW (Sunday evening yes, Friday evening no). The reducer's fresh start
 * and the "mission started" log line both call this, so they cannot disagree.
 */
export function schoolBagDecision(
    phase: MissionPhase, instantIso: string, calendar: SchoolCalendar | undefined, morningStartsAt: string,
): SchoolBagDecision {
    if (phase === 'none') return { due: false, reason: 'no mission' };
    const now = new Date(instantIso);
    if (Number.isNaN(now.getTime())) return { due: false, reason: 'time unknown' };
    const packsForToday = phase === 'morning' || eveningPacksForToday(now, morningStartsAt);
    const when = packsForToday ? 'today' : 'tomorrow';
    const verdict = judgeDay(getLocalDateString(packsForToday ? now : addLocalDays(now, 1)), calendar);
    if (verdict.kind === 'weekend') return { due: false, reason: `${when} is ${verdict.dayName}` };
    if (verdict.kind === 'no-school') return { due: false, reason: verdict.reason };
    return { due: true, calendarRead: verdict.calendarRead };
}

/** The suffix the mission-start log line carries, e.g. " · no School Bag (Pro-D day)". */
export function schoolBagLogNote(decision: SchoolBagDecision): string {
    if (!decision.due) return ` · no School Bag (${decision.reason})`;
    return decision.calendarRead ? ' · 🎒 School Bag' : ' · 🎒 School Bag (weekday; calendar not read)';
}

/** The range read from the calendar: today through today + 15, as dates and as the IPC query. */
export function schoolCalendarWindow(now: Date): { from: string; to: string; timeMin: string; timeMax: string } {
    const today = addLocalDays(now, 0);
    return {
        from: getLocalDateString(today),
        to: getLocalDateString(addLocalDays(today, 15)),
        timeMin: today.toISOString(),
        timeMax: addLocalDays(today, 16).toISOString(),
    };
}

/** A stored or dispatched value, rebuilt field by field; anything malformed is "no data". */
export function sanitizeSchoolCalendar(value: unknown): SchoolCalendar | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
    const { from, to, noSchool } = value as Record<string, unknown>;
    if (typeof from !== 'string' || typeof to !== 'string' || !DATE_RE.test(from) || !DATE_RE.test(to)) return undefined;
    if (from > to || !Array.isArray(noSchool)) return undefined;
    const byDate = new Map<string, string>();
    for (const entry of noSchool) {
        if (typeof entry !== 'object' || entry === null || !('date' in entry)) continue;
        const { date } = entry;
        if (typeof date !== 'string' || !DATE_RE.test(date) || date < from || date > to || byDate.has(date)) continue;
        byDate.set(date, cleanReason('reason' in entry ? entry.reason : undefined));
    }
    const days = [...byDate].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, reason]) => ({ date, reason }));
    return { from, to, noSchool: days };
}

export function sameSchoolCalendar(a?: SchoolCalendar, b?: SchoolCalendar): boolean {
    if (!a || !b) return a === b;
    return a.from === b.from
        && a.to === b.to
        && a.noSchool.length === b.noSchool.length
        && a.noSchool.every((d, i) => d.date === b.noSchool[i].date && d.reason === b.noSchool[i].reason);
}
