// ============================================================
// Games — Quiz Difficulty Map (read-only, cross-game)
// "What quiz level does each game ask the engine for, and what
// does the kid have to do to get there?"
//
// Every row here is COMPUTED by calling the game's own mapping
// function over its own domain. Nothing is restated: if a game
// changes its ramp, this table changes with it. That is the whole
// point — the dev Quiz Lab renders these rows so the answer to
// "what does level 2 actually mean?" cannot drift from the code.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { GameId } from '../skills/types';
import { snakeQuizLevel, MAX_GAME_TIME_MS, MAX_QUIZ_LEVEL, QUIZ_LEVEL_STEP_MS } from './snake/types';
import { deleteTierLevel, FRUIT_TYPES } from './fruits/types';
import { altitudeLevel, ALTITUDE_LEVELS, ALTITUDE_TARGET } from './blocks/types';

/** One rung of a game's ramp: the first input that reaches `level`. */
export interface LevelMapRow {
    /** What the kid did to get here, in their terms. */
    trigger: string;
    level: number;
}

export interface GameLevelMap {
    gameId: GameId;
    title: string;
    /** The mapping expression, for the reader who wants the code. */
    rule: string;
    /** Where `rule` lives, repo-relative. */
    source: string;
    /** What the level is a function OF. */
    input: string;
    rows: LevelMapRow[];
}

/**
 * Walks a domain and emits a row only where the level actually changes, so a
 * ramp with four rungs renders as four rows however finely it is sampled.
 */
function transitions<T>(
    domain: readonly T[],
    levelOf: (value: T) => number,
    label: (value: T, level: number) => string,
): LevelMapRow[] {
    const rows: LevelMapRow[] = [];
    let previous: number | null = null;
    for (const value of domain) {
        const level = levelOf(value);
        if (level === previous) continue;
        previous = level;
        rows.push({ trigger: label(value, level), level });
    }
    return rows;
}

const formatClock = (ms: number): string => {
    const totalSeconds = Math.round(ms / 1000);
    return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, '0')}`;
};

/**
 * Every second of a full snake session. One-second resolution rather than a
 * coarser step so the reported boundary stays exact no matter what
 * QUIZ_LEVEL_STEP_MS is set to — the ramp was retuned once already.
 */
const SNAKE_SAMPLE_MS = Array.from(
    { length: Math.floor(MAX_GAME_TIME_MS / 1000) + 1 },
    (_, i) => i * 1000,
);

const FRUIT_TIERS = FRUIT_TYPES.map(f => f.tier);

const BLOCKS_ALTITUDES = Array.from({ length: ALTITUDE_TARGET / 5 + 1 }, (_, i) => i * 5);

const altitudeLabel = (level: number): string =>
    ALTITUDE_LEVELS[level as keyof typeof ALTITUDE_LEVELS]?.label ?? '';

export const GAME_LEVEL_MAPS: readonly GameLevelMap[] = [
    {
        gameId: 'snake',
        title: '🐍 Snake',
        rule: `snakeQuizLevel(elapsedMs) = min(${MAX_QUIZ_LEVEL}, floor(elapsedMs / ${QUIZ_LEVEL_STEP_MS}))`,
        source: 'games/snake/types.ts → SnakeGameOverlay.tsx',
        input: 'elapsed play time (survive to reach the next rung)',
        rows: transitions(
            SNAKE_SAMPLE_MS,
            snakeQuizLevel,
            ms => `from ${formatClock(ms)} of play`,
        ),
    },
    {
        gameId: 'blocks',
        title: '🚀 Space Rescue',
        rule: 'gameState.level = altitudeLevel(altitude)',
        source: 'games/blocks/types.ts → useBlocksGame.ts → BlocksGameOverlay.tsx',
        input: 'altitude, which only rises as lines are cleared',
        rows: transitions(
            BLOCKS_ALTITUDES,
            altitudeLevel,
            (altitude, level) => `altitude ≥ ${altitude}m — ${altitudeLabel(level)}`,
        ),
    },
    {
        gameId: 'fruits',
        title: '🍉 Fruit Merge',
        rule: 'deleteTierLevel(tier)',
        source: 'games/fruits/types.ts → FruitMergeGameOverlay.tsx',
        input: 'the tier of the fruit being deleted (opt-in quiz only)',
        rows: transitions(
            FRUIT_TIERS,
            deleteTierLevel,
            tier => `${FRUIT_TYPES[tier].emoji} ${FRUIT_TYPES[tier].name} (tier ${tier}) and up`,
        ),
    },
];
