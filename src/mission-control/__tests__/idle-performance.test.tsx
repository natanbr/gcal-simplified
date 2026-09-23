// ============================================================
// Idle Performance Regression Guards
// ------------------------------------------------------------
// These tests encode the invariant "when the user is idle on the
// Calendar view, the app does almost no background work." They fail
// if a future change reintroduces an ungated polling interval or makes
// the behavior heartbeat churn state while nothing should accrue.
//
// See docs/performance.md and the Performance Checklist in CLAUDE.md.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import React from 'react';
import { mcReducer, initialState, MAX_GAME_TOKENS, PROGRESS_PER_TOKEN } from '../store/mcReducer';
import { useMissionScheduler } from '../hooks/useMissionScheduler';
import { MCContext } from '../store/useMCStore';
import type { MCState } from '../types';

// ── Helpers ──────────────────────────────────────────────────────────────────
function todayAt(h: number, m: number, s = 0): string {
    const d = new Date();
    d.setHours(h, m, s, 0);
    return d.toISOString();
}

function localDateString(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function makeWrapper(state: MCState, dispatch = vi.fn()) {
    const value = { state, dispatch };
    return {
        dispatch,
        wrapper: ({ children }: { children: React.ReactNode }) =>
            React.createElement(MCContext.Provider, { value }, children),
    };
}

// ── 1. Mission scheduler must not poll when nothing is running ────────────────
describe('idle perf — mission scheduler is gated', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('creates NO polling setInterval while no mission is active (Calendar idle)', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        // initialState.activeMission === 'none'
        const { wrapper } = makeWrapper({ ...initialState });

        renderHook(() => useMissionScheduler(), { wrapper });

        // The only setInterval in this hook is the duration-expiry poll, which
        // must not exist when there is nothing to count down.
        expect(setIntervalSpy).not.toHaveBeenCalled();
    });

    it('DOES poll while a mission is active (so expiry still works)', () => {
        const setIntervalSpy = vi.spyOn(global, 'setInterval');
        const { wrapper } = makeWrapper({ ...initialState, activeMission: 'morning' });

        renderHook(() => useMissionScheduler(), { wrapper });

        expect(setIntervalSpy).toHaveBeenCalled();
    });
});

// ── 1b. …and arms no timer chain between its exact-time fires ─────────────────
// The scheduler's self-rescheduling setTimeout is invisible to
// timer-registry.test.ts (it scans for setInterval). It used to re-aim at an
// open window every second for the whole window, on the Calendar view too.
describe('idle perf — mission scheduler arms nothing between fires', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function timersArmedOver10s(state: MCState, now: Date): number {
        vi.setSystemTime(now);
        const { wrapper } = makeWrapper(state);
        renderHook(() => useMissionScheduler(), { wrapper });
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout');
        for (let t = 0; t < 10_000; t += 100) vi.advanceTimersByTime(100);
        return setTimeoutSpy.mock.calls.length;
    }

    const at = (h: number, m: number) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
    const eveningRanAt = (iso: string): MCState => ({
        ...initialState,
        missions: initialState.missions.map(m => (m.phase === 'evening' ? { ...m, lastActiveAt: iso } : m)),
    });

    it('inside an open window whose occurrence already ran (stopped), nothing running', () => {
        expect(timersArmedOver10s(eveningRanAt(todayAt(19, 2)), at(19, 4))).toBe(0);
    });

    it('inside an open window while another mission runs across its start', () => {
        expect(timersArmedOver10s({ ...initialState, activeMission: 'morning' }, at(19, 4))).toBe(0);
    });

    it('outside every window', () => {
        expect(timersArmedOver10s({ ...initialState }, at(14, 0))).toBe(0);
    });
});

// ── 2. Behavior heartbeat must not churn state while idle ─────────────────────
describe('idle perf — behavior heartbeat is churn-free when idle', () => {
    it('returns the SAME state object at night (outside the active window)', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 1,
            moodLastResetDate: localDateString(), // suppress the daily reset
            behaviorLastUpdated: todayAt(21, 0), // past the 20:00 window end
        };
        // A 30s heartbeat tick while idle at night must be a no-op — same ref so
        // React bails out of re-rendering and MCStoreProvider skips persisting.
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAt(21, 0, 30) });
        expect(next).toBe(state);
    });

    it('returns the SAME state object for a small out-of-window tick', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAt(2, 0), // middle of the night
        };
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAt(2, 0, 30) });
        expect(next).toBe(state);
    });

    it('DOES advance state during active hours (accrual still works)', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 1,
            moodLastResetDate: localDateString(),
            behaviorProgress: 50,
            behaviorLastUpdated: todayAt(12, 0),
        };
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAt(12, 0, 30) });
        expect(next).not.toBe(state);
        expect(next.behaviorProgress).toBeGreaterThan(50);
    });

    it('returns the SAME state object while the gauge is held full at the token cap, during active hours', () => {
        // Held full = nothing can change until a token is spent, so every tick,
        // including the ones past the 3-minute gap that would re-anchor, must be
        // a no-op. This is an all-day state for a child who stops spending.
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            gameTokens: MAX_GAME_TOKENS,
            behaviorProgress: PROGRESS_PER_TOKEN,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAt(12, 0),
        };
        for (let m = 1; m <= 10; m++) {
            expect(mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAt(12, m) })).toBe(state);
        }
    });
    it('returns the SAME state object while an empty gauge drains under a negative mood, during active hours', () => {
        // The mirror of the held-full case: empty and draining cannot move.
        const state: MCState = {
            ...initialState,
            moodWind: -2,
            behaviorProgress: 0,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAt(12, 0),
        };
        for (let m = 1; m <= 10; m++) {
            expect(mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAt(12, m) })).toBe(state);
        }
    });
});
