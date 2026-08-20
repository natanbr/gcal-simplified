// ============================================================
// Quiz Module — Engine (pure sampling logic)
// The level/mix arithmetic behind the adaptive quiz. Stateless
// and RNG-injected; the per-session state (re-queue, mercy,
// last word) lives in useQuizEngine (mission-control/hooks).
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { MAX_READING_LEVEL, type SkillDayBucket } from '../../skills/types';
import type { Rng } from './reading/readingQuestions';

// The engine is the quiz module's public serving arm — reading/ internals are
// reachable only through here (guarded by skill-progress-boundaries.test.ts).
export { generateReadingQuestion, levelSkill, type Rng } from './reading/readingQuestions';

/** Sampling shares: one level down / current / stretch (+1 or +2). */
export const DOWN_SHARE = 0.20;
export const STRETCH_SHARE = 0.20;
/** Game stage at which stretch may reach two levels up. */
export const DEEP_STRETCH_STAGE = 2;

/** Reading share of the reading/math mix, clamped so math — the quiz's
 *  always-solvable escape valve — never drops below 40%. */
export const READING_SHARE_BASE = 0.5;
export const READING_SHARE_MIN = 0.40;
export const READING_SHARE_MAX = 0.60;
/** Minimum recent at-level attempts before a family's accuracy may steer the mix. */
export const MIN_ATTEMPTS_FOR_WEIGHTING = 5;
/** How far back "recent" reaches for the weighting, in days. */
export const WEIGHTING_LOOKBACK_DAYS = 14;

/** Consecutive first-attempt reading misses that switch the rest of a quiz to math. */
export const MERCY_MISS_THRESHOLD = 2;
/** Served questions between a miss and its re-queue. */
export const REQUEUE_AFTER_QUESTIONS = 3;

export interface SampledLevel {
    level: number;
    /** Whether the sample landed on the kid's current level. */
    atLevel: boolean;
}

/**
 * 20% one level down (confidence), 60% current, 20% stretch. At the ladder's
 * edges the impossible share folds into "current". Stretch depth is +1, or
 * +2 once the game stage reaches DEEP_STRETCH_STAGE (a coin decides which).
 */
export function sampleReadingLevel(current: number, stage: number, rng: Rng): SampledLevel {
    const down = current > 0 ? DOWN_SHARE : 0;
    const stretch = current < MAX_READING_LEVEL ? STRETCH_SHARE : 0;

    const roll = rng();
    if (roll < down) {
        return { level: current - 1, atLevel: false };
    }
    if (roll >= 1 - stretch) {
        const deep = stage >= DEEP_STRETCH_STAGE
            && current + 2 <= MAX_READING_LEVEL
            && rng() < 0.5;
        return { level: current + (deep ? 2 : 1), atLevel: false };
    }
    return { level: current, atLevel: true };
}

/**
 * Recent at-level first-try accuracy over a family's day buckets, or null
 * when there is not enough evidence to steer by.
 */
export function recentAccuracy(
    bucketLists: readonly (readonly SkillDayBucket[])[],
    sinceDate: string,
): number | null {
    let attempts = 0;
    let firstTry = 0;
    for (const buckets of bucketLists) {
        for (const bucket of buckets) {
            if (bucket.date < sinceDate) continue;
            attempts += bucket.attempts;
            firstTry += bucket.firstTry;
        }
    }
    if (attempts < MIN_ATTEMPTS_FOR_WEIGHTING) return null;
    return firstTry / attempts;
}

/**
 * Reading share of the mix, steered toward the weaker family: the kid sees
 * more of what they struggle with, but math never drops below 40%.
 */
export function computeReadingShare(
    readingAccuracy: number | null,
    mathAccuracy: number | null,
): number {
    if (readingAccuracy === null || mathAccuracy === null) return READING_SHARE_BASE;
    const lean = READING_SHARE_BASE + 0.5 * (mathAccuracy - readingAccuracy);
    return Math.min(READING_SHARE_MAX, Math.max(READING_SHARE_MIN, lean));
}
