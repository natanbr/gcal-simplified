// ============================================================
// Mission Control — a mission that is already running when its window opens
// ------------------------------------------------------------
// The edge left open by the 2026-09-22 stop fix: a parent starts the evening
// by hand at 18:30, it is still running at 19:00, and it is stopped at 19:04.
// The scheduler then started it again, because its only record was the START
// (18:30), which is before the window. For as long as it ran inside the window
// the scheduler also re-aimed at that window every second (the poll the stop
// fix removed everywhere else). The same poll ran while the OTHER phase's
// mission was running across the window start.
//
// The rule these pin: a run covers every occurrence it overlapped. A run that
// ended before the window opened covers none (decided 2026-09-22).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { at, jumpTo, renderLiveScheduler, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

const eveningOnly: MCState = { ...initialState, missions: initialState.missions.filter(m => m.phase === 'evening') };

/** 18:30: the evening is started by hand, half an hour before its window. */
function startEveningEarly(state: MCState = eveningOnly) {
    vi.setSystemTime(at(18, 30));
    const harness = renderLiveScheduler(state);
    harness.dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'local' });
    expect(harness.live.state.activeMission, 'precondition: ▶ Start started it').toBe('evening');
    return harness;
}

/** Crosses 19:00 the way the app does, and stops two seconds into the window. */
function crossWindowStart() {
    jumpTo(at(18, 59, 0, 59));
    step(3_000);
}

describe('a mission started before its window and still running when it opens', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('stopped inside the window, it stays stopped', () => {
        const { live, dispatch, unmount } = startEveningEarly();
        crossWindowStart();
        expect(live.state.activeMission, 'still the 18:30 run').toBe('evening');

        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening'), 'the scheduler restarted the stopped mission').toBe(1);
        unmount();
    });

    it('stopped from the phone inside the window, it stays stopped after a relaunch', () => {
        const { live, dispatch, unmount } = startEveningEarly();
        crossWindowStart();
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote', isRemote: true });
        step(1_000);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(live.state));
        unmount();

        vi.setSystemTime(at(19, 10));
        const relaunched = renderLiveScheduler(loadPersistedState());
        step(5_000);
        expect(relaunched.live.state.activeMission).toBe('none');
        relaunched.unmount();
    });

    it('arms no timer while it runs inside the window', () => {
        const { unmount } = startEveningEarly();
        crossWindowStart();
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        step(10_000);
        expect(setTimeoutSpy, 'timers armed in 10 s while the early mission runs').not.toHaveBeenCalled();
        unmount();
    });

    it('a window timer firing late (machine asleep) while it still runs logs no "skipped" line', () => {
        // Started at 18:59:50, so the 19:00 timer is due before the expiry
        // interval's first tick: the scheduler sees the mission still running.
        vi.setSystemTime(at(18, 59, 0, 50));
        const { live, dispatch, unmount } = renderLiveScheduler(eveningOnly);
        dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'local' });
        vi.setSystemTime(at(21, 0)); // the machine slept through the window; no timer ran
        step(11_000);

        expect(live.state.activityLogs.some(l => l.message.includes('skipped')),
            'a mission that was running is not a missed window').toBe(false);
        unmount();
    });

    it('stopped BEFORE the window opens, the scheduled one still starts at 19:00', () => {
        const { live, dispatch, unmount } = startEveningEarly();
        jumpTo(at(18, 45));
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_000);

        crossWindowStart();
        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(2);
        unmount();
    });
});

describe('the other mission is still running when a window opens', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    /** 18:55: the MORNING is started by hand, so it runs across the evening's 19:00 start. */
    function morningAcrossEvening() {
        vi.setSystemTime(at(18, 55));
        const harness = renderLiveScheduler({ ...initialState });
        harness.dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'morning', origin: 'local' });
        crossWindowStart();
        expect(harness.live.state.activeMission, 'precondition: the morning still runs').toBe('morning');
        return harness;
    }

    it('arms no timer while it runs', () => {
        const { unmount } = morningAcrossEvening();
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        step(10_000);
        expect(setTimeoutSpy, 'timers armed in 10 s while the other mission blocks the window').not.toHaveBeenCalled();
        unmount();
    });

    it('once it ends, the evening starts inside its window', () => {
        const { live, dispatch, unmount } = morningAcrossEvening();
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'morning' });
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });
});
