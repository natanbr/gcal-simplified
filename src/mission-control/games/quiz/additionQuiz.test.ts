import { describe, it, expect } from 'vitest';
import { generateAdditionQuestion } from './additionQuiz';

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
            expect(q.answer).toBeGreaterThanOrEqual(2); // minimum 1+1
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
