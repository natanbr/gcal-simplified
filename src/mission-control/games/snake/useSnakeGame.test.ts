import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSnakeGame } from './useSnakeGame';
import {
    INITIAL_LIVES,
    INITIAL_TIME_MS,
    EXTENSION_TIME_MS,
    MAX_GAME_TIME_MS,
    QUIZ_QUESTIONS_TO_EXTEND,
    QUIZ_QUESTIONS_TO_REVIVE,
    INITIAL_SNAKE_LENGTH,
    LEVEL_GRID_SIZES,
} from './types';

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

describe('useSnakeGame – timer initial state', () => {
    it('starts with INITIAL_TIME_MS, 0 extensions, 0 extendQuizCorrectCount', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        expect(result.current.gameState.timeRemainingMs).toBe(INITIAL_TIME_MS);
        expect(result.current.gameState.extensionsUsed).toBe(0);
        expect(result.current.gameState.extendQuizCorrectCount).toBe(0);
    });
});

describe('useSnakeGame – default level', () => {
    it('initializes with level 0 (Easy)', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        expect(result.current.gameState.level).toBe(0);
    });
});

describe('useSnakeGame – setLevel', () => {
    it('changes level when phase is waiting', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.setLevel(2);
        });
        expect(result.current.gameState.level).toBe(2);
    });

    it('ignores setLevel when phase is playing', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        act(() => {
            result.current.setLevel(3);
        });
        expect(result.current.gameState.level).toBe(0);
    });

    it('ignores setLevel when phase is game-over', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        act(() => {
            result.current.handleTimeUpClose();
        });
        expect(result.current.gameState.phase).toBe('game-over');
        act(() => {
            result.current.setLevel(1);
        });
        expect(result.current.gameState.level).toBe(0);
    });
});

describe('useSnakeGame – timer countdown', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('decrements timeRemainingMs by 200 each timer tick while playing', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        const before = result.current.gameState.timeRemainingMs;
        act(() => {
            vi.advanceTimersByTime(200);
        });
        expect(result.current.gameState.timeRemainingMs).toBe(before - 200);
    });

    it('does not decrement when phase is waiting', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(result.current.gameState.timeRemainingMs).toBe(INITIAL_TIME_MS);
    });
});

describe('useSnakeGame – handleTimeUp', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('transitions to quiz-extend when timer reaches 0 and extensions available', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        act(() => {
            vi.advanceTimersByTime(INITIAL_TIME_MS + 1000);
        });
        expect(result.current.gameState.timeRemainingMs).toBe(0);
        expect(result.current.gameState.phase).toBe('quiz-extend');
    });

    it('transitions to time-up when timer reaches 0 and max extensions used', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });

        const maxExtensions = (MAX_GAME_TIME_MS - INITIAL_TIME_MS) / EXTENSION_TIME_MS;
        for (let ext = 0; ext < maxExtensions; ext++) {
            act(() => {
                vi.advanceTimersByTime(INITIAL_TIME_MS + ext * EXTENSION_TIME_MS + 1000);
            });
            if (result.current.gameState.phase === 'quiz-extend') {
                for (let q = 0; q < QUIZ_QUESTIONS_TO_EXTEND; q++) {
                    act(() => {
                        result.current.onExtendQuizCorrect();
                    });
                }
            }
        }

        act(() => {
            vi.advanceTimersByTime(MAX_GAME_TIME_MS + 5000);
        });
        expect(result.current.gameState.phase).toBe('time-up');
        expect(result.current.gameState.timeRemainingMs).toBe(0);
    });
});

describe('useSnakeGame – onExtendQuizCorrect', () => {
    it('increments extendQuizCorrectCount on each call from playing phase', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });

        act(() => {
            result.current.onExtendQuizCorrect();
        });
        expect(result.current.gameState.extendQuizCorrectCount).toBe(1);

        act(() => {
            result.current.onExtendQuizCorrect();
        });
        expect(result.current.gameState.extendQuizCorrectCount).toBe(2);
    });

    it('adds EXTENSION_TIME_MS and increments extensionsUsed after QUIZ_QUESTIONS_TO_EXTEND correct', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        const timeBefore = result.current.gameState.timeRemainingMs;

        for (let i = 0; i < QUIZ_QUESTIONS_TO_EXTEND; i++) {
            act(() => {
                result.current.onExtendQuizCorrect();
            });
        }

        expect(result.current.gameState.phase).toBe('playing');
        expect(result.current.gameState.extensionsUsed).toBe(1);
        expect(result.current.gameState.timeRemainingMs).toBe(timeBefore + EXTENSION_TIME_MS);
        expect(result.current.gameState.extendQuizCorrectCount).toBe(0);
    });

    it('resets extendQuizCorrectCount to 0 after reaching threshold', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });

        for (let i = 0; i < QUIZ_QUESTIONS_TO_EXTEND; i++) {
            act(() => {
                result.current.onExtendQuizCorrect();
            });
        }
        expect(result.current.gameState.extendQuizCorrectCount).toBe(0);

        act(() => {
            result.current.onExtendQuizCorrect();
        });
        expect(result.current.gameState.extendQuizCorrectCount).toBe(1);
    });
});

describe('useSnakeGame – handleTimeUpClose', () => {
    it('transitions any phase to game-over', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });
        expect(result.current.gameState.phase).toBe('playing');

        act(() => {
            result.current.handleTimeUpClose();
        });
        expect(result.current.gameState.phase).toBe('game-over');
    });

    it('transitions from waiting to game-over', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        expect(result.current.gameState.phase).toBe('waiting');

        act(() => {
            result.current.handleTimeUpClose();
        });
        expect(result.current.gameState.phase).toBe('game-over');
    });
});

describe('useSnakeGame – wrap-around walls', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.5);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('snake wraps from right edge to left', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        const { cols, rows } = LEVEL_GRID_SIZES[0];
        act(() => {
            result.current.startGame('right');
        });

        const ticksToRightEdge = cols;
        for (let i = 0; i < ticksToRightEdge; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
        }

        const headX = result.current.gameState.snake[0].x;
        expect(headX).toBeGreaterThanOrEqual(0);
        expect(headX).toBeLessThan(cols);
    });

    it('snake wraps from left edge to right', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        const { cols } = LEVEL_GRID_SIZES[0];
        act(() => {
            result.current.startGame('left');
        });

        const ticksToWrap = cols;
        for (let i = 0; i < ticksToWrap; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
        }

        const headX = result.current.gameState.snake[0].x;
        expect(headX).toBeGreaterThanOrEqual(0);
        expect(headX).toBeLessThan(cols);
    });

    it('snake wraps from top edge to bottom', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        const { rows } = LEVEL_GRID_SIZES[0];
        act(() => {
            result.current.startGame('up');
        });

        const ticksToWrap = rows;
        for (let i = 0; i < ticksToWrap; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
        }

        const headY = result.current.gameState.snake[0].y;
        expect(headY).toBeGreaterThanOrEqual(0);
        expect(headY).toBeLessThan(rows);
    });

    it('snake does not die on wall collision (wrap-around)', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('right');
        });

        for (let i = 0; i < 25; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
        }

        expect(result.current.gameState.phase).toBe('playing');
    });
});

describe('useSnakeGame – onQuizCorrect revive', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('increments quizCorrectCount on each call', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('up');
        });

        for (let i = 0; i < 20; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
        }

        if (result.current.gameState.phase === 'quiz-revive') {
            act(() => {
                result.current.onQuizCorrect();
            });
            expect(result.current.gameState.quizCorrectCount).toBeGreaterThanOrEqual(1);
        }
    });

    it('rebuilds snake and resumes playing after QUIZ_QUESTIONS_TO_REVIVE correct answers', () => {
        const { result } = renderHook(() => useSnakeGame(true));
        act(() => {
            result.current.startGame('up');
        });

        for (let i = 0; i < 30; i++) {
            act(() => {
                vi.advanceTimersByTime(800);
            });
            if (result.current.gameState.phase !== 'playing') break;
        }

        if (result.current.gameState.phase === 'quiz-revive') {
            for (let q = 0; q < QUIZ_QUESTIONS_TO_REVIVE; q++) {
                act(() => {
                    result.current.onQuizCorrect();
                });
            }
            expect(result.current.gameState.phase).toBe('playing');
            expect(result.current.gameState.snake).toHaveLength(INITIAL_SNAKE_LENGTH);
            expect(result.current.gameState.quizCorrectCount).toBe(0);
            expect(result.current.gameState.direction).toBe('right');
        }
    });
});
