// ============================================================
// Snake Game — Types & Constants
// ⚠️  Internal to src/mission-control/games/snake/ only.
// ============================================================

/** A position on the game grid. */
export interface Position {
    x: number;
    y: number;
}

export type Direction = 'up' | 'down' | 'left' | 'right';

/**
 * Game lifecycle phases:
 *  - waiting:     Snake on screen, awaiting first arrow key press.
 *  - playing:     Active game loop.
 *  - quiz-revive: Snake died, answering quiz to revive.
 *  - game-over:   All lives exhausted, showing final score.
 */
export type GamePhase = 'waiting' | 'playing' | 'quiz-revive' | 'game-over';

/** A collectible food item on the grid. */
export interface FoodItem {
    position: Position;
    emoji: string;
}

export interface SnakeGameState {
    snake: Position[];
    direction: Direction;
    nextDirection: Direction;
    /** Healthy fruit the snake must eat to score. */
    fruit: FoodItem;
    /** Junk food obstacle — eating it shrinks the snake. */
    junkFood: FoodItem | null;
    /** Ticks remaining before junk food spawns (after eating a fruit). */
    junkFoodTimer: number;
    score: number;
    lives: number;
    phase: GamePhase;
    /** How many quiz questions answered correctly during current revival */
    quizCorrectCount: number;
}

// ── Grid & Timing Constants ──────────────────────────────────
export const GRID_COLS = 20;
export const GRID_ROWS = 15;
export const CELL_SIZE = 32;
export const CANVAS_WIDTH = GRID_COLS * CELL_SIZE;   // 640
export const CANVAS_HEIGHT = GRID_ROWS * CELL_SIZE;  // 480

export const INITIAL_LIVES = 3;
export const INITIAL_SNAKE_LENGTH = 3;
export const TICK_INTERVAL_MS = 300;
export const QUIZ_QUESTIONS_TO_REVIVE = 3;

/** How many segments the snake loses when eating junk food. */
export const JUNK_FOOD_PENALTY = 1;
/** Minimum snake length (can't shrink below this). */
export const MIN_SNAKE_LENGTH = 2;

/**
 * Minimum bank balance required before the "Quick Game" reward
 * becomes visible in the reward picker. Hardcoded for now;
 * can be moved to MCSettings later if needed.
 */
export const QUICK_GAME_MIN_BANK_BALANCE = 10;

// ── Food Emojis ─────────────────────────────────────────────
export const FRUIT_EMOJIS = [
    '🍎', '🍊', '🍋', '🍇', '🥕', '🥦', '🍓',
    '🫐', '🥝', '🍑', '🍌', '🥑', '🍐', '🍒',
];

export const JUNK_FOOD_EMOJIS = [
    '🍩', '🍭', '🧁', '🍫', '🎂', '🍕', '🍟',
    '🍔', '🌭', '🍪',
];

// ── Colors ───────────────────────────────────────────────────
export const COLORS = {
    bg: '#0f172a',
    gridLine: 'rgba(255,255,255,0.04)',
    snakeHead: '#4ade80',
    snakeBody: '#22c55e',
    snakeTail: '#16a34a',
    snakeEyeWhite: '#ffffff',
    snakeEyePupil: '#1e293b',
    apple: '#ef4444',
    appleLeaf: '#22c55e',
    appleStem: '#92400e',
    junkAura: 'rgba(239, 68, 68, 0.35)',
    fruitAura: 'rgba(74, 222, 128, 0.25)',
    textPrimary: '#f8fafc',
    textMuted: '#94a3b8',
    heartFull: '#ef4444',
    heartEmpty: '#334155',
} as const;
