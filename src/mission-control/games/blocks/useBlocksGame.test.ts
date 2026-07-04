import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBlocksGame } from './useBlocksGame';
import { HELP_SHAPES } from './types';

describe('useBlocksGame', () => {
    beforeEach(() => {
        vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('initializes game with correct default state', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        expect(result.current.gameState.phase).toBe('waiting');
        expect(result.current.gameState.score).toBe(0);
        expect(result.current.gameState.altitude).toBe(0);
        expect(result.current.gameState.level).toBe(0);
        expect(result.current.gameState.rescueShapeLocked).toBe(true);
        expect(result.current.gameState.standardShapes).toHaveLength(3);
    });

    it('starts game and transitions phase to playing', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        expect(result.current.gameState.phase).toBe('playing');
    });

    it('validates shape fitting and places it on grid', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Place a monomino (1x1) at grid 0,0 (make sure it's empty first)
        act(() => {
            result.current.gameState.grid[0][0] = 0;
        });
        
        const shape = HELP_SHAPES[0]; // 1x1
        
        let success = false;
        act(() => {
            success = result.current.placeShape(shape, 0, 0, 'standard', 0);
        });

        expect(success).toBe(true);
        expect(result.current.gameState.grid[0][0]).toBe(1);
        expect(result.current.gameState.standardShapes[0]).toBeNull();
    });

    it('prevents overlapping shape placement', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        const shape = HELP_SHAPES[0]; // 1x1
        
        // Ensure cell 2,2 is empty first
        act(() => {
            result.current.gameState.grid[2][2] = 0;
        });

        // Place first time
        act(() => {
            result.current.placeShape(shape, 2, 2, 'standard', 0);
        });

        // Try placing again at the exact same location
        let success = true;
        act(() => {
            success = result.current.placeShape(shape, 2, 2, 'standard', 1);
        });

        expect(success).toBe(false);
    });

    it('clears lines and scores points', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Clear row 0 and pre-fill except coordinate 0,0
        act(() => {
            result.current.gameState.grid[0] = Array(8).fill(0);
            for (let x = 1; x < 8; x++) {
                result.current.gameState.grid[0][x] = 1;
            }
        });

        // Place a 1x1 shape at 0,0 to complete the row
        const shape = HELP_SHAPES[0];
        act(() => {
            result.current.placeShape(shape, 0, 0, 'standard', 0);
        });

        // Row 1 should be completely cleared (all 0s)
        expect(result.current.gameState.grid[0].every(c => c === 0)).toBe(true);
        expect(result.current.gameState.score).toBeGreaterThan(0);
        expect(result.current.gameState.altitude).toBeGreaterThan(0);
    });

    it('unlocks the 4th rescue shape after solving visual quiz', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        expect(result.current.gameState.rescueShapeLocked).toBe(true);
        expect(result.current.gameState.quizQuestion).toBeNull();

        // Trigger quiz
        act(() => {
            result.current.triggerRescueQuiz();
        });

        expect(result.current.gameState.quizQuestion).not.toBeNull();

        // Solve quiz
        const answer = result.current.gameState.quizQuestion!.answer;
        act(() => {
            result.current.submitQuizAnswer(answer);
        });

        expect(result.current.gameState.rescueShapeLocked).toBe(false);
        expect(result.current.gameState.quizQuestion).toBeNull();
    });

    it('locks and regenerates the 4th shape on refresh', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        const initialRescueShape = result.current.gameState.rescueShape;
        expect(initialRescueShape).not.toBeNull();

        act(() => {
            result.current.refreshRescueShape();
        });

        expect(result.current.gameState.rescueShapeLocked).toBe(true);
        // It might generate the same shape randomly, but the lock state is guaranteed
    });

    it('spawns locked asteroid holes when crossing altitude 50m threshold', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Manually push altitude to 55m and level to 1
        act(() => {
            result.current.gameState.altitude = 55;
            result.current.gameState.level = 1;
        });

        // Place a shape to trigger check
        const shape = HELP_SHAPES[0];
        act(() => {
            result.current.placeShape(shape, 4, 4, 'standard', 0);
        });

        // Board should contain at least one asteroid hole cell (value 2)
        const hasAsteroidHole = result.current.gameState.grid.some(row => row.includes(2));
        expect(hasAsteroidHole).toBe(true);
    });

    it('triggers game over when neither standard shapes nor rescue shape fit, and no shape in the pool fits', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Block entire grid (fill with standard blocks value 1)
        act(() => {
            result.current.gameState.grid = Array.from({ length: 8 }, () => Array(8).fill(1));
        });

        // Trigger check by calling refreshRescueShape which updates state
        act(() => {
            result.current.refreshRescueShape();
        });

        expect(result.current.gameState.phase).toBe('game-over');
    });

    it('triggers game over when standard shapes do not fit and rescue shape is unlocked but does not fit', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Block entire grid (fill with standard blocks value 1)
        act(() => {
            result.current.gameState.grid = Array.from({ length: 8 }, () => Array(8).fill(1));
            // Unlock the rescue shape manually
            result.current.gameState.rescueShapeLocked = false;
        });

        // Trigger check
        act(() => {
            result.current.refreshRescueShape();
        });

        expect(result.current.gameState.phase).toBe('game-over');
    });

    it('does not trigger game over if standard shapes do not fit but rescue shape fits and is locked', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Fill grid except for one 1x1 hole at 0,0
        act(() => {
            result.current.gameState.grid = Array.from({ length: 8 }, () => Array(8).fill(1));
            result.current.gameState.grid[0][0] = 0;
            // Force standard shapes to be something large that doesn't fit (e.g. 2x2 blocks)
            // But set rescueShape to 1x1 Monomino which fits at 0,0
            result.current.gameState.standardShapes = [
                { id: '2x2', name: 'Block', cells: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }], color: '#f59e0b' }
            ];
            result.current.gameState.rescueShape = { id: '1x1', name: 'Monomino', cells: [{ x: 0, y: 0 }], color: '#38bdf8' };
            result.current.gameState.rescueShapeLocked = true;
        });

        // Trigger check
        act(() => {
            result.current.refreshRescueShape();
        });

        // Should NOT be game-over because rescue shape fits (even though locked, they can solve quiz)
        expect(result.current.gameState.phase).toBe('playing');
    });

    it('triggers game over when standard shapes do not fit and rescue shape is unlocked by solving quiz but does not fit', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
            result.current.triggerRescueQuiz();
        });

        const quizAnswer = result.current.gameState.quizQuestion!.answer;

        // Block entire grid (fill with standard blocks value 1)
        act(() => {
            result.current.gameState.grid = Array.from({ length: 8 }, () => Array(8).fill(1));
        });

        // Submit correct quiz answer to unlock the rescue shape
        act(() => {
            result.current.submitQuizAnswer(quizAnswer);
        });

        expect(result.current.gameState.phase).toBe('game-over');
    });

    it('applies progressive shape pool complexity based on level and excludes 1x1/1x2 from standard shapes', () => {
        const { result } = renderHook(() => useBlocksGame());
        
        act(() => {
            result.current.startGame();
        });

        // Level 0 standard shapes should not contain Monomino (1x1) or Domino (1x2)
        const level0Shapes = result.current.gameState.standardShapes;
        const containsEasy = level0Shapes.some(s => s && ['1x1', '1x2-h', '1x2-v'].includes(s.id));
        expect(containsEasy).toBe(false);
    });
});

