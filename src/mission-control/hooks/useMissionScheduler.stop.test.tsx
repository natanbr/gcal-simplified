// ============================================================
// Mission Control — a stopped mission stays stopped
// ------------------------------------------------------------
// Found by the 2026-09-22 QA run, reproduced twice in the built app: holding
// "— Minimize" for 2 s (or the phone's Stop) logged "⏹️ Mission stopped" and,
// 8 ms later, "🌙 evening mission started" by the scheduler, with a full timer.
//
// Root cause: the scheduler had no memory of having started today's
// occurrence. It only skipped a phase whose outcome date was today, and a stop
// records no outcome (it is neither a completion nor a miss). CANCEL_MISSION
// changes `missions`, the scheduler effect re-armed, aimed at the still-open
// window and fired a 0 ms timeout. The same blind spot made it re-aim at the
// open window every second for as long as the window lasted.
//
// These tests drive the REAL reducer through the real dispatch interceptor
// (schedulerTestKit.ts, which also explains why time advances in 100 ms steps).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { initialState } from '../store/mcReducer';
import { at, jumpTo, launchInsideWindow, renderLiveScheduler, startLogs, step, type Phase } from './schedulerTestKit';

describe('stopping a scheduled mission inside its window', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it.each<Phase>(['morning', 'evening'])('a %s mission stopped from the phone stays stopped', (phase) => {
        const { live, dispatch, unmount } = launchInsideWindow(phase);

        dispatch({ type: 'CANCEL_MISSION', missionPhase: phase }); // the phone's Stop, the only stop since 2026-09-24
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(live.state.activityLogs.some(l => l.message === 'Mission stopped')).toBe(true);
        expect(startLogs(live.state, phase), 'the scheduler restarted the stopped mission').toBe(1);
        unmount();
    });

    it('a mission stopped from the phone stays stopped', () => {
        const { live, dispatch, unmount } = launchInsideWindow('evening');

        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote', isRemote: true });
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('the scheduler stops re-firing once the occurrence has run, running or stopped', () => {
        // Before the fix it re-aimed at the open window every second for the
        // whole window, on the Calendar view too. The timer registry cannot see
        // it: it only scans for setInterval, and this was a setTimeout chain.
        const { dispatch, unmount } = launchInsideWindow('evening');
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        step(10_000);
        expect(setTimeoutSpy, 'timers armed in 10 s while the mission runs').not.toHaveBeenCalled();

        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(100); // the stop changes `missions`, so the schedule is rebuilt once
        setTimeoutSpy.mockClear();
        step(10_000);
        expect(setTimeoutSpy, 'timers armed in 10 s after the stop').not.toHaveBeenCalled();
        unmount();
    });

    it('▶ Start still starts a stopped mission, and stopping it again sticks', () => {
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_000);

        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening' }); // Settings → ▶ Start
        step(1_000);
        expect(live.state.activeMission).toBe('evening');

        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(5_000);
        expect(live.state.activeMission).toBe('none');
        unmount();
    });

    it('the phone can still start a stopped mission', () => {
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote', isRemote: true });
        step(1_000);
        expect(live.state.activeMission, 'precondition: the stop held').toBe('none');

        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'remote', isRemote: true });
        step(1_000);
        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening'), 'the scheduler start + the phone start, nothing else').toBe(2);
        unmount();
    });
});

describe('stopped mission — restart and rollover', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    /** Stops the evening mission at 19:04, then quits the way MCStoreProvider persists. */
    function stopThenQuit(): void {
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_000);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(live.state));
        unmount();
    }

    it('a relaunch later in the same window does not restart it', () => {
        stopThenQuit();

        vi.setSystemTime(at(19, 10));
        const { live, unmount } = renderLiveScheduler(loadPersistedState());
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        unmount();
    });

    it('a relaunch inside the next day’s window starts it as normal', () => {
        stopThenQuit();

        vi.setSystemTime(at(19, 10, 1));
        const { live, unmount } = renderLiveScheduler(loadPersistedState());
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        unmount();
    });

    it('left running overnight, the app starts the next day’s occurrence on time', () => {
        // Evening only, so tomorrow's 06:00 morning does not start in the jump.
        const eveningOnly = { ...initialState, missions: initialState.missions.filter(m => m.phase === 'evening') };
        const { live, dispatch, unmount } = launchInsideWindow('evening', eveningOnly);
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_000);

        // Nothing is armed inside today's window any more, so one act is honest here.
        jumpTo(at(18, 59, 1));
        expect(live.state.activeMission, 'nothing starts before tomorrow’s window').toBe('none');

        step(61_000);
        expect(live.state.activeMission).toBe('evening');
        unmount();
    });
});

describe('rescheduling a phase makes a new occurrence', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a running mission moved to a later start is started again at the new time', () => {
        // SET_SETTINGS deactivates a running mission whose start time changes
        // "so the scheduler can re-trigger at the new time". Pinned because the
        // trigger stamp must not swallow that.
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '19:30' } });
        step(1_000);
        expect(live.state.activeMission).toBe('none');

        jumpTo(at(19, 29));
        step(61_000);
        expect(live.state.activeMission).toBe('evening');
        unmount();
    });

    it('a stopped mission moved to a later start is started at the new time', () => {
        // DECISION (2026-09-22): a stop covers the occurrence it happened in. A
        // parent who stops at 19:04 and moves the evening to 19:30 gets 19:30.
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '19:30' } });
        step(1_000);
        expect(live.state.activeMission).toBe('none');

        jumpTo(at(19, 29));
        step(61_000);
        expect(live.state.activeMission).toBe('evening');
        unmount();
    });
});
