// ============================================================
// Mission Control — a relaunch or a wake after midnight, inside last night's
// window
// ------------------------------------------------------------
// An evening at 23:30 for 60 min is open until 00:30. Since PR 193 a late TIMER
// at 00:10 starts it, but a relaunch, or the re-arm after the machine wakes,
// aimed at the NEXT 23:30: last night's window, still open, never started and
// nothing was logged (the known limit PR 193 documented). Every arm and every
// fire now asks one question, store/missionOccurrence.ts openOccurrence: which
// occurrence is open right now. The "already handled" rules are the existing
// ones (a run since its start, its outcome date, a run going now).
//
// Every instant is taken before the clock moves: `at` counts from the faked
// "today", so `at(0, 10, 1)` read after a jump past midnight is a day later.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getLocalDateString } from '../store/behaviorSync';
import { STORAGE_KEY } from '../store/useMCStore';
import {
    at, crossing, eveningOnlyAt, jumpTo, loadEveningOnly, ranOnce, renderLiveScheduler, saveAndClose, skippedLines,
    startLogs, step,
} from './schedulerTestKit';
import type { MCState } from '../types';

const evening = (s: MCState) => s.missions.find(m => m.phase === 'evening');

/** Tonight 23:30 (day 0), 00:10 and 01:10 after it, and the evening 23:30 for 60 min that also ran the night before. */
function night() {
    return {
        tonight: at(23, 30),
        lastNight: getLocalDateString(at(23, 30)),
        relaunch: at(0, 10, 1),
        runEnds: at(1, 10, 1),
        state: ranOnce(eveningOnlyAt('23:30', 60), 'evening', at(23, 30, -1)),
    };
}

describe('a relaunch after midnight inside last night’s evening window', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); delete window.ipcRenderer; });

    it('relaunched at 00:10, last night’s evening starts, dated last night', () => {
        const { lastNight, relaunch, runEnds, state } = night();
        vi.setSystemTime(relaunch);
        const { live, unmount } = renderLiveScheduler(state);
        step(1_000);

        expect(live.state.activeMission, 'aimed at tonight’s 23:30 instead').toBe('evening');
        expect(evening(live.state)?.occurrenceDate).toBe(lastNight);
        expect(skippedLines(live.state, 'evening')).toBe(0);

        crossing(runEnds); // a late start runs its full length, as a late timer’s does
        expect(live.state.lastCompletedOrFailedEveningDate, 'the miss is last night’s').toBe(lastNight);
        unmount();
    });

    it('woken from sleep at 00:10, the re-arm starts it, dated last night', () => {
        const { lastNight, relaunch, state } = night();
        vi.setSystemTime(at(22, 0));
        const { live, emit, unmount } = renderLiveScheduler(state, { ipc: true });
        step(100);
        // The machine sleeps at 22:00 and wakes at 00:10. vi.setSystemTime keeps the
        // 23:30 timer's 1 h 30 of queue time, so only the resume's re-arm can start it.
        vi.setSystemTime(relaunch);
        emit('system:resume');
        step(1_000);

        expect(live.state.activeMission).toBe('evening');
        expect(evening(live.state)?.occurrenceDate).toBe(lastNight);
        unmount();
    });

    it('finished at 23:55, a relaunch at 00:10 does not start it again', () => {
        const { relaunch, state } = night();
        const finished = at(23, 55);
        vi.setSystemTime(at(23, 40));
        const first = renderLiveScheduler(state);
        step(100);
        expect(first.live.state.activeMission, 'precondition: tonight’s evening runs').toBe('evening');
        jumpTo(finished);
        first.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'evening', bonusTokens: 2 });
        step(1_000);
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        const relaunched = renderLiveScheduler(loadEveningOnly());
        step(2_000);
        expect(relaunched.live.state.activeMission).toBe('none');
        expect(startLogs(relaunched.live.state, 'evening')).toBe(1);
        expect(skippedLines(relaunched.live.state, 'evening')).toBe(0);
        relaunched.unmount();
    });

    it('finished after midnight (00:05), a relaunch at 00:10 does not start it again', () => {
        const { relaunch, state } = night();
        const finished = at(0, 5, 1);
        vi.setSystemTime(at(23, 40));
        const first = renderLiveScheduler(state);
        step(100);
        jumpTo(finished);
        first.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'evening', bonusTokens: 2 });
        step(1_000);
        expect(first.live.state.activeMission, 'precondition: finished').toBe('none');
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        const relaunched = renderLiveScheduler(loadEveningOnly());
        step(2_000);
        expect(relaunched.live.state.activeMission).toBe('none');
        expect(startLogs(relaunched.live.state, 'evening')).toBe(1);
        relaunched.unmount();
    });

    it('stopped from the phone at 23:50, a relaunch at 00:10 does not restart it', () => {
        const { relaunch, state } = night();
        const stopped = at(23, 50);
        vi.setSystemTime(at(23, 40));
        const first = renderLiveScheduler(state);
        step(100);
        jumpTo(stopped);
        first.dispatch({ type: 'CANCEL_MISSION', missionPhase: 'evening', origin: 'remote' });
        step(1_000);
        expect(first.live.state.activeMission, 'precondition: stopped').toBe('none');
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        const relaunched = renderLiveScheduler(loadEveningOnly());
        step(2_000);
        expect(relaunched.live.state.activeMission).toBe('none');
        expect(startLogs(relaunched.live.state, 'evening')).toBe(1);
        expect(relaunched.live.state.missedMissionStreak, 'a stop is not a miss').toBe(0);
        relaunched.unmount();
    });

    it('a cleared start time: a relaunch at 00:10 starts nothing and logs nothing', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const { relaunch, state } = night();
        const cleared: MCState = {
            ...state,
            settings: { ...state.settings, eveningStartsAt: '' },
            missions: state.missions.map(m => ({ ...m, startsAt: '', endsAt: 'NaN:NaN' })),
        };
        vi.setSystemTime(relaunch);
        const { live, unmount } = renderLiveScheduler(cleared);
        step(5_000);

        expect(live.state.activeMission).toBe('none');
        expect(live.state.activityLogs).toHaveLength(0);
        unmount();
    });
});
