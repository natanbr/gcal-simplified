import type { QuizQuestion } from './types';

export function generateAdditionQuestion(maxSum: number = 20): QuizQuestion {
    const a = Math.floor(Math.random() * (maxSum - 1)) + 1;
    const b = Math.floor(Math.random() * (maxSum - a)) + 1;

    return {
        text: `${a} + ${b} = ?`,
        answer: a + b,
    };
}

export function generateSubtractionQuestion(maxVal: number = 20): QuizQuestion {
    const a = Math.floor(Math.random() * (maxVal - 1)) + 2;
    const b = Math.floor(Math.random() * (a - 1)) + 1;

    return {
        text: `${a} - ${b} = ?`,
        answer: a - b,
    };
}

// Kid-friendly cap: multiplication never exceeds MAX_MULT_FACTOR × MAX_MULT_FACTOR
export const MAX_MULT_FACTOR = 4;

export function generateMultiplicationQuestion(maxFactor: number = MAX_MULT_FACTOR): QuizQuestion {
    maxFactor = Math.min(maxFactor, MAX_MULT_FACTOR);
    const a = Math.floor(Math.random() * (maxFactor - 1)) + 2;
    const b = Math.floor(Math.random() * (maxFactor - 1)) + 2;

    return {
        text: `${a} × ${b} = ?`,
        answer: a * b,
    };
}

export function generateLevelQuestion(level: number): QuizQuestion {
    if (level <= 0) {
        return generateAdditionQuestion(10);
    }

    if (level === 1) {
        return Math.random() < 0.5
            ? generateAdditionQuestion(20)
            : generateSubtractionQuestion(15);
    }

    if (level === 2) {
        const roll = Math.random();
        if (roll < 0.35) return generateAdditionQuestion(50);
        if (roll < 0.7) return generateSubtractionQuestion(30);
        return generateMultiplicationQuestion(4);
    }

    const roll = Math.random();
    if (roll < 0.3) return generateAdditionQuestion(100);
    if (roll < 0.55) return generateSubtractionQuestion(50);
    return generateMultiplicationQuestion(4);
}
