import { describe, it, expect } from 'vitest';
import { findVertexOffset, interpolateExtremeTime } from './tideMath';

describe('tideMath', () => {
    describe('findVertexOffset', () => {
        it('calculates 0 offset for a perfectly symmetrical parabola', () => {
            const offset = findVertexOffset(1, 2, 1);
            expect(offset).toBe(0);
        });

        it('calculates a positive offset when the peak leans to the right', () => {
            const offset = findVertexOffset(1, 2.5, 2);
            expect(offset).toBeGreaterThan(0);
            expect(offset).toBeCloseTo(0.25);
        });

        it('calculates a negative offset when the peak leans to the left', () => {
            const offset = findVertexOffset(2, 2.5, 1);
            expect(offset).toBeLessThan(0);
            expect(offset).toBeCloseTo(-0.25);
        });

        it('returns 0 when points are collinear (denominator is 0)', () => {
            const offset = findVertexOffset(1, 1, 1);
            expect(offset).toBe(0);
        });
    });

    describe('interpolateExtremeTime', () => {
        // Use local ISO format without 'Z' to avoid timezone shifts during parseISO->format sequence
        const times = [
            '2024-01-01T10:00:00',
            '2024-01-01T11:00:00',
            '2024-01-01T12:00:00',
        ];

        it('returns exact time for symmetrical peak', () => {
            const values = [1, 2, 1];
            const result = interpolateExtremeTime(times, values, 1);
            expect(result).toBe('2024-01-01T11:00');
        });

        it('returns original time if index is out of bounds (0)', () => {
            const values = [1, 2, 1];
            const result = interpolateExtremeTime(times, values, 0);
            expect(result).toBe(times[0]);
        });

        it('returns original time if index is out of bounds (length - 1)', () => {
            const values = [1, 2, 1];
            const result = interpolateExtremeTime(times, values, 2);
            expect(result).toBe(times[2]);
        });

        it('clamps offset to +0.5 hours (30 mins)', () => {
            // y1=5, y2=2, y3=1 yields positive offset > 0.5
            const values = [5, 2, 1];
            const result = interpolateExtremeTime(times, values, 1);
            expect(result).toBe('2024-01-01T11:30');
        });

        it('clamps offset to -0.5 hours (30 mins)', () => {
            // y1=1, y2=2, y3=5 yields negative offset < -0.5
            const values = [1, 2, 5];
            const result = interpolateExtremeTime(times, values, 1);
            expect(result).toBe('2024-01-01T10:30');
        });
    });

    describe('Performance and Scaling', () => {
        it('processes a large dataset in constant time regardless of array size', () => {
            const smallSize = 100;
            const largeSize = 100000;

            const smallTimes: string[] = Array(smallSize).fill('2024-01-01T10:00:00');
            const smallValues: number[] = Array(smallSize).fill(1).map((_, i) => Math.sin(i / 10));

            const largeTimes: string[] = Array(largeSize).fill('2024-01-01T10:00:00');
            const largeValues: number[] = Array(largeSize).fill(1).map((_, i) => Math.sin(i / 10));

            const numCalls = 100;

            const startSmall = performance.now();
            for (let i = 1; i < numCalls + 1; i++) {
                interpolateExtremeTime(smallTimes, smallValues, i);
            }
            const smallDuration = performance.now() - startSmall;

            const startLarge = performance.now();
            // Test at the end of the large array to ensure it's not iterating
            for (let i = largeSize - numCalls - 1; i < largeSize - 1; i++) {
                interpolateExtremeTime(largeTimes, largeValues, i);
            }
            const largeDuration = performance.now() - startLarge;

            // Allow a reasonable margin for JS engine overhead, but large should not be
            // massively slower (i.e. not O(N) scaling which would make it ~1000x slower)
            expect(largeDuration).toBeLessThan(smallDuration * 10 + 5);
        });
    });
});
