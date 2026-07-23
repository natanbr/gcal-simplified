// ============================================================
// Mission Control — Behavior/Mood System & Persistence Tests
// Covers the local-date handling of the daily mood reset, the
// game-token persistence clamp, and mission-completion idempotency.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { MCState } from '../types';

/** Builds an ISO timestamp for today at the given local time. */
function todayAtLocal(hours: number, minutes = 0): string {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
}

function localDateString(d: Date = new Date()): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// ── Daily mood reset ─────────────────────────────────────────────────────────

describe('mood daily reset — local date handling', () => {
    it('resets moodWind to 0 once per local day (1h before morning start)', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            moodLastResetDate: undefined,
            behaviorLastUpdated: todayAtLocal(12, 0),
        };
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(12, 5) });
        expect(next.moodWind).toBe(0);
        expect(next.moodLastResetDate).toBe(localDateString());
    });

    it('does not reset twice on the same local day', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 0,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAtLocal(12, 0),
        };
        const withWind = mcReducer(state, { type: 'SET_MOOD_WIND', level: 2, timestamp: todayAtLocal(12, 5) });
        expect(withWind.moodWind).toBe(2);

        // A later sync on the same local day must NOT wipe the wind back to 0.
        const later = mcReducer(withWind, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(18, 0) });
        expect(later.moodWind).toBe(2);
    });

    it('records moodLastResetDate as a local date string', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 1,
            moodLastResetDate: undefined,
            behaviorLastUpdated: todayAtLocal(10, 0),
        };
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(10, 30) });
        // Must match the LOCAL calendar date, not the UTC one.
        expect(next.moodLastResetDate).toBe(localDateString());
    });
});

// ── Behavior progress accrual ────────────────────────────────────────────────

/** A single heartbeat tick (60s) later, still today. */
function oneTickAfter(hours: number, minutes = 0): string {
    return todayAtLocal(hours, minutes + 1);
}

describe('behavior progress — active-window accrual', () => {
    function inWindowState(moodWind: number): MCState {
        return {
            ...initialState,
            moodWind,
            moodLastResetDate: localDateString(), // suppress the daily reset
            behaviorProgress: 50,
            behaviorLastUpdated: todayAtLocal(12, 0),
        };
    }

    it('accrues Good mood (+4%/h) over a one-minute in-window tick', () => {
        const next = mcReducer(inWindowState(1), { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(12, 0) });
        expect(next.behaviorProgress).toBeCloseTo(50 + 4 / 60, 5);
    });

    it('accrues Neutral mood at +1%/h — never the Good rate (no auto-promotion)', () => {
        // Regression for the `state.moodWind || 1` bug: Neutral (0) was coerced
        // to Good (1) and filled at 4%/h. It must fill at 1%/h and stay Neutral.
        const next = mcReducer(inWindowState(0), { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(12, 0) });
        expect(next.behaviorProgress).toBeCloseTo(50 + 1 / 60, 5);
        expect(next.moodWind).toBe(0);
    });

    it('accrues Excellent mood at +8.5%/h', () => {
        const next = mcReducer(inWindowState(2), { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(12, 0) });
        expect(next.behaviorProgress).toBeCloseTo(50 + 8.5 / 60, 5);
    });

    it('drains Bad mood at -3%/h and Horrible mood at -8%/h', () => {
        const bad = mcReducer(inWindowState(-1), { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(12, 0) });
        expect(bad.behaviorProgress).toBeCloseTo(50 - 3 / 60, 5);

        const horrible = mcReducer(inWindowState(-2), { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(12, 0) });
        expect(horrible.behaviorProgress).toBeCloseTo(50 - 8 / 60, 5);
    });

    it('does NOT back-fill a large gap (app was off / machine asleep)', () => {
        // A one-hour jump is not continuous app-on time — it must count nothing.
        const next = mcReducer(inWindowState(1), { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(13, 0) });
        expect(next.behaviorProgress).toBe(50);
    });

    it('accrues nothing outside the active window, even for a short tick', () => {
        // 21:00 → 21:01 local is past eveningStartsAt(19:00) + 60m window end.
        const state: MCState = {
            ...initialState,
            moodWind: 1,
            moodLastResetDate: localDateString(),
            behaviorProgress: 50,
            behaviorLastUpdated: todayAtLocal(21, 0),
        };
        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: oneTickAfter(21, 0) });
        expect(next.behaviorProgress).toBe(50);
    });
});

// ── COMPLETE_MISSION_ROUTINE idempotency ─────────────────────────────────────

describe('mcReducer — COMPLETE_MISSION_ROUTINE idempotency', () => {
    it('grants bonus tokens exactly once even if dispatched twice', () => {
        const started = mcReducer(initialState, { type: 'SET_ACTIVE_MISSION', phase: 'morning' });
        const once = mcReducer(started, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 });
        expect(once.bankCount).toBe(started.bankCount + 2);

        // Second (racing) completion must be a no-op.
        const twice = mcReducer(once, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 });
        expect(twice.bankCount).toBe(once.bankCount);
        expect(twice.behaviorProgress).toBe(once.behaviorProgress);
    });

    it('ignores completion when no mission is active', () => {
        const next = mcReducer(initialState, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 });
        expect(next.bankCount).toBe(initialState.bankCount);
    });
});

// ── Game token persistence ───────────────────────────────────────────────────

describe('loadPersistedState — gameTokens clamp', () => {
    it('preserves spent-down game tokens across restarts (no free refill)', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameTokens: 2, _migrationVersion: 1 }));
        expect(loadPersistedState().gameTokens).toBe(2);
        localStorage.removeItem(STORAGE_KEY);
    });

    it('clamps corrupted values into the 0–5 range', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameTokens: 99, _migrationVersion: 1 }));
        expect(loadPersistedState().gameTokens).toBe(5);

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameTokens: -3, _migrationVersion: 1 }));
        expect(loadPersistedState().gameTokens).toBe(0);
        localStorage.removeItem(STORAGE_KEY);
    });

    it('defaults to the initial token count when the field is missing', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ bankCount: 1, _migrationVersion: 1 }));
        expect(loadPersistedState().gameTokens).toBe(initialState.gameTokens);
        localStorage.removeItem(STORAGE_KEY);
    });
});
