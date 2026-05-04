// ============================================================
// Snake Game — Game Logic Hook
// Pure game-state machine: waiting → playing → quiz-revive → game-over.
// ⚠️  Internal to src/mission-control/games/snake/ only.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import type {
    SnakeGameState,
    Position,
    Direction,
    FoodItem,
    GameLevel,
} from './types';
import {
    INITIAL_LIVES,
    INITIAL_SNAKE_LENGTH,
    TICK_INTERVALS,
    QUIZ_QUESTIONS_TO_REVIVE,
    FRUIT_EMOJIS,
    JUNK_FOOD_EMOJIS,
    JUNK_FOOD_PENALTY,
    MIN_SNAKE_LENGTH,
    LEVEL_GRID_SIZES,
} from './types';

// ── Helpers ──────────────────────────────────────────────────

function pickRandom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomFruit(snake: Position[], cols: number, rows: number): FoodItem {
    return {
        position: randomFreeCell(snake, cols, rows),
        emoji: pickRandom(FRUIT_EMOJIS),
    };
}

function randomFreeCell(snake: Position[], cols: number, rows: number, extra?: Position | null): Position {
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    if (extra) occupied.add(`${extra.x},${extra.y}`);
    const free: Position[] = [];
    for (let x = 0; x < cols; x++) {
        for (let y = 0; y < rows; y++) {
            if (!occupied.has(`${x},${y}`)) free.push({ x, y });
        }
    }
    if (free.length === 0) return { x: 0, y: 0 };
    return free[Math.floor(Math.random() * free.length)];
}

/**
 * Spawn junk food a few tiles in front of the snake head.
 * Looks ahead in the current direction, offset by 3-5 cells.
 * If the target cell is occupied or out of bounds, falls back
 * to a random free cell.
 */
function spawnJunkFood(snake: Position[], direction: Direction, fruitPos: Position, cols: number, rows: number): FoodItem {
    const head = snake[0];
    const offset = 3 + Math.floor(Math.random() * 3); // 3–5 tiles ahead
    let target: Position;

    switch (direction) {
        case 'up':    target = { x: head.x, y: head.y - offset }; break;
        case 'down':  target = { x: head.x, y: head.y + offset }; break;
        case 'left':  target = { x: head.x - offset, y: head.y }; break;
        case 'right': target = { x: head.x + offset, y: head.y }; break;
    }

    // Validate: in bounds and not occupied?
    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    occupied.add(`${fruitPos.x},${fruitPos.y}`);
    const inBounds = target.x >= 0 && target.x < cols && target.y >= 0 && target.y < rows;
    const isFree = inBounds && !occupied.has(`${target.x},${target.y}`);

    return {
        position: isFree ? target : randomFreeCell(snake, cols, rows, fruitPos),
        emoji: pickRandom(JUNK_FOOD_EMOJIS),
    };
}

function buildInitialSnake(cols: number, rows: number): Position[] {
    const startX = Math.floor(cols / 2);
    const startY = Math.floor(rows / 2);
    return Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, i) => ({
        x: startX - i,
        y: startY,
    }));
}

function moveHead(head: Position, dir: Direction): Position {
    switch (dir) {
        case 'up':    return { x: head.x, y: head.y - 1 };
        case 'down':  return { x: head.x, y: head.y + 1 };
        case 'left':  return { x: head.x - 1, y: head.y };
        case 'right': return { x: head.x + 1, y: head.y };
    }
}

/** Prevent 180° reversal. */
function isOpposite(a: Direction, b: Direction): boolean {
    return (
        (a === 'up' && b === 'down') ||
        (a === 'down' && b === 'up') ||
        (a === 'left' && b === 'right') ||
        (a === 'right' && b === 'left')
    );
}

// ── Initial State ────────────────────────────────────────────

function createInitialState(level: GameLevel = 1): SnakeGameState {
    const { cols, rows } = LEVEL_GRID_SIZES[level];
    const snake = buildInitialSnake(cols, rows);
    return {
        snake,
        direction: 'right',
        nextDirection: 'right',
        fruit: randomFruit(snake, cols, rows),
        junkFood: null,
        junkFoodTimer: 0,
        score: 0,
        lives: INITIAL_LIVES,
        phase: 'waiting',
        quizCorrectCount: 0,
        level,
    };
}

// ── Hook ─────────────────────────────────────────────────────

export function useSnakeGame(open: boolean) {
    const [state, setState] = useState<SnakeGameState>(() => createInitialState(1));
    const stateRef = useRef(state);
    stateRef.current = state;

    const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Buffered direction queue ──────────────────────────────
    const dirQueueRef = useRef<Direction[]>([]);
    const lastEffectiveDirRef = useRef<Direction>('right');

    // ── DEBUG diagnostics (temporary) ────────────────────────
    const debugRef = useRef({ keyCount: 0, tickCount: 0, lastKey: '', queueLen: 0 });

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
    }, []);

    // ── Tick: advance game state by one step ─────────────────
    const tick = useCallback(() => {
        debugRef.current.tickCount++;

        // ⚠️  Consume from queue OUTSIDE setState (React 18 StrictMode safety).
        const queue = dirQueueRef.current;
        const nextDir: Direction | null = queue.length > 0 ? queue.shift()! : null;
        if (nextDir !== null) {
            lastEffectiveDirRef.current = nextDir;
        }
        debugRef.current.queueLen = queue.length;

        setState(prev => {
            if (prev.phase !== 'playing') return prev;

            // Apply buffered direction (one per tick)
            let direction = prev.direction;
            if (nextDir !== null && !isOpposite(nextDir, direction)) {
                direction = nextDir;
            }

            const head = prev.snake[0];
            const newHead = moveHead(head, direction);
            
            const { cols, rows } = LEVEL_GRID_SIZES[prev.level];

            // Wall collision
            if (newHead.x < 0 || newHead.x >= cols || newHead.y < 0 || newHead.y >= rows) {
                return handleDeath(prev);
            }

            // Self collision
            if (prev.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
                return handleDeath(prev);
            }

            // ── Check fruit collision ────────────────────────
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
                // Clear any existing junk food when a fruit is eaten
                newJunkFood = null;
                // Start junk food timer: 2–4 ticks after eating fruit
                newJunkFoodTimer = 2 + Math.floor(Math.random() * 3);
            }

            // ── Junk food timer countdown ────────────────────
            if (newJunkFoodTimer > 0 && newJunkFood === null) {
                newJunkFoodTimer -= 1;
                if (newJunkFoodTimer <= 0) {
                    // Spawn junk food ahead of the snake
                    newJunkFood = spawnJunkFood(newSnake, direction, newFruit.position, cols, rows);
                    newJunkFoodTimer = 0;
                }
            }

            // ── Check junk food collision ─────────────────────
            if (newJunkFood && newHead.x === newJunkFood.position.x && newHead.y === newJunkFood.position.y) {
                // Shrink snake by JUNK_FOOD_PENALTY segments (min MIN_SNAKE_LENGTH)
                const removeCount = Math.min(JUNK_FOOD_PENALTY, newSnake.length - MIN_SNAKE_LENGTH);
                if (removeCount > 0) {
                    newSnake = newSnake.slice(0, newSnake.length - removeCount);
                }
                newJunkFood = null; // consumed
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

    // ── Death handler ────────────────────────────────────────
    function handleDeath(prev: SnakeGameState): SnakeGameState {
        const newLives = prev.lives - 1;
        if (newLives <= 0) {
            return { ...prev, lives: 0, phase: 'game-over' };
        }
        return {
            ...prev,
            lives: newLives,
            phase: 'quiz-revive',
            quizCorrectCount: 0,
        };
    }

    // ── Start / Resume / Reset ───────────────────────────────

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

    // ── Keyboard handler ─────────────────────────────────────
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

    // ── Tick interval management ─────────────────────────────
    useEffect(() => {
        if (open && state.phase === 'playing') {
            tickRef.current = setInterval(tick, TICK_INTERVALS[state.level]);
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

    return {
        gameState: state,
        startGame,
        onQuizCorrect,
        resetGame,
        setLevel,
        debugRef,
    };
}
