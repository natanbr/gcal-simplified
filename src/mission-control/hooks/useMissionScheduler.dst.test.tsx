// ============================================================
// Mission Control — last night's window on a DST night
// ------------------------------------------------------------
// An occurrence's window lasts as long as a run started at it would, in real
// time (store/missionOccurrence.ts), as the run's own expiry, its due end
// (missionActivity.ts) and the hand-start rule (occurrenceDay.ts) all measure
// it. Placing the window's END on the wall clock ('27:30' as 03:30) is off by
// the hour the clocks moved: the night they spring forward the window looks
// an hour shorter than the run, the night they fall back an hour longer.
//
// This file pins a time zone with DST (America/Vancouver: 2026-03-08 02:00 →
// 03:00, 2026-11-01 02:00 → 01:00), as mcReducer.occurrence-dst.test.ts does.
// Vitest runs each file in its own process, so the zone does not leak.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { eveningOnlyAt, ranOnce, renderLiveScheduler, skippedLines, step } from './schedulerTestKit';

process.env.TZ = 'America/Vancouver';

describe('a relaunch inside last night’s window on a DST night', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('precondition: the zone has its DST nights', () => {
        expect(new Date(2026, 2, 8, 12).getTimezoneOffset()).not.toBe(new Date(2026, 2, 7, 12).getTimezoneOffset());
        expect(new Date(2026, 10, 1, 12).getTimezoneOffset()).not.toBe(new Date(2026, 9, 31, 12).getTimezoneOffset());
    });

    it('spring forward: 23:30 for 4 h runs to 04:30, so a relaunch at 04:00 starts it, dated the evening before', () => {
        // On the wall clock the window ends at 03:30 ('27:30'), half an hour before the relaunch.
        vi.setSystemTime(new Date(2026, 2, 8, 4, 0));
        const { live, unmount } = renderLiveScheduler(ranOnce(eveningOnlyAt('23:30', 240), 'evening', new Date(2026, 2, 6, 23, 30)));
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        expect(live.state.missions[0].occurrenceDate).toBe('2026-03-07');
        unmount();
    });

    it('fall back: 23:30 for 3 h ends at 01:30 (the second one), so a relaunch at 02:00 starts nothing and logs one line', () => {
        // On the wall clock the window ends at 02:30 ('26:30'), half an hour after the relaunch.
        vi.setSystemTime(new Date(2026, 10, 1, 2, 0));
        const { live, unmount } = renderLiveScheduler(ranOnce(eveningOnlyAt('23:30', 180), 'evening', new Date(2026, 9, 30, 23, 30)));
        step(3_000);

        expect(live.state.activeMission).toBe('none');
        expect(skippedLines(live.state, 'evening')).toBe(1);
        unmount();
    });
});
