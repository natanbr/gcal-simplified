import type { NumericQuestionCore, NumericQuizQuestion } from './types';
import type { MathSkillId } from '../../skills/types';

/** Injectable randomness for deterministic tests; defaults to Math.random. */
type Rng = () => number;

// ============================================================
// Tuning surface — every knob the math ladder has, in one place.
// These are the numbers the dev harness displays and the owner tunes by feel.
// ============================================================

// ── Floors: the "not trivial" line ──────────────────────────
// A question may be EASY; it may not be beneath notice. `1 + 1` is what the
// owner actually saw in snake, and the fix is a floor rather than a bigger
// range, because a bigger range alone still rolls the trivial cases.

/** No addition may total less than this. The owner's words: "the sum is always above 5". */
export const MIN_SUM = 6;
/** …and neither addend may be smaller than this: "+1" is trivial at any sum. */
export const MIN_ADDEND = 2;
/** No subtraction may start below this, which is what kills `3 - 1`. */
export const MIN_MINUEND = 10;
/** …and "−1" is as trivial as "+1", so the subtrahend has its own floor. */
export const MIN_SUBTRAHEND = 2;
/**
 * Floor on the DIFFERENCE, not just the operands. MIN_MINUEND stops `3 - 1`,
 * but `12 - 11 = 1` clears every operand floor and is still just counting back
 * one. That is the same triviality MIN_SUM exists to remove on the addition
 * side, so it needs its own floor.
 */
export const MIN_DIFFERENCE = 3;
/** Multiplication factors start at the first non-identity one. */
export const MIN_MULT_FACTOR = 2;
/** Kid-friendly cap: multiplication never exceeds MAX_MULT_FACTOR × MAX_MULT_FACTOR. */
export const MAX_MULT_FACTOR = 4;

/** Defaults for direct callers that do not go through the level table. */
export const DEFAULT_MAX_SUM = 20;
export const DEFAULT_MAX_MINUEND = 20;

// ── The ladder ──────────────────────────────────────────────

export interface MathLevelSpec {
    /** Human label for the dev harness. */
    readonly label: string;
    /** Largest addition total. Together with MIN_SUM this IS the addition range. */
    readonly maxSum: number;
    /** Largest subtraction starting value. */
    readonly maxMinuend: number;
    /** Largest multiplication factor (clamped to MAX_MULT_FACTOR). */
    readonly maxFactor: number;
    /** Op mix. The three shares are expected to sum to 1. */
    readonly addShare: number;
    readonly subShare: number;
    readonly mulShare: number;
}

/**
 * Level 0 stays the genuinely easy rung — a struggling child still has to land
 * somewhere — but "easy" now means `9 + 4`, not `1 + 1`, and it is no longer
 * addition-only. Most snake deaths happen in the first minute, so a thin
 * level 0 was most of what the child ever saw.
 *
 * Every rung above it moved up. Sampling the SUM (see `generateAdditionQuestion`)
 * lowers the average total for a given `maxSum`, so the caps rose to compensate:
 * measured against the old generator, level 3 now serves the same share of
 * genuine two-digit-plus-two-digit additions (61%) with a higher carry rate
 * (44% vs 42%) and a third fewer near-trivial questions.
 */
export const MATH_LEVELS: readonly MathLevelSpec[] = [
    { label: 'L0 · warm-up', maxSum: 14, maxMinuend: 14, maxFactor: MAX_MULT_FACTOR, addShare: 0.75, subShare: 0.25, mulShare: 0 },
    { label: 'L1 · mixed', maxSum: 30, maxMinuend: 25, maxFactor: MAX_MULT_FACTOR, addShare: 0.45, subShare: 0.35, mulShare: 0.2 },
    { label: 'L2 · stretch', maxSum: 75, maxMinuend: 50, maxFactor: MAX_MULT_FACTOR, addShare: 0.35, subShare: 0.3, mulShare: 0.35 },
    { label: 'L3 · top', maxSum: 120, maxMinuend: 80, maxFactor: MAX_MULT_FACTOR, addShare: 0.3, subShare: 0.25, mulShare: 0.45 },
];

/** Highest rung the ladder actually has. Games clamp their ramp to this. */
export const MAX_MATH_LEVEL = MATH_LEVELS.length - 1;

/** Levels above the ladder reuse its top rung; negative levels get the bottom one. */
export function mathLevelSpec(level: number): MathLevelSpec {
    const index = Math.min(MAX_MATH_LEVEL, Math.max(0, Math.floor(level)));
    return MATH_LEVELS[index];
}

// ============================================================
// Generators
// ============================================================

/** Inclusive integer draw that survives an injected rng returning exactly 1. */
function randInt(rng: Rng, lo: number, hi: number): number {
    if (hi <= lo) return lo;
    return lo + Math.min(hi - lo, Math.floor(rng() * (hi - lo + 1)));
}

/**
 * Samples the SUM first, then splits it — not `a` first and `b` from what is
 * left. Drawing `a` first makes `b`'s range shrink as `a` grows, which produced
 * lopsided "73 + 4" questions: a big total that is arithmetically easy. Sampling
 * the total and splitting it uniformly gives balanced operands (more carrying)
 * and, crucially, makes the floor expressible at all — the total is drawn from
 * `[MIN_SUM, maxSum]`, so a sum below the floor cannot be rolled.
 */
export function generateAdditionQuestion(maxSum: number = DEFAULT_MAX_SUM, rng: Rng = Math.random): NumericQuestionCore {
    const lowest = Math.max(MIN_SUM, MIN_ADDEND * 2);
    const sum = randInt(rng, lowest, Math.max(maxSum, lowest));
    const a = randInt(rng, MIN_ADDEND, sum - MIN_ADDEND);

    return {
        text: `${a} + ${sum - a} = ?`,
        answer: sum,
    };
}

export function generateSubtractionQuestion(maxVal: number = DEFAULT_MAX_MINUEND, rng: Rng = Math.random): NumericQuestionCore {
    const maxMinuend = Math.max(maxVal, MIN_MINUEND);
    // Composition sampling again: draw the DIFFERENCE first so it has a real
    // floor and a flat spread, then a subtrahend that keeps the minuend inside
    // [MIN_MINUEND, maxMinuend]. Drawing the minuend first (as this did) leaves
    // the difference to fall out of whatever range is left, which is exactly how
    // `12 - 11` survived every operand floor.
    const diff = randInt(rng, MIN_DIFFERENCE, Math.max(MIN_DIFFERENCE, maxMinuend - MIN_SUBTRAHEND));
    const loSub = Math.max(MIN_SUBTRAHEND, MIN_MINUEND - diff);
    const b = randInt(rng, loSub, Math.max(loSub, maxMinuend - diff));
    const a = b + diff;

    return {
        text: `${a} - ${b} = ?`,
        answer: a - b,
    };
}

export function generateMultiplicationQuestion(maxFactor: number = MAX_MULT_FACTOR, rng: Rng = Math.random): NumericQuestionCore {
    const highest = Math.min(Math.max(maxFactor, MIN_MULT_FACTOR), MAX_MULT_FACTOR);
    const a = randInt(rng, MIN_MULT_FACTOR, highest);
    const b = randInt(rng, MIN_MULT_FACTOR, highest);

    return {
        text: `${a} × ${b} = ?`,
        answer: a * b,
    };
}

/**
 * Level-mixed math question with its op attributed — the engine needs to know
 * WHICH skill it just served, which the plain level roll can't tell it.
 *
 * The stamped `level` is the RAW level, not the clamped table index: level 5
 * still records as 5 in `skillProgress` even though it draws from rung 3.
 */
export function generateMathQuestion(level: number, rng: Rng = Math.random): NumericQuizQuestion {
    const stamp = (core: NumericQuestionCore, skill: MathSkillId): NumericQuizQuestion =>
        ({ ...core, kind: 'numeric', skill, level: Math.max(0, level) });

    const spec = mathLevelSpec(level);
    const roll = rng();

    if (roll < spec.addShare) {
        return stamp(generateAdditionQuestion(spec.maxSum, rng), 'math-add');
    }
    // `mulShare <= 0` short-circuits before the cumulative compare so a rung with
    // no multiplication can never serve one — the invariant must not depend on
    // the three shares summing to exactly 1 in floating point.
    if (spec.mulShare <= 0 || roll < spec.addShare + spec.subShare) {
        return stamp(generateSubtractionQuestion(spec.maxMinuend, rng), 'math-sub');
    }
    return stamp(generateMultiplicationQuestion(spec.maxFactor, rng), 'math-mul');
}
