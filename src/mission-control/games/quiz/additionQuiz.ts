import type { NumericQuestionCore, NumericQuizQuestion } from './types';
import type { MathSkillId } from '../../skills/types';

/** Injectable randomness for deterministic tests; defaults to Math.random. */
type Rng = () => number;

export function generateAdditionQuestion(maxSum: number = 20, rng: Rng = Math.random): NumericQuestionCore {
    const a = Math.floor(rng() * (maxSum - 1)) + 1;
    const b = Math.floor(rng() * (maxSum - a)) + 1;

    return {
        text: `${a} + ${b} = ?`,
        answer: a + b,
    };
}

export function generateSubtractionQuestion(maxVal: number = 20, rng: Rng = Math.random): NumericQuestionCore {
    const a = Math.floor(rng() * (maxVal - 1)) + 2;
    const b = Math.floor(rng() * (a - 1)) + 1;

    return {
        text: `${a} - ${b} = ?`,
        answer: a - b,
    };
}

// Kid-friendly cap: multiplication never exceeds MAX_MULT_FACTOR × MAX_MULT_FACTOR
export const MAX_MULT_FACTOR = 4;

export function generateMultiplicationQuestion(maxFactor: number = MAX_MULT_FACTOR, rng: Rng = Math.random): NumericQuestionCore {
    maxFactor = Math.min(maxFactor, MAX_MULT_FACTOR);
    const a = Math.floor(rng() * (maxFactor - 1)) + 2;
    const b = Math.floor(rng() * (maxFactor - 1)) + 2;

    return {
        text: `${a} × ${b} = ?`,
        answer: a * b,
    };
}

/**
 * Level-mixed math question with its op attributed — the engine needs to know
 * WHICH skill it just served, which the plain level roll can't tell it.
 */
export function generateMathQuestion(level: number, rng: Rng = Math.random): NumericQuizQuestion {
    const stamp = (core: NumericQuestionCore, skill: MathSkillId): NumericQuizQuestion =>
        ({ ...core, kind: 'numeric', skill, level: Math.max(0, level) });

    if (level <= 0) {
        return stamp(generateAdditionQuestion(10, rng), 'math-add');
    }

    if (level === 1) {
        return rng() < 0.5
            ? stamp(generateAdditionQuestion(20, rng), 'math-add')
            : stamp(generateSubtractionQuestion(15, rng), 'math-sub');
    }

    if (level === 2) {
        const roll = rng();
        if (roll < 0.35) return stamp(generateAdditionQuestion(50, rng), 'math-add');
        if (roll < 0.7) return stamp(generateSubtractionQuestion(30, rng), 'math-sub');
        return stamp(generateMultiplicationQuestion(4, rng), 'math-mul');
    }

    const roll = rng();
    if (roll < 0.3) return stamp(generateAdditionQuestion(100, rng), 'math-add');
    if (roll < 0.55) return stamp(generateSubtractionQuestion(50, rng), 'math-sub');
    return stamp(generateMultiplicationQuestion(4, rng), 'math-mul');
}
