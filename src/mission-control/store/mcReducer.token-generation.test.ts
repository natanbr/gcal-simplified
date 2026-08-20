// ============================================================
// Mission Control — Mood → Game Token Generation Rates
// ------------------------------------------------------------
// The mood gauge is the ONLY generator of game tokens. These tests pin the
// contracted rates (in tokens per day, measured over the configured active
// window) and the "earning a token drops you back to normal mood" rule.
//
// They also pin the ghost-game fix: `snakeGameActive` must never survive a
// restart, or the phone remote keeps showing a game that isn't running.
// ============================================================

import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import { mcReducer, initialState, MOOD_TOKENS_PER_DAY, moodHourlyRate, MAX_GAME_TOKENS } from './mcReducer';
import { loadPersistedState, STORAGE_KEY } from './useMCStore';
import type { MCState } from '../types';

/** ISO timestamp for today at a given local time. */
function todayAtLocal(hours: number, minutes = 0): string {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
}

function localDateString(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Runs a full active day of 60s heartbeats through the reducer and returns how
 * many game tokens were generated. `moodLastResetDate` is pinned to today so the
 * daily mood reset does not fire mid-run and flatten the mood under test.
 */
function simulateActiveDay(moodWind: number, startState?: Partial<MCState>): { tokens: number; state: MCState } {
    const { startMins, endMins } = {
        startMins: 6 * 60,   // DEFAULT_SETTINGS.morningStartsAt  06:00
        endMins: 19 * 60 + 60, // eveningStartsAt 19:00 + 60min   20:00
    };

    let state: MCState = {
        ...initialState,
        ...startState,
        moodWind,
        behaviorProgress: startState?.behaviorProgress ?? 0,
        gameTokens: 0,
        moodLastResetDate: localDateString(),
        behaviorLastUpdated: todayAtLocal(Math.floor(startMins / 60), startMins % 60),
    };

    let granted = 0;
    for (let m = startMins + 1; m <= endMins; m++) {
        const before = state.gameTokens;
        state = mcReducer(state, {
            type: 'SYNC_BEHAVIOR',
            timestamp: todayAtLocal(Math.floor(m / 60), m % 60),
        });
        granted += state.gameTokens - before;
    }

    return { tokens: granted, state };
}

// ── Contracted generation rates ──────────────────────────────────────────────

describe('mood → game token generation rates', () => {
    it('declares the agreed tokens-per-day rate for every mood level', () => {
        expect(MOOD_TOKENS_PER_DAY[2]).toBe(1.5);   // Excellent
        expect(MOOD_TOKENS_PER_DAY[1]).toBe(1);     // Good
        expect(MOOD_TOKENS_PER_DAY[0]).toBeCloseTo(1 / 3, 5); // Neutral — 1 per 3 days
        expect(MOOD_TOKENS_PER_DAY[-1]).toBeLessThan(0);
        expect(MOOD_TOKENS_PER_DAY[-2]).toBeLessThan(MOOD_TOKENS_PER_DAY[-1]);
    });

    it('derives the hourly rate from the configured active window, not a magic number', () => {
        // Default window is 06:00 → 20:00 = 14 active hours.
        // Good mood = 1 token/day = 100 progress over 14h.
        expect(moodHourlyRate(1, initialState.settings)).toBeCloseTo(100 / 14, 5);

        // Halve the window and the hourly rate doubles — same tokens per day.
        const shortDay = { ...initialState.settings, morningStartsAt: '06:00', eveningStartsAt: '12:00', eveningDurationMins: 60 };
        expect(moodHourlyRate(1, shortDay)).toBeCloseTo(100 / 7, 5);
    });

    it('generates exactly 1 token across a full day at Good mood', () => {
        const { tokens } = simulateActiveDay(1);
        expect(tokens).toBe(1);
    });

    it('generates 1 token per 3 days at Neutral mood — not one per day', () => {
        let carriedProgress = 0;
        let totalTokens = 0;

        for (let day = 0; day < 3; day++) {
            const { tokens, state } = simulateActiveDay(0, { behaviorProgress: carriedProgress });
            totalTokens += tokens;
            carriedProgress = state.behaviorProgress;
        }

        expect(totalTokens).toBe(1);
    });

    it('reaches 1.5 tokens/day at Excellent mood when the mood is held there', () => {
        // A single day earns one token and drops the mood back to normal, so the
        // second half only accrues at the Neutral rate. Measure the raw rate
        // instead: 1.5 tokens/day = 150 progress over the 14h window.
        expect(moodHourlyRate(2, initialState.settings)).toBeCloseTo(150 / 14, 5);
    });

    it('drains progress at negative moods instead of generating', () => {
        const { tokens, state } = simulateActiveDay(-2, { behaviorProgress: 90 });
        expect(tokens).toBe(0);
        expect(state.behaviorProgress).toBeLessThan(90);
    });
});

// ── Mood resets to normal after a token is earned ────────────────────────────

describe('earning a game token resets mood to normal', () => {
    it('drops moodWind back to 0 the moment a token is granted', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            behaviorProgress: 99.9,
            gameTokens: 0,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAtLocal(12, 0),
        };

        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(12, 1) });

        expect(next.gameTokens).toBe(1);
        expect(next.moodWind).toBe(0);
    });

    it('leaves moodWind untouched while progress is still below the threshold', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            behaviorProgress: 10,
            gameTokens: 0,
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAtLocal(12, 0),
        };

        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(12, 1) });

        expect(next.gameTokens).toBe(0);
        expect(next.moodWind).toBe(2);
    });

    it('writes a log entry for the automatic grant so it is never invisible', () => {
        const state: MCState = {
            ...initialState,
            moodWind: 2,
            behaviorProgress: 99.9,
            gameTokens: 0,
            activityLogs: [],
            moodLastResetDate: localDateString(),
            behaviorLastUpdated: todayAtLocal(12, 0),
        };

        const next = mcReducer(state, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(12, 1) });

        expect(next.activityLogs).toHaveLength(1);
        expect(next.activityLogs[0].message).toMatch(/mood/i);
        expect(next.activityLogs[0].source).toBe('auto');
    });
});

// ── No free tokens on restart ────────────────────────────────────────────────

describe('no automatic calendar-day token grant', () => {
    it('still honours an explicit manual grant (the remote app has a button)', () => {
        const next = mcReducer({ ...initialState, gameTokens: 1 }, { type: 'GRANT_GAME_TOKEN' });
        expect(next.gameTokens).toBe(2);
    });

    it('refuses to exceed the cap', () => {
        const capped = { ...initialState, gameTokens: MAX_GAME_TOKENS };
        expect(mcReducer(capped, { type: 'GRANT_GAME_TOKEN' })).toBe(capped);
    });

    it('has no midnight/on-mount scheduler that grants tokens for free', () => {
        // The old useGameTokenScheduler granted a token on mount AND at every
        // midnight, without ever recording the date it granted for — one free
        // token per app launch, which is where the surplus came from.
        expect(existsSync(join(__dirname, 'useGameTokenScheduler.ts'))).toBe(false);
        expect(readFileSync(join(__dirname, 'MCStoreProvider.tsx'), 'utf-8'))
            .not.toContain('useGameTokenScheduler');
    });
});

// ── Ghost game state ─────────────────────────────────────────────────────────

describe('loadPersistedState — snakeGameActive', () => {
    it('never restores an active game (the phone remote would show a ghost game)', () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ snakeGameActive: true, _migrationVersion: 1 }));
        expect(loadPersistedState().snakeGameActive).toBe(false);
        localStorage.removeItem(STORAGE_KEY);
    });
});
