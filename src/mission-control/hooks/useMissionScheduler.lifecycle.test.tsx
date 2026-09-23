// ============================================================
// Mission Control — a stopped mission across the lifecycle: the phone's
// clock, a resume from sleep, a clock that was set wrong, a parent moving
// the start time earlier. Review round 1 of the 2026-09-22 stop fix.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { at, launchInsideWindow, renderLiveScheduler, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

const A_YEAR_AHEAD = () => at(19, 30, 365).toISOString();

function withEveningStamp(stamp: string): MCState {
    return { ...initialState, missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, lastActiveAt: stamp } : m)) };
}

describe('a stop that arrives from the phone or survives a sleep', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete window.ipcRenderer; });

    it('a phone whose clock runs behind cannot stamp the stop before the window', () => {
        // The stamp takes the action's timestamp. A phone 6 min behind would
        // stamp 18:58 and the evening would restart, the original bug by phone.
        // useRemoteControl scrubs the envelope's timestamp; this pins it.
        const { live, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening', timestamp: at(18, 58).toISOString() });
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening'), 'the scheduler restarted the stopped mission').toBe(1);
        unmount();
    });

    it('a resume from sleep inside the window does not restart a stopped mission', () => {
        const { live, dispatch, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        step(1_000);

        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        emit('system:resume');
        expect(setTimeoutSpy, 'precondition: the resume rebuilt the schedule').toHaveBeenCalled();
        step(5_000);
        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });
});

describe('a stamp from a clock that was set ahead', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); });

    it('is ignored in session: the window still starts', () => {
        // A mission ran while the clock read a date a year ahead, then the clock
        // was corrected. Trusting the stamp would skip every occurrence for a
        // year, silently (the old date-keyed check healed the next day).
        vi.setSystemTime(at(19, 4));
        const { live, unmount } = renderLiveScheduler(withEveningStamp(A_YEAR_AHEAD()));
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        unmount();
    });

    it('is dropped at load, so a relaunch starts the window as normal', () => {
        vi.setSystemTime(at(19, 4));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(withEveningStamp(A_YEAR_AHEAD())));
        const loaded = loadPersistedState();
        expect(loaded.missions.find(m => m.phase === 'evening')?.lastActiveAt).toBeUndefined();

        const { live, unmount } = renderLiveScheduler(loaded);
        step(1_000);
        expect(live.state.activeMission).toBe('evening');
        unmount();
    });
});

describe('moving the start time EARLIER, inside the new window', () => {
    // DECISION pending (Nathan, PR 170): a run covers every occurrence it
    // overlapped, so moving the start to a time before the run's stop or
    // reschedule makes an occurrence the run already covers. Before this PR a
    // RUNNING mission rescheduled earlier restarted at once with a fresh timer;
    // now it ends (SET_SETTINGS deactivates it) and does not restart.
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a stopped mission moved to a start before the stop is not restarted', () => {
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening' });
        dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '19:02' } });
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a running mission moved to a start before now ends and is not restarted', () => {
        const { live, dispatch, unmount } = launchInsideWindow('evening');
        dispatch({ type: 'SET_SETTINGS', settings: { eveningStartsAt: '18:30' } });
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });
});
