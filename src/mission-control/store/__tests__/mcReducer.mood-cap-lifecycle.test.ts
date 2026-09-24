// ============================================================
// Mission Control — the held mood gauge, in the sequences a real day produces
// ------------------------------------------------------------
// Companion to mcReducer.mood-cap.test.ts (review round of 2026-09-23). A
// gauge held full at the cap is new state that other actions now meet:
//   - a Quick-Game goal holds a game token that a trash refunds, so it must
//     count against the cap, or the held gauge pays its token out into the
//     gap and the refund is clamped away (a coin eaten, with a grant log for it);
//   - a mission time cleared in Settings makes the accrual rate NaN. On main
//     only the gauge went NaN; the first version of this fix carried it into
//     the token count, which saves as null and hydrated as 5 free tokens;
//   - a parent adjustment pays at most one token, as it did before the fix.
// ============================================================

import { describe, it, expect, afterEach } from 'vitest';
import { mcReducer, initialState, MAX_GAME_TOKENS, PROGRESS_PER_TOKEN } from '../mcReducer';
import { loadPersistedState, STORAGE_KEY } from '../useMCStore';
import { createLogEntry } from '../activityLog';
import type { MCState } from '../../types';

function todayAtLocal(hours: number, minutes = 0): string {
    const d = new Date();
    d.setHours(hours, minutes, 0, 0);
    return d.toISOString();
}

function localDateString(d: Date = new Date()): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Held full at the cap, Excellent mood, midday (inside the quick-game window). */
function heldAtCap(overrides: Partial<MCState> = {}): MCState {
    return {
        ...initialState,
        gameTokens: MAX_GAME_TOKENS,
        moodWind: 2,
        behaviorProgress: PROGRESS_PER_TOKEN,
        activityLogs: [],
        moodLastResetDate: localDateString(),
        lastCompletedOrFailedMorningDate: localDateString(), // opens the quick-game window
        behaviorLastUpdated: todayAtLocal(12, 0),
        ...overrides,
    };
}

const tick = (s: MCState, h: number, m: number) =>
    mcReducer(s, { type: 'SYNC_BEHAVIOR', timestamp: todayAtLocal(h, m) });

const grantLogs = (s: MCState) => s.activityLogs.filter(l => l.source === 'auto' && /mood token/i.test(l.message));

const pickQuickGame = (s: MCState) =>
    mcReducer(s, { type: 'SELECT_CASE', caseId: 0, reward: 'quick-game' });

afterEach(() => localStorage.removeItem(STORAGE_KEY));

describe('a Quick-Game goal holds its token against the cap', () => {
    it('pick, wait, trash: the refunded coin and the held gauge are both still there', () => {
        let s = pickQuickGame(heldAtCap());
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        s = tick(s, 12, 5); // long gap: re-anchor
        s = tick(s, 12, 6); // would grant if the goal's token did not count
        s = mcReducer(s, { type: 'REFUND_CASE', caseId: 0 });

        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(s.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(s.moodWind).toBe(2);
        expect(grantLogs(s)).toHaveLength(0);
    });

    it('pick, then play the game: the goal is spent, so the held token arrives, logged', () => {
        let s = pickQuickGame(heldAtCap());
        s = mcReducer(s, { type: 'CONSUME_CASE', caseId: 0, timestamp: todayAtLocal(12, 1) });
        expect(s.cases[0].reward).toBeNull();
        // Still held at the redemption itself: its sync ran while the goal held the token.
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        expect(grantLogs(s)).toHaveLength(0);
        s = tick(s, 12, 5); // re-anchor after the held span
        s = tick(s, 12, 6);

        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(s.moodWind).toBe(0);
        expect(s.behaviorProgress).toBeLessThan(1);
        expect(grantLogs(s)).toHaveLength(1);
    });

    it('a parent grant counts the goal\'s token too: refused and unlogged, so the trash still returns the coin', () => {
        let s = pickQuickGame(heldAtCap());
        const grant = { type: 'GRANT_GAME_TOKEN', isRemote: true, origin: 'remote' } as const;
        expect(createLogEntry(grant, s)).toBeNull();
        s = mcReducer(s, grant);
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        s = mcReducer(s, { type: 'REFUND_CASE', caseId: 0 });
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
    });

    it('below the cap a parent grant still lands with a goal picked', () => {
        const s = pickQuickGame(heldAtCap({ gameTokens: 3 }));
        expect(mcReducer(s, { type: 'GRANT_GAME_TOKEN' }).gameTokens).toBe(3);
    });

    it('the trash log says a game token came back (a Quick-Game goal holds no bank tokens)', () => {
        const s = pickQuickGame(heldAtCap());
        const entry = createLogEntry({ type: 'REFUND_CASE', caseId: 0 }, s);
        expect(entry?.message).toMatch(/game token/i);
        expect(entry?.message).not.toMatch(/^0 tokens/);
        expect(entry?.gameTokens).toBe(MAX_GAME_TOKENS);
    });

    it('a held gauge with a goal holding a token is still churn-free on the heartbeat', () => {
        const s = pickQuickGame(heldAtCap());
        for (let m = 1; m <= 10; m++) expect(tick(s, 12, m)).toBe(s);
    });
});

describe('a mission time cleared in Settings cannot corrupt the tokens', () => {
    // <input type="time"> emits '' when cleared; ''.split(':') has no minutes.
    const cleared = (s: MCState): MCState => ({ ...s, settings: { ...s.settings, morningStartsAt: '' } });

    it('the heartbeat is a no-op: same state, tokens and gauge untouched', () => {
        const s = cleared(heldAtCap({ gameTokens: 3, behaviorProgress: 99.99 }));
        const next = tick(s, 12, 1);
        expect(next).toBe(s);
        expect(next.gameTokens).toBe(3);
        expect(next.behaviorProgress).toBe(99.99);
    });

    it('survives a restart with the same token count (a NaN write used to hydrate as 5)', () => {
        let s = cleared(heldAtCap({ gameTokens: 1, behaviorProgress: 40 }));
        for (let m = 1; m <= 5; m++) s = tick(s, 12, m);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...s, _migrationVersion: 1 }));
        const restored = loadPersistedState();
        expect(restored.gameTokens).toBe(1);
        expect(restored.behaviorProgress).toBe(40);
    });

    it('a parent adjustment with a non-finite amount is refused: same state, no log line', () => {
        // Unreachable from the phone (its validator checks the amount), but a
        // full gauge with room used to pay a token on NaN and log "adjusted (NaN)".
        const s = heldAtCap({ gameTokens: 2 });
        const action = { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: Number.NaN, reason: 'test' } as const;
        expect(mcReducer(s, action)).toBe(s);
        expect(createLogEntry(action, s)).toBeNull();
    });
});

describe('hydration sanitizes a corrupt gauge and token count', () => {
    const load = (blob: Record<string, unknown>) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...blob, _migrationVersion: 1 }));
        return loadPersistedState();
    };

    it('a null token count (NaN serializes to null) loads as 0, never as a fresh 5', () => {
        expect(load({ gameTokens: null }).gameTokens).toBe(0);
    });

    it('a null gauge loads as empty, and an out-of-range gauge is clamped', () => {
        expect(load({ behaviorProgress: null }).behaviorProgress).toBe(0);
        expect(load({ behaviorProgress: 250 }).behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(load({ behaviorProgress: -5 }).behaviorProgress).toBe(0);
    });

    it('a blob that predates the fields still gets the defaults', () => {
        const restored = load({});
        expect(restored.gameTokens).toBe(initialState.gameTokens);
        expect(restored.behaviorProgress).toBe(initialState.behaviorProgress);
    });

    it('a saved balance over the cap counting a Quick-Game goal settles to the cap, so the trash stays lossless across restarts', () => {
        // Reachable in v0.0.42: pick a Quick Game at 5, then the gauge or a grant refills to 5.
        // Hydration keeps it raw; the logged SETTLE_GAME_TOKEN_CAP after load clamps it
        // (useGameTokenCapSettle.test.tsx drives that through the real provider).
        const settle = (s: MCState) => mcReducer(s, { type: 'SETTLE_GAME_TOKEN_CAP', origin: 'system' });
        const goal = initialState.cases.map(c => c.id === 0 ? { ...c, status: 'active' as const, reward: 'quick-game' as const, tokenCount: 0 } : c);
        const loaded = settle(load({ gameTokens: MAX_GAME_TOKENS, cases: goal }));
        expect(loaded.gameTokens).toBe(MAX_GAME_TOKENS - 1);
        const trashed = mcReducer(loaded, { type: 'REFUND_CASE', caseId: 0 });
        expect(trashed.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(settle(load({ ...trashed })).gameTokens).toBe(MAX_GAME_TOKENS);
    });
});

describe('a parent adjustment pays at most one token (the pre-fix behaviour)', () => {
    it('+250 from 90 with room grants one token and leaves the gauge full', () => {
        // Before the fix: 340 - 100 = 240, clamped to 100, one token. The full
        // gauge then pays the next token on the heartbeat, as any full gauge does.
        const next = mcReducer(heldAtCap({ gameTokens: 0, behaviorProgress: 90 }), { type: 'ADJUST_BEHAVIOR_PROGRESS', amount: 250, reason: 'test' });
        expect(next.gameTokens).toBe(1);
        expect(next.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(next.moodWind).toBe(0);
    });
});

describe('whining and a missed mission move the gauge without paying a token', () => {
    it('clearing whining at 99 below the cap fills the gauge; the heartbeat pays, logged', () => {
        const base = heldAtCap({ gameTokens: 2, behaviorProgress: 99, whiningActive: true });
        let s = mcReducer(base, { type: 'TOGGLE_WHINING', missionPhase: 'none' });
        expect(s.behaviorProgress).toBe(PROGRESS_PER_TOKEN);
        expect(s.gameTokens).toBe(2);
        expect(s.moodWind).toBe(2);
        s = tick(s, 12, 1);
        expect(s.gameTokens).toBe(3);
        expect(grantLogs(s)).toHaveLength(1);
    });

    it('detecting whining drains the gauge and never goes below empty', () => {
        const s = mcReducer(heldAtCap({ behaviorProgress: 4 }), { type: 'TOGGLE_WHINING', missionPhase: 'none' });
        expect(s.behaviorProgress).toBe(0);
        expect(s.gameTokens).toBe(MAX_GAME_TOKENS);
    });

    it('a missed mission takes its penalty off a held gauge and leaves tokens and mood alone', () => {
        const state = heldAtCap({
            missions: initialState.missions.map(m => m.phase === 'morning' ? { ...m, active: true } : m),
        });
        const next = mcReducer(state, { type: 'MARK_MISSION_TIMEOUT', missionPhase: 'morning' });
        expect(next.behaviorProgress).toBe(PROGRESS_PER_TOKEN - 20);
        expect(next.gameTokens).toBe(MAX_GAME_TOKENS);
        expect(next.moodWind).toBe(2);
    });
});
