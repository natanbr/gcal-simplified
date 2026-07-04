import { useState, useCallback, useEffect } from 'react';
import { 
    GameShape, BlocksGameState, 
    GRID_SIZE, SHAPE_POOL, HELP_SHAPES, LEVEL_COMPLEX_SHAPES, INITIAL_LAYOUTS,
    transformShape, applyClearEffects, spawnObstacles
} from './types';
import { generateLevelQuestion } from '../quiz/additionQuiz';

export function useBlocksGame() {
    const [state, setState] = useState<BlocksGameState>(createInitialState);

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
            quizQuestion: null,
            clearedFeedback: null,
        };
    }

    const resetGame = useCallback(() => {
        setState(createInitialState());
    }, []);

    // Look-ahead placement checker
    const canPlaceShape = useCallback((grid: number[][], shape: GameShape, row: number, col: number): boolean => {
        for (const cell of shape.cells) {
            const r = row + cell.y;
            const c = col + cell.x;
            if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) return false;
            if (grid[r][c] !== 0 && grid[r][c] !== 3) return false; // 0=empty, 3=satellite (can override)
        }
        return true;
    }, []);

    const hasAnyValidPlacement = useCallback((grid: number[][], shape: GameShape): boolean => {
        for (let r = 0; r < GRID_SIZE; r++) {
            for (let c = 0; c < GRID_SIZE; c++) {
                if (canPlaceShape(grid, shape, r, c)) return true;
            }
        }
        return false;
    }, [canPlaceShape]);

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
                        if (canPlaceShape(grid, s, r, c)) {
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
    }, [hasAnyValidPlacement, canPlaceShape]);

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
        setState(prev => {
            const next = { ...prev, phase: 'playing' as const };
            // Generate standard shapes immediately on start
            const shapes: GameShape[] = [];
            for (let i = 0; i < 3; i++) {
                shapes.push(selectProactiveShape(next.grid, next.level));
            }
            next.standardShapes = shapes;
            next.rescueShape = selectRescueShape(next.grid);
            return next;
        });
    }, [selectProactiveShape, selectRescueShape]);

    const triggerRescueQuiz = useCallback(() => {
        setState(prev => ({
            ...prev,
            quizQuestion: generateLevelQuestion(prev.level),
        }));
    }, []);

    const submitQuizAnswer = useCallback((answer: number) => {
        setState(prev => {
            if (prev.quizQuestion && answer === prev.quizQuestion.answer) {
                return {
                    ...prev,
                    rescueShapeLocked: false,
                    quizQuestion: null,
                };
            }
            return {
                ...prev,
                quizQuestion: generateLevelQuestion(prev.level),
            };
        });
    }, []);

    const refreshRescueShape = useCallback(() => {
        setState(prev => ({
            ...prev,
            rescueShape: selectRescueShape(prev.grid),
            rescueShapeLocked: true,
        }));
    }, [selectRescueShape]);

    const placeShape = useCallback((
        shape: GameShape, gridX: number, gridY: number, 
        slotType: 'standard' | 'rescue', slotIndex: number
    ): boolean => {
        if (state.phase !== 'playing') return false;
        if (slotType === 'rescue' && state.rescueShapeLocked) return false;
        if (!canPlaceShape(state.grid, shape, gridY, gridX)) return false;

        setState(prev => {
            if (prev.phase !== 'playing') return prev;
            if (slotType === 'rescue' && prev.rescueShapeLocked) return prev;
            if (!canPlaceShape(prev.grid, shape, gridY, gridX)) return prev;

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

            // Check completed rows & columns
            const rowsToClear: number[] = [];
            const colsToClear: number[] = [];

            for (let r = 0; r < GRID_SIZE; r++) {
                if (gridCopy[r].every(cell => cell > 0)) rowsToClear.push(r);
            }
            for (let c = 0; c < GRID_SIZE; c++) {
                if (gridCopy.every(row => row[c] > 0)) colsToClear.push(c);
            }

            // Stage 1: Mark for clearing
            const linesCleared = rowsToClear.length + colsToClear.length;
            let feedback = null;
            
            if (linesCleared > 0) {
                const clearedCells: { r: number, c: number }[] = [];
                const originalValues = new Map<string, number>();
                rowsToClear.forEach(r => {
                    for (let c = 0; c < GRID_SIZE; c++) {
                        originalValues.set(`${r}-${c}`, gridCopy[r][c]);
                        gridCopy[r][c] = 4;
                        clearedCells.push({ r, c });
                    }
                });
                colsToClear.forEach(c => {
                    for (let r = 0; r < GRID_SIZE; r++) {
                        if (!originalValues.has(`${r}-${c}`)) {
                            originalValues.set(`${r}-${c}`, gridCopy[r][c]);
                        }
                        gridCopy[r][c] = 4;
                        clearedCells.push({ r, c });
                    }
                });

                let text = "GOOD!";
                let stars = 1;
                if (linesCleared === 2) { text = "GREAT!"; stars = 2; }
                if (linesCleared >= 3) { text = "EXCELLENT!"; stars = 3; }
                feedback = { text, stars, id: Date.now().toString() };

                setTimeout(() => {
                    setState(current => {
                        const nextGrid = current.grid.map(row => [...row]);
                        clearedCells.forEach(({ r, c }) => {
                            if (nextGrid[r][c] === 4) {
                                nextGrid[r][c] = 0;
                            }
                        });

                        applyClearEffects(nextGrid, clearedCells, originalValues);
                        spawnObstacles(nextGrid, current.level);

                        return { ...current, grid: nextGrid, clearedFeedback: null };
                    });
                }, 1200);
            }

            // Scoring & Altitude progression
            const pointsGained = linesCleared * 10 + (linesCleared > 1 ? linesCleared * 5 : 0);
            const nextScore = prev.score + pointsGained;
            const nextAltitude = prev.altitude + linesCleared * 10;
            
            // Level / threshold events
            let nextLevel = prev.level;
            if (nextAltitude >= 180) nextLevel = 3;
            else if (nextAltitude >= 120) nextLevel = 2;
            else if (nextAltitude >= 50) nextLevel = 1;

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
                ...prev,
                grid: gridCopy,
                standardShapes: finalStandardShapes,
                rescueShape,
                rescueShapeLocked,
                score: nextScore,
                altitude: nextAltitude,
                level: nextLevel,
                phase,
                clearedFeedback: feedback || prev.clearedFeedback,
            };
        });
        return true;
    }, [state.phase, state.grid, state.rescueShapeLocked, canPlaceShape, selectProactiveShape, selectRescueShape]);

    // Check game over on grid change
    useEffect(() => {
        if (state.phase !== 'playing') return;
        
        // Game is over if standard shapes cannot fit, AND the rescue shape cannot fit, AND no shape in the pool fits
        const hasStandardPlacement = state.standardShapes.some(s => s && hasAnyValidPlacement(state.grid, s));
        const hasRescuePlacement = state.rescueShape && hasAnyValidPlacement(state.grid, state.rescueShape);
        
        let pool = [...SHAPE_POOL];
        for (let l = 1; l <= state.level; l++) {
            if (LEVEL_COMPLEX_SHAPES[l]) {
                pool = [...pool, ...LEVEL_COMPLEX_SHAPES[l]];
            }
        }
        const anyPoolShapeFits = pool.some(s => hasAnyValidPlacement(state.grid, s));

        if (!hasStandardPlacement && !hasRescuePlacement && !anyPoolShapeFits) {
            setState(prev => ({ ...prev, phase: 'game-over' as const }));
        }
    }, [state.grid, state.standardShapes, state.rescueShape, state.phase, state.level, hasAnyValidPlacement]);

    return {
        gameState: state,
        startGame,
        resetGame,
        placeShape,
        triggerRescueQuiz,
        submitQuizAnswer,
        refreshRescueShape,
    };
}
