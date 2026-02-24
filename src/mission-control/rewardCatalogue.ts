// ============================================================
// Mission Control — Reward Catalogue
// Fixed rewards with their coin costs.
// Separated from GoalPedestal to satisfy Fast Refresh rules.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { RewardIcon } from './types';

export const REWARDS: { id: RewardIcon; label: string; emoji: string; targetCount: number }[] = [
    { id: 'movie-popcorn', label: 'Movie + Popcorn', emoji: '🍿', targetCount: 10 },
    { id: 'show', label: 'Show', emoji: '🎬', targetCount: 10 },
    { id: 'campfire', label: 'Campfire', emoji: '🔥', targetCount: 10 },
    { id: 'game', label: 'Game', emoji: '🎮', targetCount: 6 },
    { id: 'extra-story', label: 'Extra Story', emoji: '📖', targetCount: 2 },
    { id: 'story-points', label: 'Story w/ Points', emoji: '💻', targetCount: 2 },
];

export const REWARD_MAP = Object.fromEntries(
    REWARDS.map(r => [r.id, r]),
) as Record<RewardIcon, typeof REWARDS[number]>;
