import { describe, it, expect } from 'vitest';
import { REWARDS, REWARD_MAP } from './rewardCatalogue';

describe('rewardCatalogue', () => {
    it('should have exactly 7 rewards', () => {
        expect(REWARDS).toHaveLength(7);
    });

    it('should have all expected reward IDs', () => {
        const ids = REWARDS.map(r => r.id);
        expect(ids).toContain('story-points');
        expect(ids).toContain('game');
        expect(ids).toContain('show');
        expect(ids).toContain('fishing');
        expect(ids).toContain('movie-popcorn');
        expect(ids).toContain('campfire');
        expect(ids).toContain('mystery-box');
    });

    it('should have unique IDs for all rewards', () => {
        const ids = REWARDS.map(r => r.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have positive targetCount for all rewards', () => {
        REWARDS.forEach(reward => {
            expect(reward.targetCount).toBeGreaterThan(0);
        });
    });

    describe('REWARD_MAP', () => {
        it('should contain all rewards from REWARDS', () => {
            REWARDS.forEach(reward => {
                expect(REWARD_MAP[reward.id]).toBe(reward);
            });
        });

        it('should have the same number of entries as REWARDS', () => {
            const mapKeys = Object.keys(REWARD_MAP);
            expect(mapKeys).toHaveLength(REWARDS.length);
        });
    });
});
