import { describe, it, expect } from 'vitest';
import { findVertexOffset } from './tideMath';

describe('findVertexOffset', () => {
    it('returns 0 for a symmetric trough (vertex at x=0)', () => {
        // .toBeCloseTo() helps us handle 0 vs -0
        expect(findVertexOffset(1, 0, 1)).toBeCloseTo(0);
    });

    it('returns 0 for a symmetric peak (vertex at x=0)', () => {
        expect(findVertexOffset(0, 1, 0)).toBeCloseTo(0);
    });

    it('returns a positive offset when the vertex is shifted to the right', () => {
        // Equation: y = x^2 - x + 1
        // Vertex at x = 0.5
        // x=-1 => y=3
        // x=0  => y=1
        // x=1  => y=1
        expect(findVertexOffset(3, 1, 1)).toBe(0.5);
    });

    it('returns a negative offset when the vertex is shifted to the left', () => {
        // Equation: y = x^2 + x + 1
        // Vertex at x = -0.5
        // x=-1 => y=1
        // x=0  => y=1
        // x=1  => y=3
        expect(findVertexOffset(1, 1, 3)).toBe(-0.5);
    });

    it('calculates correctly for a downward opening parabola (peak) shifted right', () => {
        // Equation: y = -x^2 + 0.5x + 1
        // Vertex at x = 0.25
        // x=-1 => y=-0.5
        // x=0  => y=1
        // x=1  => y=0.5
        expect(findVertexOffset(-0.5, 1, 0.5)).toBe(0.25);
    });

    it('returns 0 for perfectly linear (collinear) points to avoid division by zero', () => {
        // y = x -> linear, denominator becomes 0
        expect(findVertexOffset(-1, 0, 1)).toBe(0);
    });

    it('returns 0 for near-linear points within the epsilon threshold', () => {
        // y2 is almost exactly the midpoint of y1 and y3
        // y1 = 0, y2 = 1, y3 = 2.00001
        // denom = 2 * (0 + 2.00001 - 2) = 0.00002 (< 0.0001)
        expect(findVertexOffset(0, 1, 2.00001)).toBe(0);
    });
});
