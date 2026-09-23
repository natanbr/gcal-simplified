// ============================================================
// Mission Control — the mood gauge at the game-token cap
// ------------------------------------------------------------
// Bug (2026-09-22): with 5 game tokens (the cap), mood +2 and the gauge at
// 99.95 %, the next heartbeat granted nothing and kept the mood, both correct,
// but dropped the gauge to ~0 % with no log line. `applyBehaviorSync` wrapped
// the progress (`% PROGRESS_PER_TOKEN`) before the cap had decided whether a
// token was granted, so a full gauge was spent on a token that never arrived.
//
// Spec (2026-08-25): when the gauge fills while game tokens are at the cap,
// nothing is earned and the mood is left alone. The gauge still fills, so the
// rule is "hold at full", not "stop accruing": the earned token is waiting for
// room, and arrives once the child spends one.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState, MAX_GAME_TOKENS, PROGRESS_PER_TOKEN } from '../mcReducer';
import { loadPersistedState, STORAGE_KEY } from '../useMCStore';
import { moveGauge } from '../moodGauge';
import type { MCState } from '../../types';

function todayAtLocal(hours: number, minutes = 0, seconds = 0): string {
    const d = new Date();
    d.setHours(hours, minutes, seconds, 0);
    return d.toISOString();
}

function localDateString(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The reported repro: at the cap, Excellent mood, gauge nearly full, midday. */
function atCap(overrides: Partial<MCState> = {}): MCState {
    return {
        ...initialState,
        gameTokens: MAX_GAME_TOKENS,
        moodWind: 2,
        behaviorProgress: 99.95,
        activityLogs: [],
        moodLastResetDate: localDateString(), // keep the daily mood reset out of it
        behaviorLastUpdated: todayAtLocal(12, 0),
        ...overrides,
    };
}

const tick = (s: MCState, h: number, m: number) =>
    mcReducer(s, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(h, m) });

describe('mood gauge at the token cap — holds at full', () => {
    it('holds a filling gauge at full instead of wrapping it to ~0 % (the reported bug)', () => {
        const next = tick(atCap(), 12, 1);
        expect(next.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(next.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(next.moodWind).toBe(2);
        expect(next.activityLogs).toHaveLength(0);
    });

    it('climbs to full and never past it during an hour at the cap', () => {
        let s = atCap({ behaviorProgress: 95 });
        for (let m = 1; m <= 60; m++) {
            s = tick(s, 12, m);
            expect(s.behaviorProgress).toBeLessThanOrEqual(PROGRESS_PER_TOKEN);
        }
        expect(s.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
    });

    it('still drains at the cap when the mood is negative', () => {
        const next = tick(atCap({ behaviorProgress: PROGRESS_PER_TOKEN, moodWind: -1 }), 12, 1);
        expect(next.behaviorProgress).toBeLessThan(PROGRESS_PER_TOKEN);
    });
});

describe('mood gauge at the token cap — lifecycle', () => {
    it('the held token arrives, logged, once a token is spent, and the gauge restarts', () => {
        let s = tick(atCap(), 12, 1); // fills and holds
        for (let m = 2; m <= 10; m++) s = tick(s, 12, m); // held for 9 more minutes
        s = mcReducer(s, { type: 'CONSUME_GAME_TOKEN', timestamp: todayAtLocal(12, 11) });
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS - 1);

        // The anchor went stale while the gauge was held, so the first tick
        // re-anchors (no back-fill), and the second one grants.
        s = tick(s, 12, 12);
        s = tick(s, 12, 13);

        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(s.moodWind).toBe(0); // earning a token spends the mood that earned it
        expect(s.behaviorProgress).toBeGreaterThan(0);
        expect(s.behaviorProgress).toBeLessThan(1);
        const grants = s.activityLogs.filter(l => l.source === 'auto' && /mood token/i.test(l.message));
        expect(grants).toHaveLength(1);
    });

    it('a gauge held at full survives a restart, still full', () => {
        const held = tick(atCap(), 12, 1);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...held, _migrationVersion: 1 }));
        try {
            const restored = loadPersistedState();
            expect(restored.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
            // First tick after a long restart gap: still held, not wrapped.
            expect(tick(restored, 15, 0).behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        } finally {
            localStorage.removeItem(STORAGE_KEY);
        }
    });
});

describe('moveGauge — the one writer of the gauge', () => {
    const at = (behaviorProgress: number, gameTokens: number) => ({ ...initialState, behaviorProgress, gameTokens, moodWind: 2 });

    it('grants what fits under the cap and holds the rest of the gauge at full', () => {
        expect(moveGauge(at(100, MAX_GAME_TOKENS - 1), 150, Infinity)).toEqual({
            patch: { behaviorProgress: PROGRESS_PER_TOKEN, gameTokens: MAX_GAME_TOKENS, moodWind: 0 }, granted: 1,
        });
    });

    it('grants every whole token the caller allows, keeping the remainder', () => {
        expect(moveGauge(at(100, 0), 150, Infinity)).toEqual({ patch: { behaviorProgress: 50, gameTokens: 2, moodWind: 0 }, granted: 2 });
    });

    it('never takes tokens away from a balance above the cap', () => {
        expect(moveGauge(at(100, MAX_GAME_TOKENS + 2), 20, Infinity)).toEqual({
            patch: { behaviorProgress: PROGRESS_PER_TOKEN, gameTokens: MAX_GAME_TOKENS + 2, moodWind: 2 }, granted: 0,
        });
    });

    it('a corrupt (NaN) balance pays nothing and leaves the gauge as it was', () => {
        const { patch, granted } = moveGauge(at(100, Number.NaN), 10, Infinity);
        expect(granted).toBe(0);
        expect(patch.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
    });

    it('floors a drained gauge at empty', () => {
        expect(moveGauge(at(10, 2), -40, Infinity)).toEqual({ patch: { behaviorProgress: 0, gameTokens: 2, moodWind: 2 }, granted: 0 });
    });
});

describe('the other gauge writers obey the same cap rule', () => {
    it('a mission bonus crossing the gauge at the cap holds it full and leaves the mood alone', () => {
        const state = atCap({
            behaviorProgress: 90,
            missions: initialState.missions.map(m => m.phase === 'morning' ? { ...m, active: true } : m),
        });
        const next = mcReducer(state, { type: 'COMPLETE_MISSION_ROUTINE', missionPhase: 'morning', bonusTokens: 2 });
        expect(next.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(next.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(next.moodWind).toBe(2);
    });

    it('a parent\'s progress adjustment crossing the gauge at the cap holds it full and leaves the mood alone', () => {
        const next = mcReducer(atCap({ behaviorProgress: 90 }), { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: 20, reason: 'test' });
        expect(next.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(next.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(next.moodWind).toBe(2);
    });

    it('below the cap, the same adjustment still grants a token and resets the mood', () => {
        const next = mcReducer(atCap({ gameTokens: 2, behaviorProgress: 90 }), { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: 20, reason: 'test' });
        expect(next.gameTokens).toBe(3);
        expect(next.behaviorProgress).toBeCloseTo(10);
        expect(next.moodWind).toBe(0);
    });
});
