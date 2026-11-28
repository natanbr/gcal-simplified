// ============================================================
// savedIntoWindows — the windows a Settings save put under the clock, each by
// its start (stampMissionActivity, missionActivity.ts), read by the scheduler
// (occurrenceHandled.ts). Through the real reducer, with the action's
// timestamp, as the app dispatches it. Scheduler-level cases:
// hooks/useMissionScheduler.no-start-on-demand*.test.tsx and
// hooks/useMissionScheduler.saved-window-kept.test.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { stampMissionActivity } from './missionActivity';
import { occurrenceHandled } from './occurrenceHandled';
import type { MCSettings, MCState, MissionPhase } from '../types';

const nov = (day: number, h: number, m: number, s = 0, ms = 0) => new Date(2026, 10, day, h, m, s, ms);
const iso = (d: Date) => d.toISOString();

/** Settings → Save with `settings`, dispatched at `when`. */
const saveAt = (s: MCState, settings: Partial<MCSettings>, when: Date): MCState =>
    mcReducer(s, { type: 'SET_SETTINGS', settings, timestamp: when.toISOString() });

const windowsOf = (s: MCState, phase: MissionPhase) => s.missions.find(m => m.phase === phase)?.savedIntoWindows;

describe('a save that puts a window under the clock records that window by its start', () => {
    it.each<[string, Partial<MCSettings>, Date, Date]>([
        ['a start time a minute in the past (06:00 → 06:59 at 07:00)', { morningStartsAt: '06:59' }, nov(10, 7, 0), nov(10, 6, 59)],
        ['a start time at the very instant of the save (the tie)', { morningStartsAt: '07:00' }, nov(10, 7, 0), nov(10, 7, 0)],
        ['a longer duration that reopens a closed window (30 → 90 min at 07:00)', { morningDurationMins: 90 }, nov(10, 7, 0), nov(10, 6, 0)],
        ['past midnight, onto last night\'s window (evening 19:00 → 23:30 at 00:10)', { eveningStartsAt: '23:30' }, nov(11, 0, 10), nov(10, 23, 30)],
        ['a start moved within the open window it was in (06:00 → 06:05 at 06:10): another occurrence', { morningStartsAt: '06:05' }, nov(10, 6, 10), nov(10, 6, 5)],
    ])('%s', (_name, settings, when, windowStart) => {
        const saved = saveAt(initialState, settings, when);
        const phase = 'eveningStartsAt' in settings ? 'evening' : 'morning';
        expect(windowsOf(saved, phase)).toEqual([{ savedAt: iso(when), windowStart: iso(windowStart) }]);
        expect(windowsOf(saved, phase === 'morning' ? 'evening' : 'morning'), 'the other phase').toBeUndefined();
    });
});

describe('savedIntoWindows gains nothing', () => {
    it.each<[string, Partial<MCSettings>, Date]>([
        ['a start still ahead (06:00 → 07:10 at 07:00)', { morningStartsAt: '07:10' }, nov(10, 7, 0)],
        ['a start 1 ms ahead', { morningStartsAt: '07:00' }, nov(10, 6, 59, 59, 999)],
        ['a longer duration for the window already open (30 → 60 min at 06:10)', { morningDurationMins: 60 }, nov(10, 6, 10)],
        ['a shorter duration that closes the open window', { morningDurationMins: 5 }, nov(10, 6, 10)],
        ['a duration that leaves the window closed (30 → 45 min at 07:00)', { morningDurationMins: 45 }, nov(10, 7, 0)],
        ['a save that changes no window (the Cream task)', { creamTaskEnabled: true }, nov(10, 6, 10)],
        ['a refused start time (a cleared field)', { morningStartsAt: '' }, nov(10, 6, 10)],
        ['the same start time', { morningStartsAt: '06:00' }, nov(10, 6, 10)],
    ])('%s', (_name, settings, when) => {
        const saved = saveAt(initialState, settings, when);
        expect(saved.missions.map(m => m.savedIntoWindows)).toEqual([undefined, undefined]);
    });

    it('and the fast path holds: a task tap returns the reducer\'s own state, unstamped', () => {
        const prev = initialState;
        const next: MCState = { ...prev, missions: prev.missions.map(m => (m.phase === 'morning' ? { ...m, tasks: [...m.tasks] } : m)) };
        expect(stampMissionActivity(prev, next, nov(10, 7, 0).toISOString())).toBe(next);
    });
});

describe('a recorded window is kept', () => {
    const stamped = saveAt(initialState, { morningStartsAt: '06:59' }, nov(10, 7, 0));
    const first = { savedAt: iso(nov(10, 7, 0)), windowStart: iso(nov(10, 6, 59)) };

    it('by a later save that moves the start ahead', () => {
        expect(windowsOf(saveAt(stamped, { morningStartsAt: '07:30' }, nov(10, 7, 5)), 'morning')).toEqual([first]);
    });

    it('by a later save that lengthens the window it opened (that window was already open)', () => {
        expect(windowsOf(saveAt(stamped, { morningDurationMins: 45 }, nov(10, 7, 5)), 'morning')).toEqual([first]);
    });

    it('by a later save that shortens it until it closes: the window it opened is where it was', () => {
        expect(windowsOf(saveAt(stamped, { morningDurationMins: 5 }, nov(10, 7, 10)), 'morning')).toEqual([first]);
    });

    it('by a phone start, its stop and a full Reset', () => {
        const at = (h: number, m: number) => nov(10, h, m).toISOString();
        const started = mcReducer(stamped, { type: 'SET_ACTIVE_MISSION', phase: 'morning', origin: 'remote', timestamp: at(7, 1) });
        const reset = mcReducer(started, { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'morning', origin: 'remote', timestamp: at(7, 2) });
        const stopped = mcReducer(reset, { type: 'CANCEL_MISSION', missionPhase: 'morning', origin: 'remote', timestamp: at(7, 3) });
        expect([started, reset, stopped].map(s => windowsOf(s, 'morning'))).toEqual([[first], [first], [first]]);
    });

    it('beside a second window that a later save opens', () => {
        expect(windowsOf(saveAt(stamped, { morningStartsAt: '07:55' }, nov(10, 8, 0)), 'morning'))
            .toEqual([first, { savedAt: iso(nov(10, 8, 0)), windowStart: iso(nov(10, 7, 55)) }]);
    });

    it("beside the next day's window at the same start (the look-back still reaches the first)", () => {
        const nextDay = saveAt(stamped, { morningDurationMins: 60 }, nov(11, 7, 40));
        expect(windowsOf(nextDay, 'morning')).toEqual([first, { savedAt: iso(nov(11, 7, 40)), windowStart: iso(nov(11, 6, 59)) }]);
    });

    it('once per window: opened again later, its entry keeps the earlier save', () => {
        const closed = saveAt(stamped, { morningDurationMins: 5 }, nov(10, 7, 10));
        expect(windowsOf(saveAt(closed, { morningDurationMins: 30 }, nov(10, 7, 20)), 'morning')).toEqual([first]);
    });

    it('opened again under a clock running ahead, the window stays covered once the clock is put right', () => {
        // Covered at 07:00 (06:59 for 30 min, open until 07:29). At a clock reading 07:35 the length goes to 60 min, which
        // opens the same window again. Taking that later save, the entry was in the future at the real 07:10, so ignored.
        const reopened = saveAt(stamped, { morningDurationMins: 60 }, nov(10, 7, 35));
        expect(windowsOf(reopened, 'morning')).toEqual([first]);
        const o = { day: '2026-11-10', startMs: nov(10, 6, 59).getTime(), endMs: nov(10, 7, 59).getTime() };
        expect(occurrenceHandled(reopened, 'morning', o, nov(10, 7, 10).getTime()), 'released while open').toBe(true);
    });

    it('on the four latest days that have one: a window on a fifth day drops the first day\'s', () => {
        // A window opened at 07:00 on each of five days, the start moved between 06:58 and 06:59 every time.
        let s = initialState;
        for (let day = 10; day <= 14; day += 1) s = saveAt(s, { morningStartsAt: day % 2 === 0 ? '06:59' : '06:58' }, nov(day, 7, 0));
        const starts = windowsOf(s, 'morning')?.map(w => w.windowStart);
        expect(starts, 'the four latest days, in order of start').toEqual([11, 12, 13, 14].map(d => iso(nov(d, 6, d % 2 === 0 ? 59 : 58))));
    });

    it('Codex: eight windows covered on the 10th, then a length save that opens the 11th: the 10th stays covered for the look-back', () => {
        // The morning at 15 min. At 07:08 on the 10th the start goes to 07:00, 07:01 … 07:07 and back to 07:00 (eight windows);
        // the 11th's 07:00–07:15 passes unseen, and at 07:30 the length goes to 60 min, which opens it. Kept by count, the
        // ninth window dropped the 10th's 07:00, the one the scheduler's look-back asks about.
        let s = saveAt(initialState, { morningDurationMins: 15 }, nov(10, 6, 40));
        for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 0]) s = saveAt(s, { morningStartsAt: `07:0${m}` }, nov(10, 7, 8));
        expect(windowsOf(s, 'morning'), 'precondition: eight windows covered').toHaveLength(8);
        const lengthened = saveAt(s, { morningDurationMins: 60 }, nov(11, 7, 30));
        const tenth = { day: '2026-11-10', startMs: nov(10, 7, 0).getTime(), endMs: nov(10, 8, 0).getTime() };
        expect(occurrenceHandled(lengthened, 'morning', tenth, nov(11, 7, 31).getTime()), 'the 10th read as missed').toBe(true);
        expect(windowsOf(lengthened, 'morning'), 'the 11th is covered too').toHaveLength(9);
    });

    it('64 at most, the latest to start, and the window a save just opened among them', () => {
        // 70 saves at 13:00 on the 10th move a 90-min morning from 11:50 to 12:59, one minute at a time; then back to 11:50.
        let s = saveAt(initialState, { morningDurationMins: 90 }, nov(10, 6, 40));
        for (let m = 0; m < 70; m += 1) s = saveAt(s, { morningStartsAt: `${11 + Math.floor((50 + m) / 60)}:${String((50 + m) % 60).padStart(2, '0')}` }, nov(10, 13, 0));
        const capped = windowsOf(s, 'morning') ?? [];
        expect(capped, 'a damaged clock or a busy parent cannot grow the list').toHaveLength(64);
        expect(capped[0]?.windowStart, 'the six that start first are dropped').toBe(iso(nov(10, 11, 56)));
        const reopened = windowsOf(saveAt(s, { morningStartsAt: '11:50' }, nov(10, 13, 0)), 'morning') ?? [];
        expect(reopened, 'still 64').toHaveLength(64);
        expect(reopened.slice(0, 2).map(w => w.windowStart), 'the open window kept, the next to start first dropped').toEqual([iso(nov(10, 11, 50)), iso(nov(10, 11, 57))]);
    });

    it('the window a save just opened is kept even on a day before the four already kept', () => {
        // Four saves under a clock running days ahead (the 14th … 17th), then one with the clock put right on the 10th.
        let s = initialState;
        for (let day = 14; day <= 17; day += 1) s = saveAt(s, { morningStartsAt: day % 2 === 0 ? '06:59' : '06:58' }, nov(day, 7, 0));
        const opened = saveAt(s, { morningStartsAt: '06:57' }, nov(10, 7, 0));
        const windows = windowsOf(opened, 'morning') ?? [];
        expect(windows[0], 'the open window, first in order of start').toEqual({ savedAt: iso(nov(10, 7, 0)), windowStart: iso(nov(10, 6, 57)) });
        expect(windows, 'beside the four later days').toHaveLength(5);
    });

    it('a length save made under a clock a week ahead keeps the real window, which stays covered once the clock is put right', () => {
        // Covered at 07:00 on the 10th (06:59 for 30 min). The clock jumps to the 17th at 07:35 and the length goes to 60 min,
        // which opens the 17th's 06:59 window. Kept by age (an earlier build), the 10th's entry fell more than four days behind it
        // and was dropped; kept by day, the two days each keep theirs.
        const fastClock = saveAt(stamped, { morningDurationMins: 60 }, nov(17, 7, 35));
        expect(windowsOf(fastClock, 'morning')).toEqual([first, { savedAt: iso(nov(17, 7, 35)), windowStart: iso(nov(17, 6, 59)) }]);
        const o = { day: '2026-11-10', startMs: nov(10, 6, 59).getTime(), endMs: nov(10, 7, 59).getTime() };
        expect(occurrenceHandled(fastClock, 'morning', o, nov(10, 7, 10).getTime()), 'the clock put right at 07:10: the open window started on demand').toBe(true);
    });
});
