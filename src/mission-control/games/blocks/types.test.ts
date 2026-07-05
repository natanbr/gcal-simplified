import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Position } from './types';
import { transformShape, applyClearEffects, spawnObstacles, GRID_SIZE } from './types';

function makeGrid(fill = 0): number[][] {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(fill));
}

function mockRandomSequence(values: number[]) {
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => values[idx++ % values.length]);
}

describe('transformShape', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns identity (rotation 0, no mirror) when random yields 0 then >= 0.5', () => {
        mockRandomSequence([0.0, 0.9]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        const result = transformShape(cells);
        expect(result).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    });

    it('applies 90° rotation (case 1) without mirror', () => {
        mockRandomSequence([0.25, 0.9]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
        const result = transformShape(cells);
        expect(result).toEqual([{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 0 }]);
    });

    it('applies 180° rotation (case 2) without mirror', () => {
        mockRandomSequence([0.5, 0.9]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        const result = transformShape(cells);
        expect(result).toEqual([{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
    });

    it('applies 270° rotation (case 3) without mirror', () => {
        mockRandomSequence([0.75, 0.9]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
        const result = transformShape(cells);
        expect(result).toEqual([{ x: 0, y: 1 }, { x: 0, y: 0 }, { x: 1, y: 1 }]);
    });

    it('applies mirror after rotation 0', () => {
        mockRandomSequence([0.0, 0.1]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
        const result = transformShape(cells);
        expect(result).toEqual([{ x: 2, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 0 }]);
    });

    it('applies mirror after 90° rotation', () => {
        mockRandomSequence([0.25, 0.1]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
        const result = transformShape(cells);
        const minX = Math.min(...result.map(p => p.x));
        const minY = Math.min(...result.map(p => p.y));
        expect(minX).toBe(0);
        expect(minY).toBe(0);
        expect(result.every(p => p.x >= 0 && p.y >= 0)).toBe(true);
    });

    it('normalizes all coordinates to non-negative values', () => {
        for (let rot = 0; rot < 4; rot++) {
            for (const mir of [true, false]) {
                mockRandomSequence([rot / 4, mir ? 0.1 : 0.9]);
                const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 3, y: 1 }];
                const result = transformShape(cells);
                const allNonNeg = result.every(p => p.x >= 0 && p.y >= 0);
                expect(allNonNeg).toBe(true);
                const hasZeroX = result.some(p => p.x === 0);
                const hasZeroY = result.some(p => p.y === 0);
                expect(hasZeroX).toBe(true);
                expect(hasZeroY).toBe(true);
                vi.restoreAllMocks();
            }
        }
    });

    it('single cell always stays at (0,0)', () => {
        for (let rot = 0; rot < 4; rot++) {
            for (const mir of [true, false]) {
                mockRandomSequence([rot / 4, mir ? 0.1 : 0.9]);
                const result = transformShape([{ x: 0, y: 0 }]);
                expect(result).toEqual([{ x: 0, y: 0 }]);
                vi.restoreAllMocks();
            }
        }
    });

    it('preserves relative distances between cells', () => {
        mockRandomSequence([0.25, 0.9]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 3, y: 0 }];
        const result = transformShape(cells);
        const dx = Math.abs(result[0].x - result[1].x);
        const dy = Math.abs(result[0].y - result[1].y);
        expect(dx + dy).toBe(3);
    });

    it('returns same number of cells as input', () => {
        mockRandomSequence([0.5, 0.3]);
        const cells: Position[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 1 }, { x: 3, y: 2 }];
        expect(transformShape(cells)).toHaveLength(4);
    });
});

describe('applyClearEffects', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('satellite (value 3) clears diagonal debris neighbors', () => {
        const grid = makeGrid();
        grid[2][2] = 0;
        grid[1][1] = 1;
        grid[1][3] = 1;
        grid[3][1] = 1;
        grid[3][3] = 1;
        const cleared = [{ r: 2, c: 2 }];
        const origValues = new Map([['2-2', 3]]);
        applyClearEffects(grid, cleared, origValues);
        expect(grid[1][1]).toBe(0);
        expect(grid[1][3]).toBe(0);
        expect(grid[3][1]).toBe(0);
        expect(grid[3][3]).toBe(0);
    });

    it('satellite does not clear non-debris diagonal neighbors', () => {
        const grid = makeGrid();
        grid[1][1] = 2;
        grid[1][3] = 3;
        grid[3][1] = 5;
        grid[3][3] = 0;
        const cleared = [{ r: 2, c: 2 }];
        const origValues = new Map([['2-2', 3]]);
        applyClearEffects(grid, cleared, origValues);
        expect(grid[1][1]).toBe(2);
        expect(grid[1][3]).toBe(3);
        expect(grid[3][1]).toBe(5);
        expect(grid[3][3]).toBe(0);
    });

    it('satellite at corner only clears in-bounds diagonals', () => {
        const grid = makeGrid();
        grid[1][1] = 1;
        const cleared = [{ r: 0, c: 0 }];
        const origValues = new Map([['0-0', 3]]);
        applyClearEffects(grid, cleared, origValues);
        expect(grid[1][1]).toBe(0);
    });

    it('satellite at bottom-right corner handles bounds correctly', () => {
        const grid = makeGrid();
        grid[6][6] = 1;
        const cleared = [{ r: 7, c: 7 }];
        const origValues = new Map([['7-7', 3]]);
        applyClearEffects(grid, cleared, origValues);
        expect(grid[6][6]).toBe(0);
    });

    it('electricity (value 5) spawns 2 meteors on empty cells', () => {
        const grid = makeGrid();
        let callIdx = 0;
        const randomValues = [0.0, 0.0, 0.125, 0.0];
        vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIdx++ % randomValues.length]);
        const cleared = [{ r: 4, c: 4 }];
        const origValues = new Map([['4-4', 5]]);
        applyClearEffects(grid, cleared, origValues);
        const meteorCount = grid.flat().filter(v => v === 2).length;
        expect(meteorCount).toBe(2);
    });

    it('regular debris (value 1) produces no special effect', () => {
        const grid = makeGrid();
        grid[0][0] = 1;
        grid[1][1] = 1;
        const gridCopy = grid.map(row => [...row]);
        const cleared = [{ r: 3, c: 3 }];
        const origValues = new Map([['3-3', 1]]);
        applyClearEffects(grid, cleared, origValues);
        expect(grid).toEqual(gridCopy);
    });

    it('handles combined satellite and electricity effects in one batch', () => {
        const grid = makeGrid();
        grid[1][1] = 1;
        grid[1][3] = 1;
        grid[3][1] = 1;
        grid[3][3] = 1;

        let callIdx = 0;
        const randomValues = [0.25, 0.25, 0.375, 0.25];
        vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIdx++ % randomValues.length]);

        const cleared = [{ r: 2, c: 2 }, { r: 5, c: 5 }];
        const origValues = new Map([['2-2', 3], ['5-5', 5]]);
        applyClearEffects(grid, cleared, origValues);

        expect(grid[1][1]).toBe(0);
        expect(grid[1][3]).toBe(0);
        expect(grid[3][1]).toBe(0);
        expect(grid[3][3]).toBe(0);

        const meteorCount = grid.flat().filter(v => v === 2).length;
        expect(meteorCount).toBe(2);
    });

    it('electricity does nothing if no empty cells available', () => {
        const grid = makeGrid(1);
        const cleared = [{ r: 0, c: 0 }];
        const origValues = new Map([['0-0', 5]]);
        mockRandomSequence([0.5, 0.5]);
        applyClearEffects(grid, cleared, origValues);
        const meteorCount = grid.flat().filter(v => v === 2).length;
        expect(meteorCount).toBe(0);
    });
});

describe('spawnObstacles', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('level 0 spawns nothing', () => {
        const grid = makeGrid();
        spawnObstacles(grid, 0);
        expect(grid.flat().every(v => v === 0)).toBe(true);
    });

    it('level 1 spawns exactly 2 meteors', () => {
        const grid = makeGrid();
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 1);
        expect(grid.flat().filter(v => v === 2).length).toBe(2);
        expect(grid.flat().filter(v => v === 3).length).toBe(0);
        expect(grid.flat().filter(v => v === 5).length).toBe(0);
    });

    it('level 2 spawns 2 meteors + 1 satellite', () => {
        const grid = makeGrid();
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125, 0.25, 0.25];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 2);
        expect(grid.flat().filter(v => v === 2).length).toBe(2);
        expect(grid.flat().filter(v => v === 3).length).toBe(1);
        expect(grid.flat().filter(v => v === 5).length).toBe(0);
    });

    it('level 3 spawns 2 meteors + 1 satellite + 1 electricity', () => {
        const grid = makeGrid();
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125, 0.25, 0.25, 0.375, 0.375];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 3);
        expect(grid.flat().filter(v => v === 2).length).toBe(2);
        expect(grid.flat().filter(v => v === 3).length).toBe(1);
        expect(grid.flat().filter(v => v === 5).length).toBe(1);
    });

    it('does not spawn meteors if they already exist', () => {
        const grid = makeGrid();
        grid[0][0] = 2;
        mockRandomSequence([0.5, 0.5]);
        spawnObstacles(grid, 1);
        expect(grid.flat().filter(v => v === 2).length).toBe(1);
    });

    it('does not spawn satellite if one already exists', () => {
        const grid = makeGrid();
        grid[0][0] = 3;
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 2);
        expect(grid.flat().filter(v => v === 3).length).toBe(1);
    });

    it('does not spawn electricity if one already exists', () => {
        const grid = makeGrid();
        grid[0][0] = 5;
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125, 0.25, 0.25];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 3);
        expect(grid.flat().filter(v => v === 5).length).toBe(1);
    });

    it('high level still works the same as level 3', () => {
        const grid = makeGrid();
        let callIdx = 0;
        const vals = [0.0, 0.0, 0.125, 0.125, 0.25, 0.25, 0.375, 0.375];
        vi.spyOn(Math, 'random').mockImplementation(() => vals[callIdx++ % vals.length]);
        spawnObstacles(grid, 10);
        expect(grid.flat().filter(v => v === 2).length).toBe(2);
        expect(grid.flat().filter(v => v === 3).length).toBe(1);
        expect(grid.flat().filter(v => v === 5).length).toBe(1);
    });
});
