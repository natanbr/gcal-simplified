// ============================================================
// Mission Control — which days are school days
// ------------------------------------------------------------
// The school-bag task appears only on school days: Monday to Friday, minus the
// days the family calendar says there is no school (a Pro-D day, a break, a
// statutory holiday). With no calendar data for a date it falls back to plain
// Monday to Friday. Each no-school date carries a short reason for the log —
// a canonical label or a statutory holiday's public name, never the raw title
// of someone's event (the log rides the broadcast to the phone).
//
// Every instant here is built from LOCAL components (new Date(y, m, d, h)),
// never from a `Z` literal: vitest pins no time zone, and a UTC literal lands
// on a different local day west of Greenwich.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    NO_SCHOOL_KEYWORDS,
    NOT_A_CLOSURE,
    classifySchoolCalendar,
    isSchoolDay,
    sameSchoolCalendar,
    sanitizeSchoolCalendar,
    schoolBagDecision,
    schoolBagLogNote,
    schoolCalendarWindow,
    type SchoolCalendar,
} from './schoolDays';

// 2026-09-27 is a Sunday. Mon 28, Tue 29, Wed 30, Thu Oct 1, Fri 2, Sat 3.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const iso = (y: number, m: number, d: number, h = 0, min = 0) => local(y, m, d, h, min).toISOString();

const FROM = '2026-09-27';
const TO = '2026-10-12';

/** A Google all-day event: start local midnight, end = local midnight of the EXCLUSIVE end day. */
function allDay(title: string, y: number, m: number, d: number, days = 1, extra: Record<string, unknown> = {}) {
    return { id: `evt-${title}-${d}`, title, allDay: true, start: local(y, m, d), end: local(y, m, d + days), ...extra };
}

/** A statutory holiday exactly as electron/api.ts builds it from nager.at. */
function stat(date: string, name: string) {
    return {
        id: `holiday-${date}-${name}`,
        title: name,
        allDay: true,
        isHoliday: true,
        start: new Date(`${date}T00:00:00`),
        end: new Date(`${date}T23:59:59`),
    };
}

const classify = (events: unknown[]) => classifySchoolCalendar(events, FROM, TO).noSchool;
const noSchool = (events: unknown[]) => classify(events).map(d => d.date);
/** The default morning start (06:00): an evening started before it, after midnight, is still "tonight". */
const MORNING = '06:00';
const due = (phase: 'morning' | 'evening' | 'none', instant: string, cal?: SchoolCalendar) => schoolBagDecision(phase, instant, cal, MORNING).due;

describe('classifySchoolCalendar — which days an event covers', () => {
    it('a 3-day all-day break (Mon–Wed, Google end = Thu 00:00) covers Mon, Tue and Wed, not Thu', () => {
        expect(noSchool([allDay('Winter Break', 2026, 9, 28, 3)])).toEqual(['2026-09-28', '2026-09-29', '2026-09-30']);
    });

    it('a statutory holiday (T00:00:00 to T23:59:59) covers its own day only', () => {
        expect(noSchool([stat('2026-09-30', 'National Day for Truth and Reconciliation')])).toEqual(['2026-09-30']);
    });

    it('an event that began before the range still covers the days inside it', () => {
        expect(noSchool([allDay('Spring Break', 2026, 9, 21, 8)])).toEqual(['2026-09-27', '2026-09-28']);
    });

    it('ignores days after the end of the range', () => {
        expect(noSchool([allDay('Pro-D Day', 2026, 10, 13)])).toEqual([]);
    });

    it('accepts start/end as strings as well as Date objects (whatever crosses IPC)', () => {
        const asStrings = { id: 'x', title: 'Pro-D Day', allDay: true, start: iso(2026, 9, 29), end: iso(2026, 9, 30) };
        const asLocalText = { id: 'y', title: 'No School', allDay: true, start: '2026-10-02T00:00:00', end: '2026-10-03T00:00:00' };
        expect(noSchool([asStrings, asLocalText])).toEqual(['2026-09-29', '2026-10-02']);
    });

    it('returns the range it was asked for, each date once, in order — a statutory name beats a keyword label', () => {
        const cal = classifySchoolCalendar(
            [allDay('Pro-D Day', 2026, 9, 30), stat('2026-09-30', 'Truth and Reconciliation'), allDay('No school', 2026, 9, 28)],
            FROM,
            TO,
        );
        expect(cal).toEqual({
            from: FROM,
            to: TO,
            noSchool: [
                { date: '2026-09-28', reason: 'no school' },
                { date: '2026-09-30', reason: 'Truth and Reconciliation' },
            ],
        });
    });

    it('skips malformed entries without throwing', () => {
        const junk: unknown[] = [
            null,
            'Pro-D Day',
            42,
            {},
            { title: 'Pro-D Day', allDay: true, start: 'not a date', end: 'nope' },
            { title: 7, allDay: true, start: local(2026, 9, 29), end: local(2026, 9, 30) },
        ];
        expect(() => noSchool(junk)).not.toThrow();
        expect(noSchool(junk)).toEqual([]);
    });
});

describe('classifySchoolCalendar — which events mean no school, and the reason the log shows', () => {
    it.each([
        ['Pro-D Day', 'Pro-D day'],
        ['Pro D day', 'Pro-D day'],
        ['ProD Day', 'Pro-D day'],
        ['PRO-D', 'Pro-D day'],
        ['Professional Development Day', 'Pro-D day'],
        ['No School', 'no school'],
        ['School Closed', 'school closed'],
        ['Schools closed (storm)', 'school closed'],
        ['Non-Instructional Day', 'non-instructional day'],
        ['Non instructional day', 'non-instructional day'],
        ['Spring Break', 'school break'],
        ['Winter Break', 'school break'],
        ['Summer Vacation', 'school break'],
        ['Christmas Holidays', 'school break'],
        ['Mid-Winter Break', 'school break'],
        ['winter holiday', 'school break'],
    ])('an all-day "%s" is a no-school day, logged as "%s"', (title, reason) => {
        expect(classify([allDay(title, 2026, 9, 29)])).toEqual([{ date: '2026-09-29', reason }]);
    });

    // PR 179 review: real family-calendar titles, both directions.
    it.each([
        ['Pro–D Day', 'Pro-D day'], // en dash U+2013
        ['Pro‑D Day', 'Pro-D day'], // non-breaking hyphen U+2011
        ['Pro—D Day', 'Pro-D day'], // em dash U+2014
        ['Pro D', 'Pro-D day'],
        ['School Closure', 'school closed'],
        ['Schools Closed', 'school closed'],
        ['Winter  Break', 'school break'], // two spaces
        ['Winter Vacation', 'school break'],
        ['Summer Holidays', 'school break'],
    ])('also a no-school day: "%s" → "%s"', (title, reason) => {
        expect(classify([allDay(title, 2026, 9, 29)])).toEqual([{ date: '2026-09-29', reason }]);
    });

    it.each([
        // "prod" is not Pro-D: a separator or a following "day" is required.
        'Prod release',
        'Deploy to prod',
        'School prod',
        // Announcements ABOUT a break or a closure, on a day that has school.
        'Schools reopen after Spring Break',
        'Classes resume after Spring Break',
        'Last day of classes before Winter Break',
        'Last Day of Classes before Winter Vacation',
        'Winter Break starts after school',
        'Spring Break camp registration due',
        'Summer holidays begin at noon',
        'Christmas Holiday Concert',
        'Christmas holidays craft fair',
        'No school bus today',
        'Early dismissal - no school in the afternoon',
        'Report cards go home (no school Friday)',
    ])('an all-day "%s" is NOT a no-school day', (title) => {
        expect(noSchool([allDay(title, 2026, 9, 29)])).toEqual([]);
    });

    it('the reason is the canonical label, never the event\'s own title (the log reaches the phone)', () => {
        const [day] = classify([allDay("Pro-D Day — Mrs Smith's class, bring lunch", 2026, 9, 29)]);
        expect(day.reason).toBe('Pro-D day');
    });

    it('a statutory holiday is logged by its public name, stripped of control characters and cut to 40 characters', () => {
        const [day] = classify([stat('2026-09-30', `Truth\u0007 and\nReconciliation ${'x'.repeat(60)}`)]);
        expect(day.reason).not.toMatch(/\p{Cc}/u);
        expect(day.reason.length).toBeLessThanOrEqual(40);
        expect(day.reason.startsWith('Truth and Reconciliation')).toBe(true);
    });

    it('also strips invisible formatting characters — the name reaches the phone and the audit trail', () => {
        // U+202E flips how the rest of the line displays; U+200B is zero-width.
        const [day] = classify([stat('2026-09-30', 'Truth‮ and​Reconciliation')]);
        expect(day.reason).not.toMatch(/\p{Cf}/u);
        expect(day.reason).toBe('Truth and Reconciliation');
    });

    it.each([
        ['Dentist', {}],
        ['Soccer practice', {}],
        ['Product demo', {}],
        // electron/api.ts flags ANY transparent all-day event `isHoliday` —
        // birthdays too — so that flag must never mean "no school".
        ["Mom's birthday", { isHoliday: true }],
        // A Google holiday-calendar observance: flagged, but school is open.
        ['Halloween', { isHoliday: true }],
        ["Mother's Day", { isHoliday: true }],
    ])('an all-day "%s" is NOT a no-school day', (title, extra) => {
        expect(noSchool([allDay(title, 2026, 9, 29, 1, extra)])).toEqual([]);
    });

    it('a TIMED event never counts, even when its title matches ("Pro-D planning meeting" 15:00)', () => {
        const meeting = {
            id: 'm',
            title: 'Pro-D planning meeting',
            allDay: false,
            start: local(2026, 9, 29, 15),
            end: local(2026, 9, 29, 16),
        };
        expect(noSchool([meeting])).toEqual([]);
    });

    it('a statutory holiday counts whatever its title', () => {
        expect(classify([stat('2026-10-12', 'Thanksgiving')])).toEqual([{ date: '2026-10-12', reason: 'Thanksgiving' }]);
    });
});

describe('NO_SCHOOL_KEYWORDS (structural)', () => {
    it('every pattern is case-insensitive and stateless (no g/y flag, which makes .test() skip matches)', () => {
        expect(NO_SCHOOL_KEYWORDS.length).toBeGreaterThan(0);
        for (const pattern of [...NO_SCHOOL_KEYWORDS.map(k => k.pattern), NOT_A_CLOSURE]) {
            expect(pattern.flags, String(pattern)).toContain('i');
            expect(pattern.flags, String(pattern)).not.toMatch(/[gy]/);
        }
    });

    it('every label is one of the canonical, title-free reasons', () => {
        const canonical = ['Pro-D day', 'no school', 'school closed', 'non-instructional day', 'school break'];
        for (const { label } of NO_SCHOOL_KEYWORDS) expect(canonical).toContain(label);
    });
});

describe('isSchoolDay', () => {
    const cal: SchoolCalendar = { from: FROM, to: TO, noSchool: [{ date: '2026-09-29', reason: 'Pro-D day' }] };

    it('with no calendar: Monday to Friday are school days, the weekend is not', () => {
        expect(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'].map(d => isSchoolDay(d))).toEqual([true, true, true, true, true]);
        expect(isSchoolDay('2026-10-03')).toBe(false);
        expect(isSchoolDay('2026-09-27')).toBe(false);
    });

    it('a listed date inside the range is not a school day; an unlisted weekday is', () => {
        expect(isSchoolDay('2026-09-29', cal)).toBe(false);
        expect(isSchoolDay('2026-09-28', cal)).toBe(true);
    });

    it('a weekend is never a school day, even inside the range and unlisted', () => {
        expect(isSchoolDay('2026-10-03', cal)).toBe(false);
    });

    it('a date outside the stored range falls back to Monday to Friday', () => {
        const stale: SchoolCalendar = { from: '2026-09-01', to: '2026-09-15', noSchool: [] };
        expect(isSchoolDay('2026-09-29', stale)).toBe(true);
        expect(isSchoolDay('2026-10-03', stale)).toBe(false);
    });
});

describe('schoolBagDecision — whether the bag is on the list', () => {
    it('morning: packs on a school day, not on the weekend', () => {
        expect(due('morning', iso(2026, 9, 28, 6))).toBe(true); // Monday
        expect(due('morning', iso(2026, 10, 3, 6))).toBe(false); // Saturday
        expect(due('morning', iso(2026, 9, 27, 6))).toBe(false); // Sunday
    });

    it('evening: packs the night BEFORE a school day', () => {
        expect(due('evening', iso(2026, 9, 27, 19))).toBe(true); // Sunday → Monday
        expect(due('evening', iso(2026, 9, 29, 19))).toBe(true); // Tuesday → Wednesday
        expect(due('evening', iso(2026, 10, 2, 19))).toBe(false); // Friday → Saturday
        expect(due('evening', iso(2026, 10, 3, 19))).toBe(false); // Saturday → Sunday
    });

    it('a Pro-D day removes it from that morning and from the evening before', () => {
        const cal = classifySchoolCalendar([allDay('Pro-D Day', 2026, 9, 29)], FROM, TO);
        expect(due('morning', iso(2026, 9, 29, 6), cal)).toBe(false);
        expect(due('evening', iso(2026, 9, 28, 19), cal)).toBe(false);
        expect(due('evening', iso(2026, 9, 29, 19), cal)).toBe(true);
    });

    it('an evening started before midnight packs for the next calendar day', () => {
        expect(due('evening', iso(2026, 9, 27, 23, 59))).toBe(true); // Sun 23:59 → Monday
        expect(due('evening', iso(2026, 10, 2, 23, 59))).toBe(false); // Fri 23:59 → Saturday
    });

    it('an evening started after midnight but before the morning start packs for THAT day — the night before it', () => {
        // Owner's rule: the bag is packed the night before. Fri 00:20 is still
        // Thursday night, so it packs for Friday, not for Saturday.
        expect(due('evening', iso(2026, 10, 2, 0, 20))).toBe(true); // Fri 00:20 → Friday
        expect(due('evening', iso(2026, 10, 3, 0, 20))).toBe(false); // Sat 00:20 → Saturday
        expect(due('evening', iso(2026, 9, 28, 0, 20))).toBe(true); // Mon 00:20 → Monday
    });

    it('the boundary is the morning mission\'s start time: just before it is still "tonight", at it is tomorrow', () => {
        expect(due('evening', iso(2026, 10, 2, 5, 59))).toBe(true); // Fri 05:59 → Friday
        expect(due('evening', iso(2026, 10, 2, 6, 0))).toBe(false); // Fri 06:00 → Saturday
        // It is the configured time, not a fixed 06:00.
        expect(schoolBagDecision('evening', iso(2026, 10, 2, 6, 30), undefined, '07:00').due).toBe(true);
        expect(schoolBagDecision('evening', iso(2026, 10, 2, 5, 30), undefined, '05:00').due).toBe(false);
    });

    it.each(['', '25:99', 'soon', '6'])('a morning start it cannot read (%j) keeps the plain rule: the next calendar day', (morningStartsAt) => {
        expect(schoolBagDecision('evening', iso(2026, 10, 2, 0, 20), undefined, morningStartsAt).due).toBe(false); // Fri → Saturday
    });

    // 2026-03-08 is the spring-forward Sunday in North America, so Saturday
    // night is 23 hours long there. Where the running zone has no change that
    // night the case would prove nothing, so it only runs where it can fail
    // (TZ cannot be pinned through the environment on this Windows Node).
    const springForward = local(2026, 3, 7, 12).getTimezoneOffset() !== local(2026, 3, 8, 12).getTimezoneOffset();
    it.runIf(springForward)('adds a calendar day, not 24 hours (Sat 23:30 + 24 h is Monday 00:30)', () => {
        expect(due('evening', iso(2026, 3, 7, 23, 30))).toBe(false); // Sat → Sunday
    });

    it('never for phase none, or an instant it cannot read', () => {
        expect(due('none', iso(2026, 9, 28, 6))).toBe(false);
        expect(due('morning', 'garbage')).toBe(false);
    });
});

describe('schoolBagDecision + schoolBagLogNote — the reason the log shows', () => {
    const note = (phase: 'morning' | 'evening', instant: string, cal?: SchoolCalendar) =>
        schoolBagLogNote(schoolBagDecision(phase, instant, cal, MORNING));
    const read = classifySchoolCalendar(
        [allDay('Pro-D Day', 2026, 9, 29), stat('2026-10-12', 'Thanksgiving')],
        FROM,
        TO,
    );

    it('a school day the calendar was read for: just the bag', () => {
        expect(note('morning', iso(2026, 9, 28, 6), read)).toBe(' · 🎒 School Bag');
    });

    it('a weekday with no calendar data says so', () => {
        expect(note('morning', iso(2026, 9, 28, 6))).toBe(' · 🎒 School Bag (weekday; calendar not read)');
        expect(note('morning', iso(2026, 10, 14, 6), read)).toBe(' · 🎒 School Bag (weekday; calendar not read)');
    });

    it('the weekend names the day it is about', () => {
        expect(note('evening', iso(2026, 10, 2, 19), read)).toBe(' · no School Bag (tomorrow is Saturday)');
        expect(note('morning', iso(2026, 9, 27, 6), read)).toBe(' · no School Bag (today is Sunday)');
        expect(note('evening', iso(2026, 10, 3, 0, 20), read)).toBe(' · no School Bag (today is Saturday)'); // after midnight
    });

    it('a no-school date gives its reason', () => {
        expect(note('morning', iso(2026, 9, 29, 6), read)).toBe(' · no School Bag (Pro-D day)');
        expect(note('evening', iso(2026, 10, 11, 19), read)).toBe(' · no School Bag (Thanksgiving)');
    });
});

describe('schoolCalendarWindow', () => {
    it('covers today through today + 15, fetched from local midnight to the midnight after the last day', () => {
        expect(schoolCalendarWindow(local(2026, 9, 27, 14, 30))).toEqual({
            from: '2026-09-27',
            to: '2026-10-12',
            timeMin: iso(2026, 9, 27),
            timeMax: iso(2026, 10, 13),
        });
    });
});

describe('sanitizeSchoolCalendar', () => {
    it('keeps a valid calendar, its dates sorted, once each, inside the range', () => {
        expect(sanitizeSchoolCalendar({
            from: FROM,
            to: TO,
            noSchool: [
                { date: '2026-09-30', reason: 'Pro-D day' },
                { date: '2026-09-28', reason: 'no school' },
                { date: '2026-09-30', reason: 'duplicate' },
                { date: '2026-12-25', reason: 'out of range' },
                { date: 'soon', reason: 'x' },
                '2026-09-29',
                7,
            ],
        })).toEqual({
            from: FROM,
            to: TO,
            noSchool: [{ date: '2026-09-28', reason: 'no school' }, { date: '2026-09-30', reason: 'Pro-D day' }],
        });
    });

    it('cleans a stored reason the same way the classifier does, and never leaves it empty', () => {
        const cal = sanitizeSchoolCalendar({
            from: FROM,
            to: TO,
            noSchool: [
                { date: '2026-09-28', reason: `bad\u0000reason ${'y'.repeat(80)}` },
                { date: '2026-09-29', reason: '\u0001\u0002' },
                { date: '2026-09-30', reason: 42 },
            ],
        });
        expect(cal?.noSchool.map(d => d.reason.length <= 40 && !/\p{Cc}/u.test(d.reason))).toEqual([true, true, true]);
        expect(cal?.noSchool.slice(1).map(d => d.reason)).toEqual(['no school', 'no school']);
    });

    it.each<[string, unknown]>([
        ['null', null],
        ['undefined', undefined],
        ['a string', '2026-09-27'],
        ['an array', [FROM, TO]],
        ['a missing range', { noSchool: [] }],
        ['a range that is not a date', { from: 'monday', to: TO, noSchool: [] }],
        ['a range that runs backwards', { from: TO, to: FROM, noSchool: [] }],
        ['days that are not a list', { from: FROM, to: TO, noSchool: '2026-09-29' }],
        ['the old string-list shape', { from: FROM, to: TO, noSchoolDates: ['2026-09-29'] }],
    ])('turns %s into "no calendar data"', (_label, value) => {
        expect(sanitizeSchoolCalendar(value)).toBeUndefined();
    });
});

describe('sameSchoolCalendar', () => {
    const a: SchoolCalendar = { from: FROM, to: TO, noSchool: [{ date: '2026-09-29', reason: 'Pro-D day' }] };

    it('compares by content, reasons included', () => {
        expect(sameSchoolCalendar(undefined, undefined)).toBe(true);
        expect(sameSchoolCalendar(a, { ...a, noSchool: [{ date: '2026-09-29', reason: 'Pro-D day' }] })).toBe(true);
        expect(sameSchoolCalendar(a, { ...a, noSchool: [{ date: '2026-09-30', reason: 'Pro-D day' }] })).toBe(false);
        expect(sameSchoolCalendar(a, { ...a, noSchool: [{ date: '2026-09-29', reason: 'no school' }] })).toBe(false);
        expect(sameSchoolCalendar(a, { ...a, to: '2026-10-13' })).toBe(false);
        expect(sameSchoolCalendar(a, undefined)).toBe(false);
    });
});
