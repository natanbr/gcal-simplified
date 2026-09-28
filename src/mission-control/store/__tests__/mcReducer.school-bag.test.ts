// ============================================================
// Mission Control — the School Bag task, through the reducer
// ------------------------------------------------------------
// Owner's rule (2026-09-27): "organizing the bag for school" is a task in both
// routines, only on school days — not on holidays or Pro-D days. The morning
// packs for TODAY; the evening packs the night before, for TOMORROW.
//
// It is decided in exactly one place, SET_ACTIVE_MISSION's fresh start, which
// the scheduler, the Settings Start buttons and the phone all go through, so
// the checklist a child sees never changes mid-run. "Now" is the action's own
// instant, never the reducer reading the clock.
// ============================================================

import { describe, it, expect, afterEach, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mcReducer, initialState } from '../mcReducer';
import { classifySchoolCalendar, type SchoolCalendar } from '../schoolDays';
import { createLogEntry } from '../activityLog';
import { REMOTE_ALLOWED_ACTIONS } from '../../hooks/useRemoteControl';
import type { MCAction, MCState, MissionPhase } from '../../types';

// 2026-09-27 is a Sunday. Mon 28, Tue 29, Wed 30, Thu Oct 1, Fri 2, Sat 3.
const local = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);
const allDay = (title: string, d: number, days = 1, extra: Record<string, unknown> = {}) =>
    ({ id: `e-${title}`, title, allDay: true, start: local(2026, 9, d), end: local(2026, 9, d + days), ...extra });

function calendarOf(events: unknown[]): SchoolCalendar {
    return classifySchoolCalendar(events, '2026-09-27', '2026-10-12');
}

function start(phase: MissionPhase, when: Date, schoolCalendar?: SchoolCalendar, from: MCState = initialState): MCState {
    return mcReducer({ ...from, schoolCalendar }, { type: 'SET_ACTIVE_MISSION', phase, timestamp: when.toISOString() });
}

const tasksOf = (s: MCState, phase: MissionPhase) => s.missions.find(m => m.phase === phase)!.tasks;
const hasBag = (s: MCState, phase: MissionPhase) => tasksOf(s, phase).some(t => t.id === 'school-bag');

afterEach(() => {
    vi.useRealTimers();
});

describe('happy path — the bag is on the checklist of a school day', () => {
    it('a school Monday morning has the bag, last, not yet done', () => {
        const tasks = tasksOf(start('morning', local(2026, 9, 28, 6)), 'morning');
        expect(tasks.at(-1)).toMatchObject({ id: 'school-bag', label: 'School Bag', icon: '🎒', completed: false, locked: false });
    });

    it('a Sunday evening has it (Monday is a school day), immediately before Bed', () => {
        const ids = tasksOf(start('evening', local(2026, 9, 27, 19)), 'evening').map(t => t.id);
        expect(ids.slice(-2)).toEqual(['school-bag', 'bed']);
    });

    it('a Tuesday evening has it', () => {
        expect(hasBag(start('evening', local(2026, 9, 29, 19)), 'evening')).toBe(true);
    });

    it('lives alongside the Cream task in the evening, before Bed', () => {
        const withCream = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { creamTaskEnabled: true, creamTaskDaysTarget: 3 } });
        const ids = tasksOf(start('evening', local(2026, 9, 27, 19), undefined, withCream), 'evening').map(t => t.id);
        expect(ids).toContain('cream');
        expect(ids.indexOf('school-bag')).toBe(ids.indexOf('bed') - 1);
    });

    // One order in both phases: Cream, then the School Bag (last in the morning, right before Bed in the evening).
    it('Cream enabled while the bag is on the list lands BEFORE the bag, in both phases', () => {
        let state = start('morning', local(2026, 9, 28, 6));
        state = mcReducer(state, { type: 'CANCEL_MISSION', missionPhase: 'morning', timestamp: local(2026, 9, 28, 6, 5).toISOString() });
        state = start('evening', local(2026, 9, 28, 19), undefined, state);
        state = mcReducer(state, { type: 'SET_SETTINGS', settings: { creamTaskEnabled: true, creamTaskDaysTarget: 3, creamTaskSchedule: 'both' } });
        expect(tasksOf(state, 'morning').map(t => t.id).slice(-2)).toEqual(['cream', 'school-bag']);
        expect(tasksOf(state, 'evening').map(t => t.id).slice(-3)).toEqual(['cream', 'school-bag', 'bed']);
    });

    it('a fresh start puts a bag carried from an earlier run back in its place', () => {
        const [a, b, c, d, bed] = tasksOf(initialState, 'evening');
        const bag = { id: 'school-bag', label: 'School Bag', icon: '🎒', completed: false, locksAt: null, locked: false };
        const cream = { id: 'cream', label: 'Cream (3d left)', icon: 'Droplet', completed: false, locksAt: null, locked: false };
        const carried: MCState = {
            ...initialState,
            settings: { ...initialState.settings, creamTaskEnabled: true },
            creamTaskDaysLeft: 3,
            missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, tasks: [a, b, c, d, bag, cream, bed] } : m)),
        };
        expect(tasksOf(start('evening', local(2026, 9, 27, 19), undefined, carried), 'evening').map(t => t.id).slice(-3))
            .toEqual(['cream', 'school-bag', 'bed']);
    });
});

describe('negative — no bag when there is no school', () => {
    it('not on a Saturday morning, nor a Friday evening', () => {
        expect(hasBag(start('morning', local(2026, 10, 3, 6)), 'morning')).toBe(false);
        expect(hasBag(start('evening', local(2026, 10, 2, 19)), 'evening')).toBe(false);
    });

    it('a Pro-D day removes it from that morning AND from the evening before', () => {
        const cal = calendarOf([allDay('Pro-D Day', 29)]);
        expect(hasBag(start('morning', local(2026, 9, 29, 6), cal), 'morning')).toBe(false);
        expect(hasBag(start('evening', local(2026, 9, 28, 19), cal), 'evening')).toBe(false);
        // ...and only those: the next morning is a school day again.
        expect(hasBag(start('morning', local(2026, 9, 30, 6), cal), 'morning')).toBe(true);
    });

    it('a statutory holiday removes it', () => {
        const cal = calendarOf([{
            id: 'holiday-2026-09-30-Truth and Reconciliation',
            title: 'National Day for Truth and Reconciliation',
            allDay: true,
            start: new Date('2026-09-30T00:00:00'),
            end: new Date('2026-09-30T23:59:59'),
        }]);
        expect(hasBag(start('morning', local(2026, 9, 30, 6), cal), 'morning')).toBe(false);
        expect(hasBag(start('evening', local(2026, 9, 29, 19), cal), 'evening')).toBe(false);
    });

    it('a 3-day Winter Break removes it on every covered day, and it is back after', () => {
        const cal = calendarOf([allDay('Winter Break', 28, 3)]); // Mon–Wed
        for (const d of [28, 29, 30]) expect(hasBag(start('morning', local(2026, 9, d, 6), cal), 'morning')).toBe(false);
        expect(hasBag(start('evening', local(2026, 9, 27, 19), cal), 'evening')).toBe(false); // Sun → Mon
        expect(hasBag(start('evening', local(2026, 9, 30, 19), cal), 'evening')).toBe(true); // Wed → Thu
    });

    it.each([
        ['a birthday (flagged isHoliday by api.ts)', allDay("Mom's birthday", 29, 1, { isHoliday: true })],
        ['Halloween (a holiday-calendar observance)', allDay('Halloween', 29, 1, { isHoliday: true })],
        ['a timed "Pro-D planning meeting" at 15:00', { id: 'm', title: 'Pro-D planning meeting', allDay: false, start: local(2026, 9, 29, 15), end: local(2026, 9, 29, 16) }],
    ])('%s does NOT remove it', (_label, event) => {
        expect(hasBag(start('morning', local(2026, 9, 29, 6), calendarOf([event])), 'morning')).toBe(true);
    });

    it('calendar not connected: plain Monday to Friday', () => {
        expect(hasBag(start('morning', local(2026, 9, 29, 6), undefined), 'morning')).toBe(true);
        expect(hasBag(start('morning', local(2026, 9, 27, 6), undefined), 'morning')).toBe(false);
    });

    it('a date outside the stored range: plain Monday to Friday', () => {
        const stale: SchoolCalendar = { from: '2026-09-01', to: '2026-09-15', noSchool: [] };
        expect(hasBag(start('morning', local(2026, 10, 5, 6), stale), 'morning')).toBe(true); // Monday
        expect(hasBag(start('morning', local(2026, 10, 3, 6), stale), 'morning')).toBe(false); // Saturday
    });

    it('a bag left over from Friday\'s run is removed on Saturday\'s fresh start', () => {
        const friday = mcReducer(start('morning', local(2026, 10, 2, 6)), { type: 'CANCEL_MISSION', missionPhase: 'morning', timestamp: local(2026, 10, 2, 6, 5).toISOString() });
        expect(hasBag(friday, 'morning')).toBe(true);
        expect(hasBag(start('morning', local(2026, 10, 3, 6), undefined, friday), 'morning')).toBe(false);
    });
});

describe('SET_SCHOOL_CALENDAR', () => {
    const cal: SchoolCalendar = { from: '2026-09-27', to: '2026-10-12', noSchool: [{ date: '2026-09-29', reason: 'Pro-D day' }] };
    const set = (calendar: SchoolCalendar | null): MCAction => ({ type: 'SET_SCHOOL_CALENDAR', calendar, origin: 'system' });

    it('stores the calendar; null (not connected) clears it', () => {
        const stored = mcReducer(initialState, set(cal));
        expect(stored.schoolCalendar).toEqual(cal);
        expect(mcReducer(stored, set(null)).schoolCalendar).toBeUndefined();
    });

    it('returns the SAME state reference when the data did not change (the persist effect bails out)', () => {
        const stored = mcReducer(initialState, set(cal));
        expect(mcReducer(stored, set({ ...cal, noSchool: cal.noSchool.map(d => ({ ...d })) }))).toBe(stored);
        expect(mcReducer(initialState, set(null))).toBe(initialState);
    });

    it('stores only what it sanitised: a reason is cleaned, a malformed payload means "not connected"', () => {
        const dirty = { ...cal, noSchool: [{ date: '2026-09-29', reason: `x\u0000y${'z'.repeat(80)}` }, { date: 'soon', reason: 'r' }] };
        const stored = mcReducer(initialState, set(dirty)).schoolCalendar;
        expect(stored?.noSchool).toHaveLength(1);
        expect(stored?.noSchool[0].reason).not.toMatch(/\p{Cc}/u);
        expect(stored?.noSchool[0].reason.length).toBeLessThanOrEqual(40);
        const garbage: SchoolCalendar = JSON.parse('{"from":"monday"}'); // what a stale or tampered dispatcher could send
        expect(mcReducer({ ...initialState, schoolCalendar: cal }, set(garbage)).schoolCalendar).toBeUndefined();
    });

    it('writes no activity-log line', () => {
        expect(createLogEntry({ ...set(cal), timestamp: new Date().toISOString() }, initialState)).toBeNull();
    });

    it('is not an action the phone remote may send', () => {
        expect(REMOTE_ALLOWED_ACTIONS.has('SET_SCHOOL_CALENDAR')).toBe(false);
    });

    it('does not change the checklist of a mission already running', () => {
        const running = start('morning', local(2026, 9, 29, 6));
        expect(hasBag(running, 'morning')).toBe(true);
        const proDToday = mcReducer(running, set(cal));
        expect(hasBag(proDToday, 'morning')).toBe(true);
        // A restart of the clock is not a fresh start either.
        const reset = mcReducer(proDToday, { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning', timestamp: local(2026, 9, 29, 6, 10).toISOString() });
        expect(hasBag(reset, 'morning')).toBe(true);
    });
});

describe('the mission-start log line says why the bag is, or is not, on the list', () => {
    const startLine = (phase: MissionPhase, when: Date, schoolCalendar?: SchoolCalendar, from: MCState = initialState) =>
        createLogEntry({ type: 'SET_ACTIVE_MISSION', phase, timestamp: when.toISOString() }, { ...from, schoolCalendar })?.message;
    const read = calendarOf([
        allDay('Pro-D Day', 29),
        { id: 'holiday-2026-10-12-Thanksgiving', title: 'Thanksgiving', allDay: true, start: new Date('2026-10-12T00:00:00'), end: new Date('2026-10-12T23:59:59') },
    ]);

    it('keeps the "<phase> mission started" prefix, then the bag', () => {
        expect(startLine('morning', local(2026, 9, 28, 6), read)).toBe('morning mission started · 🎒 School Bag');
    });

    it('says when the calendar was not read for that day', () => {
        expect(startLine('morning', local(2026, 9, 28, 6))).toBe('morning mission started · 🎒 School Bag (weekday; calendar not read)');
    });

    it('names the weekend, a Pro-D day and a statutory holiday', () => {
        expect(startLine('evening', local(2026, 10, 2, 19), read)).toBe('evening mission started · no School Bag (tomorrow is Saturday)');
        expect(startLine('morning', local(2026, 9, 29, 6), read)).toBe('morning mission started · no School Bag (Pro-D day)');
        expect(startLine('evening', local(2026, 10, 11, 19), read)).toBe('evening mission started · no School Bag (Thanksgiving)');
    });

    it('never carries the event\'s own title to the log (it rides the broadcast to the phone)', () => {
        const cal = calendarOf([allDay("Pro-D Day (Mrs Smith's class)", 29)]);
        expect(startLine('morning', local(2026, 9, 29, 6), cal)).not.toMatch(/Smith/);
    });

    it('the log and the reducer cannot disagree: 🎒 in the line exactly when the bag is on the list', () => {
        const cases: Array<[MissionPhase, Date, SchoolCalendar | undefined]> = [];
        for (let d = 26; d <= 31; d++) {
            for (const cal of [undefined, read]) {
                cases.push(
                    ['morning', new Date(2026, 8, d, 6), cal],
                    ['evening', new Date(2026, 8, d, 19), cal],
                    ['evening', new Date(2026, 8, d, 0, 20), cal], // after midnight
                    ['evening', new Date(2026, 8, d, 5, 30), cal], // between 05:00 and 06:00: the setting decides
                );
            }
        }
        const earlyMornings = { ...initialState, settings: { ...initialState.settings, morningStartsAt: '05:00' } };
        for (const from of [initialState, earlyMornings]) {
            for (const [phase, when, cal] of cases) {
                const logged = startLine(phase, when, cal, from)?.includes('· 🎒 School Bag') ?? false;
                expect(logged, `${phase} ${when.toString()} from ${from.settings.morningStartsAt}`).toBe(hasBag(start(phase, when, cal, from), phase));
            }
        }
    });

    it('writes no "mission started" line when another mission is running (the reducer refuses the start)', () => {
        const running = start('morning', local(2026, 9, 28, 6));
        const retrigger: MCAction = { type: 'SET_ACTIVE_MISSION', phase: 'evening', timestamp: local(2026, 9, 28, 6, 10).toISOString() };
        const refused = mcReducer(running, retrigger);
        expect(refused.activeMission).toBe('morning');
        expect(refused.missions.find(m => m.phase === 'evening')?.active).toBe(false);
        expect(createLogEntry(retrigger, running)).toBeNull();
        expect(createLogEntry({ ...retrigger, phase: 'morning' }, running)).toBeNull();
    });
});

describe('lifecycle — the decision uses the action instant, not the wall clock', () => {
    it('an evening started just before midnight packs for the day after the ACTION, whatever the clock says', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(local(2026, 9, 27, 20)); // the clock says Sunday evening (→ Monday: bag)
        expect(hasBag(start('evening', local(2026, 10, 2, 23, 59)), 'evening')).toBe(false); // Fri 23:59 → Saturday
        vi.setSystemTime(local(2026, 10, 2, 20)); // the clock says Friday evening (→ Saturday: no bag)
        expect(hasBag(start('evening', local(2026, 9, 27, 23, 59)), 'evening')).toBe(true); // Sun 23:59 → Monday
    });

    it('an evening started after midnight, before the morning start, packs for THAT day (still the night before it)', () => {
        expect(hasBag(start('evening', new Date(2026, 8, 28, 0, 0, 30)), 'evening')).toBe(true); // Mon 00:00:30 → Monday
        expect(hasBag(start('evening', new Date(2026, 8, 27, 0, 0, 30)), 'evening')).toBe(false); // Sun 00:00:30 → Sunday
        expect(hasBag(start('evening', new Date(2026, 9, 2, 0, 20)), 'evening')).toBe(true); // Fri 00:20 → Friday
    });

    it('the boundary is the morning start time from Settings, read from the state', () => {
        const earlyMornings = { ...initialState, settings: { ...initialState.settings, morningStartsAt: '05:00' } };
        expect(hasBag(start('evening', new Date(2026, 9, 2, 5, 30)), 'evening')).toBe(true); // before 06:00 → Friday
        expect(hasBag(start('evening', new Date(2026, 9, 2, 5, 30), undefined, earlyMornings), 'evening')).toBe(false); // after 05:00 → Saturday
    });
});

describe('structural — decided in one place', () => {
    // Walked here rather than through src/__tests__/helpers: the isolation
    // guard forbids mission-control files, tests included, importing from there.
    const mcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
    function productionFiles(dir: string): string[] {
        return readdirSync(dir).flatMap(entry => {
            const full = join(dir, entry);
            if (statSync(full).isDirectory()) return productionFiles(full);
            return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [full] : [];
        });
    }

    it('only mcReducer.ts calls withSchoolBag, once, inside the SET_ACTIVE_MISSION case', () => {
        // Every file, routineTasks.ts included: only its `function withSchoolBag(`
        // definition is not a call. (Skipping that file let a call hidden in
        // syncCreamTask, which runs after every mission change, stay green.)
        const callers = productionFiles(mcRoot)
            .map(file => ({ file: relative(mcRoot, file).split(sep).join('/'), calls: (readFileSync(file, 'utf-8').match(/(?<!function\s+)\bwithSchoolBag\(/g) ?? []).length }))
            .filter(({ calls }) => calls > 0);
        expect(callers).toEqual([{ file: 'store/mcReducer.ts', calls: 1 }]);
        const reducer = readFileSync(join(mcRoot, 'store', 'mcReducer.ts'), 'utf-8');
        // Exactly the SET_ACTIVE_MISSION case: from its label to the next `case '` label.
        const start = reducer.indexOf("case 'SET_ACTIVE_MISSION'");
        const next = reducer.slice(start + 1).search(/\n\s*case '/);
        expect(start).toBeGreaterThan(-1);
        expect(next).toBeGreaterThan(-1);
        expect(reducer.slice(start, start + 1 + next)).toMatch(/withSchoolBag\(/);
    });
});
