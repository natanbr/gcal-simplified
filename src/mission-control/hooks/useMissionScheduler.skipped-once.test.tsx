// ============================================================
// Mission Control — when a "skipped" line may be written, and when not again
// ------------------------------------------------------------
// Review round 1 of PR 198. The line was reported at ANY re-arm: after the
// parent's CLEAR, a mission started by hand, a task tap or a Settings save
// brought it back, and a Settings save that moved a start time into the past
// wrote one at once. Now only a launch or a wake looks back (the app was not
// watching) and a late timer still reports its own window; the scheduler
// remembers every line it wrote or found in the log. What remains: a launch
// after a CLEAR writes it once more (requirements → Known limits).
//
// Every instant is taken before the clock moves: `at` counts from the faked
// "today", so `at(0, 40, 1)` read after a jump past midnight is a day later.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';
import { initialState, mcReducer } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import {
    at, eveningOnlyAt, loadEveningOnly, ranOnce, renderLiveScheduler, saveAndClose, skippedLines, step,
} from './schedulerTestKit';
import type { MCState } from '../types';

/** Evening 23:30 for 60 min (open until 00:30), which ran the night before last. */
const lateEvening = () => ranOnce(eveningOnlyAt('23:30', 60), 'evening', at(23, 30, -1));

/** Launched at 00:40 after last night's window passed: its one line is written. */
function launchedAfterTheWindow(when: Date, options: { ipc?: boolean } = {}) {
    const state = lateEvening();
    vi.setSystemTime(when);
    const harness = renderLiveScheduler(state, options);
    step(3_000);
    expect(skippedLines(harness.live.state, 'evening'), 'precondition: the line').toBe(1);
    return harness;
}

describe('a "skipped" line is not brought back while the app runs', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); delete window.ipcRenderer; });

    it('a line from an earlier launch, a CLEAR, then a Settings save: no line comes back', () => {
        // A re-arm for a change to `missions`. (A hand start of the same mission would not
        // show it: while a mission runs, every one of its windows counts as handled.)
        const [first, second] = [at(0, 40, 1), at(1, 0, 1)];
        const before = launchedAfterTheWindow(first);
        before.dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' }); // not the newest line
        saveAndClose(before);

        vi.setSystemTime(second);
        const { live, dispatch, unmount } = renderLiveScheduler(loadEveningOnly());
        step(3_000);
        const missions = live.state.missions;
        dispatch({ type: 'CLEAR_LOGS' });
        dispatch({ type: 'SET_SETTINGS', settings: { eveningDurationMins: 45 } });
        step(3_000);

        expect(live.state.missions, 'precondition: the save re-armed the scheduler').not.toBe(missions);
        expect(skippedLines(live.state, 'evening')).toBe(0);
        unmount();
    });

    it('a line found in the log at launch, a CLEAR, then a wake: no line comes back', () => {
        const [first, second] = [at(0, 40, 1), at(1, 0, 1)];
        const before = launchedAfterTheWindow(first);
        before.dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' }); // not the newest line
        saveAndClose(before);

        vi.setSystemTime(second);
        const { live, dispatch, emit, unmount } = renderLiveScheduler(loadEveningOnly(), { ipc: true });
        step(3_000);
        expect(skippedLines(live.state, 'evening'), 'precondition: found, not written again').toBe(1);
        dispatch({ type: 'CLEAR_LOGS' });
        emit('system:resume');
        step(3_000);

        expect(skippedLines(live.state, 'evening')).toBe(0);
        unmount();
    });

    it('a wake landing in the same render as a change to `missions` still looks back', () => {
        // A stale task lock, or a save, can land with the wake: the new token says it was one.
        const wake = at(1, 0, 1);
        vi.setSystemTime(at(23, 0));
        const { live, dispatch, send, unmount } = renderLiveScheduler(lateEvening(), { ipc: true });
        step(100);
        vi.setSystemTime(wake); // the 23:30 timer keeps its 30 min of queue time; the re-arm clears it
        act(() => {
            send('system:resume');
            dispatch({ type: 'SET_SETTINGS', settings: { eveningDurationMins: 45 } });
        });
        step(3_000);

        expect(skippedLines(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a launch under StrictMode (src/main.tsx) writes the line once', () => {
        // Its second mount run must look back too, and must not write a second line.
        const state = lateEvening();
        vi.setSystemTime(at(0, 40, 1));
        const { live, unmount } = renderLiveScheduler(state, { strict: true });
        step(3_000);
        expect(skippedLines(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('KNOWN LIMIT: a relaunch after a CLEAR writes it once more', () => {
        const relaunch = at(1, 30, 1);
        const first = launchedAfterTheWindow(at(0, 40, 1));
        first.dispatch({ type: 'CLEAR_LOGS' });
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        const again = renderLiveScheduler(loadEveningOnly());
        step(3_000);
        expect(skippedLines(again.live.state, 'evening')).toBe(1);
        again.unmount();
    });
});

describe('a Settings save is not a missed window', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    /** The 08:00 morning, which ran yesterday, moved at 07:30 to 07:00: that window has closed. */
    function movedIntoThePast() {
        const s = ranOnce(mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningStartsAt: '08:00' } }), 'morning', at(8, 0, -1));
        vi.setSystemTime(at(7, 30));
        const harness = renderLiveScheduler({ ...s, missions: s.missions.filter(m => m.phase === 'morning') });
        step(3_000);
        harness.dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' } });
        step(3_000);
        return harness;
    }

    it('moving a start time into the past writes no line, and starts nothing', () => {
        const { live, unmount } = movedIntoThePast();
        expect(skippedLines(live.state, 'morning')).toBe(0);
        expect(live.state.activeMission).toBe('none');
        unmount();
    });

    it('KNOWN LIMIT: a relaunch later that day reports that window, as for any launch', () => {
        const relaunch = at(9, 0);
        saveAndClose(movedIntoThePast());
        vi.setSystemTime(relaunch);
        const loaded = loadPersistedState();
        const again = renderLiveScheduler({ ...loaded, missions: loaded.missions.filter(m => m.phase === 'morning') });
        step(3_000);
        expect(skippedLines(again.live.state, 'morning')).toBe(1);
        again.unmount();
    });
});

describe('both missions overdue at the same launch', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('closed from yesterday evening to 21:00 today: one line for each, nothing starts', () => {
        const history: MCState = ranOnce(ranOnce({ ...initialState }, 'morning', at(6, 0, -1)), 'evening', at(19, 0, -2));
        vi.setSystemTime(at(21, 0));
        const { live, unmount } = renderLiveScheduler(history);
        step(3_000);

        expect(skippedLines(live.state, 'morning'), 'today’s 06:00').toBe(1);
        expect(skippedLines(live.state, 'evening'), 'today’s 19:00').toBe(1);
        expect(live.state.activeMission).toBe('none');
        expect(live.state.missedMissionStreak).toBe(0);
        unmount();
    });
});
