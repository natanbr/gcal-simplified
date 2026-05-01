import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSnakeGame } from './useSnakeGame';
import { INITIAL_LIVES } from './types';

describe('useSnakeGame', () => {
    it('initializes correctly', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        expect(result.current.gameState.phase).toBe('waiting');
        expect(result.current.gameState.score).toBe(0);
        expect(result.current.gameState.lives).toBe(INITIAL_LIVES);
    });

    it('starts game on direction input', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        expect(result.current.gameState.phase).toBe('playing');
        expect(result.current.gameState.direction).toBe('right');
    });

    it('resets game correctly', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
            result.current.resetGame();
        });
        expect(result.current.gameState.phase).toBe('waiting');
    });
});
