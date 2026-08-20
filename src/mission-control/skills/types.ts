// ============================================================
// Mission Control — Skill Progress Domain Types
// Shared by the store (persistence, reducer) and the quiz module
// (engine, generators). Lives OUTSIDE games/ so the store never
// imports upward from a game module.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

export type GameId = 'snake' | 'blocks' | 'fruits';

export type ReadingSkillId = 'read-word-pic' | 'read-pic-word' | 'read-missing-letter';
export type MathSkillId = 'math-add' | 'math-sub' | 'math-mul';
export type SkillId = ReadingSkillId | MathSkillId;

export const ALL_SKILL_IDS: readonly SkillId[] = [
    'read-word-pic', 'read-pic-word', 'read-missing-letter',
    'math-add', 'math-sub', 'math-mul',
];

export const READING_SKILL_IDS: readonly ReadingSkillId[] = [
    'read-word-pic', 'read-pic-word', 'read-missing-letter',
];

export function isReadingSkill(skill: SkillId): skill is ReadingSkillId {
    return (READING_SKILL_IDS as readonly string[]).includes(skill);
}

/**
 * One local calendar day of practice for one skill. At-level vs off-level
 * matters for reading: ~40% of served questions are deliberately easier or
 * harder than the kid's level (confidence + stretch sampling), and counting
 * those into accuracy would brand a healthy kid "struggling". Charts and
 * callouts read the at-level pair; off-level counts only feed volume.
 */
export interface SkillDayBucket {
    /** LOCAL date (YYYY-MM-DD) — never a UTC slice, per the timezone rule. */
    date: string;
    attempts: number;
    firstTry: number;
    offAttempts: number;
    offFirstTry: number;
    /** Per-game split; omitted until the first answer in that game. */
    byGame?: Partial<Record<GameId, { a: number; c: number }>>;
}

/** One reading-level change, with the promotion-window evidence that
 *  triggered it — the parent-facing answer to "how long and what did it". */
export interface LevelHistoryEntry {
    date: string;
    /** The level AFTER this change (the seed entry records the start level). */
    level: number;
    attempts: number;
    correct: number;
}

export interface SkillProgress {
    /** Invisible adaptive reading level, 0..MAX_READING_LEVEL. */
    readingLevel: number;
    /** Sliding window of at-current-level reading first attempts, newest last. */
    window: (0 | 1)[];
    levelHistory: LevelHistoryEntry[];
    /** wordId → first-attempt miss count (feeds the "hardest words" panel). */
    missedWords: Record<string, number>;
    days: Record<SkillId, SkillDayBucket[]>;
}

/** The payload of one answered quiz question, as dispatched by the games. */
export interface QuizAnswerRecord {
    skill: SkillId;
    /** The level the question was generated at. */
    level: number;
    /** Reading: was this AT the kid's current level (vs confidence/stretch)?
     *  Math questions always pass true — they have no off-level sampling. */
    atLevel: boolean;
    /** Reading: first tap; math: first submit. Recorded at that moment. */
    firstTry: boolean;
    wordId?: string;
    gameId: GameId;
}

// ---- Tuning constants (the adaptive-engine spec, in one place) ----

export const MAX_READING_LEVEL = 6;
/** Sliding-window length for promotion evidence. */
export const WINDOW_SIZE = 20;
/** Minimum window entries before promotion/demotion can fire. */
export const PROMOTE_MIN_ATTEMPTS = 15;
export const PROMOTE_ACCURACY = 0.85;
export const DEMOTE_ACCURACY = 0.40;
/** At levels 0..FAST_TRACK_MAX_LEVEL, a perfect first FAST_TRACK_STREAK
 *  promotes immediately — a kid who already reads skips the boring rungs. */
export const FAST_TRACK_MAX_LEVEL = 2;
export const FAST_TRACK_STREAK = 5;
/** Bounded history caps — this slice rides every persisted-state write. */
export const DAY_BUCKET_CAP = 60;
export const LEVEL_HISTORY_CAP = 50;
export const MISSED_WORDS_CAP = 50;

export function createDefaultSkillProgress(): SkillProgress {
    return {
        readingLevel: 0,
        window: [],
        levelHistory: [],
        missedWords: {},
        days: {
            'read-word-pic': [],
            'read-pic-word': [],
            'read-missing-letter': [],
            'math-add': [],
            'math-sub': [],
            'math-mul': [],
        },
    };
}
