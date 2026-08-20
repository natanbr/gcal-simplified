// ============================================================
// Quiz Engine — interval-mapped sampling tests (no statistics,
// exact boundaries per the approved adaptive spec).
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    computeReadingShare,
    recentAccuracy,
    sampleReadingLevel,
    READING_SHARE_BASE,
    READING_SHARE_MAX,
    READING_SHARE_MIN,
} from './quizEngine';
import type { SkillDayBucket } from '../../skills/types';

/** Rng that replays a fixed sequence. */
function seq(values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
}

describe('sampleReadingLevel', () => {
    it('maps the 20/60/20 intervals at a mid-ladder level', () => {
        expect(sampleReadingLevel(3, 0, seq([0.19]))).toEqual({ level: 2, atLevel: false });
        expect(sampleReadingLevel(3, 0, seq([0.21]))).toEqual({ level: 3, atLevel: true });
        expect(sampleReadingLevel(3, 0, seq([0.79]))).toEqual({ level: 3, atLevel: true });
        expect(sampleReadingLevel(3, 0, seq([0.81]))).toEqual({ level: 4, atLevel: false });
    });

    it('folds the impossible share into current at the edges', () => {
        // L0: no level below — the down share becomes current.
        expect(sampleReadingLevel(0, 0, seq([0.19]))).toEqual({ level: 0, atLevel: true });
        expect(sampleReadingLevel(0, 0, seq([0.81]))).toEqual({ level: 1, atLevel: false });
        // L6: no stretch — the top share becomes current.
        expect(sampleReadingLevel(6, 3, seq([0.99]))).toEqual({ level: 6, atLevel: true });
        expect(sampleReadingLevel(6, 3, seq([0.19]))).toEqual({ level: 5, atLevel: false });
    });

    it('allows +2 stretch only from stage 2, on a coin flip', () => {
        expect(sampleReadingLevel(3, 1, seq([0.9, 0.1]))).toEqual({ level: 4, atLevel: false });
        expect(sampleReadingLevel(3, 2, seq([0.9, 0.4]))).toEqual({ level: 5, atLevel: false });
        expect(sampleReadingLevel(3, 2, seq([0.9, 0.6]))).toEqual({ level: 4, atLevel: false });
        // +2 never overshoots the ladder.
        expect(sampleReadingLevel(5, 3, seq([0.9, 0.1]))).toEqual({ level: 6, atLevel: false });
    });
});

describe('computeReadingShare', () => {
    it('defaults to the base without enough evidence', () => {
        expect(computeReadingShare(null, null)).toBe(READING_SHARE_BASE);
        expect(computeReadingShare(0.9, null)).toBe(READING_SHARE_BASE);
    });

    it('leans toward the weaker family, clamped to the 40-60% band', () => {
        // Reading much weaker → more reading, capped at 60%.
        expect(computeReadingShare(0.5, 0.9)).toBe(READING_SHARE_MAX);
        // Math much weaker → more math, but reading never below 40%.
        expect(computeReadingShare(0.9, 0.4)).toBe(READING_SHARE_MIN);
        // Mild gap → mild lean.
        expect(computeReadingShare(0.8, 0.9)).toBeCloseTo(0.55);
    });
});

describe('recentAccuracy', () => {
    const bucket = (date: string, attempts: number, firstTry: number): SkillDayBucket =>
        ({ date, attempts, firstTry, offAttempts: 0, offFirstTry: 0 });

    it('ignores buckets before the cutoff and needs 5+ attempts', () => {
        const old = [bucket('2026-07-01', 50, 10)];
        const fresh = [bucket('2026-08-18', 4, 4)];
        expect(recentAccuracy([old, fresh], '2026-08-10')).toBeNull();

        const enough = [bucket('2026-08-18', 4, 4), bucket('2026-08-19', 4, 2)];
        expect(recentAccuracy([enough], '2026-08-10')).toBeCloseTo(6 / 8);
    });
});
