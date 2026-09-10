import { describe, it, expect } from 'vitest';
import { initialState } from './mcReducer';
import {
    MISSED_LOCK_THRESHOLD,
    SHIELD_SEGMENTS,
    applyMissionRoutineComplete,
    applyMissionTimeout,
    isEconomyLocked,
    sanitizeMissedStreak,
    shieldSegmentsLeft,
    shieldTier,
} from './missionStreak';
import type { MCState } from '../types';

const AT = '2026-09-02T07:00:00.000Z';

function withStreak(streak: number, patch: Partial<MCState> = {}): MCState {
    return { ...initialState, missedMissionStreak: streak, ...patch };
}

/** A morning mission mid-flight, so the timeout applier has something to close. */
function runningMorning(streak: number): MCState {
    return {
        ...withStreak(streak),
        activeMission: 'morning',
        missions: initialState.missions.map(m =>
            m.phase === 'morning'
                ? { ...m, active: true, startedAt: AT, durationMins: 30, loggedTimeoutAt: undefined }
                : m,
        ),
    };
}

describe('missionStreak — thresholds', () => {
    it('locks at six consecutive misses, which is the three days the rule is written in', () => {
        expect(MISSED_LOCK_THRESHOLD).toBe(6);
        expect(SHIELD_SEGMENTS).toBe(6);
    });

    it('maps every streak value onto the agreed colour tier', () => {
        expect([0, 1, 2].map(shieldTier)).toEqual(['green', 'green', 'green']);
        expect([3, 4].map(shieldTier)).toEqual(['amber', 'amber']);
        expect(shieldTier(5)).toBe('red');
        expect(shieldTier(6)).toBe('broken');
        // Over-threshold can only come from a corrupt blob; it must still read as broken.
        expect(shieldTier(99)).toBe('broken');
    });

    it('drains one segment per miss and never goes below empty', () => {
        expect([0, 1, 3, 5, 6, 9].map(shieldSegmentsLeft)).toEqual([6, 5, 3, 1, 0, 0]);
    });

    it('derives the lock from the streak rather than storing it', () => {
        expect(isEconomyLocked(withStreak(5))).toBe(false);
        expect(isEconomyLocked(withStreak(6))).toBe(true);
        expect(isEconomyLocked(withStreak(7))).toBe(true);
    });
});

describe('missionStreak — sanitizing a persisted value', () => {
    // A blob written before this feature has no field at all; a NaN write
    // serializes to null. Either one must not become `undefined + 1 = NaN`,
    // which would leave the lock permanently on or permanently off.
    it.each([
        [undefined, 0],
        [null, 0],
        [Number.NaN, 0],
        [Number.POSITIVE_INFINITY, MISSED_LOCK_THRESHOLD],
        ['4', 0],
        [-3, 0],
        [2.7, 2],
        [4, 4],
        [99, MISSED_LOCK_THRESHOLD],
    ])('sanitizes %p to %p', (input, expected) => {
        expect(sanitizeMissedStreak(input)).toBe(expected);
    });
});

describe('missionStreak — mission outcomes', () => {
    it('adds one miss when a mission times out', () => {
        const next = applyMissionTimeout(runningMorning(2), 'morning', AT);
        expect(next.missedMissionStreak).toBe(3);
    });

    it('clamps the streak at the lock threshold so it cannot run away', () => {
        const next = applyMissionTimeout(runningMorning(6), 'morning', AT);
        expect(next.missedMissionStreak).toBe(MISSED_LOCK_THRESHOLD);
    });

    it('is idempotent — a mission already marked timed out cannot be counted twice', () => {
        const once = applyMissionTimeout(runningMorning(2), 'morning', AT);
        const twice = applyMissionTimeout(once, 'morning', AT);
        expect(twice.missedMissionStreak).toBe(3);
        // Same reference: React and the persist effect must be able to bail out.
        expect(twice).toBe(once);
    });

    it('still drains behaviour progress on a timeout, as it did before the shield existed', () => {
        const next = applyMissionTimeout(runningMorning(0), 'morning', AT);
        expect(next.behaviorProgress).toBe(initialState.behaviorProgress - 20);
    });

    it('records the outcome date so the scheduler does not re-run the mission today', () => {
        const next = applyMissionTimeout(runningMorning(0), 'morning', AT);
        expect(next.lastCompletedOrFailedMorningDate).toBe('2026-09-02');
    });

    it('resets the whole streak when a single mission is completed', () => {
        const locked = runningMorning(MISSED_LOCK_THRESHOLD);
        expect(isEconomyLocked(locked)).toBe(true);
        const next = applyMissionRoutineComplete(locked, 'morning', 2, AT);
        expect(next.missedMissionStreak).toBe(0);
        expect(isEconomyLocked(next)).toBe(false);
    });

    it('still pays the completion bonus while the shield was broken — collecting is the way out', () => {
        const locked = runningMorning(MISSED_LOCK_THRESHOLD);
        const next = applyMissionRoutineComplete(locked, 'morning', 2, AT);
        expect(next.bankCount).toBe(locked.bankCount + 2);
    });

    it('ignores a completion for a mission that is not running (double-fire guard)', () => {
        const idle = withStreak(4);
        expect(applyMissionRoutineComplete(idle, 'morning', 2, AT)).toBe(idle);
    });
});
