import { describe, it, expect } from 'vitest';
import {
    dailyVolume,
    daysBetween,
    hardestWords,
    levelUpRows,
    momentumSeries,
    needsWork,
    NEEDS_WORK_MIN_ATTEMPTS,
    perGameTotals,
    weeklyAccuracy,
} from './progressSelectors';
import { createDefaultSkillProgress, type SkillDayBucket, type SkillProgress } from './types';

function bucket(date: string, attempts: number, firstTry: number, extra: Partial<SkillDayBucket> = {}): SkillDayBucket {
    return { date, attempts, firstTry, offAttempts: 0, offFirstTry: 0, ...extra };
}

function progressWith(days: Partial<SkillProgress['days']>): SkillProgress {
    const base = createDefaultSkillProgress();
    return { ...base, days: { ...base.days, ...days } };
}

describe('momentumSeries', () => {
    it('sums at-level net across all reading skills per day, cumulatively', () => {
        const progress = progressWith({
            'read-word-pic': [bucket('2026-08-18', 4, 3)],  // net +2
            'read-pic-word': [bucket('2026-08-18', 2, 0), bucket('2026-08-19', 3, 3)], // -2, +3
        });
        expect(momentumSeries(progress, '2026-08-01')).toEqual([
            { date: '2026-08-18', net: 0, cum: 0 },
            { date: '2026-08-19', net: 3, cum: 3 },
        ]);
    });

    it('ignores days before the cutoff and off-level-only days', () => {
        const progress = progressWith({
            'read-word-pic': [bucket('2026-07-01', 10, 10), bucket('2026-08-18', 0, 0, { offAttempts: 5 })],
        });
        expect(momentumSeries(progress, '2026-08-01')).toEqual([]);
    });
});

describe('levelUpRows', () => {
    it('derives days-at-previous-level from the preceding entry, newest first', () => {
        const rows = levelUpRows([
            { date: '2026-07-01', level: 0, attempts: 0, correct: 0 }, // seed
            { date: '2026-07-13', level: 1, attempts: 5, correct: 5 },
            { date: '2026-08-01', level: 2, attempts: 18, correct: 16 },
        ]);
        expect(rows).toEqual([
            { date: '2026-08-01', level: 2, attempts: 18, correct: 16, daysAtPrev: 19 },
            { date: '2026-07-13', level: 1, attempts: 5, correct: 5, daysAtPrev: 12 },
        ]);
    });

    it('yields no rows for a seed-only history', () => {
        expect(levelUpRows([{ date: '2026-08-20', level: 0, attempts: 0, correct: 0 }])).toEqual([]);
    });
});

describe('weeklyAccuracy', () => {
    it('buckets the last N weeks ending today, null for empty weeks', () => {
        const buckets = [bucket('2026-08-20', 4, 2), bucket('2026-08-15', 6, 6), bucket('2026-08-05', 2, 0)];
        const points = weeklyAccuracy(buckets, '2026-08-20', 3);
        expect(points).toHaveLength(3);
        // Current week: Aug 14-20 → both recent buckets.
        expect(points[2]).toMatchObject({ attempts: 10, accuracy: 8 / 10 });
        // Two weeks back: Jul 31 - Aug 6 → the Aug 5 bucket.
        expect(points[0]).toMatchObject({ attempts: 2, accuracy: 0 });
        expect(points[1]).toMatchObject({ attempts: 0, accuracy: null });
    });
});

describe('dailyVolume / perGameTotals / hardestWords', () => {
    it('counts at-level AND off-level answers as practice volume', () => {
        const progress = progressWith({
            'read-word-pic': [bucket('2026-08-20', 3, 2, { offAttempts: 2 })],
            'math-add': [bucket('2026-08-20', 4, 4)],
        });
        const today = dailyVolume(progress, '2026-08-20', 2)[1];
        expect(today).toEqual({ date: '2026-08-20', reading: 5, math: 4 });
    });

    it('totals per-game answer counts across all skills', () => {
        const progress = progressWith({
            'read-pic-word': [bucket('2026-08-20', 3, 2, { byGame: { snake: { a: 2, c: 1 }, blocks: { a: 1, c: 1 } } })],
            'math-mul': [bucket('2026-08-19', 2, 2, { byGame: { snake: { a: 2, c: 2 } } })],
        });
        expect(perGameTotals(progress)).toEqual({ snake: 4, blocks: 1, fruits: 0 });
    });

    it('ranks hardest words by miss count', () => {
        expect(hardestWords({ ship: 3, dog: 1, cat: 5 }, 2)).toEqual([
            { word: 'cat', misses: 5 },
            { word: 'ship', misses: 3 },
        ]);
    });
});

describe('needsWork', () => {
    it('stays silent below the minimum sample', () => {
        const progress = progressWith({
            'read-pic-word': [bucket('2026-08-19', NEEDS_WORK_MIN_ATTEMPTS - 1, 0)],
        });
        expect(needsWork(progress, '2026-08-14')).toBeNull();
    });

    it('flags the weakest sufficiently-sampled skill under the threshold', () => {
        const progress = progressWith({
            'read-pic-word': [bucket('2026-08-19', 12, 6)],   // 50%
            'read-word-pic': [bucket('2026-08-19', 12, 8)],   // 67%
            'read-missing-letter': [bucket('2026-08-19', 12, 12)], // 100% — fine
        });
        expect(needsWork(progress, '2026-08-14')).toEqual({ skill: 'read-pic-word', accuracy: 0.5 });
    });

    it('stays silent when every skill is above the threshold', () => {
        const progress = progressWith({
            'read-pic-word': [bucket('2026-08-19', 20, 18)],
        });
        expect(needsWork(progress, '2026-08-14')).toBeNull();
    });
});

describe('daysBetween', () => {
    it('crosses month boundaries correctly', () => {
        expect(daysBetween('2026-07-30', '2026-08-02')).toBe(3);
    });
});
