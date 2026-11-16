// ============================================================
// Mission Control — a Settings save never starts a mission on demand, on the
// DST nights
// ------------------------------------------------------------
// The save is stamped when it puts a window under the clock, and that window is
// measured in real time (store/missionOccurrence.ts), as the scheduler measures
// it. A 4 h evening at 23:30 is open until 04:30 on the spring-forward night
// (the wall clock would say 03:30) and until 02:30 on the fall-back night. Both
// DST nights of 2026 in America/Los_Angeles (2026-03-08 02:00 → 03:00,
// 2026-11-01 02:00 → 01:00), as useMissionScheduler.dst.test.tsx does.
// Vitest runs each file in its own process, so the zone does not leak.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { SAVED_LONG_AGO, crossing, eveningOnlyAt, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';

process.env.TZ = 'America/Los_Angeles';

type Day = [number, number, number];
const on = ([y, mo, d]: Day, h: number, m: number, s = 0) => new Date(y, mo, d, h, m, s);
const plusDays = ([y, mo, d]: Day, n: number): Day => [y, mo, d + n];

/** The evening before each DST night. */
const NIGHTS: Array<{ name: string; eve: Day }> = [
    { name: 'spring forward', eve: [2026, 2, 7] },
    { name: 'fall back', eve: [2026, 9, 31] },
];

const moveEvening = (startsAt: string) => ({ type: 'SET_SETTINGS', settings: { eveningStartsAt: startsAt } }) as const;

describe('a Settings save across a DST night', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('precondition: the zone has its DST nights', () => {
        for (const { eve } of NIGHTS) {
            expect(on(eve, 12, 0).getTimezoneOffset()).not.toBe(on(plusDays(eve, 1), 12, 0).getTimezoneOffset());
        }
    });

    it.each(NIGHTS)('$name: moved onto last night\'s 4 h 23:30 window 20 real minutes before it ends, nothing starts; the next night does', ({ eve }) => {
        const ends = new Date(on(eve, 23, 30).getTime() + 240 * 60_000);
        expect(ends.getHours(), 'precondition: the window spans the clock change').toBe(eve[1] === 2 ? 4 : 2);

        vi.setSystemTime(new Date(ends.getTime() - 25 * 60_000));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 240));
        step(1_100);
        expect(h.live.state.activeMission, 'precondition: no window is open at launch').toBe('none');
        jumpTo(new Date(ends.getTime() - 20 * 60_000));
        h.dispatch(moveEvening('23:30'));
        step(2_000);
        expect(h.live.state.activeMission, "last night's window, open in real time, started on demand").toBe('none');

        crossing(on(plusDays(eve, 1), 23, 30));
        expect(h.live.state.activeMission, 'the next night is a new occurrence').toBe('evening');
        expect(startLogs(h.live.state, 'evening')).toBe(1);
        h.unmount();
    });

    it.each(NIGHTS)('$name: a start moved to 03:30, still ahead at a 00:30 save, starts automatically', ({ eve }) => {
        vi.setSystemTime(on(plusDays(eve, 1), 0, 30));
        const h = renderLiveScheduler(eveningOnlyAt('19:00', 240));
        step(1_100);
        h.dispatch(moveEvening('03:30'));

        crossing(on(plusDays(eve, 1), 3, 30));
        expect(h.live.state.activeMission).toBe('evening');
        h.unmount();
    });

    it.each(NIGHTS)('$name: a save 10 real minutes after the 4 h window ended stamps nothing (a wall-clock window would still be open on the fall-back night)', ({ eve }) => {
        const ends = new Date(on(eve, 23, 30).getTime() + 240 * 60_000);
        const set = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '19:00', eveningDurationMins: 240 }, timestamp: SAVED_LONG_AGO });
        const saved = mcReducer(set, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' }, timestamp: new Date(ends.getTime() + 10 * 60_000).toISOString() });
        expect(saved.missions.find(m => m.phase === 'evening')?.savedIntoWindowAt).toBeUndefined();
    });
});
