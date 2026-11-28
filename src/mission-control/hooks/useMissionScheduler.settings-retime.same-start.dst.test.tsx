// ============================================================
// Mission Control — a second start move onto the same instant starts nothing,
// on the spring-forward night (review of PR 209, found by Codex)
// ------------------------------------------------------------
// The save that moves a start time onto the run decides once whether the run
// also covers the occurrence ahead (retimeCoversDay, store/missionActivity.ts).
// On 2026-03-08 in America/New_York 02:40 does not exist and becomes 03:40
// EDT: a move from 02:40 to 03:40 changes nothing ahead, yet decided again it
// uncovered the window the first move had covered, and the scheduler started
// it with a full timer after a miss, with no phone involved. Reducer-level
// cases: store/occurrenceHandled.retime-same-start.dst.test.ts. Saves are
// dispatched at the test's clock (the dispatch interceptor stamps them), as
// Settings → Save does. Vitest runs each file in its own process, so the zone
// does not leak.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crossing, eveningOnlyAt, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';

process.env.TZ = 'America/New_York';

const mar = (day: number, h: number, m: number) => new Date(2026, 2, day, h, m);

describe('a second move onto the same instant, on the spring-forward night', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('precondition: 02:40 does not exist on the 8th and is 03:40 EDT', () => {
        expect(mar(8, 2, 40).getTime()).toBe(mar(8, 3, 40).getTime());
    });

    it('missed at 15:05 on the 7th, moved at 03:30 to 02:40 and at 03:41 to 03:40: nothing starts on the 8th; the 9th does', () => {
        vi.setSystemTime(mar(7, 14, 30));
        const h = renderLiveScheduler(eveningOnlyAt('14:35', 30));
        step(1_100);
        crossing(mar(7, 14, 35));
        expect(h.live.state.activeMission, 'precondition: the scheduler started 14:35').toBe('evening');
        crossing(mar(7, 15, 5));
        expect(h.live.state.lastCompletedOrFailedEveningDate, 'precondition: a miss').toBe('2026-03-07');

        jumpTo(mar(8, 3, 30));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '02:40' } });
        jumpTo(mar(8, 3, 41));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '03:40' } });
        step(2_000);
        expect(h.live.state.activeMission, 'the second save released the covered window: a fresh attempt after the miss').toBe('none');
        expect(startLogs(h.live.state, 'evening')).toBe(1);

        crossing(mar(9, 3, 40));
        expect(h.live.state.activeMission, 'the night after is a new occurrence').toBe('evening');
        expect(startLogs(h.live.state, 'evening')).toBe(2);
        h.unmount();
    });
});
