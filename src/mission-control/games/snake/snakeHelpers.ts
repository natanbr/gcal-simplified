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
    FRUIT_EMOJIS,
    JUNK_FOOD_EMOJIS,
    LEVEL_GRID_SIZES,
    INITIAL_TIME_MS,
    EXTENSION_TIME_MS,
    MAX_GAME_TIME_MS,
} from './types';

export function pickRandom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function randomFreeCell(
    snake: Position[],
    cols: number,
    rows: number,
    extra?: Position | null,
): Position {
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

export function randomFruit(snake: Position[], cols: number, rows: number): FoodItem {
    return {
        position: randomFreeCell(snake, cols, rows),
        emoji: pickRandom(FRUIT_EMOJIS),
    };
}

export function spawnJunkFood(
    snake: Position[],
    direction: Direction,
    fruitPos: Position,
    cols: number,
    rows: number,
): FoodItem {
    const head = snake[0];
    const offset = 3 + Math.floor(Math.random() * 3);
    let target: Position;

    switch (direction) {
        case 'up':    target = { x: head.x, y: head.y - offset }; break;
        case 'down':  target = { x: head.x, y: head.y + offset }; break;
        case 'left':  target = { x: head.x - offset, y: head.y }; break;
        case 'right': target = { x: head.x + offset, y: head.y }; break;
    }

    const occupied = new Set(snake.map(s => `${s.x},${s.y}`));
    occupied.add(`${fruitPos.x},${fruitPos.y}`);
    const inBounds = target.x >= 0 && target.x < cols && target.y >= 0 && target.y < rows;
    const isFree = inBounds && !occupied.has(`${target.x},${target.y}`);

    return {
        position: isFree ? target : randomFreeCell(snake, cols, rows, fruitPos),
        emoji: pickRandom(JUNK_FOOD_EMOJIS),
    };
}

export function buildInitialSnake(cols: number, rows: number): Position[] {
    const startX = Math.floor(cols / 2);
    const startY = Math.floor(rows / 2);
    return Array.from({ length: INITIAL_SNAKE_LENGTH }, (_, i) => ({
        x: startX - i,
        y: startY,
    }));
}

export function moveHead(head: Position, dir: Direction, cols: number, rows: number): Position {
    let { x, y } = head;
    switch (dir) {
        case 'up':    y -= 1; break;
        case 'down':  y += 1; break;
        case 'left':  x -= 1; break;
        case 'right': x += 1; break;
    }
    return { x: ((x % cols) + cols) % cols, y: ((y % rows) + rows) % rows };
}

export function isOpposite(a: Direction, b: Direction): boolean {
    return (
        (a === 'up' && b === 'down') ||
        (a === 'down' && b === 'up') ||
        (a === 'left' && b === 'right') ||
        (a === 'right' && b === 'left')
    );
}

export function handleDeath(prev: SnakeGameState): SnakeGameState {
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

export function createInitialState(level: GameLevel = 0): SnakeGameState {
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
        timeRemainingMs: INITIAL_TIME_MS,
        extensionsUsed: 0,
        extendQuizCorrectCount: 0,
    };
}

export function canExtendTime(extensionsUsed: number): boolean {
    const totalUsed = INITIAL_TIME_MS + extensionsUsed * EXTENSION_TIME_MS;
    return totalUsed + EXTENSION_TIME_MS <= MAX_GAME_TIME_MS;
}

export function resolveTimeUp(prev: SnakeGameState): SnakeGameState {
    if (prev.phase !== 'playing') return prev;
    if (canExtendTime(prev.extensionsUsed)) {
        return { ...prev, phase: 'quiz-extend', extendQuizCorrectCount: 0 };
    }
    return { ...prev, phase: 'time-up', timeRemainingMs: 0 };
}
