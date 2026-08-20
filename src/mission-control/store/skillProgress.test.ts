// ============================================================
// Skill Progress — pure logic tests (RED-first for the reading
// practice feature). Spec: the adaptive-engine section of the
// approved plan; every constant asserted here is the contract.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    createDefaultSkillProgress,
    DAY_BUCKET_CAP,
    FAST_TRACK_STREAK,
    LEVEL_HISTORY_CAP,
    MAX_READING_LEVEL,
    MISSED_WORDS_CAP,
    PROMOTE_MIN_ATTEMPTS,
    WINDOW_SIZE,
    type SkillProgress,
} from '../skills/types';
import { applyQuizAnswer, makeLevelChangeLog, sanitizeSkillProgress, type QuizAnswerRecord } from './skillProgress';

const DATE = '2026-08-20';

function answer(overrides: Partial<QuizAnswerRecord> = {}): QuizAnswerRecord {
    return {
        skill: 'read-pic-word',
        level: 0,
        atLevel: true,
        firstTry: true,
        wordId: 'dog',
        gameId: 'snake',
        ...overrides,
    };
}

/** Run n at-level reading answers, correct/incorrect per the outcomes array. */
function run(progress: SkillProgress, outcomes: boolean[], date = DATE): SkillProgress {
    for (const ok of outcomes) {
        progress = applyQuizAnswer(progress, answer({ firstTry: ok }), date).progress;
    }
    return progress;
}

describe('applyQuizAnswer — day buckets', () => {
    it('upserts today\'s bucket for the answered skill', () => {
        let p = createDefaultSkillProgress();
        p = applyQuizAnswer(p, answer(), DATE).progress;
        p = applyQuizAnswer(p, answer({ firstTry: false }), DATE).progress;

        const buckets = p.days['read-pic-word'];
        expect(buckets).toHaveLength(1);
        expect(buckets[0]).toMatchObject({ date: DATE, attempts: 2, firstTry: 1 });
        // Other skills untouched
        expect(p.days['math-add']).toHaveLength(0);
    });

    it('routes off-level reading answers to the off counters, not the at-level pair', () => {
        let p = createDefaultSkillProgress();
        p = applyQuizAnswer(p, answer({ atLevel: false, firstTry: false }), DATE).progress;

        expect(p.days['read-pic-word'][0]).toMatchObject({
            attempts: 0, firstTry: 0, offAttempts: 1, offFirstTry: 0,
        });
        // Off-level answers never touch the promotion window.
        expect(p.window).toHaveLength(0);
    });

    it('tracks the per-game split', () => {
        let p = createDefaultSkillProgress();
        p = applyQuizAnswer(p, answer({ gameId: 'snake' }), DATE).progress;
        p = applyQuizAnswer(p, answer({ gameId: 'blocks', firstTry: false }), DATE).progress;

        expect(p.days['read-pic-word'][0].byGame).toEqual({
            snake: { a: 1, c: 1 },
            blocks: { a: 1, c: 0 },
        });
    });

    it('starts a new bucket on a new local date and prunes past the cap', () => {
        let p = createDefaultSkillProgress();
        for (let i = 0; i < DAY_BUCKET_CAP + 5; i++) {
            const day = String(100 + i); // strictly increasing pseudo-dates
            p = applyQuizAnswer(p, answer(), `2026-x-${day}`).progress;
        }
        const buckets = p.days['read-pic-word'];
        expect(buckets).toHaveLength(DAY_BUCKET_CAP);
        expect(buckets[buckets.length - 1].date).toBe(`2026-x-${100 + DAY_BUCKET_CAP + 4}`);
    });

    it('folds a backwards-clock answer into its existing bucket without breaking order', () => {
        let p = createDefaultSkillProgress();
        p = applyQuizAnswer(p, answer(), '2026-08-19').progress;
        p = applyQuizAnswer(p, answer(), '2026-08-20').progress;
        // Clock jumped back a day: the older bucket exists — reuse it.
        p = applyQuizAnswer(p, answer(), '2026-08-19').progress;

        const buckets = p.days['read-pic-word'];
        expect(buckets.map(b => b.date)).toEqual(['2026-08-19', '2026-08-20']);
        expect(buckets[0].attempts).toBe(2);
    });

    it('ignores an unknown skill id entirely (same reference back)', () => {
        const p = createDefaultSkillProgress();
        const result = applyQuizAnswer(
            p,
            answer({ skill: 'read-telepathy' as never }),
            DATE,
        );
        expect(result.progress).toBe(p);
        expect(result.levelChange).toBeNull();
    });
});

describe('applyQuizAnswer — missed words', () => {
    it('counts first-attempt misses per word', () => {
        let p = createDefaultSkillProgress();
        p = applyQuizAnswer(p, answer({ firstTry: false, wordId: 'ship' }), DATE).progress;
        p = applyQuizAnswer(p, answer({ firstTry: false, wordId: 'ship' }), DATE).progress;
        p = applyQuizAnswer(p, answer({ firstTry: true, wordId: 'ship' }), DATE).progress;

        expect(p.missedWords).toEqual({ ship: 2 });
    });

    it('caps the missed-words map by evicting the smallest count', () => {
        let p = createDefaultSkillProgress();
        // 'big' misses twice so it must survive the eviction.
        p = applyQuizAnswer(p, answer({ firstTry: false, wordId: 'big' }), DATE).progress;
        p = applyQuizAnswer(p, answer({ firstTry: false, wordId: 'big' }), DATE).progress;
        for (let i = 0; i < MISSED_WORDS_CAP; i++) {
            p = applyQuizAnswer(p, answer({ firstTry: false, wordId: `w${i}` }), DATE).progress;
        }
        expect(Object.keys(p.missedWords).length).toBeLessThanOrEqual(MISSED_WORDS_CAP);
        expect(p.missedWords['big']).toBe(2);
    });
});

describe('applyQuizAnswer — promotion window & leveling', () => {
    it('seeds levelHistory with the starting level on first answer', () => {
        const { progress } = applyQuizAnswer(createDefaultSkillProgress(), answer(), DATE);
        expect(progress.levelHistory[0]).toMatchObject({ date: DATE, level: 0, attempts: 0, correct: 0 });
    });

    it('fast-tracks a perfect first streak at low levels', () => {
        let p = createDefaultSkillProgress();
        let change = null;
        for (let i = 0; i < FAST_TRACK_STREAK; i++) {
            const res = applyQuizAnswer(p, answer(), DATE);
            p = res.progress;
            change = res.levelChange;
        }
        expect(change).toMatchObject({ from: 0, to: 1 });
        expect(p.readingLevel).toBe(1);
        expect(p.window).toHaveLength(0); // reset on change
        // seed + the promotion
        expect(p.levelHistory).toHaveLength(2);
        expect(p.levelHistory[1]).toMatchObject({
            level: 1, attempts: FAST_TRACK_STREAK, correct: FAST_TRACK_STREAK,
        });
    });

    it('does NOT fast-track once a miss broke the streak', () => {
        let p = createDefaultSkillProgress();
        p = run(p, [true, false, true, true, true, true]); // 5 correct after a miss
        expect(p.readingLevel).toBe(0);
    });

    it('promotes at >= 85% over >= 15 window entries (13/15 promotes)', () => {
        let p = createDefaultSkillProgress();
        p = { ...p, readingLevel: 3 }; // above fast-track levels
        const outcomes = [...Array(13).fill(true), false, false]; // 13/15 = 86.7%
        p = run(p, outcomes);
        expect(p.readingLevel).toBe(4);
        expect(p.window).toHaveLength(0);
    });

    it('does not promote at 80% (12/15)', () => {
        let p = createDefaultSkillProgress();
        p = { ...p, readingLevel: 3 };
        p = run(p, [...Array(12).fill(true), false, false, false]);
        expect(p.readingLevel).toBe(3);
    });

    it('demotes below 40% over >= 15 entries, but never below level 0', () => {
        let p = createDefaultSkillProgress();
        p = { ...p, readingLevel: 3 };
        p = run(p, [...Array(5).fill(true), ...Array(10).fill(false)]); // 33%
        expect(p.readingLevel).toBe(2);

        // 6/15 = 40% must NOT demote.
        let q = createDefaultSkillProgress();
        q = { ...q, readingLevel: 3 };
        q = run(q, [...Array(6).fill(true), ...Array(9).fill(false)]);
        expect(q.readingLevel).toBe(3);
    });

    it('at the level-0 floor a failing window resets WITHOUT a level change or history entry', () => {
        let p = createDefaultSkillProgress();
        let lastChange = null;
        for (let i = 0; i < PROMOTE_MIN_ATTEMPTS; i++) {
            const res = applyQuizAnswer(p, answer({ firstTry: false, wordId: `w${i}` }), DATE);
            p = res.progress;
            lastChange = res.levelChange;
        }
        expect(p.readingLevel).toBe(0);
        expect(lastChange).toBeNull();
        expect(p.window).toHaveLength(0);           // reset — the anti-log-spam rule
        expect(p.levelHistory).toHaveLength(1);      // seed only
    });

    it('at the max level a passing window resets WITHOUT a change', () => {
        let p = createDefaultSkillProgress();
        p = { ...p, readingLevel: MAX_READING_LEVEL };
        p = run(p, Array(PROMOTE_MIN_ATTEMPTS).fill(true));
        expect(p.readingLevel).toBe(MAX_READING_LEVEL);
        expect(p.window).toHaveLength(0);
        expect(p.levelHistory.filter(e => e.level === MAX_READING_LEVEL + 1)).toHaveLength(0);
    });

    it('window slides at WINDOW_SIZE and math answers never enter it', () => {
        let p = createDefaultSkillProgress();
        p = { ...p, readingLevel: 3 };
        // Interleave math — must not affect the reading window.
        p = applyQuizAnswer(p, answer({ skill: 'math-add' }), DATE).progress;
        // 40..85% dead-zone accuracy: keeps accumulating, window caps at 20.
        p = run(p, Array(30).fill(true).map((_, i) => i % 2 === 0)); // 50%
        expect(p.window.length).toBeLessThanOrEqual(WINDOW_SIZE);
        expect(p.readingLevel).toBe(3);
    });

    it('caps levelHistory', () => {
        let p = createDefaultSkillProgress();
        // Bounce between promote (fast-track) and demote floors many times.
        for (let cycle = 0; cycle < LEVEL_HISTORY_CAP + 10; cycle++) {
            p = { ...p, readingLevel: 3, window: [] };
            p = run(p, [...Array(5).fill(true), ...Array(10).fill(false)]); // demote 3→2
        }
        expect(p.levelHistory.length).toBeLessThanOrEqual(LEVEL_HISTORY_CAP);
    });
});

describe('sanitizeSkillProgress — persisted-blob repair (lifecycle)', () => {
    it('returns pristine defaults for a missing or non-object slice', () => {
        expect(sanitizeSkillProgress(undefined)).toEqual(createDefaultSkillProgress());
        expect(sanitizeSkillProgress('corrupt')).toEqual(createDefaultSkillProgress());
        expect(sanitizeSkillProgress([1, 2])).toEqual(createDefaultSkillProgress());
    });

    it('repairs a partial slice — missing sub-objects come back as defaults', () => {
        const repaired = sanitizeSkillProgress({ readingLevel: 3 });
        expect(repaired.readingLevel).toBe(3);
        expect(repaired.window).toEqual([]);
        expect(repaired.days['read-word-pic']).toEqual([]);
        expect(repaired.missedWords).toEqual({});
    });

    it('clamps out-of-range and mistyped reading levels', () => {
        expect(sanitizeSkillProgress({ readingLevel: 99 }).readingLevel).toBe(MAX_READING_LEVEL);
        expect(sanitizeSkillProgress({ readingLevel: -1 }).readingLevel).toBe(0);
        expect(sanitizeSkillProgress({ readingLevel: '3' }).readingLevel).toBe(0);
    });

    it('drops unknown skill keys and caps oversized day arrays', () => {
        const oversized = Array.from({ length: DAY_BUCKET_CAP + 40 }, (_, i) => ({
            date: `d${i}`, attempts: 1, firstTry: 1, offAttempts: 0, offFirstTry: 0,
        }));
        const repaired = sanitizeSkillProgress({
            days: { 'read-word-pic': oversized, 'skill-from-the-future': [{ date: 'x' }] },
        });
        expect(repaired.days['read-word-pic']).toHaveLength(DAY_BUCKET_CAP);
        expect('skill-from-the-future' in repaired.days).toBe(false);
    });

    it('filters junk out of the window and level history', () => {
        const repaired = sanitizeSkillProgress({
            window: [1, 0, 'yes', 2, null, 1],
            levelHistory: [{ date: '2026-08-01', level: 42 }, 'junk', { level: 2 }],
        });
        expect(repaired.window).toEqual([1, 0, 1]);
        expect(repaired.levelHistory).toEqual([
            { date: '2026-08-01', level: MAX_READING_LEVEL, attempts: 0, correct: 0 },
        ]);
    });
});

describe('makeLevelChangeLog', () => {
    it('is neutral, auto-attributed, and id-collision-proof per level', () => {
        const ts = '2026-08-20T18:00:00.000Z';
        const log = makeLevelChangeLog({ from: 2, to: 3, attempts: 18, correct: 16 }, ts);
        expect(log.id).toBe('auto-reading-level-2026-08-20T18:00:00.000Z-3');
        expect(log.source).toBe('auto');
        expect(log.timestamp).toBe(ts);
        // Kid-reachable surface: the message must not reveal the level number.
        expect(log.message).not.toMatch(/\d/);
    });
});
