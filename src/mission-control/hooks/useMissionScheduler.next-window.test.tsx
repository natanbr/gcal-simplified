// ============================================================
// Mission Control — a run left over from the day before ends inside its
// phase's next window
// ------------------------------------------------------------
// The morning starts Monday 06:04 and the app is quit (or the machine sleeps)
// at 06:10 with tasks open. Tuesday 06:15 the 15 s tick finds Monday's run
// over and records the miss. Its END was stamped at the tick (Tuesday 06:15),
// so the scheduler read Tuesday's 06:00 occurrence as already run: no morning,
// no "skipped" line, and games shut all day (review of PR 193, V1). A run's end
// is now stamped at its DUE end when it ended later than that
// (store/missionActivity.ts): Monday 06:34.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { isQuickGameWindowOpen } from '../store/gameWindow';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { at, launchInsideWindow, renderLiveScheduler, saveAndClose, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

const morningOnly = (s: MCState): MCState => ({ ...s, missions: s.missions.filter(m => m.phase === 'morning') });

/** Monday: the morning starts at 06:04 and the app closes at 06:10, the run still going. */
function mondayMorningLeftRunning(): Date {
    const monday = at(6, 4);
    const harness = launchInsideWindow('morning', morningOnly({ ...initialState }));
    step(6 * 60_000);
    saveAndClose(harness);
    return monday;
}

/** Tuesday, at the given time: the app starts again on what Monday saved. */
function relaunchTuesday(h: number, m: number) {
    vi.setSystemTime(at(h, m, 1));
    return renderLiveScheduler(morningOnly(loadPersistedState()));
}

describe('Monday’s morning, left running, ends during Tuesday’s', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    it('relaunched at 06:15: Monday’s miss is recorded, and Tuesday’s morning starts', () => {
        const monday = mondayMorningLeftRunning();
        const { live, unmount } = relaunchTuesday(6, 15);
        step(20_000);

        expect(live.state.missedMissionStreak, 'Monday’s miss').toBe(1);
        expect(live.state.lastCompletedOrFailedMorningDate).toBe(getLocalDateString(monday));
        expect(live.state.activeMission, 'Tuesday’s morning was taken as already run').toBe('morning');
        expect(startLogs(live.state, 'morning')).toBe(2);
        unmount();
    });

    it('Monday’s run is stamped as ended at its due end, 06:34, not at Tuesday’s tick', () => {
        const monday = mondayMorningLeftRunning();
        const { live, unmount } = relaunchTuesday(7, 0);
        step(20_000);

        expect(live.state.missions[0].lastActiveAt).toBe(new Date(monday.getTime() + 30 * 60_000).toISOString());
        unmount();
    });

    it('relaunched at 05:50: Tuesday’s morning starts at 06:00', () => {
        mondayMorningLeftRunning();
        const { live, unmount } = relaunchTuesday(5, 50);
        step(20_000);
        expect(live.state.activeMission, 'Monday’s run expired').toBe('none');

        step(10 * 60_000);
        expect(live.state.activeMission).toBe('morning');
        unmount();
    });

    it('relaunched at 07:00: no morning today, and Monday’s miss is dated Monday', () => {
        const monday = mondayMorningLeftRunning();
        const { live, unmount } = relaunchTuesday(7, 0);
        step(20_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'morning')).toBe(1);
        expect(live.state.lastCompletedOrFailedMorningDate).toBe(getLocalDateString(monday));
        // Tuesday's morning never ran, so its games stay shut (requirements → Quick-game window).
        expect(isQuickGameWindowOpen(live.state, at(10, 0, 1).toISOString())).toBe(false);
        unmount();
    });
});

describe('yesterday’s stuck run, ended at a launch inside today’s window', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    it('END_STALE_MISSION_RUN stamps yesterday’s due end, so tonight’s evening starts', () => {
        // Saved running since yesterday 19:00 with no readable duration (JSON's null).
        vi.setSystemTime(at(19, 10));
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...initialState,
            activeMission: 'evening',
            missions: initialState.missions.map(m => (m.phase === 'evening'
                ? { ...m, active: true, startedAt: at(19, 0, -1).toISOString(), durationMins: null }
                : m)),
        }));
        const loaded = loadPersistedState();
        const { live, dispatch, unmount } = renderLiveScheduler({ ...loaded, missions: loaded.missions.filter(m => m.phase === 'evening') });
        dispatch({ type: 'END_STALE_MISSION_RUN', missionPhase: 'evening', origin: 'system' });
        step(2_000);

        expect(live.state.activeMission, 'tonight’s evening was taken as already run').toBe('evening');
        unmount();
    });
});
