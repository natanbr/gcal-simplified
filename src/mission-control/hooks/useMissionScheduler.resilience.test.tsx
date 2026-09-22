// ============================================================
// Mission Control — scheduler resilience across sleep/resume
// ------------------------------------------------------------
// Regression tests for "missions start at wrong time".
//
// A `setTimeout` armed for 06:00 does not survive a machine suspend: on resume
// it fires late — sometimes hours late — and the old scheduler started a
// "morning" routine in the middle of the afternoon. These tests pin both halves
// of the fix: a late firing is discarded, and a resume re-arms the schedule
// against the real wall clock.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { useMissionScheduler } from './useMissionScheduler';
import { MCContext } from '../store/useMCStore';
import { initialState } from '../store/mcReducer';
import type { MCState, MCAction, MissionTask } from '../types';

const MORNING_AT = '06:00';
const EVENING_AT = '19:00';

function buildState(overrides: Partial<MCState> = {}): MCState {
    return {
        ...initialState,
        missions: [
            {
                phase: 'morning' as const,
                startsAt: MORNING_AT,
                endsAt: '06:30',
                durationMins: 30,
                active: false,
                startedAt: undefined,
                tasks: [],
            },
        ],
        ...overrides,
    };
}

function renderScheduler(state: MCState, dispatch: React.Dispatch<MCAction>) {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
        React.createElement(MCContext.Provider, { value: { state, dispatch } }, children);
    return renderHook(() => useMissionScheduler(), { wrapper });
}

/** Today at a given local time. */
function todayAt(h: number, m: number): Date {
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

function missionStarts(dispatch: ReturnType<typeof vi.fn>): boolean {
    return dispatch.mock.calls.some(
        ([action]) => action?.type === 'SET_ACTIVE_MISSION' && action?.phase === 'morning'
    );
}

/** Captures `system:resume` subscribers so tests can simulate a machine wake. */
function stubIpcRenderer() {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const unsubscribe = vi.fn();
    window.ipcRenderer = {
        on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
            listeners[channel] = listener;
            return unsubscribe;
        }),
        invoke: vi.fn().mockResolvedValue(undefined),
    };
    return { listeners, unsubscribe };
}

describe('mission scheduler — sleep/resume resilience', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        delete window.ipcRenderer;
    });

    it('starts the mission when the timer fires on time', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);
        vi.advanceTimersByTime(60_000); // reaches exactly 06:00

        expect(missionStarts(dispatch)).toBe(true);
        unmount();
    });

    it('does NOT start the mission when the timer fires hours late (machine was asleep)', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);

        // Simulate a suspend: the wall clock jumps forward without the timer
        // queue advancing — exactly what a laptop lid does to a pending timeout.
        vi.setSystemTime(todayAt(11, 30));
        vi.advanceTimersByTime(60_000); // the 06:00 timeout finally runs, ~5.5h late

        expect(missionStarts(dispatch)).toBe(false);
        unmount();
    });

    it('still tolerates a small delay — a few seconds late is on time', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);

        vi.setSystemTime(new Date(todayAt(5, 59).getTime() + 30_000)); // 30s of drift
        vi.advanceTimersByTime(60_000);

        expect(missionStarts(dispatch)).toBe(true);
        unmount();
    });

    it('re-arms after a skipped firing instead of going silent for the day', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);

        vi.setSystemTime(todayAt(11, 30));
        vi.advanceTimersByTime(60_000);
        expect(missionStarts(dispatch)).toBe(false);

        // A skipped occurrence must still schedule the next one — otherwise one
        // suspend would disable the mission permanently.
        vi.advanceTimersByTime(1_000);
        expect(vi.getTimerCount()).toBeGreaterThan(0);
        unmount();
    });

    it('subscribes to the main process resume signal', () => {
        const { listeners } = stubIpcRenderer();
        vi.setSystemTime(todayAt(5, 0));

        const { unmount } = renderScheduler(buildState(), vi.fn());

        expect(listeners['system:resume']).toBeTypeOf('function');
        unmount();
    });

    it('re-arms against the real clock on resume, so a slept-through timer is rebuilt', () => {
        const { listeners } = stubIpcRenderer();
        const dispatch = vi.fn();

        // Arm at 05:00 — the timer is a full hour out.
        vi.setSystemTime(todayAt(5, 0));
        const { unmount } = renderScheduler(buildState(), dispatch);

        // The machine sleeps and wakes at 05:59. The original timer still
        // believes it has an hour of queue time left.
        vi.setSystemTime(todayAt(5, 59));
        act(() => {
            listeners['system:resume']();
        });

        // Only 60s of queue time. Without the resume re-arm the stale timer would
        // need another full hour, and nothing would fire here.
        vi.advanceTimersByTime(60_000);

        expect(missionStarts(dispatch)).toBe(true);
        unmount();
    });

    it('unsubscribes from the resume signal on unmount', () => {
        const { unsubscribe } = stubIpcRenderer();
        vi.setSystemTime(todayAt(5, 0));

        const { unmount } = renderScheduler(buildState(), vi.fn());
        unmount();

        expect(unsubscribe).toHaveBeenCalled();
    });

    it('attributes scheduler-driven mission starts so they are never silent in the log', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);
        vi.advanceTimersByTime(60_000);

        const start = dispatch.mock.calls.find(([a]) => a?.type === 'SET_ACTIVE_MISSION');
        expect(start?.[0].origin).toBe('scheduler');

        // The logging interceptor must also have produced an entry — a mission
        // that starts with nothing in the log is the original complaint.
        const log = dispatch.mock.calls.find(([a]) => a?.type === 'ADD_LOG');
        expect(log, 'scheduler-driven mission start produced no log entry').toBeDefined();
        expect(log?.[0].log.source).toBe('scheduler');
        unmount();
    });

    it('starts the mission when a late fire still lands inside the mission window', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);

        // Sleep over 06:00; the lid opens at 06:10 — past the 5-minute
        // tolerance but inside the 06:00–06:30 window. Skipping here lost the
        // whole day's mission.
        vi.setSystemTime(todayAt(6, 10));
        vi.advanceTimersByTime(60_000);

        expect(missionStarts(dispatch)).toBe(true);
        unmount();
    });

    it('re-arms to TODAY when a resume lands inside a still-open mission window', () => {
        const { listeners } = stubIpcRenderer();
        const dispatch = vi.fn();

        // Arm at 05:00; the machine sleeps over 06:00 and wakes at 06:10.
        vi.setSystemTime(todayAt(5, 0));
        const { unmount } = renderScheduler(buildState(), dispatch);

        vi.setSystemTime(todayAt(6, 10));
        act(() => {
            listeners['system:resume']();
        });

        // The re-arm must aim at today's still-open window, not tomorrow.
        vi.advanceTimersByTime(1_000);

        expect(missionStarts(dispatch)).toBe(true);
        unmount();
    });

    // ── The miss the shield used to never see ────────────────────────────────
    // MARK_MISSION_TIMEOUT only ever fired from MissionTimerDisplay, which is
    // only mounted while the overlay is on screen. A mission left minimized —
    // or expiring while the user sits on the Calendar view — ended with plain
    // SET_ACTIVE_MISSION 'none' and no miss recorded anywhere, so the streak
    // shield would silently never have counted it.
    /** A mission of `phase` mid-flight with `tasks`, expiring 30 min after its start. */
    function runningMission(
        tasks: MissionTask[],
        loggedTimeoutAt?: string,
        phase: 'morning' | 'evening' = 'morning',
    ): MCState {
        const isMorning = phase === 'morning';
        const startedAt = new Date(isMorning ? todayAt(6, 0) : todayAt(19, 0)).toISOString();
        return buildState({
            activeMission: phase,
            missions: [{
                phase,
                startsAt: isMorning ? MORNING_AT : EVENING_AT,
                endsAt: isMorning ? '06:30' : '19:30',
                durationMins: 30,
                active: true,
                startedAt,
                loggedTimeoutAt,
                tasks,
            }],
        });
    }

    /** One checklist task. The id is a parameter because a single-task mission
     *  cannot tell `every` from `some` — the whole point of the fixtures below. */
    const task = (completed: boolean, id = 'brush'): MissionTask =>
        ({ id, label: id, icon: 'Sparkles', completed, locksAt: null, locked: false });

    /** Indices of the two dispatches in call order, or -1. */
    function order(dispatch: ReturnType<typeof vi.fn>) {
        const types = dispatch.mock.calls.map(([a]) => a?.type);
        return { timeout: types.indexOf('MARK_MISSION_TIMEOUT'), cleared: types.indexOf('SET_ACTIVE_MISSION') };
    }

    it('records the miss for a PARTLY finished mission that expires with no overlay on screen', () => {
        // Two tasks, exactly one done. A single-task fixture cannot catch
        // `every` -> `some` in the scheduler's `allDone`: under `some`, one
        // ticked box in a five-task routine would read as a completed mission
        // and the shield would never lose a segment.
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(6, 29));

        const partlyDone = runningMission([task(true, 'brush'), task(false, 'dress')]);
        const { unmount } = renderScheduler(partlyDone, dispatch);
        vi.setSystemTime(todayAt(6, 31)); // past startedAt + durationMins
        vi.advanceTimersByTime(15_000);   // the expiry tick

        const { timeout, cleared } = order(dispatch);
        expect(timeout, 'the miss must be recorded').toBeGreaterThanOrEqual(0);
        // Before clearing the phase: MARK_MISSION_TIMEOUT reads the mission that
        // is still active, and SET_ACTIVE_MISSION's own log line needs the phase.
        expect(timeout).toBeLessThan(cleared);
        expect(dispatch.mock.calls[timeout][0].origin).toBe('scheduler');
        // WHICH mission was missed, not merely that one was. A hardcoded phase
        // stamps `loggedTimeoutAt` on the wrong mission, so the real one stays
        // unguarded and can be charged again on the next tick.
        expect(dispatch.mock.calls[timeout][0].missionPhase).toBe('morning');
        unmount();
    });

    it('reports the EVENING phase when the evening mission is the one that expires', () => {
        // Every other fixture in this file is the morning mission, so a
        // hardcoded `missionPhase: 'morning'` would pass all of them. This is
        // the case that fails.
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(19, 29));

        const evening = runningMission([task(true, 'shower'), task(false, 'pjs')], undefined, 'evening');
        const { unmount } = renderScheduler(evening, dispatch);
        vi.setSystemTime(todayAt(19, 31));
        vi.advanceTimersByTime(15_000);

        const { timeout } = order(dispatch);
        expect(timeout, 'the miss must be recorded').toBeGreaterThanOrEqual(0);
        expect(dispatch.mock.calls[timeout][0].missionPhase).toBe('evening');
        unmount();
    });

    it('does not record a miss when every task was finished', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(6, 29));

        const allDone = runningMission([task(true, 'brush'), task(true, 'dress')]);
        const { unmount } = renderScheduler(allDone, dispatch);
        vi.setSystemTime(todayAt(6, 31));
        vi.advanceTimersByTime(15_000);

        expect(order(dispatch).timeout).toBe(-1);
        expect(order(dispatch).cleared).toBeGreaterThanOrEqual(0);
        unmount();
    });

    it('counts a mission with NO tasks at all as a miss', () => {
        // PINS TODAY BEHAVIOUR, which is a judgement call and not obviously the
        // only right answer: `allDone` is `tasks.length > 0 && every(...)`, so an
        // empty checklist can never be "done" and expiring costs a shield
        // segment. Catches the `tasks.length > 0 &&` guard being dropped —
        // `[].every()` is true, which would turn a mission whose tasks were all
        // removed (or not yet synced in) into a free success.
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(6, 29));

        const { unmount } = renderScheduler(runningMission([]), dispatch);
        vi.setSystemTime(todayAt(6, 31));
        vi.advanceTimersByTime(15_000);

        expect(order(dispatch).timeout).toBeGreaterThanOrEqual(0);
        unmount();
    });

    it('does not re-record a miss the visible overlay already marked', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(6, 29));

        const already = runningMission(
            [task(true, 'brush'), task(false, 'dress')],
            new Date(todayAt(6, 30)).toISOString(),
        );
        const { unmount } = renderScheduler(already, dispatch);
        vi.setSystemTime(todayAt(6, 31));
        vi.advanceTimersByTime(15_000);

        // The reducer would no-op anyway, but a redundant dispatch still runs the
        // log interceptor's speculative reduce on every tick.
        expect(order(dispatch).timeout).toBe(-1);
        unmount();
    });

    it('logs a skipped mission so the day is never silently lost', () => {
        stubIpcRenderer();
        const dispatch = vi.fn();
        vi.setSystemTime(todayAt(5, 59));

        const { unmount } = renderScheduler(buildState(), dispatch);

        vi.setSystemTime(todayAt(11, 30)); // window long closed
        vi.advanceTimersByTime(60_000);

        expect(missionStarts(dispatch)).toBe(false);
        const skip = dispatch.mock.calls.find(
            ([a]) => a?.type === 'ADD_LOG' && String(a?.log?.message).includes('skipped')
        );
        expect(skip, 'a skipped mission must be visible in the activity log').toBeDefined();
        expect(skip?.[0].log.source).toBe('scheduler');
        unmount();
    });
});
