// ============================================================
// Mission Control — an unparseable mission time arms nothing
// ------------------------------------------------------------
// Found 2026-09-24 by reading the code: clearing Settings → "Auto-trigger at"
// and pressing Save stored `startsAt: ''` and `endsAt: 'NaN:NaN'`. The
// scheduler turned '' into an Invalid Date, armed `setTimeout(fn, NaN)` (which
// fires at once), judged the NaN drift "too late" and logged "Morning mission
// skipped — the  window was missed", then re-armed 1 s later. Forever, on both
// views: a store write, a log line, a localStorage write and a remote
// broadcast every second. Profiles saved since v0.0.42 may already hold it.
//
// The scheduler must fail closed: a time it cannot parse schedules nothing and
// says nothing. The other phase keeps its schedule.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initialState } from '../store/mcReducer';
import { STORAGE_KEY, loadPersistedState } from '../store/useMCStore';
import type { MCState } from '../types';
import { at, INSIDE_WINDOW, renderLiveScheduler, startLogs, step } from './schedulerTestKit';

/** What Save wrote after the morning time field was cleared. */
function clearedMorning(base: MCState = initialState): MCState {
    return {
        ...base,
        settings: { ...base.settings, morningStartsAt: '' },
        missions: base.missions.map(m => (m.phase === 'morning' ? { ...m, startsAt: '', endsAt: 'NaN:NaN' } : m)),
    };
}

function withEveningTaskLock(locksAt: string): MCState {
    return {
        ...initialState,
        missions: initialState.missions.map(m => (m.phase !== 'evening' ? m : {
            ...m,
            tasks: m.tasks.map((t, i) => (i === 0 ? { ...t, locksAt } : t)),
        })),
    };
}

function skippedLogs(state: MCState): number {
    return state.activityLogs.filter(l => l.message.includes('skipped')).length;
}

function nanDelayCalls(spy: { mock: { calls: unknown[][] } }): number {
    return spy.mock.calls.filter(([, delay]) => typeof delay === 'number' && Number.isNaN(delay)).length;
}

describe('scheduler — an unparseable mission start time', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {}); // firedTooLate warns on every fire
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.removeItem(STORAGE_KEY); });

    it.each<[string, [number, number]]>([
        ['outside both windows (12:00)', [12, 0]],
        ['inside the morning window (06:04)', INSIDE_WINDOW.morning],
    ])('logs no "skipped" line and arms no NaN timer — %s', (_label, [h, m]) => {
        vi.setSystemTime(at(h, m));
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const { live, unmount } = renderLiveScheduler(clearedMorning());

        step(5_000);

        expect(skippedLogs(live.state), 'a "mission skipped" line for a time that does not exist').toBe(0);
        expect(nanDelayCalls(setTimeoutSpy), 'setTimeout armed with a NaN delay').toBe(0);
        expect(live.state.activeMission, 'nothing starts on a time that does not exist').toBe('none');
        unmount();
    });

    it('re-arms nothing once mounted: no timer chain on an idle view', () => {
        vi.setSystemTime(at(12, 0));
        const { unmount } = renderLiveScheduler(clearedMorning());
        step(100); // let the mount-time arming settle
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

        step(5_000);

        expect(setTimeoutSpy, 'timers armed in 5 s with nothing due until 19:00').not.toHaveBeenCalled();
        unmount();
    });

    it('guard: the evening mission still starts at 19:00 beside a broken morning', () => {
        vi.setSystemTime(at(18, 59));
        const { live, unmount } = renderLiveScheduler(clearedMorning());

        step(61_000);

        expect(live.state.activeMission).toBe('evening');
        expect(startLogs(live.state, 'evening')).toBe(1);
        unmount();
    });

    it('a profile saved with a cleared morning time relaunches quietly and starts the morning at 06:00', () => {
        // Lifecycle: the bad value is already on disk (since v0.0.42). Hydration
        // repairs it to the default, so tomorrow's morning is not silently lost.
        localStorage.setItem(STORAGE_KEY, JSON.stringify(clearedMorning()));
        vi.setSystemTime(at(5, 59));
        const { live, unmount } = renderLiveScheduler(loadPersistedState());

        step(61_000);

        expect(skippedLogs(live.state)).toBe(0);
        expect(live.state.activeMission).toBe('morning');
        unmount();
    });
});

describe('scheduler — an unparseable task lock time', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'warn').mockImplementation(() => {});
    });
    afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

    // '' is not listed: `if (t.locksAt)` already skips it. A non-empty value
    // that is not HH:MM (hand-edited or corrupted storage) reaches the chain.
    it.each(['NaN:NaN', 'garbage'])('locksAt %j arms no NaN timer and no 1 s chain, and locks nothing', (locksAt) => {
        vi.setSystemTime(at(12, 0));
        const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
        const { live, unmount } = renderLiveScheduler(withEveningTaskLock(locksAt));

        step(5_000);

        expect(nanDelayCalls(setTimeoutSpy), 'setTimeout armed with a NaN delay').toBe(0);
        const evening = live.state.missions.find(m => m.phase === 'evening');
        expect(evening?.tasks.some(t => t.locked)).toBe(false);
        setTimeoutSpy.mockClear();
        step(5_000);
        expect(setTimeoutSpy, 'timers re-armed in 5 s for a lock time that does not exist').not.toHaveBeenCalled();
        unmount();
    });
});
