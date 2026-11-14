// ============================================================
// Mission Control — a Settings save after a run, on the DST nights
// ------------------------------------------------------------
// The 2026-11-13 rule (retimedOntoItsRun, store/occurrenceDay.ts) reads the
// phase's last activity against the new start time with the hand-start rule,
// which measures real time. These pin it on both DST nights of 2026 in
// America/Los_Angeles (2026-03-08 02:00 → 03:00, 2026-11-01 02:00 → 01:00), as
// useMissionScheduler.dst.test.tsx does: a 23 h or 25 h day must neither cover
// the next day's occurrence nor uncover the one the save moved onto the run.
// Vitest runs each file in its own process, so the zone does not leak.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { crossing, eveningOnlyAt, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

process.env.TZ = 'America/Los_Angeles';

type Day = [number, number, number];
const on = ([y, mo, d]: Day, h: number, m: number, s = 0) => new Date(y, mo, d, h, m, s);
const plusDays = ([y, mo, d]: Day, n: number): Day => [y, mo, d + n];

/** The evening before each DST night. */
const NIGHTS: Array<{ name: string; eve: Day }> = [
    { name: 'spring forward', eve: [2026, 2, 7] },
    { name: 'fall back', eve: [2026, 9, 31] },
];

function morningOnly(): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningDurationMins: 10 } });
    return { ...s, missions: s.missions.filter(m => m.phase === 'morning') };
}

describe('a Settings save after a run, across a DST night', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('precondition: the zone has its DST nights', () => {
        for (const { eve } of NIGHTS) {
            expect(on(eve, 12, 0).getTimezoneOffset()).not.toBe(on(plusDays(eve, 1), 12, 0).getTimezoneOffset());
        }
    });

    it.each(NIGHTS)('$name: a morning moved to 06:10 during its 06:00 run skips that day and starts the next', ({ eve }) => {
        vi.setSystemTime(on(eve, 6, 0));
        const h = renderLiveScheduler(morningOnly());
        step(100);
        jumpTo(on(eve, 6, 8));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '06:10' } });
        crossing(on(eve, 6, 10));
        expect(h.live.state.activeMission, 'covered by the run the save ended').toBe('none');

        crossing(on(plusDays(eve, 1), 6, 10));
        expect(h.live.state.activeMission, 'the next day is a new occurrence').toBe('morning');
        expect(startLogs(h.live.state, 'morning')).toBe(2);
        h.unmount();
    });

    it.each(NIGHTS)('$name: a 4 h evening at 23:30 missed overnight and moved 10 min past its end starts only the night after', ({ eve }) => {
        // 23:30 + 4 h of real time: 04:30 on the spring night, 02:30 on the fall night.
        const ends = new Date(on(eve, 23, 30).getTime() + 240 * 60_000);
        expect(ends.getHours(), 'precondition: the run spans the clock change').toBe(eve[1] === 2 ? 4 : 2);
        const moved = new Date(ends.getTime() + 10 * 60_000);
        const hhmm = `${String(moved.getHours()).padStart(2, '0')}:${String(moved.getMinutes()).padStart(2, '0')}`;

        vi.setSystemTime(on(eve, 23, 29, 59));
        const h = renderLiveScheduler(eveningOnlyAt('23:30', 240));
        step(1_100);
        crossing(ends);
        expect(h.live.state.activeMission, 'precondition: the run timed out').toBe('none');
        jumpTo(new Date(ends.getTime() + 5 * 60_000));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: hhmm } });

        crossing(moved);
        expect(h.live.state.activeMission, `the save pulled ${hhmm} onto the miss`).toBe('none');

        crossing(on(plusDays(eve, 2), moved.getHours(), moved.getMinutes()));
        expect(h.live.state.activeMission, 'the night after is a new occurrence').toBe('evening');
        expect(startLogs(h.live.state, 'evening')).toBe(2);
        h.unmount();
    });
});
