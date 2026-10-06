// ============================================================
// Mission Control — a mission window that crosses midnight
// ------------------------------------------------------------
// An evening at 23:30 for 60 min stores `endsAt: '24:30'`: the end is start +
// duration, not wrapped, and the scheduler reads it as 00:30 the next day. The
// strict HH:MM rule for entered times rejects '24:30', so reading the end with
// it (or wrapping it to '00:30') loses tonight's mission without a word. Every
// other scheduler suite uses daytime windows, so nothing else would notice
// (review of the 2026-09-26 parser consolidation, found by mutation).
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import { at, crossing, jumpTo, renderLiveScheduler, saveAndClose, startLogs, step } from './schedulerTestKit';
import type { MCState } from '../types';

/** Evening 23:30 for 60 min, derived the way Settings → Save derives it. */
function lateEvening(): MCState {
    const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:30', eveningDurationMins: 60 } });
    expect(s.missions.find(m => m.phase === 'evening')?.endsAt, 'precondition').toBe('24:30');
    return s;
}

/** The same, without the morning: a 06:00 morning would run in the middle of a day-long jump. */
function lateEveningOnly(): MCState {
    const s = lateEvening();
    return { ...s, missions: s.missions.filter(m => m.phase === 'evening') };
}

const skippedLogs = (s: MCState) => s.activityLogs.filter(l => l.message.startsWith('Evening mission skipped')).length;

describe('an evening window that crosses midnight', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a launch at 23:40 starts tonight’s mission, not tomorrow’s', () => {
        vi.setSystemTime(at(23, 40));
        const { live, unmount } = renderLiveScheduler(lateEvening());
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a timer that fires 30 min late, inside the window before midnight, still starts it', () => {
        vi.setSystemTime(at(23, 20));
        const { live, unmount } = renderLiveScheduler(lateEvening());
        step(100);
        expect(live.state.activeMission, 'precondition: armed, not started').toBe('none');

        // The machine sleeps through 23:30. vi.setSystemTime keeps the pending
        // timer's remaining delay, so it fires at about 23:59:59.9: past the
        // 5 min tolerance, so only the window end read from '24:30' keeps it on
        // time. The same late timer firing after midnight, still inside the
        // window, starts it too (the cases below). What does NOT start it is a
        // relaunch or the resume re-arm after midnight: those aim at tonight's
        // occurrence (an older limit).
        vi.setSystemTime(at(23, 50));
        jumpTo(at(0, 0, 1));
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(skippedLogs(live.state), 'logged as skipped').toBe(0);
        unmount();
    });
});

// An outcome after midnight used to be dated by the clock, so the next day's
// evening counted as done and never started: no start, no miss, no line. The
// outcome is now dated by the day its occurrence began, and the scheduler
// compares an occurrence with its own start day (store/occurrenceDay.ts).
describe('an overnight evening that ends after midnight leaves the next evening alone', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    it('timed out at 00:40, the next evening still starts at 23:30, and both misses count', () => {
        const launch = at(23, 40);
        const firstEnd = at(0, 40, 1); // 60 min after the 23:40 start
        const nextStart = at(23, 30, 1);
        const secondEnd = at(0, 30, 2);
        vi.setSystemTime(launch);
        const { live, unmount } = renderLiveScheduler(lateEveningOnly());
        step(100);
        expect(live.state.activeMission, 'precondition: tonight’s evening runs').toBe('evening');

        crossing(firstEnd);
        expect(live.state.activeMission).toBe('none');
        expect(live.state.missedMissionStreak).toBe(1);
        expect(live.state.lastCompletedOrFailedEveningDate, 'dated the night it began').toBe(getLocalDateString(launch));

        jumpTo(new Date(nextStart.getTime() - 1000));
        step(2_000);
        expect(live.state.activeMission, 'the next evening was taken as already done').toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(2);

        crossing(secondEnd);
        expect(live.state.missedMissionStreak, 'the second night’s miss counts too').toBe(2);
        unmount();
    });

    it('finished at 00:15, then relaunched inside the next evening’s window, that evening starts', () => {
        const launch = at(23, 40);
        const finished = at(0, 15, 1);
        const nextEvening = at(23, 40, 1);
        vi.setSystemTime(launch);
        const first = renderLiveScheduler(lateEveningOnly());
        step(100);
        jumpTo(finished);
        first.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'evening', bonusTokens: 2 });
        step(1_000);
        expect(first.live.state.activeMission, 'precondition: completed').toBe('none');
        saveAndClose(first);

        vi.setSystemTime(nextEvening);
        const relaunched = renderLiveScheduler(loadPersistedState());
        step(1_000);
        expect(relaunched.live.state.activeMission).toBe('evening');
        relaunched.unmount();
    });

    it('relaunched at 00:10 with the run still going, it ends at 00:40 and the next evening starts', () => {
        const launch = at(23, 40);
        const relaunch = at(0, 10, 1);
        const end = at(0, 40, 1);
        const nextStart = at(23, 30, 1);
        vi.setSystemTime(launch);
        const first = renderLiveScheduler(lateEveningOnly());
        step(100);
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        // Hydration puts the default morning back; drop it again, for the same reason as above.
        const loaded = loadPersistedState();
        const { live, unmount } = renderLiveScheduler({ ...loaded, missions: loaded.missions.filter(m => m.phase === 'evening') });
        step(100);
        expect(live.state.activeMission, 'precondition: the saved run resumes').toBe('evening');
        crossing(end);
        expect(live.state.activeMission).toBe('none');
        expect(live.state.lastCompletedOrFailedEveningDate).toBe(getLocalDateString(launch));

        jumpTo(new Date(nextStart.getTime() - 1000));
        step(2_000);
        expect(live.state.activeMission).toBe('evening');
        unmount();
    });
});

// The reader's half: a timer armed for 23:30 that fires after midnight (the
// machine slept, and the resume's re-arm had not run yet) belongs to the
// evening that began before midnight, so it is judged against THAT day.
describe('a late timer after midnight, for an evening already finished before its window', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    /** Started by hand at 23:00 and finished at 23:20: tonight is done. The 23:30 timer is armed. */
    function finishedEarly() {
        vi.setSystemTime(at(23, 0));
        const harness = renderLiveScheduler(lateEveningOnly());
        harness.dispatch({ type: 'SET_ACTIVE_MISSION', phase: 'evening', origin: 'local' });
        jumpTo(at(23, 20));
        harness.dispatch({ type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'evening', bonusTokens: 2 });
        step(1_000);
        expect(harness.live.state.activeMission, 'precondition: finished').toBe('none');
        return harness;
    }

    it('firing inside the window (about 00:25) does not start it a second time', () => {
        const { live, unmount } = finishedEarly();
        // vi.setSystemTime keeps the timer's remaining ~10 min, so it fires at about 00:25.
        vi.setSystemTime(at(0, 15, 1));
        step(11 * 60_000);

        expect(live.state.activeMission).toBe('none');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('firing after the window (about 00:35) logs no "skipped" line for an evening that ran', () => {
        const { live, unmount } = finishedEarly();
        vi.setSystemTime(at(0, 25, 1));
        step(11 * 60_000);

        expect(skippedLogs(live.state)).toBe(0);
        unmount();
    });
});

// The scheduler names the occurrence it starts (SET_ACTIVE_MISSION's
// occurrenceDate), so a run it starts late is dated by its target, whatever the
// window looks like when it ends.
describe('a late start is dated by the scheduler’s own target', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    it('a late timer at about 00:10, inside last night’s window, starts that evening and dates it that night', () => {
        const night = at(23, 20);
        vi.setSystemTime(night);
        const { live, unmount } = renderLiveScheduler(lateEveningOnly());
        step(100);
        vi.setSystemTime(at(0, 0, 1)); // the remaining ~10 min: it fires at about 00:10
        step(11 * 60_000);
        expect(live.state.activeMission, 'the late timer started it').toBe('evening');

        crossing(at(1, 10, 1));
        expect(live.state.lastCompletedOrFailedEveningDate).toBe(getLocalDateString(night));
        unmount();
    });

    it('the 10 s test evening at 23:58, started 4 min late after midnight, is that night’s: the next one still starts', () => {
        // Inside the 5 min late-fire tolerance, but its window (23:58–23:58:10)
        // never crosses midnight, so re-deriving the day at the outcome said "tomorrow".
        const night = at(23, 50);
        vi.setSystemTime(night);
        const tenSeconds = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:58', eveningDurationMins: 1 / 6 } });
        const { live, unmount } = renderLiveScheduler({ ...tenSeconds, missions: tenSeconds.missions.filter(m => m.phase === 'evening') });
        step(100);
        vi.setSystemTime(at(23, 54)); // the timer keeps its ~8 min: it fires at about 00:02
        step(8 * 60_000 + 30_000);
        expect(startLogs(live.state, 'evening'), 'started inside the tolerance').toBe(1);
        expect(live.state.activeMission, 'and expired 10 s later').toBe('none');
        expect(live.state.lastCompletedOrFailedEveningDate).toBe(getLocalDateString(night));

        jumpTo(at(23, 57, 0, 59));
        step(2_000);
        expect(live.state.activeMission, 'the next evening').toBe('evening');
        unmount();
    });
});
