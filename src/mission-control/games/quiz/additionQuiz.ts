// ============================================================
// Quiz Module — Addition Question Generator
// Generates simple addition questions (a + b = ?) for young kids.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import type { QuizQuestion } from './types';

/**
 * Generate a random addition question where `a + b <= maxSum`.
 * Both operands are guaranteed to be >= 1.
 *
 * @param maxSum – Upper bound for the sum (inclusive). Default: 20.
 */
export function generateAdditionQuestion(maxSum: number = 20): QuizQuestion {
    const a = Math.floor(Math.random() * (maxSum - 1)) + 1;
    const b = Math.floor(Math.random() * (maxSum - a)) + 1;

    return {
        text: `${a} + ${b} = ?`,
        answer: a + b,
    };
}
