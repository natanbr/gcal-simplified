// ============================================================
// savedIntoWindows — the windows a Settings save put under the clock, each by
// its start (stampMissionActivity, missionActivity.ts), read by the scheduler
// (occurrenceHandled.ts). Through the real reducer, with the action's
// timestamp, as the app dispatches it. Scheduler-level cases:
// hooks/useMissionScheduler.no-start-on-demand*.test.tsx.
// ============================================================

import { describe, it, expect } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { stampMissionActivity } from './missionActivity';
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

    it('once per window: opened again later, its entry takes the later save', () => {
        const closed = saveAt(stamped, { morningDurationMins: 5 }, nov(10, 7, 10));
        expect(windowsOf(saveAt(closed, { morningDurationMins: 30 }, nov(10, 7, 20)), 'morning'))
            .toEqual([{ savedAt: iso(nov(10, 7, 20)), windowStart: iso(nov(10, 6, 59)) }]);
    });

    it('until it is four days older than a new entry, when no look-back can reach it', () => {
        const within = saveAt(stamped, { morningStartsAt: '06:58' }, nov(14, 6, 59));
        expect(windowsOf(within, 'morning'), 'four days to the minute').toHaveLength(2);
        const beyond = saveAt(stamped, { morningStartsAt: '06:58' }, nov(14, 7, 0));
        expect(windowsOf(beyond, 'morning')).toEqual([{ savedAt: iso(nov(14, 7, 0)), windowStart: iso(nov(14, 6, 58)) }]);
    });
});
