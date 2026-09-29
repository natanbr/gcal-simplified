// ============================================================
// Mission Control — a mission saved running with an incomplete record
// ------------------------------------------------------------
// JSON writes a NaN `durationMins` as null, and the expiry check skips a null
// duration, so such a mission never ended. Giving it its window's length at
// load ends it on the first 15 s tick, but for a run from an EARLIER day that
// tick charges a miss dated on the launch day: the shield loses a segment for
// a data bug, `lastCompletedOrFailedEveningDate` becomes today, and tonight's
// evening then never starts, with no "skipped" line (review of PR 184).
//
// So a stuck run whose window closed before today ends at load with no
// outcome, like a Stop: no miss, no conclusion, one attributed log line, and
// `lastActiveAt` set to when it started so that old occurrence is not
// restarted. A run from today keeps its window's length and ends normally.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import { at, jumpTo, renderLiveScheduler, startLogs, step } from '../hooks/schedulerTestKit';
import type { MCState, MissionPhase } from '../types';

type Phase = Exclude<MissionPhase, 'none'>;

/** Saves `phase` as running since `startedAt` with the null duration JSON wrote. */
function saveStuck(phase: Phase, startedAt: Date, extra: Record<string, unknown> = {}): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        activeMission: phase,
        missions: initialState.missions.map(m => (m.phase === phase
            ? { ...m, active: true, startedAt: startedAt.toISOString(), durationMins: null, ...extra }
            : m)),
    }));
}

function mission(state: MCState, phase: Phase) {
    const m = state.missions.find(x => x.phase === phase);
    if (!m) throw new Error(`no ${phase} mission`);
    return m;
}

describe('hydration — a mission saved running with no readable duration', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('a run from yesterday ends at load with no outcome and one system log line', () => {
        const yesterday1900 = at(19, 0, -1);
        saveStuck('evening', yesterday1900);
        vi.setSystemTime(at(7, 0));

        const reloaded = loadPersistedState();

        expect(reloaded.activeMission).toBe('none');
        expect(mission(reloaded, 'evening').active).toBe(false);
        expect(mission(reloaded, 'evening').startedAt).toBeUndefined();
        expect(mission(reloaded, 'evening').lastActiveAt).toBe(yesterday1900.toISOString());
        expect(reloaded.missedMissionStreak, 'a miss charged for a data bug').toBe(0);
        expect(reloaded.lastCompletedOrFailedEveningDate, 'recorded as a conclusion').toBeNull();
        const lines = reloaded.activityLogs.filter(l => l.message.includes('ended at startup'));
        expect(lines).toHaveLength(1);
        expect(lines[0].source).toBe('system');
        expect(lines[0].message).toMatch(/^Evening mission from \d{4}-\d{2}-\d{2} ended at startup/);
    });

    it('lifecycle: tonight’s evening still starts on time after that', () => {
        saveStuck('evening', at(19, 0, -1));
        vi.setSystemTime(at(7, 0));
        const { live, unmount } = renderLiveScheduler(loadPersistedState());
        step(100);

        jumpTo(at(19, 0, 0, 30));
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a run from today keeps running with its window’s length, and ends normally', () => {
        saveStuck('morning', at(6, 0));
        vi.setSystemTime(at(6, 10));

        const reloaded = loadPersistedState();

        expect(reloaded.activeMission).toBe('morning');
        expect(mission(reloaded, 'morning').durationMins).toBe(30);
        expect(reloaded.activityLogs.some(l => l.message.includes('ended at startup'))).toBe(false);
    });

    it('a mission that already ended (active false) gets no duration back', () => {
        // SET_ACTIVE_MISSION 'none' keeps startedAt and clears durationMins, so
        // every timed-out mission looks like this on disk.
        saveStuck('morning', at(6, 0), { active: false });
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'), activeMission: 'none' }));
        vi.setSystemTime(at(9, 0));

        const reloaded = loadPersistedState();

        expect(mission(reloaded, 'morning').durationMins ?? null).toBeNull();
        expect(reloaded.activityLogs.some(l => l.message.includes('ended at startup'))).toBe(false);
    });
});
