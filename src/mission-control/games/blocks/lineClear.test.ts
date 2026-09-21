import { describe, it, expect } from 'vitest';
import { clearFeedback, markCompletedLines, resolvePendingClear } from './lineClear';
import { GRID_SIZE } from './types';

const EXPLODING = 4;
const emptyGrid = () => Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(0));

describe('markCompletedLines', () => {
    it('marks a full row exploding and records what each cell held', () => {
        const grid = emptyGrid();
        grid[0].fill(1);
        grid[0][3] = 3; // a satellite

        const { linesCleared, pendingClear } = markCompletedLines(grid, null);

        expect(linesCleared).toBe(1);
        expect(grid[0].every(cell => cell === EXPLODING)).toBe(true);
        expect(pendingClear?.cells).toHaveLength(GRID_SIZE);
        expect(pendingClear?.cells).toContainEqual({ r: 0, c: 3, original: 3 });
    });

    it('records a cell where a row and a column cross once, with its value before either marked it', () => {
        const grid = emptyGrid();
        grid[0].fill(1);
        grid.forEach(row => { row[0] = 1; });
        grid[0][0] = 5; // electricity at the crossing

        const { linesCleared, pendingClear } = markCompletedLines(grid, null);

        expect(linesCleared).toBe(2);
        expect(pendingClear?.cells).toHaveLength(2 * GRID_SIZE - 1);
        expect(pendingClear?.cells.filter(({ r, c }) => r === 0 && c === 0)).toEqual([{ r: 0, c: 0, original: 5 }]);
    });

    it('does not complete a line again while it is still exploding', () => {
        const grid = emptyGrid();
        grid[0].fill(1);
        const first = markCompletedLines(grid, null).pendingClear;

        grid[5][5] = 1; // a later drop that completes nothing
        const again = markCompletedLines(grid, first);

        expect(again.linesCleared).toBe(0);
        expect(again.pendingClear).toBe(first);
    });

    it('a line crossing an exploding one completes and joins it; the crossing keeps its first original', () => {
        const grid = emptyGrid();
        grid[0].fill(1);
        grid[0][2] = 3;
        const first = markCompletedLines(grid, null).pendingClear;
        grid.forEach((row, r) => { if (r > 0) row[2] = 1; }); // column 2, through the exploding row

        const joined = markCompletedLines(grid, first);

        expect(joined.linesCleared).toBe(1);
        expect(joined.pendingClear?.cells).toHaveLength(2 * GRID_SIZE - 1);
        expect(joined.pendingClear?.cells).toContainEqual({ r: 0, c: 2, original: 3 });
        expect(grid.every(row => row[2] === EXPLODING)).toBe(true);
    });
});

describe('resolvePendingClear', () => {
    it('empties the exploding cells and fires a satellite from the value it held', () => {
        const grid = emptyGrid();
        grid[3].fill(1);
        grid[3][4] = 3;
        grid[2][3] = 1; // debris diagonal to the satellite
        grid[4][5] = 1; // debris diagonal to the satellite
        grid[2][4] = 1; // debris straight above it: untouched
        const pending = markCompletedLines(grid, null).pendingClear!;

        const next = resolvePendingClear(grid, pending, 0, 1);

        expect(next[3].every(cell => cell === 0)).toBe(true);
        expect([next[2][3], next[4][5], next[2][4]]).toEqual([0, 0, 1]);
        expect(grid[3].every(cell => cell === EXPLODING)).toBe(true); // input untouched
    });

    it('lands meteors in the same cells for the same seed, so a replayed clear rolls the same board', () => {
        const grid = emptyGrid();
        grid[3].fill(1);
        grid[3][4] = 5; // electricity: its meteors land at random
        const pending = markCompletedLines(grid, null).pendingClear!;

        const once = resolvePendingClear(grid, pending, 1, 42);
        const again = resolvePendingClear(grid, pending, 1, 42);

        expect(once.flat().filter(cell => cell === 2).length).toBeGreaterThan(0);
        expect(again).toEqual(once);
    });
});

describe('clearFeedback', () => {
    it.each([
        [1, 'GOOD!', 1],
        [2, 'GREAT!', 2],
        [3, 'EXCELLENT!', 3],
        [4, 'EXCELLENT!', 3],
    ])('%i line(s) → %s', (lines, text, stars) => {
        expect(clearFeedback(lines, 'id')).toEqual({ text, stars, id: 'id' });
    });
});
