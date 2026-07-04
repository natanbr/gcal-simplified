import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    generateAdditionQuestion,
    generateSubtractionQuestion,
    generateMultiplicationQuestion,
    generateLevelQuestion,
} from './additionQuiz';

describe('generateAdditionQuestion', () => {
    it('returns an object with text and answer', () => {
        const q = generateAdditionQuestion();
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('answer');
        expect(typeof q.text).toBe('string');
        expect(typeof q.answer).toBe('number');
    });

    it('answer equals the sum of the two operands in text', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateAdditionQuestion();
            const match = q.text.match(/^(\d+) \+ (\d+) = \?$/);
            expect(match).not.toBeNull();
            const a = Number(match![1]);
            const b = Number(match![2]);
            expect(q.answer).toBe(a + b);
        }
    });

    it('both operands are >= 1', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateAdditionQuestion();
            const match = q.text.match(/^(\d+) \+ (\d+) = \?$/);
            expect(Number(match![1])).toBeGreaterThanOrEqual(1);
            expect(Number(match![2])).toBeGreaterThanOrEqual(1);
        }
    });

    it('sum never exceeds maxSum (default 20)', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateAdditionQuestion();
            expect(q.answer).toBeLessThanOrEqual(20);
            expect(q.answer).toBeGreaterThanOrEqual(2);
        }
    });

    it('respects custom maxSum', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateAdditionQuestion(10);
            expect(q.answer).toBeLessThanOrEqual(10);
            expect(q.answer).toBeGreaterThanOrEqual(2);
        }
    });
});

describe('generateSubtractionQuestion', () => {
    it('returns an object with text and answer', () => {
        const q = generateSubtractionQuestion();
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('answer');
        expect(typeof q.text).toBe('string');
        expect(typeof q.answer).toBe('number');
    });

    it('answer equals a - b for the operands in text', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateSubtractionQuestion();
            const match = q.text.match(/^(\d+) - (\d+) = \?$/);
            expect(match).not.toBeNull();
            const a = Number(match![1]);
            const b = Number(match![2]);
            expect(q.answer).toBe(a - b);
        }
    });

    it('first operand >= 2 and second operand >= 1', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateSubtractionQuestion();
            const match = q.text.match(/^(\d+) - (\d+) = \?$/);
            expect(Number(match![1])).toBeGreaterThanOrEqual(2);
            expect(Number(match![2])).toBeGreaterThanOrEqual(1);
        }
    });

    it('answer is always >= 1', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateSubtractionQuestion();
            expect(q.answer).toBeGreaterThanOrEqual(1);
        }
    });

    it('first operand never exceeds maxVal (default 20)', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateSubtractionQuestion();
            const match = q.text.match(/^(\d+) - (\d+) = \?$/);
            expect(Number(match![1])).toBeLessThanOrEqual(20);
        }
    });

    it('respects custom maxVal', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateSubtractionQuestion(8);
            const match = q.text.match(/^(\d+) - (\d+) = \?$/);
            expect(Number(match![1])).toBeLessThanOrEqual(8);
            expect(q.answer).toBeGreaterThanOrEqual(1);
        }
    });
});

describe('generateMultiplicationQuestion', () => {
    it('returns an object with text and answer', () => {
        const q = generateMultiplicationQuestion();
        expect(q).toHaveProperty('text');
        expect(q).toHaveProperty('answer');
        expect(typeof q.text).toBe('string');
        expect(typeof q.answer).toBe('number');
    });

    it('answer equals a * b for the factors in text', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateMultiplicationQuestion();
            const match = q.text.match(/^(\d+) × (\d+) = \?$/);
            expect(match).not.toBeNull();
            const a = Number(match![1]);
            const b = Number(match![2]);
            expect(q.answer).toBe(a * b);
        }
    });

    it('both factors are >= 2', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateMultiplicationQuestion();
            const match = q.text.match(/^(\d+) × (\d+) = \?$/);
            expect(Number(match![1])).toBeGreaterThanOrEqual(2);
            expect(Number(match![2])).toBeGreaterThanOrEqual(2);
        }
    });

    it('factors never exceed maxFactor (default 10)', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateMultiplicationQuestion();
            const match = q.text.match(/^(\d+) × (\d+) = \?$/);
            expect(Number(match![1])).toBeLessThanOrEqual(10);
            expect(Number(match![2])).toBeLessThanOrEqual(10);
        }
    });

    it('respects custom maxFactor', () => {
        for (let i = 0; i < 100; i++) {
            const q = generateMultiplicationQuestion(5);
            const match = q.text.match(/^(\d+) × (\d+) = \?$/);
            expect(Number(match![1])).toBeLessThanOrEqual(5);
            expect(Number(match![2])).toBeLessThanOrEqual(5);
            expect(Number(match![1])).toBeGreaterThanOrEqual(2);
            expect(Number(match![2])).toBeGreaterThanOrEqual(2);
        }
    });
});

describe('generateLevelQuestion', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns a valid question with text and numeric answer for every level', () => {
        for (let level = 0; level <= 4; level++) {
            const q = generateLevelQuestion(level);
            expect(typeof q.text).toBe('string');
            expect(typeof q.answer).toBe('number');
            expect(q.text).toMatch(/= \?$/);
        }
    });

    it('level 0 produces only addition with sum <= 10', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateLevelQuestion(0);
            expect(q.text).toContain('+');
            expect(q.text).not.toContain('-');
            expect(q.text).not.toContain('×');
            const match = q.text.match(/^(\d+) \+ (\d+) = \?$/);
            expect(match).not.toBeNull();
            expect(q.answer).toBeLessThanOrEqual(10);
        }
    });

    it('negative levels are treated as level 0', () => {
        for (let i = 0; i < 20; i++) {
            const q = generateLevelQuestion(-1);
            expect(q.text).toContain('+');
            expect(q.answer).toBeLessThanOrEqual(10);
        }
    });

    it('level 1 dispatches to addition when random < 0.5', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
        const q = generateLevelQuestion(1);
        expect(q.text).toContain('+');
    });

    it('level 1 dispatches to subtraction when random >= 0.5', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.7);
        const q = generateLevelQuestion(1);
        expect(q.text).toContain('-');
    });

    it('level 1 only produces + or - operators', () => {
        for (let i = 0; i < 50; i++) {
            const q = generateLevelQuestion(1);
            const hasPlus = q.text.includes('+');
            const hasMinus = q.text.includes('-');
            expect(hasPlus || hasMinus).toBe(true);
            expect(q.text).not.toContain('×');
        }
    });

    it('level 1 addition answers do not exceed 20', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.0);
        const q = generateLevelQuestion(1);
        expect(q.text).toContain('+');
        expect(q.answer).toBeLessThanOrEqual(20);
    });

    it('level 1 subtraction operands do not exceed 15', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);
        const q = generateLevelQuestion(1);
        expect(q.text).toContain('-');
        const match = q.text.match(/^(\d+) - (\d+) = \?$/);
        expect(Number(match![1])).toBeLessThanOrEqual(15);
    });

    it('level 2 dispatches to addition when roll < 0.35', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
        const q = generateLevelQuestion(2);
        expect(q.text).toContain('+');
    });

    it('level 2 dispatches to subtraction when 0.35 <= roll < 0.7', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.5);
        const q = generateLevelQuestion(2);
        expect(q.text).toContain('-');
    });

    it('level 2 dispatches to multiplication when roll >= 0.7', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.8);
        const q = generateLevelQuestion(2);
        expect(q.text).toContain('×');
    });

    it('level 3 dispatches to addition when roll < 0.3', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.1);
        const q = generateLevelQuestion(3);
        expect(q.text).toContain('+');
    });

    it('level 3 dispatches to subtraction when 0.3 <= roll < 0.55', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.4);
        const q = generateLevelQuestion(3);
        expect(q.text).toContain('-');
    });

    it('level 3 dispatches to multiplication when roll >= 0.55', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);
        const q = generateLevelQuestion(3);
        expect(q.text).toContain('×');
    });

    it('level 3+ uses the same distribution as level 3', () => {
        vi.spyOn(Math, 'random').mockReturnValueOnce(0.9);
        const q = generateLevelQuestion(5);
        expect(q.text).toContain('×');
    });

    it('level question answers are always correct', () => {
        for (let level = 0; level <= 3; level++) {
            for (let i = 0; i < 20; i++) {
                const q = generateLevelQuestion(level);
                const addMatch = q.text.match(/^(\d+) \+ (\d+) = \?$/);
                const subMatch = q.text.match(/^(\d+) - (\d+) = \?$/);
                const mulMatch = q.text.match(/^(\d+) × (\d+) = \?$/);
                if (addMatch) {
                    expect(q.answer).toBe(Number(addMatch[1]) + Number(addMatch[2]));
                } else if (subMatch) {
                    expect(q.answer).toBe(Number(subMatch[1]) - Number(subMatch[2]));
                } else if (mulMatch) {
                    expect(q.answer).toBe(Number(mulMatch[1]) * Number(mulMatch[2]));
                } else {
                    expect.unreachable('question text did not match any known pattern');
                }
            }
        }
    });
});
