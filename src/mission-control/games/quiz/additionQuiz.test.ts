import { describe, it, expect } from 'vitest';
import {
    generateAdditionQuestion,
    generateSubtractionQuestion,
    generateMultiplicationQuestion,
    generateMathQuestion,
    mathLevelSpec,
    MATH_LEVELS,
    MAX_MATH_LEVEL,
    MIN_SUM,
    MIN_ADDEND,
    MIN_MINUEND,
    MIN_SUBTRAHEND,
    MIN_MULT_FACTOR,
    MAX_MULT_FACTOR,
} from './additionQuiz';

// ============================================================
// Deterministic randomness. The generators take an injectable rng precisely so
// tests never have to reach for vi.spyOn(Math, 'random') — which pins the
// NUMBER of internal rng calls and breaks on any refactor that draws once more.
// ============================================================

/** Seeded LCG — same sequence every run, on every machine. */
function lcg(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** Plays the given values in order, then falls back to a steady 0.5. */
function seq(...values: number[]): () => number {
    let i = 0;
    return () => (i < values.length ? values[i++] : 0.5);
}

const ADD = /^(\d+) \+ (\d+) = \?$/;
const SUB = /^(\d+) - (\d+) = \?$/;
const MUL = /^(\d+) × (\d+) = \?$/;

/** How many draws each property-style sweep takes. */
const SAMPLES = 3000;

// ============================================================
// THE FLOOR — the owner's actual complaint: "I got questions like 1+1 … let's
// make sure the sum is always above 5".
//
// These assertions are deliberately written as LITERALS, not derived from the
// exported constants. Everything else in this file follows MATH_LEVELS so the
// owner can tune it freely; this is the line that tuning must not cross, so if
// someone lowers MIN_SUM to 4 these have to go red and force the conversation.
// A floor with no test is a floor that comes back.
// ============================================================

describe('the trivial-question floor', () => {
    it('never serves an addition totalling 5 or less, at any level', () => {
        const rng = lcg(42);
        const offenders: string[] = [];
        for (let level = 0; level <= MAX_MATH_LEVEL + 2; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                if (ADD.test(q.text) && q.answer <= 5) offenders.push(`L${level}: ${q.text}`);
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('never serves an addition with a 1 in it — "+1" is trivial at any total', () => {
        const rng = lcg(1337);
        const offenders: string[] = [];
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const m = q.text.match(ADD);
                if (m && Math.min(Number(m[1]), Number(m[2])) < 2) offenders.push(`L${level}: ${q.text}`);
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('never serves a subtraction starting below 10 — no more "3 - 1"', () => {
        const rng = lcg(7);
        const offenders: string[] = [];
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const m = q.text.match(SUB);
                if (m && Number(m[1]) < 10) offenders.push(`L${level}: ${q.text}`);
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('never leaves a difference below 3 — no more "12 - 11"', () => {
        // The operand floors do not imply this one: 12 - 11 clears MIN_MINUEND
        // and MIN_SUBTRAHEND and is still counting back one. Caught in the dev
        // Quiz Lab histogram, which showed 10% of level-0 answers at 4 or below
        // while every addition sum was correctly >= MIN_SUM.
        // Literal 3, not MIN_DIFFERENCE: tuning the floor down should go red.
        const rng = lcg(1234);
        const offenders: string[] = [];
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const m = q.text.match(SUB);
                if (m && q.answer < 3) offenders.push(`L${level}: ${q.text} (${q.answer})`);
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('never subtracts 1', () => {
        const rng = lcg(99);
        const offenders: string[] = [];
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const m = q.text.match(SUB);
                if (m && Number(m[2]) < 2) offenders.push(`L${level}: ${q.text}`);
            }
        }
        expect(offenders.slice(0, 5)).toEqual([]);
    });

    it('holds even when the rng is pinned at its extremes', () => {
        // Floors are exactly where a degenerate rng bites: 0 always picks the
        // bottom of every range.
        for (const value of [0, 0.0001, 0.9999]) {
            for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
                const q = generateMathQuestion(level, () => value);
                if (ADD.test(q.text)) expect(q.answer).toBeGreaterThanOrEqual(MIN_SUM);
                const m = q.text.match(SUB);
                if (m) expect(Number(m[1])).toBeGreaterThanOrEqual(MIN_MINUEND);
            }
        }
    });
});

// ============================================================
// The ladder's shape. Derived from MATH_LEVELS so tuning does not redden it.
// ============================================================

describe('MATH_LEVELS', () => {
    it('gives every rung a usable, non-empty range', () => {
        for (const spec of MATH_LEVELS) {
            expect(spec.maxSum).toBeGreaterThanOrEqual(Math.max(MIN_SUM, MIN_ADDEND * 2));
            expect(spec.maxMinuend).toBeGreaterThan(MIN_MINUEND);
            expect(spec.maxFactor).toBeGreaterThanOrEqual(MIN_MULT_FACTOR);
            expect(spec.label.length).toBeGreaterThan(0);
        }
    });

    it('has op shares that sum to 1 on every rung', () => {
        for (const spec of MATH_LEVELS) {
            expect(spec.addShare + spec.subShare + spec.mulShare).toBeCloseTo(1, 6);
            expect(Math.min(spec.addShare, spec.subShare, spec.mulShare)).toBeGreaterThanOrEqual(0);
        }
    });

    it('is monotone — no rung is easier than the one below it', () => {
        for (let i = 1; i < MATH_LEVELS.length; i++) {
            expect(MATH_LEVELS[i].maxSum).toBeGreaterThan(MATH_LEVELS[i - 1].maxSum);
            expect(MATH_LEVELS[i].maxMinuend).toBeGreaterThanOrEqual(MATH_LEVELS[i - 1].maxMinuend);
            // Multiplication is the hardest op, so its share may only grow.
            expect(MATH_LEVELS[i].mulShare).toBeGreaterThanOrEqual(MATH_LEVELS[i - 1].mulShare);
        }
    });

    it('keeps level 0 the easy rung: no multiplication', () => {
        expect(MATH_LEVELS[0].mulShare).toBe(0);
    });

    it('clamps out-of-range levels to the ends of the ladder', () => {
        expect(mathLevelSpec(-5)).toBe(MATH_LEVELS[0]);
        expect(mathLevelSpec(0)).toBe(MATH_LEVELS[0]);
        expect(mathLevelSpec(MAX_MATH_LEVEL)).toBe(MATH_LEVELS[MAX_MATH_LEVEL]);
        expect(mathLevelSpec(99)).toBe(MATH_LEVELS[MAX_MATH_LEVEL]);
    });
});

// ============================================================
// Generators in isolation.
// ============================================================

describe('generateAdditionQuestion', () => {
    it('answer equals the sum of the two operands in the text', () => {
        const rng = lcg(3);
        for (let i = 0; i < SAMPLES; i++) {
            const q = generateAdditionQuestion(40, rng);
            const parts = q.text.match(ADD);
            expect(parts).not.toBeNull();
            expect(q.answer).toBe(Number(parts![1]) + Number(parts![2]));
        }
    });

    it('stays inside [MIN_SUM, maxSum] for any cap', () => {
        for (const cap of [10, 14, 30, 75, 120]) {
            const rng = lcg(cap);
            for (let i = 0; i < 500; i++) {
                const q = generateAdditionQuestion(cap, rng);
                expect(q.answer).toBeGreaterThanOrEqual(MIN_SUM);
                expect(q.answer).toBeLessThanOrEqual(cap);
            }
        }
    });

    it('clamps a cap below the floor instead of producing an empty range', () => {
        // The generators are exported and the dev harness pokes them directly,
        // so a nonsense cap must degrade to the floor, not to NaN.
        for (const cap of [0, 1, MIN_SUM - 1]) {
            const q = generateAdditionQuestion(cap, lcg(11));
            expect(q.answer).toBe(MIN_SUM);
        }
    });

    it('samples the total uniformly rather than skewing to one end', () => {
        // The old generator drew `a` first, so `b`'s range shrank as `a` grew and
        // the totals piled up near the cap (mean 8.0 out of a 2..10 range).
        // Sampling the total is what makes the mean land mid-range.
        const rng = lcg(2024);
        let total = 0;
        for (let i = 0; i < 20000; i++) total += generateAdditionQuestion(14, rng).answer;
        expect(total / 20000).toBeGreaterThan(9);
        expect(total / 20000).toBeLessThan(11);
    });
});

describe('generateSubtractionQuestion', () => {
    it('answer equals a - b and is always positive', () => {
        const rng = lcg(5);
        for (let i = 0; i < SAMPLES; i++) {
            const q = generateSubtractionQuestion(40, rng);
            const parts = q.text.match(SUB);
            expect(parts).not.toBeNull();
            expect(q.answer).toBe(Number(parts![1]) - Number(parts![2]));
            expect(q.answer).toBeGreaterThanOrEqual(1);
        }
    });

    it('keeps the minuend in [MIN_MINUEND, maxVal] and the subtrahend above the floor', () => {
        for (const cap of [14, 25, 50, 80]) {
            const rng = lcg(cap);
            for (let i = 0; i < 500; i++) {
                const parts = generateSubtractionQuestion(cap, rng).text.match(SUB)!;
                expect(Number(parts[1])).toBeGreaterThanOrEqual(MIN_MINUEND);
                expect(Number(parts[1])).toBeLessThanOrEqual(cap);
                expect(Number(parts[2])).toBeGreaterThanOrEqual(MIN_SUBTRAHEND);
            }
        }
    });

    it('clamps a cap below the minuend floor', () => {
        const parts = generateSubtractionQuestion(3, lcg(13)).text.match(SUB)!;
        expect(Number(parts[1])).toBe(MIN_MINUEND);
    });
});

describe('generateMultiplicationQuestion', () => {
    it('answer equals a * b with both factors inside the kid-friendly cap', () => {
        const rng = lcg(8);
        for (let i = 0; i < SAMPLES; i++) {
            const q = generateMultiplicationQuestion(MAX_MULT_FACTOR, rng);
            const parts = q.text.match(MUL);
            expect(parts).not.toBeNull();
            expect(q.answer).toBe(Number(parts![1]) * Number(parts![2]));
            for (const f of [Number(parts![1]), Number(parts![2])]) {
                expect(f).toBeGreaterThanOrEqual(MIN_MULT_FACTOR);
                expect(f).toBeLessThanOrEqual(MAX_MULT_FACTOR);
            }
        }
    });

    it('respects a custom maxFactor below the cap', () => {
        const rng = lcg(9);
        for (let i = 0; i < 300; i++) {
            const parts = generateMultiplicationQuestion(3, rng).text.match(MUL)!;
            expect(Number(parts[1])).toBeLessThanOrEqual(3);
            expect(Number(parts[2])).toBeLessThanOrEqual(3);
        }
    });

    it('clamps maxFactor above the cap — MAX_MULT_FACTOR is not negotiable', () => {
        const rng = lcg(10);
        for (let i = 0; i < 300; i++) {
            const parts = generateMultiplicationQuestion(10, rng).text.match(MUL)!;
            expect(Number(parts[1])).toBeLessThanOrEqual(MAX_MULT_FACTOR);
            expect(Number(parts[2])).toBeLessThanOrEqual(MAX_MULT_FACTOR);
        }
    });
});

// ============================================================
// Level dispatch.
// ============================================================

describe('generateMathQuestion', () => {
    it('routes each level by its own shares', () => {
        MATH_LEVELS.forEach((spec, level) => {
            expect(generateMathQuestion(level, seq(0)).text).toMatch(ADD);
            expect(generateMathQuestion(level, seq(spec.addShare - 0.001)).text).toMatch(ADD);
            expect(generateMathQuestion(level, seq(spec.addShare + 0.001)).text).toMatch(SUB);
            if (spec.mulShare > 0) {
                const cum = spec.addShare + spec.subShare;
                expect(generateMathQuestion(level, seq(cum - 0.001)).text).toMatch(SUB);
                expect(generateMathQuestion(level, seq(cum + 0.001)).text).toMatch(MUL);
            }
        });
    });

    it('never multiplies on a rung whose mulShare is 0, whatever the roll', () => {
        const level = MATH_LEVELS.findIndex(s => s.mulShare === 0);
        expect(level).toBeGreaterThanOrEqual(0);
        for (const roll of [0, 0.5, 0.99, 1]) {
            expect(generateMathQuestion(level, seq(roll)).text).not.toMatch(MUL);
        }
    });

    it('stays inside its rung caps at every level', () => {
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            const spec = mathLevelSpec(level);
            const rng = lcg(200 + level);
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const add = q.text.match(ADD);
                const sub = q.text.match(SUB);
                const mul = q.text.match(MUL);
                if (add) expect(q.answer).toBeLessThanOrEqual(spec.maxSum);
                else if (sub) expect(Number(sub[1])).toBeLessThanOrEqual(spec.maxMinuend);
                else if (mul) expect(q.answer).toBeLessThanOrEqual(spec.maxFactor * spec.maxFactor);
                else expect.unreachable(`unknown question shape: ${q.text}`);
            }
        }
    });

    it('answers are always arithmetically correct', () => {
        const rng = lcg(77);
        for (let level = 0; level <= MAX_MATH_LEVEL + 2; level++) {
            for (let i = 0; i < SAMPLES; i++) {
                const q = generateMathQuestion(level, rng);
                const add = q.text.match(ADD);
                const sub = q.text.match(SUB);
                const mul = q.text.match(MUL);
                if (add) expect(q.answer).toBe(Number(add[1]) + Number(add[2]));
                else if (sub) expect(q.answer).toBe(Number(sub[1]) - Number(sub[2]));
                else if (mul) expect(q.answer).toBe(Number(mul[1]) * Number(mul[2]));
                else expect.unreachable(`unknown question shape: ${q.text}`);
            }
        }
    });

    it('attributes the skill that matches the operator', () => {
        // skillProgress is keyed on this; a mislabelled question corrupts the
        // per-skill day buckets that RECORD_QUIZ_ANSWER writes.
        const rng = lcg(4242);
        for (let level = 0; level <= MAX_MATH_LEVEL; level++) {
            for (let i = 0; i < 500; i++) {
                const q = generateMathQuestion(level, rng);
                expect(q.kind).toBe('numeric');
                if (ADD.test(q.text)) expect(q.skill).toBe('math-add');
                else if (SUB.test(q.text)) expect(q.skill).toBe('math-sub');
                else expect(q.skill).toBe('math-mul');
            }
        }
    });

    it('stamps the RAW level, not the clamped ladder index', () => {
        // skillProgress buckets by the level the GAME reported, so a level-5
        // snake question must not be recorded as a level-3 one.
        expect(generateMathQuestion(MAX_MATH_LEVEL + 2, lcg(1)).level).toBe(MAX_MATH_LEVEL + 2);
        expect(generateMathQuestion(-3, lcg(1)).level).toBe(0);
    });

    it('draws harder questions on higher rungs', () => {
        // Guards the whole point of the change: the mix must actually move up.
        const meanAnswer = (level: number) => {
            const rng = lcg(500 + level);
            let total = 0;
            for (let i = 0; i < 5000; i++) total += generateMathQuestion(level, rng).answer;
            return total / 5000;
        };
        const means = MATH_LEVELS.map((_, level) => meanAnswer(level));
        for (let i = 1; i < means.length; i++) {
            expect(means[i]).toBeGreaterThan(means[i - 1]);
        }
    });
});
