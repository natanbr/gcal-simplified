// ============================================================
// Mission Control — Reward Catalogue
// Fixed rewards with their coin costs.
// Separated from GoalPedestal to satisfy Fast Refresh rules.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { RewardIcon } from './types';

export const REWARDS: { id: RewardIcon; label: string; emoji: string; targetCount: number }[] = [
    { id: 'story-points', label: 'Story w/ Points', emoji: '💻', targetCount: 3 },
    { id: 'game', label: 'Game', emoji: '🎮', targetCount: 6 },
    { id: 'bow-arrow', label: 'Bow & Arrow', emoji: '🏹', targetCount: 4 },
    { id: 'show', label: 'Short Show', emoji: '🎬', targetCount: 8 },
    { id: 'fishing', label: 'Fishing', emoji: '🎣', targetCount: 10 },
    { id: 'movie-popcorn', label: 'Movie + Popcorn', emoji: '🍿', targetCount: 12 },
    { id: 'campfire', label: 'Fire', emoji: '🔥', targetCount: 14 },
    { id: 'mystery-box', label: 'Mystery Box', emoji: '❓', targetCount: 50 },
];

export const REWARD_MAP = Object.fromEntries(
    REWARDS.map(r => [r.id, r]),
) as Record<RewardIcon, typeof REWARDS[number]>;
