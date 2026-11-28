// ============================================================
// Mission Control — a Settings save never starts a mission on demand: the
// review round's cases (the rule: useMissionScheduler.no-start-on-demand.test.tsx)
// ------------------------------------------------------------
// The stamp (savedIntoWindows, store/missionActivity.ts) is written when a
// save's window is open at the save and was not open AT THAT START before it,
// and it covers only that window (store/occurrenceHandled.ts). These pin:
//   - a known gap: a window already open and pending behind another running
//     mission, moved to another start that is open too, is stamped, so it no
//     longer starts when the other mission ends (the phone can start it);
//   - a second save that moves a window the first save opened: a new window
//     opened by the save, held back too ("was anything open before" would
//     start it);
//   - a duration-only save inside a window the retime rule had covered: the
//     longer window must stay covered (a save never uncovers a covered window);
//   - a wake after the covered window closed: no ⏭️ line, no start;
//   - past midnight: a relaunch inside last night's covered window starts
//     nothing, and the next night starts as normal.
// Saves are dispatched at the test's clock. Real reducer, real dispatch
// interceptor (schedulerTestKit.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import {
    crossing, eveningOnlyAt, jumpTo, loadEveningOnly, ranOnce, renderLiveScheduler, saveAndClose, skippedLines, startLogs, step,
    type Phase,
} from './schedulerTestKit';
import type { MCState } from '../types';

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number, s = 0) => new Date(2026, 10, day, h, m, s);

const missionOf = (s: MCState, phase: Phase) => s.missions.find(m => m.phase === phase);

/** Launches at `when` (default: a profile on which nothing ran) with no window open. */
function launchAt(when: Date, state: MCState = initialState, ipc = false) {
    vi.setSystemTime(when);
    const h = renderLiveScheduler(state, { ipc });
    step(1_100);
    expect(h.live.state.activeMission, 'precondition: no window is open at launch').toBe('none');
    return h;
}

describe('a save into the window: the review round', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('known gap, pinned: an evening pending behind a running morning, moved 19:00 → 19:05 at 19:10, does not start when the morning ends', () => {
        // 19:00–20:00 was open and waiting; 19:05–20:05 was not open before the save, so the
        // save is stamped like any save into the window. (Only lengthened, it is not: the
        // evening still starts when the morning ends, no-start-on-demand.test.tsx.)
        const h = launchAt(nov(10, 18, 55), initialState, true);
        h.emit('remote-control:action', { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        jumpTo(nov(10, 19, 10));
        expect(h.live.state.activeMission, 'precondition: the evening window opened behind the running morning').toBe('morning');
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '19:05' } });
        expect(missionOf(h.live.state, 'evening')?.savedIntoWindows, 'precondition: the move is stamped')
            .toEqual([{ savedAt: nov(10, 19, 10).toISOString(), windowStart: nov(10, 19, 5).toISOString() }]);

        jumpTo(nov(10, 19, 12));
        h.emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'morning' });
        step(2_000);
        expect(h.live.state.activeMission, 'the gap: the evening that was waiting stays unstarted').toBe('none');
        crossing(nov(10, 20, 5));
        expect(startLogs(h.live.state, 'evening')).toBe(0);
        h.unmount();
    });

    it('two saves into the window (06:00 → 06:59 at 07:00, then → 07:03 at 07:05): neither starts the morning', () => {
        const h = launchAt(nov(10, 7, 0));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '06:59' } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the first save started nothing').toBe('none');

        jumpTo(nov(10, 7, 5));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '07:03' } });
        step(2_000);
        expect(h.live.state.activeMission, 'the second save opened 07:03–07:33 and it started').toBe('none');
        crossing(nov(10, 7, 33));
        expect(startLogs(h.live.state, 'morning')).toBe(0);
        h.unmount();
    });

    it('a wake after the window the save opened has closed writes no ⏭️ line for it, and starts nothing', () => {
        // The morning ran the day before, so a wake owes a line for a window that closed without running.
        const h = launchAt(nov(10, 5, 0), ranOnce(initialState, 'morning', nov(9, 6, 0)), true);
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '04:59' } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');

        jumpTo(nov(10, 5, 40)); // 04:59–05:29 has closed
        h.emit('system:resume');
        step(3_000);
        expect(skippedLines(h.live.state, 'morning'), 'the wake reported the window the save covered as missed').toBe(0);
        expect(h.live.state.activeMission).toBe('none');
        h.unmount();
    });

    it('overnight: an evening moved at 23:40 onto 23:30 (60 min), relaunched at 00:10, starts nothing and logs no line; the next night starts', () => {
        // Ran the night before at its old 23:50, so a relaunch owes lines for windows it missed.
        const h = launchAt(nov(10, 23, 35), ranOnce(eveningOnlyAt('23:50', 60), 'evening', nov(9, 23, 50)));
        jumpTo(nov(10, 23, 40));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30' } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');
        saveAndClose(h);

        vi.setSystemTime(nov(11, 0, 10));
        const next = renderLiveScheduler(loadEveningOnly());
        step(2_000);
        expect(next.live.state.activeMission, "the relaunch started last night's 23:30–00:30 on demand").toBe('none');
        expect(skippedLines(next.live.state, 'evening')).toBe(0);

        crossing(nov(11, 23, 30));
        expect(next.live.state.activeMission, 'the next night is a new occurrence').toBe('evening');
        expect(missionOf(next.live.state, 'evening')?.occurrenceDate).toBe('2026-11-11');
        expect(startLogs(next.live.state, 'evening')).toBe(1);
        next.unmount();
    });

    it('a duration-only save inside a window the retime rule covered does not uncover it (review: it started the evening on demand)', () => {
        // Evening 19:00 for 30 min ran on the 10th; moved at 19:30 to 06:40, which the run covers by design.
        const h = launchAt(nov(10, 19, 30), ranOnce(eveningOnlyAt('19:00', 30), 'evening', nov(10, 19, 0)));
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '06:40' } });
        step(1_100);
        jumpTo(nov(11, 6, 44));
        step(1_100);
        expect(h.live.state.activeMission, 'precondition: 06:40 on the 11th is covered by the retime rule').toBe('none');
        // A longer window makes the run look farther from the start than from the window before it.
        h.dispatch({ type: 'SET_SETTINGS', settings: { eveningDurationMins: 120 } });
        step(2_000);
        expect(h.live.state.activeMission, 'the duration save started the evening on demand').toBe('none');
        expect(startLogs(h.live.state, 'evening')).toBe(0);
        h.unmount();
    });
});
