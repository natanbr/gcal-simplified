import { useState, useCallback, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { isPlaceable, hasAnyPlacement } from './placement';
import { GameShape, BlocksGameState, INITIAL_LAYOUTS, altitudeLevel } from './types';
import {
    CLEAR_DELAY_MS, PendingClear, clearFeedback, markCompletedLines, resolvePendingClear, withClearsDrained,
} from './lineClear';
import { dealStandardTriple, dealRescueShape, anyPoolShapeFits } from './dealer';

/** The game the board renders, plus the clear still exploding on it — kept in
 *  state so its timer is scheduled from what React committed (see lineClear.ts). */
interface HookState { game: BlocksGameState; pendingClear: PendingClear | null }

/** Lifts an updater of the game alone; a no-op stays the same reference. */
const onGame = (update: (game: BlocksGameState) => BlocksGameState) => (prev: HookState): HookState => {
    const game = update(prev.game);
    return game === prev.game ? prev : { ...prev, game };
};

export function useBlocksGame() {
    const [{ game, pendingClear }, setState] = useState<HookState>(() => ({
        game: createInitialState(), pendingClear: null,
    }));

    function createInitialState(): BlocksGameState {
        const layoutIndex = Math.floor(Math.random() * INITIAL_LAYOUTS.length);
        const gridCopy = INITIAL_LAYOUTS[layoutIndex].map(row => [...row]);
        return {
            grid: gridCopy,
            standardShapes: [null, null, null],
            rescueShape: null,
            rescueShapeLocked: true,
            altitude: 0,
            score: 0,
            phase: 'waiting',
            level: 0,
            rescueQuizActive: false,
            clearedFeedback: null,
        };
    }

    const resetGame = useCallback(() => {
        setState({ game: createInitialState(), pendingClear: null });
    }, []);

    const startGame = useCallback(() => {
        setState(onGame(prev => ({
            ...prev,
            phase: 'playing' as const,
            standardShapes: dealStandardTriple(prev.grid, prev.level),
            rescueShape: dealRescueShape(prev.grid),
        })));
    }, []);

    const triggerRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({ ...prev, rescueQuizActive: true })));
    }, []);

    /** The engine-driven overlay confirmed a counted correct answer. */
    const resolveRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({
            ...prev,
            rescueShapeLocked: false,
            rescueQuizActive: false,
        })));
    }, []);

    /** Opt-in quiz: backing out costs nothing but the unlock. */
    const cancelRescueQuiz = useCallback(() => {
        setState(onGame(prev => ({ ...prev, rescueQuizActive: false })));
    }, []);

    const refreshRescueShape = useCallback(() => {
        setState(onGame(prev => ({
            ...prev,
            rescueShape: dealRescueShape(withClearsDrained(prev.grid)),
            rescueShapeLocked: true,
        })));
    }, []);

    /** Returns nothing on purpose: the updater decides against the latest state,
     *  which can be newer than the caller's render (a clear landing in the same
     *  frame as the lift), so no answer computed out here could be trusted. */
    const placeShape = useCallback((
        shape: GameShape, gridX: number, gridY: number,
        slotType: 'standard' | 'rescue', slotIndex: number
    ): void => {
        const feedbackId = Date.now().toString();
        setState(prevState => {
            const prev = prevState.game;
            if (prev.phase !== 'playing') return prevState;
            if (slotType === 'rescue' && prev.rescueShapeLocked) return prevState;
            if (!isPlaceable(prev.grid, shape, { r: gridY, c: gridX })) return prevState;

            const gridCopy = prev.grid.map(row => [...row]);
            
            // Place cells
            for (const cell of shape.cells) {
                const r = gridY + cell.y;
                const c = gridX + cell.x;
                gridCopy[r][c] = 1; // 1 = standard block
            }

            // Remove shape from slot
            const standardShapes = [...prev.standardShapes];
            let rescueShape = prev.rescueShape;
            let rescueShapeLocked = prev.rescueShapeLocked;

            if (slotType === 'standard') {
                standardShapes[slotIndex] = null;
            } else {
                rescueShape = null;
                rescueShapeLocked = true; // relock slot
            }

            // Full lines explode now and are emptied by the effect below.
            const { linesCleared, pendingClear } = markCompletedLines(gridCopy, prevState.pendingClear);

            // Scoring & Altitude progression
            const pointsGained = linesCleared * 10 + (linesCleared > 1 ? linesCleared * 5 : 0);
            const nextScore = prev.score + pointsGained;
            const nextAltitude = prev.altitude + linesCleared * 10;
            
            // Level / threshold events. max() pins the rule that a level, once
            // reached, is never taken back.
            const nextLevel = Math.max(prev.level, altitudeLevel(nextAltitude));

            // If victory reached
            const phase = nextAltitude >= 200 ? ('victory' as const) : prev.phase;

            // The clear stays painted for CLEAR_DELAY_MS, and exploding cells read
            // as occupied. Deal against the board as it will be once they drain,
            // or the next hand is planned around lines that are about to vanish.
            const dealBoard = withClearsDrained(gridCopy);

            // Handle replenishing rescue shape immediately if slot empty
            if (rescueShape === null) {
                rescueShape = dealRescueShape(dealBoard);
                rescueShapeLocked = true;
            }

            // Check if all standard shapes placed
            const allStandardUsed = standardShapes.every(s => s === null);
            const finalStandardShapes = allStandardUsed
                ? dealStandardTriple(dealBoard, nextLevel)
                : standardShapes;

            return {
                game: {
                    ...prev,
                    grid: gridCopy,
                    standardShapes: finalStandardShapes,
                    rescueShape,
                    rescueShapeLocked,
                    score: nextScore,
                    altitude: nextAltitude,
                    level: nextLevel,
                    phase,
                    clearedFeedback: linesCleared > 0 ? clearFeedback(linesCleared, feedbackId) : prev.clearedFeedback,
                },
                pendingClear,
            };
        });
    }, []);

    // One timer per COMMITTED clear, however often React ran its updater. A
    // joining line or a new game replaces `pendingClear` and unmounting drops it
    // (closing the game only hides it); the identity check covers a fired timer.
    useEffect(() => {
        if (!pendingClear) return;
        const timer = setTimeout(() => {
            const seed = Math.random() * 2 ** 32; // out here: a replayed updater must roll the same meteors
            // Sync, so the cleared board commits in this task: a lift landing first
            // would render on the old board, then be refused on the new one.
            flushSync(() => setState(prev => prev.pendingClear !== pendingClear ? prev : {
                game: {
                    ...prev.game,
                    grid: resolvePendingClear(prev.game.grid, pendingClear, prev.game.level, seed),
                    clearedFeedback: null,
                },
                pendingClear: null,
            }));
        }, CLEAR_DELAY_MS);
        return () => clearTimeout(timer);
    }, [pendingClear]);

    // Check game over on grid change — never mid-explosion: those cells are about to be free.
    useEffect(() => {
        if (game.phase !== 'playing' || pendingClear) return;

        // Game is over if standard shapes cannot fit, AND the rescue shape cannot fit, AND no shape in the pool fits
        const hasStandardPlacement = game.standardShapes.some(s => s && hasAnyPlacement(game.grid, s.cells));
        const hasRescuePlacement = !!game.rescueShape && hasAnyPlacement(game.grid, game.rescueShape.cells);

        if (!hasStandardPlacement && !hasRescuePlacement && !anyPoolShapeFits(game.grid, game.level)) {
            setState(onGame(prev => ({ ...prev, phase: 'game-over' as const })));
        }
    }, [game.grid, game.standardShapes, game.rescueShape, game.phase, game.level, pendingClear]);

    return {
        gameState: game,
        startGame,
        resetGame,
        placeShape,
        triggerRescueQuiz,
        resolveRescueQuiz,
        cancelRescueQuiz,
        refreshRescueShape,
    };
}
