// ============================================================
// Mission Control — the cost a goal charges is the cost the picker shows
// ------------------------------------------------------------
// Bug (2026-09-22): a parent set Game to 2 tokens in ⚙️ → 🎁 Rewards. The
// picker showed "🎮 Game 2 ⭐", but the goal it created was 0 / 6. The picker
// read `settings.rewardConfigs`, while the dispatch carried the catalogue cost
// from `REWARD_MAP`, and the reducer trusted whatever cost the caller passed.
// The reducer now derives the cost itself, through the same function the
// picker renders with, so the two can no longer disagree.
// ============================================================

import { describe, it, expect } from 'vitest';
import { mcReducer, initialState } from '../mcReducer';
import { createLogEntry } from '../activityLog';
import { loadPersistedState, STORAGE_KEY } from '../useMCStore';
import { rewardCost, isRewardEnabled, MAX_REWARD_COST } from '../../rewardCatalogue';
import type { MCAction, MCState, RewardIcon } from '../../types';

type RewardConfigs = NonNullable<MCState['settings']['rewardConfigs']>;

function withRewardConfigs(rewardConfigs: RewardConfigs, base: MCState = initialState): MCState {
    return { ...base, settings: { ...base.settings, rewardConfigs } };
}

function select(reward: RewardIcon, caseId = 0): MCAction {
    return { type: 'SELECT_CASE', caseId, reward };
}

const case0 = (s: MCState) => s.cases.find(c => c.id === 0)!;

describe('SELECT_CASE — the reducer charges the configured cost', () => {
    it('charges the parent-configured cost, not the catalogue cost (the reported bug)', () => {
        const state = withRewardConfigs({ game: { enabled: true, targetCount: 2 } });
        const next = mcReducer(state, select('game'));
        expect(case0(next).targetCount).toBe(2);
    });

    it('ignores a cost smuggled onto the action — the cost is not the caller\'s to pick', () => {
        const state = withRewardConfigs({ game: { enabled: true, targetCount: 2 } });
        // Not a fresh literal, so no excess-property check: this is what an old
        // build or a hand-built dispatch that still sends a cost looks like.
        const smuggled = { type: 'SELECT_CASE', caseId: 0, reward: 'game', targetCount: 6 } as const;
        expect(case0(mcReducer(state, smuggled)).targetCount).toBe(2);
    });

    it('falls back to the catalogue cost when the parent configured nothing', () => {
        expect(case0(mcReducer(initialState, select('game'))).targetCount).toBe(6);
        expect(case0(mcReducer(initialState, select('mystery-box'))).targetCount).toBe(50);
    });

    it('applies a configured cost to the quick game too, and still spends its game token', () => {
        const state = withRewardConfigs({ 'quick-game': { enabled: true, targetCount: 3 } }, { ...initialState, gameTokens: 2 });
        const next = mcReducer(state, select('quick-game'));
        expect(case0(next).targetCount).toBe(3);
        expect(next.gameTokens).toBe(1);
    });
});

describe('SELECT_CASE — what it must refuse', () => {
    it('refuses a reward the parent disabled, even on a direct dispatch', () => {
        const state = withRewardConfigs({ game: { enabled: false, targetCount: 6 } });
        expect(mcReducer(state, select('game'))).toBe(state);
    });

    it('writes no "Goal selected" log line for a disabled reward', () => {
        const state = withRewardConfigs({ game: { enabled: false, targetCount: 6 } });
        expect(createLogEntry(select('game'), state)).toBeNull();
    });

    it('writes no "Goal selected" log line for a quick game refused for lack of game tokens', () => {
        const state: MCState = { ...initialState, gameTokens: 0 };
        expect(mcReducer(state, select('quick-game'))).toBe(state);
        expect(createLogEntry(select('quick-game'), state)).toBeNull();
    });

    it('refuses a reward id that is only an inherited object property ("constructor")', () => {
        // A hand-built or stale payload, the shape a type check cannot see.
        const hostile: MCAction = JSON.parse('{"type":"SELECT_CASE","caseId":0,"reward":"constructor"}');
        expect(mcReducer(initialState, hostile)).toBe(initialState);
        expect(createLogEntry(hostile, initialState)).toBeNull();
    });

    it('still logs a selection it accepts', () => {
        const log = createLogEntry(select('game'), withRewardConfigs({ game: { enabled: true, targetCount: 2 } }));
        expect(log?.message).toContain('Goal selected');
    });
});

describe('rewardCost — a stored cost the pedestal can actually render', () => {
    // The settings input's `max={100}` is not enforced on typed input, and
    // settings are persisted unvalidated. A cost of 100000 would now render
    // 100000 token slots, where before the fix it was never charged at all.
    it.each([
        [1000, MAX_REWARD_COST],
        [2.4, 2],
        [0, 1],
        [-3, 1],
    ])('clamps a configured %s to a whole number within 1..MAX_REWARD_COST (%s)', (stored, expected) => {
        const settings = withRewardConfigs({ game: { enabled: true, targetCount: stored } }).settings;
        expect(rewardCost(settings, 'game')).toBe(expected);
    });

    it('falls back to the catalogue cost for a stored value that is not a number', () => {
        const junk = { enabled: true, targetCount: Number.NaN };
        expect(rewardCost(withRewardConfigs({ game: junk }).settings, 'game')).toBe(6);
    });

    it('treats a reward with no config as enabled', () => {
        expect(isRewardEnabled(initialState.settings, 'game')).toBe(true);
    });
});

describe('SELECT_CASE — lifecycle', () => {
    it('a goal chosen at a custom cost fills and redeems at that cost', () => {
        let s = withRewardConfigs({ game: { enabled: true, targetCount: 2 } }, { ...initialState, bankCount: 5 });
        s = mcReducer(s, select('game'));
        // "All" moves only the coins the goal still needs — 2, not the catalogue 6.
        s = mcReducer(s, { type: 'VACUUM_TO_CASE', caseId: 0 });
        expect(case0(s).tokenCount).toBe(2);
        expect(s.bankCount).toBe(3);
        s = mcReducer(s, { type: 'CONSUME_CASE', caseId: 0 });
        expect(case0(s).status).toBe('empty');
        expect(s.bankCount).toBe(3);
    });

    it('an existing goal keeps the cost it was chosen at when the parent changes the setting', () => {
        let s = mcReducer(initialState, select('game'));
        expect(case0(s).targetCount).toBe(6);
        s = mcReducer(s, { type: 'SET_SETTINGS', settings: { rewardConfigs: { game: { enabled: true, targetCount: 2 } } } });
        expect(case0(s).targetCount).toBe(6);
    });

    it('an existing goal keeps its stored cost across a restart', () => {
        const chosen = mcReducer(initialState, select('game'));
        const saved = withRewardConfigs({ game: { enabled: true, targetCount: 2 } }, chosen);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...saved, _migrationVersion: 1 }));
        try {
            expect(case0(loadPersistedState()).targetCount).toBe(6);
        } finally {
            localStorage.removeItem(STORAGE_KEY);
        }
    });
});
