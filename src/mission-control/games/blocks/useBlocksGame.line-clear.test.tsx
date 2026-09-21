// ============================================================
// A completed line is resolved exactly once.
//
// The line is marked exploding (4) when the shape lands and emptied 1200ms
// later, when its satellite/electricity effects and the level's obstacles are
// applied. React may run a state updater more than once — StrictMode runs it
// twice in development, and in production an update rendered ahead of a
// lower-priority one is replayed on top of it afterwards — so nothing an
// updater schedules may outlive the run that scheduled it.
//
// spawnObstacles is mocked for the whole file; each suite sets what it does.
// The first makes it a marker that adds 1 to a cell no line here touches: the
// board itself counts how many resolutions reached COMMITTED state. A spy's
// call count would also count the StrictMode run React discards.
// ============================================================
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StrictMode, startTransition, useLayoutEffect } from 'react';
import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { useBlocksGame } from './useBlocksGame';
import { HELP_SHAPES, spawnObstacles } from './types';
import { CLEAR_DELAY_MS } from './lineClear';

vi.mock('./types', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./types')>();
    return { ...actual, spawnObstacles: vi.fn() };
});

type Game = ReturnType<typeof useBlocksGame>;

const DOT = HELP_SHAPES[0];
const MARKER = { r: 5, c: 5 };

const resolutions = (game: Game) => game.gameState.grid[MARKER.r][MARKER.c];

/** An empty board with row 0 one cell short of complete: a DOT at (0,0) clears it. */
function armRowZero(game: Game) {
    const { grid } = game.gameState;
    grid.forEach(row => row.fill(0));
    grid[0].fill(1);
    grid[0][0] = 0;
}

function startedGame(options?: { strict: boolean }) {
    const hook = renderHook(() => useBlocksGame(), options?.strict ? { wrapper: StrictMode } : undefined);
    act(() => hook.result.current.startGame());
    act(() => armRowZero(hook.result.current));
    return hook;
}

describe('useBlocksGame — line clear resolves once', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.mocked(spawnObstacles).mockReset();
        vi.mocked(spawnObstacles).mockImplementation(grid => { grid[MARKER.r][MARKER.c] += 1; });
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('under StrictMode (how the app runs in development)', () => {
        const { result } = startedGame({ strict: true });

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        const timersAfterPlacement = vi.getTimerCount();
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        expect(result.current.gameState.grid[0].every(cell => cell === 0)).toBe(true);
        expect(resolutions(result.current)).toBe(1);
        expect(timersAfterPlacement).toBe(1);
    });

    it('when React replays the placement on top of a lower-priority update', () => {
        const { result } = startedGame();

        // Production shape of the race: a finger lift is a discrete, sync-lane
        // update, rendered ahead of a default-lane one already pending (the
        // clear timer's own) and then replayed on top of it. A direct call in a
        // test is default-lane itself and would just batch, so a transition
        // supplies the lower lane that forces the replay.
        act(() => {
            startTransition(() => result.current.cancelRescueQuiz());
            result.current.placeShape(DOT, 0, 0, 'standard', 0);
        });
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        expect(resolutions(result.current)).toBe(1);
        expect(spawnObstacles).toHaveBeenCalledTimes(1);
    });

    it('a second line completed mid-explosion joins it: one resolution, feedback kept until then', () => {
        const { result } = startedGame();
        act(() => {
            result.current.gameState.grid[2].fill(1);
            result.current.gameState.grid[2][0] = 0;
        });

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        act(() => result.current.placeShape(DOT, 0, 2, 'standard', 1));
        const secondFeedback = result.current.gameState.clearedFeedback;
        // One new line: the exploding row 0 is not counted a second time.
        expect(secondFeedback?.text).toBe('GOOD!');
        expect(result.current.gameState.score).toBe(20);

        // The first line's own 1200ms are up, but the second is mid-explosion:
        // its feedback card must not be taken down under it.
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        expect(result.current.gameState.clearedFeedback).toBe(secondFeedback);
        expect(result.current.gameState.grid[0].every(cell => cell === 4)).toBe(true);

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        expect(result.current.gameState.grid[0].every(cell => cell === 0)).toBe(true);
        expect(result.current.gameState.grid[2].every(cell => cell === 0)).toBe(true);
        expect(result.current.gameState.clearedFeedback).toBeNull();
        expect(resolutions(result.current)).toBe(1);
    });

    it('a drop mid-explosion that completes no line neither re-scores it nor delays it', () => {
        const { result } = startedGame();

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        const afterClear = result.current.gameState;
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        act(() => result.current.placeShape(DOT, 3, 3, 'standard', 1));

        expect(result.current.gameState.score).toBe(afterClear.score);
        expect(result.current.gameState.altitude).toBe(afterClear.altitude);
        expect(result.current.gameState.clearedFeedback).toBe(afterClear.clearedFeedback);

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        expect(result.current.gameState.grid[0].every(cell => cell === 0)).toBe(true);
    });

    it('a rescue-quiz tap mid-explosion does not delay the clear', () => {
        const { result } = startedGame();

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });
        act(() => result.current.triggerRescueQuiz());
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS / 2); });

        expect(result.current.gameState.grid[0].every(cell => cell === 0)).toBe(true);
    });

    it('completing lines in the last free cell is not game over', () => {
        const { result } = startedGame();
        act(() => {
            result.current.gameState.grid.forEach(row => row.fill(1));
            result.current.gameState.grid[7][7] = 0;
        });

        // Exploding cells block placement, but they are about to be free.
        act(() => result.current.placeShape(DOT, 7, 7, 'standard', 0));
        expect(result.current.gameState.phase).toBe('playing');

        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });
        expect(result.current.gameState.phase).toBe('playing');
    });

    it('a new game started mid-explosion is not touched by the old clear', () => {
        const { result } = startedGame();

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        act(() => result.current.resetGame());
        const freshBoard = result.current.gameState.grid.map(row => [...row]);
        act(() => { vi.advanceTimersByTime(CLEAR_DELAY_MS); });

        expect(result.current.gameState.grid).toEqual(freshBoard);
        expect(spawnObstacles).not.toHaveBeenCalled();
    });

    // Leaving Mission Control. Closing the game only hides it; reopening resets (above).
    it('unmounting mid-explosion leaves no timer behind', () => {
        const { result, unmount } = startedGame();

        act(() => result.current.placeShape(DOT, 0, 0, 'standard', 0));
        unmount();

        expect(vi.getTimerCount()).toBe(0);
    });

    it('a refused drop schedules nothing', () => {
        const { result } = startedGame();

        const before = result.current.gameState;
        act(() => result.current.placeShape(DOT, 1, 0, 'standard', 0)); // (0,1) is filled

        expect(result.current.gameState).toBe(before);
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('useBlocksGame — a lift in the same frame as the clear', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0);
        vi.mocked(spawnObstacles).mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
        // React's dev build writes window.event back after running a handler,
        // which under jsdom leaves the click stuck there: every later update in
        // this file would read as discrete (sync) and could never be replayed.
        Reflect.deleteProperty(window, 'event');
    });

    const TARGET = { r: 3, c: 3 };

    function LiftHarness({ api, seen }: { api: { current: Game | null }; seen: number[] }) {
        const game = useBlocksGame();
        api.current = game;
        useLayoutEffect(() => { seen.push(game.gameState.grid[TARGET.r][TARGET.c]); });
        // A React click stands in for useShapeDrag's native pointerup: both are
        // discrete events, so both update on the sync lane (React reads
        // window.event for a native listener).
        return <button onClick={() => game.placeShape(DOT, TARGET.c, TARGET.r, 'standard', 1)}>lift</button>;
    }

    it('is judged against the cleared board, never shown placed and then taken back', () => {
        const api: { current: Game | null } = { current: null };
        const seen: number[] = [];
        const view = render(<LiftHarness api={api} seen={seen} />);
        const game = () => api.current as Game;
        act(() => game().startGame());
        act(() => armRowZero(game()));
        act(() => game().placeShape(DOT, 0, 0, 'standard', 0));

        // The clear drops a meteor exactly where the child is about to lift.
        vi.mocked(spawnObstacles).mockImplementation(grid => {
            if (grid[TARGET.r][TARGET.c] === 0) grid[TARGET.r][TARGET.c] = 2;
        });
        seen.length = 0;

        // Timer and lift in one act: the lift arrives before React has
        // rendered anything the timer queued — the ~1-frame window.
        act(() => {
            vi.advanceTimersByTime(CLEAR_DELAY_MS);
            fireEvent.click(view.getByText('lift'));
        });

        expect(seen).not.toContain(1);
        expect(game().gameState.grid[TARGET.r][TARGET.c]).toBe(2);
        expect(game().gameState.standardShapes[1]).not.toBeNull();
    });
});

describe('useBlocksGame — a clear React replays', () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        let n = 0; // varied, so two independent rolls would land in different cells
        vi.spyOn(Math, 'random').mockImplementation(() => (n++ * 0.6180339887) % 1);
        const actual = await vi.importActual<typeof import('./types')>('./types');
        vi.mocked(spawnObstacles).mockReset();
        vi.mocked(spawnObstacles).mockImplementation(actual.spawnObstacles);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    function BoardLog({ api, boards }: { api: { current: Game | null }; boards: string[] }) {
        const game = useBlocksGame();
        api.current = game;
        useLayoutEffect(() => { boards.push(JSON.stringify(game.gameState.grid)); });
        return null;
    }

    it('rolls the same meteors both times', () => {
        const api: { current: Game | null } = { current: null };
        const boards: string[] = [];
        render(<BoardLog api={api} boards={boards} />);
        const game = () => api.current as Game;
        act(() => game().startGame());
        act(() => {
            armRowZero(game());
            game().gameState.level = 1; // the clear tops up meteors
        });
        act(() => game().placeShape(DOT, 0, 0, 'standard', 0));
        boards.length = 0;

        // An update already queued when the timer fires (the rescue quiz resolves
        // from a setTimeout): flushSync commits the clear ahead of it, and React
        // then replays the clear on top of it.
        act(() => {
            game().cancelRescueQuiz();
            vi.advanceTimersByTime(CLEAR_DELAY_MS);
        });

        const cleared = boards.filter(board => !board.includes('4'));
        expect(cleared.length).toBeGreaterThan(1);
        expect(new Set(cleared).size).toBe(1);
    });
});
