import { describe, it, expect, vi, afterEach } from 'vitest';
import { applyClearEffects, spawnObstacles, GRID_SIZE } from './types';

function makeGrid(fill = 0): number[][] {
    return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(fill));
}

function mockRandomSequence(values: number[]) {
    let idx = 0;
    vi.spyOn(Math, 'random').mockImplementation(() => values[idx++ % values.length]);
}

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
