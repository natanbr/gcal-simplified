// ============================================================
// When the bank refills, and against which board.
//
// A drop that empties a slot refills it at once — unless a line is exploding,
// whether this drop completed it or an earlier one did. Then the slot stays
// empty until the clear resolves, and is dealt against the board as it is by
// then: lines gone, meteors landed. Dealt any
// earlier, the hand is planned against a board that is about to change, and
// the child is handed a shape that is refused everywhere until the explosion
// ends, or whose space a meteor then takes.
//
// spawnObstacles is mocked for the whole file (a no-op unless a test says
// otherwise), so each test decides exactly what "meteors landed" means.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useLayoutEffect } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { useBlocksGame } from './useBlocksGame';
import { HELP_SHAPES, GameShape, spawnObstacles } from './types';
import { CLEAR_DELAY_MS } from './lineClear';
import { hasAnyPlacement } from './placement';

vi.mock('./types', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./types')>();
    return { ...actual, spawnObstacles: vi.fn() };
});

type Game = ReturnType<typeof useBlocksGame>;

const DOT = HELP_SHAPES[0];
const ASTEROID = 2;
const HELP_IDS = new Set(HELP_SHAPES.map(s => s.id));

const isHelpShape = (shape: GameShape) => HELP_IDS.has(shape.id.slice(0, shape.id.lastIndexOf('-')));
const fitsNow = (game: Game, shape: GameShape) => hasAnyPlacement(game.gameState.grid, shape.cells);

/** A started game whose bank holds a single DOT in slot 0, on `fill`. */
function gameWithLastShape(fill: (grid: number[][]) => void) {
    const hook = renderHook(() => useBlocksGame());
    act(() => hook.result.current.startGame());
    act(() => {
        const state = hook.result.current.gameState;
        fill(state.grid);
        state.standardShapes = [DOT, null, null];
    });
    return hook;
}

const emptyBoard = (grid: number[][]) => grid.forEach(row => row.fill(0));

/** Every cell filled but (0,0): a DOT there completes every row and column,
 *  so the whole board explodes and, until it drains, nothing fits anywhere. */
const oneHoleBoard = (grid: number[][]) => {
    grid.forEach(row => row.fill(1));
    grid[0][0] = 0;
};

describe('useBlocksGame — refilling the bank', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        let n = 0; // varied, so every draw the dealer makes is not the same one
        vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
        vi.mocked(spawnObstacles).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('deals the next hand at once when the emptying drop clears nothing', () => {
        const { result } = gameWithLastShape(emptyBoard);

        act(() => result.current.placeShape(DOT, 4, 4, 'standard', 0));

        const bank = result.current.gameState.standardShapes;
        expect(bank.every(s => s !== null)).toBe(true);
        for (const shape of bank) expect(fitsNow(result.current, shape as GameShape)).toBe(true);
    });

    it('leaves the bank empty while the clear it caused explodes, then deals against the cleared board', () => {
        const { result } = gameWithLastShape(oneHoleBoard);

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));

        // Mid-explosion: nothing on the board fits, so a hand dealt now would
        // be refused wherever the child dragged it.
        expect(result.current.gameState.grid[3][3]).toBe(4);
        expect(result.current.gameState.standardShapes).toEqual([null, null, null]);

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        const bank = result.current.gameState.standardShapes;
        expect(bank.every(s => s !== null)).toBe(true);
        for (const shape of bank as GameShape[]) {
            expect(fitsNow(result.current, shape)).toBe(true);
            // Dealt against the painted board, every slot would have fallen
            // back to the last-resort monomino — nothing else fits there.
            expect(isHelpShape(shape)).toBe(false);
        }
    });

    it('also waits when an earlier clear is still exploding and the emptying drop completes nothing', () => {
        const { result } = gameWithLastShape(grid => {
            emptyBoard(grid);
            grid[0].fill(1);
            grid[0][0] = 0; // a DOT at (0,0) clears row 0
        });
        act(() => { result.current.gameState.standardShapes = [DOT, DOT, null]; });

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0)); // clears row 0
        act(() => result.current.placeShape(DOT, 4, 4, 'standard', 1)); // quiet, empties the bank

        expect(result.current.gameState.grid[0][3]).toBe(4); // row 0 still exploding
        expect(result.current.gameState.standardShapes).toEqual([null, null, null]);

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        const bank = result.current.gameState.standardShapes as GameShape[];
        expect(bank.every(s => s !== null)).toBe(true);
        for (const shape of bank) expect(fitsNow(result.current, shape)).toBe(true);
    });

    it('deals around the meteors the clear drops, not into the space they take', () => {
        const { result } = gameWithLastShape(oneHoleBoard);
        // When the clear resolves, asteroids fill everything but a 1x3 run —
        // so only a horizontal tromino fits the board the child is left with.
        vi.mocked(spawnObstacles).mockImplementation(grid => {
            grid.forEach(row => row.fill(ASTEROID));
            grid[3][0] = grid[3][1] = grid[3][2] = 0;
        });

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        const bank = result.current.gameState.standardShapes as GameShape[];
        expect(bank).toHaveLength(3);
        for (const shape of bank) expect(fitsNow(result.current, shape)).toBe(true);
    });

    it('re-deals the rescue slot at once after the rescue shape is used on a quiet drop', () => {
        const { result } = gameWithLastShape(emptyBoard);
        act(() => {
            result.current.gameState.standardShapes = [DOT, DOT, null];
            result.current.gameState.rescueShape = DOT;
            result.current.resolveRescueQuiz(); // the child answered: unlocked
        });

        act(() => result.current.placeShape(DOT, 4, 4, 'rescue', 0));

        const { rescueShape, rescueShapeLocked } = result.current.gameState;
        expect(rescueShape).not.toBeNull();
        expect(rescueShapeLocked).toBe(true);
        expect(fitsNow(result.current, rescueShape as GameShape)).toBe(true);
    });

    it('re-deals the rescue slot when the clear the rescue shape caused resolves', () => {
        const { result } = gameWithLastShape(oneHoleBoard);
        act(() => {
            result.current.gameState.standardShapes = [DOT, DOT, null];
            result.current.gameState.rescueShape = DOT;
            result.current.resolveRescueQuiz();
        });

        act(() => result.current.placeShape(DOT, 0, 0, 'rescue', 0));
        expect(result.current.gameState.rescueShape).toBeNull();

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        const { rescueShape, rescueShapeLocked } = result.current.gameState;
        expect(rescueShape).not.toBeNull();
        expect(rescueShapeLocked).toBe(true);
        expect(fitsNow(result.current, rescueShape as GameShape)).toBe(true);
        // The two standard shapes were never emptied, so they are not re-dealt.
        expect(result.current.gameState.standardShapes).toEqual([DOT, DOT, null]);
    });
});

describe('useBlocksGame — a clear React replays deals one hand', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        let n = 0; // varied, so two independent deals would not match
        vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
        vi.mocked(spawnObstacles).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function BankLog({ api, banks }: { api: { current: Game | null }; banks: string[] }) {
        const game = useBlocksGame();
        api.current = game;
        useLayoutEffect(() => { banks.push(JSON.stringify(game.gameState.standardShapes)); });
        return null;
    }

    it('deals the same hand each time the resolving updater runs', () => {
        const api: { current: Game | null } = { current: null };
        const banks: string[] = [];
        render(<BankLog api={api} banks={banks} />);
        const game = () => api.current as Game;
        act(() => game().startGame());
        act(() => {
            const { grid } = game().gameState;
            grid.forEach(row => row.fill(0));
            grid[0].fill(1);
            grid[0][0] = 0;
            game().gameState.standardShapes = [DOT, null, null];
        });
        act(() => game().placeShape(DOT, 0, 0, 'standard', 0));
        banks.length = 0;

        // An update already queued when the timer fires: flushSync commits the
        // clear ahead of it, and React then replays the clear on top of it.
        // The same replay main's line-clear suite uses for the meteors.
        act(() => {
            game().cancelRescueQuiz();
            vi.advanceTimersByTime(CLEAR_DELAY_MS);
        });

        const dealt = banks.filter(bank => !bank.startsWith('[null'));
        expect(dealt.length).toBeGreaterThan(1);
        expect(new Set(dealt).size).toBe(1);
    });
});
