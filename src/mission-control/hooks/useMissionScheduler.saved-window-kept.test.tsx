// ============================================================
// Mission Control — a window a Settings save covered stays covered
// (review of PR 209, Codex)
// ------------------------------------------------------------
// A save that opens a window is stamped, the window counts as handled (no
// start, no miss) and the save logs "not started". The scheduler's look-back
// (a launch or a wake) must then never call that window "missed (app closed or
// machine asleep)": the log would contradict itself. Two ways it did:
//   - a later length save that shortened the window: the check "was the save
//     made inside the window" read the window with the NEW length, so the save
//     fell outside it;
//   - a later save that covered the next day's window at the same start: the
//     only stamp was overwritten, while the look-back still reaches the first.
// Each window a save opened is now kept by its start (savedIntoWindows,
// store/missionActivity.ts). Saves are dispatched at the test's clock.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { jumpTo, renderLiveScheduler, skippedLines, step } from './schedulerTestKit';
import type { MCState } from '../types';

/** A date in November 2026 (fixed, so a test that passes midnight names its days plainly). */
const nov = (day: number, h: number, m: number) => new Date(2026, 10, day, h, m);

const notStartedLines = (s: MCState) => s.activityLogs.filter(l => l.message.startsWith('Morning mission not started')).length;

/** Only the morning, on a profile where it never ran (so a look-back owes a line only for a window this session saw). */
const morningOnly: MCState = { ...initialState, missions: initialState.missions.filter(m => m.phase === 'morning') };

/** The machine sleeps until `when` (no timer fires on the way), then wakes. */
function sleepUntil(h: ReturnType<typeof renderLiveScheduler>, when: Date) {
    vi.setSystemTime(when);
    h.emit('system:resume');
    step(3_000);
}

describe('a covered window is never reported missed', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('Codex: morning 08:00 moved at 06:45 to 06:00 for 60 min, shortened to 30 min at 07:05, a wake at 07:10: one explanation, no ⏭️ line', () => {
        vi.setSystemTime(nov(10, 5, 55));
        const h = renderLiveScheduler(morningOnly, { ipc: true });
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '08:00' } });
        step(1_100);

        jumpTo(nov(10, 6, 45));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '06:00', morningDurationMins: 60 } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');
        expect(notStartedLines(h.live.state), 'precondition: Settings explained it').toBe(1);

        jumpTo(nov(10, 7, 5));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningDurationMins: 30 } });
        step(2_000);
        sleepUntil(h, nov(10, 7, 10));
        expect(skippedLines(h.live.state, 'morning'), 'the look-back called the covered 06:00 window missed').toBe(0);
        expect(h.live.state.activeMission).toBe('none');
        h.unmount();
    });

    it("a save covering the next day's window at the same start keeps the first day's covered: a wake writes no ⏭️ line for it", () => {
        // The 10th: launched at 06:40, the morning moved at 07:00 to 06:59 (06:59–07:29 covered).
        vi.setSystemTime(nov(10, 6, 40));
        const h = renderLiveScheduler(morningOnly, { ipc: true });
        step(1_100);
        jumpTo(nov(10, 7, 0));
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '06:59' } });
        step(2_000);
        expect(notStartedLines(h.live.state), 'precondition: the 10th is explained').toBe(1);

        // Asleep through the 11th's 06:59–07:29: the wake reports that window, rightly.
        sleepUntil(h, nov(11, 7, 40));
        expect(skippedLines(h.live.state, 'morning'), "precondition: the 11th's window was missed").toBe(1);
        // Lengthened to 60 min: the 11th's 06:59–07:59 opens again and is covered.
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningDurationMins: 60 } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');
        expect(notStartedLines(h.live.state), 'precondition: the 11th is explained too').toBe(2);

        // Now the newest window that has closed is the 10th's, which a save covered.
        sleepUntil(h, nov(11, 7, 45));
        expect(skippedLines(h.live.state, 'morning'), "the wake called the 10th's covered window missed").toBe(1);
        h.unmount();
    });

    it("Codex: eight windows covered on the 10th, then a length save opening the 11th's: a wake writes no ⏭️ line for the 10th", () => {
        // A 15-min morning. At 07:08 on the 10th the start goes to 07:00, 07:01 … 07:07 and back to 07:00: eight windows.
        vi.setSystemTime(nov(10, 6, 40));
        const h = renderLiveScheduler(morningOnly, { ipc: true });
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningDurationMins: 15 } });
        step(1_100);
        jumpTo(nov(10, 7, 8));
        for (const m of [0, 1, 2, 3, 4, 5, 6, 7, 0]) h.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: `07:0${m}` } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the saves started nothing').toBe('none');

        // Asleep through the 11th's 07:00–07:15: the wake reports that window, rightly.
        sleepUntil(h, nov(11, 7, 30));
        expect(skippedLines(h.live.state, 'morning'), "precondition: the 11th's window was missed").toBe(1);
        // Only the length, 15 → 60 min: the 11th's 07:00–08:00 opens again and is covered.
        h.dispatch({ type: 'SET_SETTINGS', settings: { morningDurationMins: 60 } });
        step(2_000);
        expect(h.live.state.activeMission, 'precondition: the save started nothing').toBe('none');

        // The newest window that has closed is the 10th's 07:00–08:00, which the first saves covered.
        sleepUntil(h, nov(11, 7, 35));
        expect(skippedLines(h.live.state, 'morning'), "the ninth window pushed out the 10th's, and the wake called it missed").toBe(1);
        expect(h.live.state.activeMission).toBe('none');
        h.unmount();
    });
});
