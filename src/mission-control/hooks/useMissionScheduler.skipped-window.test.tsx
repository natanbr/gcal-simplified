// ============================================================
// Mission Control — a window that passed while the app was closed or asleep
// ------------------------------------------------------------
// "Scheduler actions are never silent": a timer that fires after its window
// closed (the machine slept) writes "⏭️ … mission skipped". But a relaunch, or
// the re-arm after a wake that ran before the stale timer, aimed straight at
// the next occurrence and wrote nothing, so the parent never learned the window
// was missed. Now the arm reports the last window that closed without running,
// once: never again on a later launch, never a second line when the stale timer
// and the re-arm both see it. A skip charges no shield and records no outcome.
//
// Every instant is taken before the clock moves: `at` counts from the faked
// "today", so `at(0, 40, 1)` read after a jump past midnight is a day later.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState, mcReducer } from '../store/mcReducer';
import { getLocalDateString } from '../store/behaviorSync';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import {
    at, eveningOnlyAt, loadEveningOnly, ranOnce, renderLiveScheduler, saveAndClose, skippedLines, startLogs, step,
} from './schedulerTestKit';
import type { MCState } from '../types';

/** Evening 23:30 for 60 min (open until 00:30), which ran the night before last. */
const lateEvening = () => ranOnce(eveningOnlyAt('23:30', 60), 'evening', at(23, 30, -1));

/** The defaults with only the morning (06:00–06:30), which ran yesterday. */
const morningOnly = (s: MCState): MCState => ({ ...s, missions: s.missions.filter(m => m.phase === 'morning') });

describe('a window that passed while the app was closed', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    it('relaunched at 00:40, after last night’s 23:30–00:30: not started, one line, no shield, no outcome', () => {
        const state = lateEvening();
        const nightBefore = getLocalDateString(at(23, 30, -1));
        vi.setSystemTime(at(0, 40, 1));
        const { live, unmount } = renderLiveScheduler(state);
        step(3_000);

        expect(live.state.activeMission).toBe('none');
        expect(skippedLines(live.state, 'evening'), 'the missed window left no trace').toBe(1);
        expect(live.state.activityLogs[0].message).toBe('Evening mission skipped — the 23:30 window was missed (machine asleep)');
        expect(live.state.activityLogs[0].source).toBe('scheduler');
        expect(live.state.missedMissionStreak, 'a skip is not a miss').toBe(0);
        expect(live.state.lastCompletedOrFailedEveningDate, 'nor a conclusion').toBe(nightBefore);
        unmount();
    });

    it('relaunched again the same night, and the next morning: no second line', () => {
        const state = lateEvening();
        const relaunches = [at(0, 40, 1), at(1, 30, 1), at(9, 0, 1)];
        vi.setSystemTime(relaunches[0]);
        const first = renderLiveScheduler(state);
        step(3_000);
        expect(skippedLines(first.live.state, 'evening'), 'precondition').toBe(1);
        // Another line after it, as any day has: ADD_LOG drops only a replay of the NEWEST entry.
        first.dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' });
        expect(first.live.state.activityLogs[0].message, 'precondition: the skip is no longer the newest line').not.toMatch(/skipped/);
        saveAndClose(first);

        for (const when of relaunches.slice(1)) {
            vi.setSystemTime(when);
            const again = renderLiveScheduler(loadEveningOnly());
            step(3_000);
            expect(skippedLines(again.live.state, 'evening'), `relaunched at ${when.toTimeString()}`).toBe(1);
            saveAndClose(again);
        }
    });

    it('the morning: closed over 06:00–06:30, relaunched at 07:00 and at 09:00, one line', () => {
        const state = morningOnly(ranOnce({ ...initialState }, 'morning', at(6, 0, -1)));
        const [seven, nine] = [at(7, 0), at(9, 0)];
        vi.setSystemTime(seven);
        const first = renderLiveScheduler(state);
        step(3_000);
        expect(first.live.state.activeMission).toBe('none');
        expect(skippedLines(first.live.state, 'morning')).toBe(1);
        expect(first.live.state.activityLogs[0].message).toBe('Morning mission skipped — the 06:00 window was missed (machine asleep)');
        first.dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' }); // not the newest line any more
        saveAndClose(first);

        vi.setSystemTime(nine);
        const again = renderLiveScheduler(morningOnly(loadPersistedState()));
        step(3_000);
        expect(skippedLines(again.live.state, 'morning')).toBe(1);
        again.unmount();
    });

    it('closed for a whole day, relaunched inside today’s window: yesterday’s gets its line, then today’s starts', () => {
        // Starting today's first would stamp the run, and yesterday's would read as run: no line.
        const state = ranOnce({ ...initialState, missions: initialState.missions.filter(m => m.phase === 'evening') }, 'evening', at(19, 0, -2));
        vi.setSystemTime(at(19, 10));
        const { live, unmount } = renderLiveScheduler(state);
        step(3_000);

        expect(skippedLines(live.state, 'evening'), 'yesterday’s 19:00').toBe(1);
        expect(live.state.activeMission, 'today’s 19:00').toBe('evening');
        // Newest first: the skipped line came before the start.
        expect(live.state.activityLogs.map(l => l.message.split(' ').slice(0, 3).join(' '))).toEqual(['evening mission started', 'Evening mission skipped']);
        unmount();
    });

    it('KNOWN LIMIT: a Settings save moving a start to a time already passed today writes the line at once', () => {
        // At 07:30 the 08:00 morning (which ran yesterday) is moved to 07:00: its window
        // closed at 07:30, so today's morning will not run. True, but the line says
        // "machine asleep" (requirements → Mission scheduling → Known limits, 2026-10-06).
        const state = morningOnly(ranOnce(mcReducer(initialState, { type: 'SET_SETTINGS', settings: { morningStartsAt: '08:00' } }), 'morning', at(8, 0, -1)));
        vi.setSystemTime(at(7, 30));
        const { live, dispatch, unmount } = renderLiveScheduler(state);
        step(3_000);
        expect(skippedLines(live.state, 'morning'), 'precondition').toBe(0);
        dispatch({ type: 'SET_SETTINGS', settings: { morningStartsAt: '07:00' } });
        step(3_000);

        expect(skippedLines(live.state, 'morning')).toBe(1);
        expect(live.state.activeMission).toBe('none');
        unmount();
    });

    it('a window whose evening ran and finished writes no line', () => {
        const state = ranOnce(eveningOnlyAt('23:30', 60), 'evening', at(23, 30));
        vi.setSystemTime(at(0, 40, 1));
        const { live, unmount } = renderLiveScheduler(state);
        step(3_000);
        expect(skippedLines(live.state, 'evening')).toBe(0);
        unmount();
    });

    it('a profile on which the mission never ran writes no line at launch: nothing says the app existed then', () => {
        vi.setSystemTime(at(0, 40, 1));
        const { live, unmount } = renderLiveScheduler(eveningOnlyAt('23:30', 60));
        step(3_000);
        expect(live.state.activityLogs).toHaveLength(0);
        unmount();
    });
});

describe('a window slept through with the app open', () => {
    beforeEach(() => { vi.useFakeTimers(); localStorage.removeItem(STORAGE_KEY); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); delete window.ipcRenderer; });

    it('asleep 23:00–01:00, the wake’s re-arm writes one line, before the stale timer fires', () => {
        // A profile with no history: the window began while this session was up.
        const wake = at(1, 0, 1);
        vi.setSystemTime(at(23, 0));
        const { live, emit, unmount } = renderLiveScheduler(eveningOnlyAt('23:30', 60), { ipc: true });
        step(100);
        // The 23:30 timer keeps its 30 min of queue time; the re-arm clears it.
        vi.setSystemTime(wake);
        emit('system:resume');
        step(3_000);

        expect(live.state.activeMission).toBe('none');
        expect(skippedLines(live.state, 'evening'), 'the re-arm passed over it in silence').toBe(1);
        unmount();
    });

    it('the stale timer fires first and logs it, then the wake’s re-arm: still one line', () => {
        const wake = at(1, 0, 1);
        vi.setSystemTime(at(23, 0));
        const { live, emit, unmount } = renderLiveScheduler(eveningOnlyAt('23:30', 60), { ipc: true });
        step(100);
        vi.setSystemTime(wake);
        step(31 * 60_000); // the stale timer fires at about 01:30, its window long closed
        expect(skippedLines(live.state, 'evening'), 'precondition: the late fire logged it').toBe(1);
        emit('system:resume');
        step(3_000);

        expect(skippedLines(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('woken, then relaunched: still one line', () => {
        // With a history, so the relaunch has its own reason to report the window.
        const state = lateEvening();
        const [wake, relaunch] = [at(1, 0, 1), at(1, 30, 1)];
        vi.setSystemTime(at(23, 0));
        const first = renderLiveScheduler(state, { ipc: true });
        step(100);
        vi.setSystemTime(wake);
        first.emit('system:resume');
        step(3_000);
        expect(skippedLines(first.live.state, 'evening'), 'precondition').toBe(1);
        first.dispatch({ type: 'ADD_TOKENS', amount: 1, source: 'manual' }); // not the newest line any more
        saveAndClose(first);

        vi.setSystemTime(relaunch);
        const relaunched = renderLiveScheduler(loadEveningOnly());
        step(3_000);
        expect(skippedLines(relaunched.live.state, 'evening')).toBe(1);
        relaunched.unmount();
    });
});

describe('the 10-second test duration', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    /** Evening 23:58 for 10 s, which ran the night before. A start up to 5 min late is on time. */
    function tenSeconds(): MCState {
        const s = mcReducer(initialState, { type: 'SET_SETTINGS', settings: { eveningStartsAt: '23:58', eveningDurationMins: 1 / 6 } });
        return ranOnce({ ...s, missions: s.missions.filter(m => m.phase === 'evening') }, 'evening', at(23, 58, -1));
    }

    it('relaunched at 00:02, 4 min after its start, it starts, dated the night before', () => {
        const state = tenSeconds();
        const night = getLocalDateString(at(23, 58));
        vi.setSystemTime(at(0, 2, 1));
        const { live, unmount } = renderLiveScheduler(state);
        step(1_000);
        expect(startLogs(live.state, 'evening'), 'a late timer at 00:02 starts it; a relaunch did not').toBe(1);
        expect(live.state.missions[0].occurrenceDate).toBe(night);
        unmount();
    });

    it('relaunched at 00:05, past the 5 min tolerance: not started, one line', () => {
        const state = tenSeconds();
        vi.setSystemTime(at(0, 5, 1));
        const { live, unmount } = renderLiveScheduler(state);
        step(3_000);
        expect(live.state.activeMission).toBe('none');
        expect(skippedLines(live.state, 'evening')).toBe(1);
        unmount();
    });
});
