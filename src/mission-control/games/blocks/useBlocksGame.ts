import { useState, useCallback, useEffect } from 'react';
import { isPlaceable } from './placement';
import {
    GameShape, BlocksGameState,
    GRID_SIZE, SHAPE_POOL, HELP_SHAPES, LEVEL_COMPLEX_SHAPES, INITIAL_LAYOUTS,
    transformShape, altitudeLevel
} from './types';
import { CLEAR_DELAY_MS, PendingClear, clearFeedback, markCompletedLines, resolvePendingClear } from './lineClear';

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

    const hasAnyValidPlacement = useCallback((grid: number[][], shape: GameShape): boolean => {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (isPlaceable(grid, shape, { r, c })) return true;
            }
        }
        return false;
    }, []);

    // Intelligent proactive shape selector
    const selectProactiveShape = useCallback((grid: number[][], level: number): GameShape => {
        let pool = [...SHAPE_POOL];
        for (let l = 1; l <= level; l++) {
            if (LEVEL_COMPLEX_SHAPES[l]) {
                pool = [...pool, ...LEVEL_COMPLEX_SHAPES[l]];
            }
        }
        
        let selected: GameShape;
        // Search for a shape that fits, prioritizing those that clear lines if possible
        const fittingShapes = pool.filter(s => hasAnyValidPlacement(grid, s));
        if (fittingShapes.length > 0) {
            // 30% chance to return a line-clearing shape if available
            const clearing = fittingShapes.filter(s => {
                for (let r = 0; r < GRID_SIZE; r++) {
                    for (let c = 0; c < GRID_SIZE; c++) {
                        if (isPlaceable(grid, s, { r, c })) {
                            return true; 
                        }
                    }
                }
                return false;
            });
            if (clearing.length > 0 && Math.random() < 0.3) {
                selected = clearing[Math.floor(Math.random() * clearing.length)];
            } else {
                selected = fittingShapes[Math.floor(Math.random() * fittingShapes.length)];
            }
        } else {
            // Fallback: check if any HELP_SHAPES fit
            const fittingHelp = HELP_SHAPES.filter(s => hasAnyValidPlacement(grid, s));
            if (fittingHelp.length > 0) {
                selected = fittingHelp[Math.floor(Math.random() * fittingHelp.length)];
            } else {
                selected = HELP_SHAPES[0];
            }
        }
        return {
            ...selected,
            id: `${selected.id}-${Math.random().toString(36).substring(2, 11)}`,
            cells: transformShape(selected.cells),
        };
    }, [hasAnyValidPlacement]);

    // Intelligent rescue shape selector (includes HELP_SHAPES for standard rescue utility)
    const selectRescueShape = useCallback((grid: number[][]): GameShape => {
        const pool = [...HELP_SHAPES, ...SHAPE_POOL];
        const fittingShapes = pool.filter(s => hasAnyValidPlacement(grid, s));
        let selected: GameShape;
        if (fittingShapes.length > 0) {
            selected = fittingShapes[Math.floor(Math.random() * fittingShapes.length)];
        } else {
            selected = HELP_SHAPES[0];
        }
        return {
            ...selected,
            id: `${selected.id}-${Math.random().toString(36).substring(2, 11)}`,
            cells: transformShape(selected.cells),
        };
    }, [hasAnyValidPlacement]);

    const startGame = useCallback(() => {
        setState(onGame(prev => {
            const next = { ...prev, phase: 'playing' as const };
            // Generate standard shapes immediately on start
            const shapes: GameShape[] = [];
            for (let i = 0; i < 3; i++) {
                shapes.push(selectProactiveShape(next.grid, next.level));
            }
            next.standardShapes = shapes;
            next.rescueShape = selectRescueShape(next.grid);
            return next;
        }));
    }, [selectProactiveShape, selectRescueShape]);

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
            rescueShape: selectRescueShape(prev.grid),
            rescueShapeLocked: true,
        })));
    }, [selectRescueShape]);

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

            // Handle replenishing rescue shape immediately if slot empty
            if (rescueShape === null) {
                rescueShape = selectRescueShape(gridCopy);
                rescueShapeLocked = true;
            }

            // Check if all standard shapes placed
            const allStandardUsed = standardShapes.every(s => s === null);
            let finalStandardShapes = standardShapes;
            if (allStandardUsed) {
                // Generate next round
                finalStandardShapes = [];
                for (let i = 0; i < 3; i++) {
                    finalStandardShapes.push(selectProactiveShape(gridCopy, nextLevel));
                }
            }

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
    }, [selectProactiveShape, selectRescueShape]);

    // One timer per COMMITTED clear, however often React ran its updater. A
    // joining line or a new game replaces `pendingClear` and unmounting drops it
    // (closing the game only hides it); the identity check covers a fired timer.
    useEffect(() => {
        if (!pendingClear) return;
        const timer = setTimeout(() => {
            setState(prev => prev.pendingClear !== pendingClear ? prev : {
                game: {
                    ...prev.game,
                    grid: resolvePendingClear(prev.game.grid, pendingClear, prev.game.level),
                    clearedFeedback: null,
                },
                pendingClear: null,
            });
        }, CLEAR_DELAY_MS);
        return () => clearTimeout(timer);
    }, [pendingClear]);

    // Check game over on grid change — never mid-explosion: those cells are about to be free.
    useEffect(() => {
        if (game.phase !== 'playing' || pendingClear) return;

        // Game is over if standard shapes cannot fit, AND the rescue shape cannot fit, AND no shape in the pool fits
        const hasStandardPlacement = game.standardShapes.some(s => s && hasAnyValidPlacement(game.grid, s));
        const hasRescuePlacement = game.rescueShape && hasAnyValidPlacement(game.grid, game.rescueShape);

        let pool = [...SHAPE_POOL];
        for (let l = 1; l <= game.level; l++) {
            if (LEVEL_COMPLEX_SHAPES[l]) {
                pool = [...pool, ...LEVEL_COMPLEX_SHAPES[l]];
            }
        }
        const anyPoolShapeFits = pool.some(s => hasAnyValidPlacement(game.grid, s));

        if (!hasStandardPlacement && !hasRescuePlacement && !anyPoolShapeFits) {
            setState(onGame(prev => ({ ...prev, phase: 'game-over' as const })));
        }
    }, [game.grid, game.standardShapes, game.rescueShape, game.phase, game.level, pendingClear, hasAnyValidPlacement]);

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
