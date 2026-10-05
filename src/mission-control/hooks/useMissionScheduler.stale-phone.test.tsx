// ============================================================
// Mission Control — a phone tap that lands after its mission ended
// ------------------------------------------------------------
// The phone draws each mission card from the last broadcast, so its Reset and
// +/- buttons can name a mission that has already ended (it expired, or the
// phone's own Stop landed first). The plain Reset set that mission `active`
// again with nothing running: hidden on the desktop, never expiring, shown as
// running on the phone, and saved across a restart. These drive the REAL remote
// path (allowlist, validators, timestamp scrub) into the real reducer.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { at, jumpTo, launchInsideWindow, renderLiveScheduler, step } from './schedulerTestKit';
import type { MCState } from '../types';

const evening = (s: MCState) => s.missions.find(m => m.phase === 'evening');
const adjustLines = (s: MCState) => s.activityLogs.filter(l => l.message.startsWith('Mission time adjusted')).length;

/** The evening starts at 19:04 (inside its window) and expires unfinished at 20:04. */
function eveningThatExpired() {
    const harness = launchInsideWindow('evening', { ...initialState }, { ipc: true });
    jumpTo(at(20, 3));
    step(90_000);
    expect(harness.live.state.activeMission, 'precondition: it expired').toBe('none');
    return harness;
}

describe('a phone tap that lands after its mission ended', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it('a Reset does not bring the expired mission back, also after a relaunch', () => {
        const { live, emit, unmount } = eveningThatExpired();
        emit('remote-control:action', { type: 'RESET_MISSION', missionPhase: 'evening' });
        step(1_000);

        expect(evening(live.state)?.active, 'a hidden mission, active with nothing running').toBe(false);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(live.state));
        unmount();

        vi.setSystemTime(at(20, 10));
        const relaunched = renderLiveScheduler(loadPersistedState());
        step(1_000);
        expect(relaunched.live.state.activeMission).toBe('none');
        expect(evening(relaunched.live.state)?.active).toBe(false);
        relaunched.unmount();
    });

    it('a Reset right behind the phone’s own Stop leaves the mission stopped', () => {
        const { live, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        emit('remote-control:action', { type: 'CANCEL_MISSION', missionPhase: 'evening' });
        emit('remote-control:action', { type: 'RESET_MISSION', missionPhase: 'evening' });
        step(1_000);

        expect(live.state.activeMission).toBe('none');
        expect(evening(live.state)?.active).toBe(false);
        unmount();
    });

    it('a +10 for the expired mission changes nothing and writes no line', () => {
        const { live, emit, unmount } = eveningThatExpired();
        const before = live.state.missions;
        emit('remote-control:action', { type: 'ADJUST_MISSION_END', missionPhase: 'evening', deltaMinutes: 10 });
        step(1_000);

        expect(live.state.missions).toBe(before);
        expect(adjustLines(live.state)).toBe(0);
        unmount();
    });
});
