import { useState, useCallback, useEffect, useRef } from 'react';
import type { SnakeGameState, Direction, GameLevel } from './types';
import {
    TICK_INTERVALS,
    QUIZ_QUESTIONS_TO_REVIVE,
    QUIZ_QUESTIONS_TO_EXTEND,
    JUNK_FOOD_PENALTY,
    MIN_SNAKE_LENGTH,
    LEVEL_GRID_SIZES,
    EXTENSION_TIME_MS,
} from './types';
import {
    isOpposite,
    moveHead,
    handleDeath,
    randomFruit,
    spawnJunkFood,
    buildInitialSnake,
    createInitialState,
    canExtendTime,
    resolveTimeUp,
} from './snakeHelpers';

export function useSnakeGame(open: boolean) {
    const [state, setState] = useState<SnakeGameState>(() => createInitialState(0));
    const stateRef = useRef(state);
    stateRef.current = state;

    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const tickIntervalRef = useRef<number>(TICK_INTERVALS[state.level]);

    const dirQueueRef = useRef<Direction[]>([]);
    const lastEffectiveDirRef = useRef<Direction>('right');
    const lastImmediateRef = useRef<number>(0);

    const debugRef = useRef({ keyCount: 0, tickCount: 0, lastKey: '', queueLen: 0 });

    const tick = useCallback(() => {
        debugRef.current.tickCount++;

        const queue = dirQueueRef.current;
        const nextDir: Direction | null = queue.length > 0 ? queue.shift()! : null;
        if (nextDir !== null) {
            lastEffectiveDirRef.current = nextDir;
        }
        debugRef.current.queueLen = queue.length;

        setState(prev => {
            if (prev.phase !== 'playing') return prev;

            let direction = prev.direction;
            if (nextDir !== null && !isOpposite(nextDir, direction)) {
                direction = nextDir;
            }

            const { cols, rows } = LEVEL_GRID_SIZES[prev.level];
            const head = prev.snake[0];
            const newHead = moveHead(head, direction, cols, rows);

            if (prev.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
                return handleDeath(prev);
            }

            const ateFruit = newHead.x === prev.fruit.position.x && newHead.y === prev.fruit.position.y;
            let newSnake = [newHead, ...prev.snake];
            if (!ateFruit) {
                newSnake.pop();
            }

            let newFruit = prev.fruit;
            let newJunkFood = prev.junkFood;
            let newJunkFoodTimer = prev.junkFoodTimer;
            let newScore = prev.score;

            if (ateFruit) {
                newScore += 1;
                newFruit = randomFruit(newSnake, cols, rows);
                newJunkFood = null;
                newJunkFoodTimer = 2 + Math.floor(Math.random() * 3);
            }

            if (newJunkFoodTimer > 0 && newJunkFood === null) {
                newJunkFoodTimer -= 1;
                if (newJunkFoodTimer <= 0) {
                    newJunkFood = spawnJunkFood(newSnake, direction, newFruit.position, cols, rows);
                    newJunkFoodTimer = 0;
                }
            }

            if (newJunkFood && newHead.x === newJunkFood.position.x && newHead.y === newJunkFood.position.y) {
                const removeCount = Math.min(JUNK_FOOD_PENALTY, newSnake.length - MIN_SNAKE_LENGTH);
                if (removeCount > 0) {
                    newSnake = newSnake.slice(0, newSnake.length - removeCount);
                }
                newJunkFood = null;
                newJunkFoodTimer = 0;
            }

            return {
                ...prev,
                snake: newSnake,
                direction,
                nextDirection: direction,
                score: newScore,
                fruit: newFruit,
                junkFood: newJunkFood,
                junkFoodTimer: newJunkFoodTimer,
            };
        });
    }, []);

    const queueDirection = useCallback((dir: Direction) => {
        const queue = dirQueueRef.current;
        const lastDir = queue.length > 0
            ? queue[queue.length - 1]
            : lastEffectiveDirRef.current;

        if (dir === lastDir || isOpposite(dir, lastDir)) return;
        if (queue.length >= 3) return;

        queue.push(dir);
        debugRef.current.keyCount++;
        debugRef.current.lastKey = dir;
        debugRef.current.queueLen = queue.length;

        const now = Date.now();
        if (now - lastImmediateRef.current > 100 && tickRef.current !== null) {
            lastImmediateRef.current = now;
            tick();
            clearInterval(tickRef.current);
            tickRef.current = setInterval(tick, tickIntervalRef.current);
        }
    }, [tick]);

    const startGame = useCallback((dir: Direction) => {
        dirQueueRef.current = [];
        lastEffectiveDirRef.current = dir;
        setState(prev => ({
            ...prev,
            phase: 'playing',
            direction: dir,
            nextDirection: dir,
        }));
    }, []);

    const onQuizCorrect = useCallback(() => {
        setState(prev => {
            const newCount = prev.quizCorrectCount + 1;
            if (newCount >= QUIZ_QUESTIONS_TO_REVIVE) {
                const { cols, rows } = LEVEL_GRID_SIZES[prev.level];
                const snake = buildInitialSnake(cols, rows);
                dirQueueRef.current = [];
                lastEffectiveDirRef.current = 'right';
                return {
                    ...prev,
                    snake,
                    direction: 'right',
                    nextDirection: 'right',
                    fruit: randomFruit(snake, cols, rows),
                    junkFood: null,
                    junkFoodTimer: 0,
                    phase: 'playing',
                    quizCorrectCount: 0,
                    level: prev.level,
                };
            }
            return { ...prev, quizCorrectCount: newCount };
        });
    }, []);

    const canExtend = useCallback(() => {
        return canExtendTime(state.extensionsUsed);
    }, [state.extensionsUsed]);

    const onExtendQuizCorrect = useCallback(() => {
        setState(prev => {
            const newCount = prev.extendQuizCorrectCount + 1;
            if (newCount >= QUIZ_QUESTIONS_TO_EXTEND) {
                return {
                    ...prev,
                    phase: 'playing',
                    extendQuizCorrectCount: 0,
                    extensionsUsed: prev.extensionsUsed + 1,
                    timeRemainingMs: prev.timeRemainingMs + EXTENSION_TIME_MS,
                };
            }
            return { ...prev, extendQuizCorrectCount: newCount };
        });
    }, []);

    const handleTimeUpClose = useCallback(() => {
        setState(prev => ({ ...prev, phase: 'game-over' }));
    }, []);

    const resetGame = useCallback(() => {
        dirQueueRef.current = [];
        lastEffectiveDirRef.current = 'right';
        setState(prev => createInitialState(prev.level));
    }, []);

    const setLevel = useCallback((level: GameLevel) => {
        setState(prev => {
            if (prev.phase !== 'waiting') return prev;
            return createInitialState(level);
        });
    }, []);

    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            const dirMap: Record<string, Direction> = {
                ArrowUp: 'up',
                ArrowDown: 'down',
                ArrowLeft: 'left',
                ArrowRight: 'right',
            };
            const dir = dirMap[e.key];
            if (!dir) return;

            e.preventDefault();
            const current = stateRef.current;
            if (current.phase === 'waiting') {
                startGame(dir);
            } else if (current.phase === 'playing') {
                queueDirection(dir);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, startGame, queueDirection]);

    useEffect(() => {
        tickIntervalRef.current = TICK_INTERVALS[state.level];
        if (open && state.phase === 'playing') {
            tickRef.current = setInterval(tick, tickIntervalRef.current);
        } else {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        }
        return () => {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        };
    }, [open, state.phase, tick, state.level]);

    useEffect(() => {
        if (!open || (state.phase !== 'playing')) return;
        const TIMER_TICK = 200;
        const timerInterval = setInterval(() => {
            setState(prev => {
                if (prev.phase !== 'playing') return prev;
                const next = prev.timeRemainingMs - TIMER_TICK;
                if (next <= 0) {
                    return resolveTimeUp({ ...prev, timeRemainingMs: 0 });
                }
                return { ...prev, timeRemainingMs: next };
            });
        }, TIMER_TICK);
        return () => clearInterval(timerInterval);
    }, [open, state.phase]);

    return {
        gameState: state,
        startGame,
        onQuizCorrect,
        onExtendQuizCorrect,
        canExtend,
        handleTimeUpClose,
        resetGame,
        setLevel,
    };
}
