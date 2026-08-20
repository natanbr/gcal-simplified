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
import type { MCState, MCAction } from '../types';

const MORNING_AT = '06:00';

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
                startedAt: null,
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
    (window as unknown as { ipcRenderer: unknown }).ipcRenderer = {
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
        delete (window as unknown as { ipcRenderer?: unknown }).ipcRenderer;
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
});
