// ============================================================
// ============================================================
// Mission Control — Reward Catalogue
// Rewards with their default coin costs. The picker and the reducer read the
// parent's overrides through rewardCost / isRewardEnabled below.
// Separated from GoalPedestal to satisfy Fast Refresh rules.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { MCSettings, MCState, RewardIcon } from './types';

export const REWARDS: { id: RewardIcon; label: string; emoji: string; targetCount: number }[] = [
    { id: 'story-points', label: 'Story w/ Points', emoji: '💻', targetCount: 3 },
    { id: 'game', label: 'Game', emoji: '🎮', targetCount: 6 },
    { id: 'bow-arrow', label: 'Bow & Arrow', emoji: '🏹', targetCount: 4 },
    { id: 'show', label: 'Short Show', emoji: '🎬', targetCount: 8 },
    { id: 'fishing', label: 'Fishing', emoji: '🎣', targetCount: 10 },
    { id: 'movie-popcorn', label: 'Movie + Popcorn', emoji: '🍿', targetCount: 12 },
    { id: 'campfire', label: 'Fire', emoji: '🔥', targetCount: 14 },
    { id: 'mystery-box', label: 'Mystery Box', emoji: '❓', targetCount: 50 },
    { id: 'quick-game', label: 'Quick Game', emoji: '🐍', targetCount: 1 },
];

export const REWARD_MAP = Object.fromEntries(
    REWARDS.map(r => [r.id, r]),
) as Record<RewardIcon, typeof REWARDS[number]>;

// ── The catalogue as the parent configured it (⚙️ → 🎁 Rewards) ────────────────
// ONE definition of "what does this reward cost, and is it offered", read by
// the picker to render and by the SELECT_CASE reducer case to charge. The
// picker once read the parent's cost while the dispatch carried the catalogue
// cost, so the pedestal showed "Game 2 ⭐" and created a 0 / 6 goal.

/** The settings editor's declared ceiling (`max={100}`, not enforced on typed
 *  input). A goal renders one slot per token, so an unbounded stored cost
 *  would render thousands of them. */
export const MAX_REWARD_COST = 100;

/** Whole number in 1..MAX_REWARD_COST. Settings persist unvalidated, so the
 *  stored cost is data to sanitize, not a number to trust. */
export function clampRewardCost(cost: number): number {
    return Math.min(MAX_REWARD_COST, Math.max(1, Math.round(cost)));
}

export function rewardCost(settings: Pick<MCSettings, 'rewardConfigs'>, id: RewardIcon): number {
    const configured = settings.rewardConfigs?.[id]?.targetCount;
    return typeof configured === 'number' && Number.isFinite(configured)
        ? clampRewardCost(configured)
        : REWARD_MAP[id].targetCount;
}

export function isRewardEnabled(settings: Pick<MCSettings, 'rewardConfigs'>, id: RewardIcon): boolean {
    return settings.rewardConfigs?.[id]?.enabled ?? true;
}

/**
 * Whether SELECT_CASE may create this goal. The reducer and the activity-log
 * mirror both call it, so a refused selection can never log "Goal selected".
 * Picker-only filters (a suspended phone-games privilege, the quick game's
 * mood and time window) are deliberately not here yet — see requirements.md.
 */
export function canSelectReward(state: Pick<MCState, 'settings' | 'gameTokens'>, id: RewardIcon): boolean {
    // hasOwn, not `in`: "constructor" is `in` every object literal.
    if (!Object.hasOwn(REWARD_MAP, id) || !isRewardEnabled(state.settings, id)) return false;
    return id !== 'quick-game' || state.gameTokens > 0;
}
