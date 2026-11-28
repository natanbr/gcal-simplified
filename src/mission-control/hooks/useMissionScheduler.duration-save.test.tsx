// ============================================================
// Mission Control — a duration-only Settings save never moves a covered
// occurrence, through the real scheduler (review of PR 209)
// ------------------------------------------------------------
// The retime rule (2026-11-13) lets a run cover the next occurrence when it is
// nearer that start than the window behind it. It weighed the window behind
// with the CURRENT length, so a length save the minute before the start
// decided again: after a miss, lengthening the evening released the moved
// window and the scheduler started a fresh full-timer attempt with no phone;
// after a phone stop, shortening it held back a start that was due. The
// decision is now made at the save that moved the start time (retimeCoversDay,
// store/missionActivity.ts). Reducer-level cases and the property:
// store/occurrenceHandled.duration-*.test.ts. Saves are dispatched at the
// test's clock (the dispatch interceptor stamps them), as Settings → Save does.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { crossing, eveningOnlyAt, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);

/** Launches at 18:55 on the 10th with only the evening, at 19:00 for `durationMins`, and lets 19:00 start it. */
function eveningStarted(durationMins: number) {
    vi.setSystemTime(nov(10, 18, 55));
    const h = renderLiveScheduler(eveningOnlyAt('19:00', durationMins), { ipc: true });
    step(1_100);
    crossing(nov(10, 19, 0));
    expect(h.live.state.activeMission, 'precondition: the scheduler started 19:00').toBe('evening');
    return h;
}

describe('a length save the minute before a moved start', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it.each<[string, number | null]>([
        ['control: no length save', null],
        ['lengthened 30 → 120 min at 06:39', 120],
    ])('after a miss (19:00 for 30 min, timed out), the evening moved at 06:20 to 06:40, %s: nothing starts at 06:40', (_name, longer) => {
        const h = eveningStarted(30);
        crossing(nov(10, 19, 30));
        expect(h.live.state.activeMission, 'precondition: the run timed out').toBe('none');
        expect(h.live.state.lastCompletedOrFailedEveningDate, 'precondition: a miss').toBe('2026-11-10');

        jumpTo(nov(11, 6, 20));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '06:40' } });
        jumpTo(nov(11, 6, 39));
        if (longer !== null) h.dispatch({ type: 'SET_SETTINGS', settings: { eveningDurationMins: longer } });
        crossing(nov(11, 6, 40));
        expect(h.live.state.activeMission, 'the length save released 06:40: a fresh attempt after the miss').toBe('none');
        expect(startLogs(h.live.state, 'evening')).toBe(1);
        h.unmount();
    });

    it.each<[string, number | null]>([
        ['control: no length save', null],
        ['shortened 120 → 30 min at 06:39', 30],
    ])('a run the phone stopped at 19:01 (19:00 for 120 min), moved at 06:20 to 06:40 the next day, %s: 06:40 starts', (_name, shorter) => {
        const h = eveningStarted(120);
        jumpTo(nov(10, 19, 1));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_100);
        expect(h.live.state.activeMission, 'precondition: the phone stopped it').toBe('none');

        jumpTo(nov(11, 6, 20));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '06:40' } });
        jumpTo(nov(11, 6, 39));
        if (shorter !== null) h.dispatch({ type: 'SET_SETTINGS', settings: { eveningDurationMins: shorter } });
        crossing(nov(11, 6, 40));
        expect(h.live.state.activeMission, 'the length save held back the start that was due').toBe('evening');
        expect(startLogs(h.live.state, 'evening')).toBe(2);
        h.unmount();
    });
});
