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
// So hydration only DETECTS a stuck run whose window closed before today and
// leaves it as saved; END_STALE_MISSION_RUN, dispatched once after load
// (useStaleMissionRunEnd), ends it with no outcome, like a Stop, and its log
// line reaches the audit trail (useStaleMissionRunEnd.test.tsx). A run whose
// window reaches today gets its window's length and ends normally.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import { createLogEntry } from './activityLog';
import { staleIncompleteRunPhases } from './staleMissionRun';
import { isEconomyLocked, MISSED_LOCK_THRESHOLD } from './missionStreak';
import { REMOTE_ALLOWED_ACTIONS } from '../hooks/useRemoteControl';
import { at, jumpTo, renderLiveScheduler, startLogs, step } from '../hooks/schedulerTestKit';
import type { MCAction, MCState, MissionPhase } from '../types';

type Phase = Exclude<MissionPhase, 'none'>;

/** Saves `phase` as running since `startedAt` with the null duration JSON wrote. */
function saveStuck(phase: Phase, startedAt: Date, extra: Record<string, unknown> = {}, top: Record<string, unknown> = {}): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...initialState,
        activeMission: phase,
        ...top,
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

const startupLines = (s: MCState) => s.activityLogs.filter(l => l.message.includes('ended at startup'));
// No timestamp: a stamped action also runs the mood-gauge sync, which is not under test.
const endRun = (phase: Phase): MCAction => ({ type: 'END_STALE_MISSION_RUN', missionPhase: phase, origin: 'system' });

describe('hydration — a mission saved running with no readable duration', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('a run from yesterday loads as saved and is detected, not ended, by hydration', () => {
        // Ending it inside loadPersistedState wrote a line the audit trail never
        // saw: useAuditTrail treats every loaded entry as already written.
        saveStuck('evening', at(19, 0, -1));
        vi.setSystemTime(at(7, 0));

        const reloaded = loadPersistedState();

        expect(reloaded.activeMission).toBe('evening');
        expect(mission(reloaded, 'evening').active).toBe(true);
        expect(mission(reloaded, 'evening').durationMins ?? null, 'a duration would end it on the first tick, as a miss').toBeNull();
        expect(startupLines(reloaded)).toHaveLength(0);
        expect(staleIncompleteRunPhases(reloaded)).toEqual(['evening']);
    });

    it('a run from today keeps running with its window’s length, and ends normally', () => {
        saveStuck('morning', at(6, 0));
        vi.setSystemTime(at(6, 10));

        const reloaded = loadPersistedState();

        expect(reloaded.activeMission).toBe('morning');
        expect(mission(reloaded, 'morning').durationMins).toBe(30);
        expect(staleIncompleteRunPhases(reloaded)).toEqual([]);
    });

    it('an overnight run whose window reaches today is not an earlier day’s: 23:30 + 60, launched at 00:10', () => {
        // The window END is compared with midnight, not the start.
        saveStuck('evening', at(23, 30, -1), {}, {
            settings: { ...initialState.settings, eveningStartsAt: '23:30', eveningDurationMins: 60 },
        });
        vi.setSystemTime(at(0, 10));

        const reloaded = loadPersistedState();

        expect(mission(reloaded, 'evening').active).toBe(true);
        expect(mission(reloaded, 'evening').durationMins).toBe(60);
        expect(staleIncompleteRunPhases(reloaded)).toEqual([]);
    });

    it('a mission that already ended (active false) from yesterday gets no duration and is not ended again', () => {
        // SET_ACTIVE_MISSION 'none' keeps startedAt and clears durationMins, so
        // every normally ended mission looks like this on disk.
        saveStuck('morning', at(6, 0, -1), { active: false }, { activeMission: 'none' });
        vi.setSystemTime(at(9, 0));

        const reloaded = loadPersistedState();

        expect(mission(reloaded, 'morning').durationMins ?? null).toBeNull();
        expect(staleIncompleteRunPhases(reloaded)).toEqual([]);
    });
});

describe('END_STALE_MISSION_RUN — ends an earlier day’s stuck run with no outcome', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); localStorage.removeItem(STORAGE_KEY); });

    it('like a Stop: no miss, no conclusion date, the run cleared, the start/end stamped', () => {
        saveStuck('evening', at(19, 0, -1));
        vi.setSystemTime(at(7, 0));
        const loaded = loadPersistedState();

        const next = mcReducer(loaded, endRun('evening'));

        expect(next.activeMission).toBe('none');
        expect(mission(next, 'evening').active).toBe(false);
        expect(mission(next, 'evening').startedAt).toBeUndefined();
        expect(next.missedMissionStreak, 'a miss charged for a data bug').toBe(0);
        expect(next.lastCompletedOrFailedEveningDate, 'recorded as a conclusion').toBeNull();
        // Its end is stamped at its due end (yesterday 19:00 + the 60-min window), not at
        // this launch: a launch inside the next evening's window must not read that one as run.
        expect(mission(next, 'evening').lastActiveAt).toBe(at(20, 0, -1).toISOString());
        const line = createLogEntry(endRun('evening'), loaded);
        expect(line?.message).toMatch(/^Evening mission from \d{4}-\d{2}-\d{2} ended at startup: its saved record was incomplete$/);
    });

    it('is a no-op on a mission that is not an earlier day’s stuck run: same state, no line', () => {
        saveStuck('morning', at(6, 0));
        vi.setSystemTime(at(6, 10));
        const loaded = loadPersistedState();

        expect(mcReducer(loaded, endRun('morning'))).toBe(loaded);
        expect(createLogEntry(endRun('morning'), loaded)).toBeNull();
    });

    it('is not refused by a broken shield: it frees the store and moves no token', () => {
        saveStuck('evening', at(19, 0, -1), {}, { missedMissionStreak: MISSED_LOCK_THRESHOLD });
        vi.setSystemTime(at(7, 0));
        const loaded = loadPersistedState();
        expect(isEconomyLocked(loaded), 'precondition: the shield is broken').toBe(true);

        const next = mcReducer(loaded, endRun('evening'));

        expect(next.activeMission).toBe('none');
        expect(next.missedMissionStreak).toBe(MISSED_LOCK_THRESHOLD);
        expect(createLogEntry(endRun('evening'), loaded)).not.toBeNull();
    });

    it('is not a remote action: the phone cannot end a mission with no outcome', () => {
        expect(REMOTE_ALLOWED_ACTIONS.has('END_STALE_MISSION_RUN')).toBe(false);
    });

    it('lifecycle: tonight’s evening still starts on time after it', () => {
        saveStuck('evening', at(19, 0, -1));
        vi.setSystemTime(at(7, 0));
        const { live, dispatch, unmount } = renderLiveScheduler(loadPersistedState());
        dispatch(endRun('evening'));
        step(100);

        jumpTo(at(19, 0, 0, 30));
        step(100);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });
});
