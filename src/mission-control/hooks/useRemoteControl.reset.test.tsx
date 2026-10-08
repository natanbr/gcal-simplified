// ============================================================
// Mission Control — the Resets arrive from the phone only
// ------------------------------------------------------------
// Reset is phone-only (owner, 2026-10-07): the overlay's "↺ Reset" and its 2 s
// hold are gone, so the remote path is the one way in. These drive the REAL
// remote path (allowlist, validators, timestamp scrub) into the real reducer
// and pin that both Resets still reach the running mission from there. The
// phone sends RESET_MISSION today; RESET_MISSION_WITH_TIMER stays allowlisted
// for a phone button that does not exist yet (useRemoteControl.drift.test.ts).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { launchInsideWindow, step } from './schedulerTestKit';
import type { MCState } from '../types';

const evening = (s: MCState) => s.missions.find(m => m.phase === 'evening');
const shower = (s: MCState) => evening(s)?.tasks.find(t => t.id === 'shower');
const fullResetLines = (s: MCState) => s.activityLogs.filter(l => l.message === 'Mission fully reset (tasks + timer)');

describe('the phone resets the running mission', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.clear(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); delete window.ipcRenderer; });

    it("the phone's Reset clears the tasks and keeps the timer", () => {
        const { live, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        const startedAt = evening(live.state)?.startedAt;
        emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: 'evening', taskId: 'shower' });
        step(1_000);
        expect(shower(live.state)?.completed, 'precondition: the tick landed').toBe(true);

        emit('remote-control:action', { type: 'RESET_MISSION', missionPhase: 'evening' });
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        expect(shower(live.state)?.completed).toBe(false);
        expect(evening(live.state)?.startedAt, 'tasks only').toBe(startedAt);
        expect(fullResetLines(live.state)).toEqual([]);
        unmount();
    });

    it('a remote full Reset clears the tasks and restarts the timer, logged as remote', () => {
        const { live, emit, unmount } = launchInsideWindow('evening', { ...initialState }, { ipc: true });
        const startedAt = evening(live.state)?.startedAt;
        emit('remote-control:action', { type: 'COMPLETE_TASK', missionPhase: 'evening', taskId: 'shower' });
        step(60_000);

        emit('remote-control:action', { type: 'RESET_MISSION_WITH_TIMER', missionPhase: 'evening' });
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        expect(shower(live.state)?.completed).toBe(false);
        expect(Date.parse(evening(live.state)?.startedAt ?? ''), 'the timer restarted').toBeGreaterThan(Date.parse(startedAt ?? ''));
        expect(fullResetLines(live.state).map(l => l.source)).toEqual(['remote']);
        unmount();
    });
});
