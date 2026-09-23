// ============================================================
// Placement — the one "may this shape sit here?" rule the ghost, the game and
// the dealer all read, plus the dealer's "is this line full?" forecast.
//
// These lived inside useBlocksGame as useCallbacks with empty dependency
// arrays, which made the deal logic untestable: the only way to reach it was
// through the hook, whose starting grid is a random INITIAL_LAYOUTS pick.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
    CELL,
    isPlaceable,
    findAnchors,
    hasAnyPlacement,
    findCompletedLines,
    linesClearedBy,
    projectPlacement,
    completingAnchors,
    orientations,
    normalizeCells,
} from './placement';
import { GRID_SIZE, GameShape, Position } from './types';

/** An 8x8 grid of `fill`, so tests only have to describe what differs. */
function grid(fill: number = CELL.EMPTY): number[][] {
    return Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(fill));
}

const DOMINO_H = [{ x: 0, y: 0 }, { x: 1, y: 0 }];

/** isPlaceable takes a dealt shape; only its cells matter to the rule. */
const asShape = (cells: Position[]): GameShape => ({ id: 't', name: 't', color: 'none', cells });
const SINGLE = [{ x: 0, y: 0 }];

describe('isPlaceable', () => {
    it('accepts a shape that lands entirely on empty cells', () => {
        expect(isPlaceable(grid(), asShape(DOMINO_H), { r: 0, c: 0 })).toBe(true);
    });

    it('rejects a shape that runs off the right edge', () => {
        expect(isPlaceable(grid(), asShape(DOMINO_H), { r: 0, c: GRID_SIZE - 1 })).toBe(false);
    });

    it('rejects a shape that runs off the bottom edge', () => {
        const vertical = [{ x: 0, y: 0 }, { x: 0, y: 1 }];
        expect(isPlaceable(grid(), asShape(vertical), { r: GRID_SIZE - 1, c: 0 })).toBe(false);
    });

    it('rejects negative anchors', () => {
        expect(isPlaceable(grid(), asShape(SINGLE), { r: -1, c: 0 })).toBe(false);
        expect(isPlaceable(grid(), asShape(SINGLE), { r: 0, c: -1 })).toBe(false);
    });

    it('rejects a cell already holding debris', () => {
        const g = grid();
        g[3][4] = CELL.BLOCK;
        expect(isPlaceable(g, asShape(SINGLE), { r: 3, c: 4 })).toBe(false);
    });

    it('rejects an asteroid cell — asteroids are permanent holes', () => {
        const g = grid();
        g[3][4] = CELL.ASTEROID;
        expect(isPlaceable(g, asShape(SINGLE), { r: 3, c: 4 })).toBe(false);
    });

    it('ALLOWS overwriting a satellite — the one overridable cell', () => {
        const g = grid();
        g[3][4] = CELL.SATELLITE;
        expect(isPlaceable(g, asShape(SINGLE), { r: 3, c: 4 })).toBe(true);
    });

    it('rejects a cell mid-clear (4) — it is still occupied until it drains', () => {
        const g = grid();
        g[3][4] = 4; // exploding; lineClear.ts owns the value
        expect(isPlaceable(g, asShape(SINGLE), { r: 3, c: 4 })).toBe(false);
    });
});

describe('findAnchors / hasAnyPlacement', () => {
    it('finds every anchor on an empty board', () => {
        // A horizontal domino fits at 8 rows x 7 columns.
        expect(findAnchors(grid(), DOMINO_H)).toHaveLength(GRID_SIZE * (GRID_SIZE - 1));
    });

    it('reports no placement on a full board', () => {
        expect(hasAnyPlacement(grid(CELL.BLOCK), SINGLE)).toBe(false);
        expect(findAnchors(grid(CELL.BLOCK), SINGLE)).toEqual([]);
    });

    it('finds the single surviving gap', () => {
        const g = grid(CELL.BLOCK);
        g[5][2] = CELL.EMPTY;
        expect(findAnchors(g, SINGLE)).toEqual([{ r: 5, c: 2 }]);
    });
});

describe('findCompletedLines', () => {
    it('finds nothing on an empty board', () => {
        expect(findCompletedLines(grid())).toEqual({ rows: [], cols: [] });
    });

    it('finds a full row', () => {
        const g = grid();
        g[2] = Array<number>(GRID_SIZE).fill(CELL.BLOCK);
        expect(findCompletedLines(g)).toEqual({ rows: [2], cols: [] });
    });

    it('finds a full column', () => {
        const g = grid();
        for (let r = 0; r < GRID_SIZE; r++) g[r][6] = CELL.BLOCK;
        expect(findCompletedLines(g)).toEqual({ rows: [], cols: [6] });
    });

    it('counts a line of mixed non-empty cells — asteroids and satellites fill a line', () => {
        // ANY non-zero value counts. An asteroid the child can never cover
        // still completes the row it sits in — the same `cell > 0` rule that
        // lineClear.markCompletedLines applies to the real board.
        const g = grid();
        g[2] = [1, 2, 3, 1, 1, 1, 1, 1];
        expect(findCompletedLines(g).rows).toEqual([2]);
    });

    it('does not count a row with a single gap', () => {
        const g = grid();
        g[2] = Array<number>(GRID_SIZE).fill(CELL.BLOCK);
        g[2][7] = CELL.EMPTY;
        expect(findCompletedLines(g).rows).toEqual([]);
    });
});

describe('projectPlacement', () => {
    it('writes the shape as debris and leaves the source grid untouched', () => {
        const g = grid();
        const { grid: next } = projectPlacement(g, DOMINO_H, { r: 1, c: 1 });
        expect(next[1][1]).toBe(CELL.BLOCK);
        expect(next[1][2]).toBe(CELL.BLOCK);
        expect(g[1][1]).toBe(CELL.EMPTY); // no mutation
    });

    it('clears a row the placement completes, and reports the count', () => {
        const g = grid();
        for (let c = 0; c < GRID_SIZE - 1; c++) g[4][c] = CELL.BLOCK;
        const { grid: next, linesCleared } = projectPlacement(g, SINGLE, { r: 4, c: 7 });
        expect(linesCleared).toBe(1);
        expect(next[4].every(cell => cell === CELL.EMPTY)).toBe(true);
    });

    it('clears a column the placement completes, cells and all', () => {
        // The count comes from findCompletedLines, so it stays right even when
        // the column is never actually emptied. Only the cells show the clear.
        const g = grid();
        for (let r = 0; r < GRID_SIZE - 1; r++) g[r][6] = CELL.BLOCK;
        const { grid: next, linesCleared } = projectPlacement(g, SINGLE, { r: 7, c: 6 });
        expect(linesCleared).toBe(1);
        expect(next.every(row => row[6] === CELL.EMPTY)).toBe(true);
    });

    it('clears a row and a column together and counts both', () => {
        const g = grid();
        for (let c = 0; c < GRID_SIZE; c++) g[4][c] = CELL.BLOCK;
        for (let r = 0; r < GRID_SIZE; r++) g[r][4] = CELL.BLOCK;
        g[4][4] = CELL.EMPTY; // the shared cell is the only gap in both
        const { grid: next, linesCleared } = projectPlacement(g, SINGLE, { r: 4, c: 4 });
        expect(linesCleared).toBe(2);
        expect(next[4].every(cell => cell === CELL.EMPTY)).toBe(true);
        expect(next.every(row => row[4] === CELL.EMPTY)).toBe(true);
    });
});

describe('linesClearedBy', () => {
    // The dealer's cheap forecast: it checks only the lines the shape touches
    // and never builds the grid, so it can drift from projectPlacement unnoticed.
    it('counts a column the placement completes', () => {
        const g = grid();
        for (let r = 0; r < GRID_SIZE - 1; r++) g[r][6] = CELL.BLOCK;
        expect(linesClearedBy(g, SINGLE, { r: 7, c: 6 })).toBe(1);
    });

    it('counts a row and a column completed together as two', () => {
        const g = grid();
        for (let c = 0; c < GRID_SIZE; c++) g[4][c] = CELL.BLOCK;
        for (let r = 0; r < GRID_SIZE; r++) g[r][4] = CELL.BLOCK;
        g[4][4] = CELL.EMPTY;
        expect(linesClearedBy(g, SINGLE, { r: 4, c: 4 })).toBe(2);
    });
});

describe('completingAnchors', () => {
    it('is empty when no placement can finish a line', () => {
        expect(completingAnchors(grid(), SINGLE)).toEqual([]);
    });

    it('finds the anchor that plugs the last hole in a row', () => {
        const g = grid();
        for (let c = 0; c < GRID_SIZE - 1; c++) g[4][c] = CELL.BLOCK;
        expect(completingAnchors(g, SINGLE)).toEqual([{ r: 4, c: 7 }]);
    });

    it('rejects a shape too big for the gap it would have to fill', () => {
        // Row 4 has a one-cell gap; a horizontal domino cannot sit in it.
        const g = grid();
        for (let c = 0; c < GRID_SIZE - 1; c++) g[4][c] = CELL.BLOCK;
        expect(completingAnchors(g, DOMINO_H)).toEqual([]);
    });
});

describe('orientations', () => {
    it('returns the single distinct orientation of a 1x1', () => {
        expect(orientations(SINGLE)).toHaveLength(1);
    });

    it('returns two distinct orientations of a domino, not eight', () => {
        // 4 rotations x 2 mirrors = 8 raw transforms, but a domino only has a
        // horizontal and a vertical form. Duplicates must be collapsed or the
        // deal is silently biased toward symmetric shapes.
        const result = orientations(DOMINO_H);
        expect(result).toHaveLength(2);
    });

    it('returns one orientation for a 2x2 square', () => {
        const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
        expect(orientations(square)).toHaveLength(1);
    });

    it('returns four orientations for an L tromino (chiral under mirror)', () => {
        const lTromino = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
        expect(orientations(lTromino)).toHaveLength(4);
    });

    it('normalizes every orientation to the origin', () => {
        for (const cells of orientations([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }])) {
            expect(Math.min(...cells.map(c => c.x))).toBe(0);
            expect(Math.min(...cells.map(c => c.y))).toBe(0);
        }
    });
});

describe('normalizeCells', () => {
    it('shifts a shape back to the origin', () => {
        expect(normalizeCells([{ x: 3, y: 5 }, { x: 4, y: 5 }])).toEqual([
            { x: 0, y: 0 }, { x: 1, y: 0 },
        ]);
    });
});
