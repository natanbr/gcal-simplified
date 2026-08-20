// ============================================================
// Mission Control — Skill Progress (pure logic)
// Bucket accounting + the invisible reading-level machine.
// Called from one ~5-line case in mcReducer; everything here is
// pure and driven by the action's timestamp-derived local date.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { ActivityLogEntry } from '../types';
import {
    ALL_SKILL_IDS,
    createDefaultSkillProgress,
    DAY_BUCKET_CAP,
    DEMOTE_ACCURACY,
    FAST_TRACK_MAX_LEVEL,
    FAST_TRACK_STREAK,
    isReadingSkill,
    LEVEL_HISTORY_CAP,
    MAX_READING_LEVEL,
    MISSED_WORDS_CAP,
    PROMOTE_ACCURACY,
    PROMOTE_MIN_ATTEMPTS,
    WINDOW_SIZE,
    type QuizAnswerRecord,
    type SkillDayBucket,
    type SkillProgress,
} from '../skills/types';

export type { QuizAnswerRecord } from '../skills/types';

export interface LevelChange {
    from: number;
    to: number;
    /** Promotion-window evidence at the moment of the change. */
    attempts: number;
    correct: number;
}

function upsertBucket(
    buckets: SkillDayBucket[],
    date: string,
    record: QuizAnswerRecord,
): SkillDayBucket[] {
    const applyTo = (b: SkillDayBucket): SkillDayBucket => {
        const game = { ...(b.byGame?.[record.gameId] ?? { a: 0, c: 0 }) };
        game.a += 1;
        game.c += record.firstTry ? 1 : 0;
        return {
            ...b,
            attempts: b.attempts + (record.atLevel ? 1 : 0),
            firstTry: b.firstTry + (record.atLevel && record.firstTry ? 1 : 0),
            offAttempts: b.offAttempts + (record.atLevel ? 0 : 1),
            offFirstTry: b.offFirstTry + (!record.atLevel && record.firstTry ? 1 : 0),
            byGame: { ...b.byGame, [record.gameId]: game },
        };
    };

    // A backwards clock (NTP/DST) may hand us a date older than the newest
    // bucket — fold into the existing bucket for that date instead of
    // appending out of order or resurrecting pruned days.
    const existing = buckets.findIndex(b => b.date === date);
    if (existing !== -1) {
        return buckets.map((b, i) => (i === existing ? applyTo(b) : b));
    }

    const fresh: SkillDayBucket = {
        date, attempts: 0, firstTry: 0, offAttempts: 0, offFirstTry: 0,
    };
    return [...buckets, applyTo(fresh)]
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
        .slice(-DAY_BUCKET_CAP);
}

function recordMiss(missedWords: Record<string, number>, wordId: string): Record<string, number> {
    const next = { ...missedWords, [wordId]: (missedWords[wordId] ?? 0) + 1 };
    const keys = Object.keys(next);
    if (keys.length > MISSED_WORDS_CAP) {
        // Evict the coldest word (never the one just missed).
        let coldest: string | null = null;
        for (const key of keys) {
            if (key === wordId) continue;
            if (coldest === null || next[key] < next[coldest]) coldest = key;
        }
        if (coldest !== null) delete next[coldest];
    }
    return next;
}

/** A clean first-try success pays one miss back down — without decay, a rough
 *  first week tops the parent's "hardest words" panel forever. */
function recordMastery(missedWords: Record<string, number>, wordId: string): Record<string, number> {
    const count = missedWords[wordId];
    if (count === undefined) return missedWords;
    const next = { ...missedWords };
    if (count <= 1) delete next[wordId];
    else next[wordId] = count - 1;
    return next;
}

/**
 * Applies one answered question. Returns the same `progress` reference when
 * the record is invalid, so the reducer can bail out without churn.
 */
export function applyQuizAnswer(
    progress: SkillProgress,
    record: QuizAnswerRecord,
    localDate: string,
): { progress: SkillProgress; levelChange: LevelChange | null } {
    if (!(ALL_SKILL_IDS as readonly string[]).includes(record.skill)) {
        return { progress, levelChange: null };
    }

    const next: SkillProgress = {
        ...progress,
        days: {
            ...progress.days,
            [record.skill]: upsertBucket(progress.days[record.skill] ?? [], localDate, record),
        },
        // The seed entry anchors "how long at this level" for the first change.
        levelHistory: progress.levelHistory.length === 0
            ? [{ date: localDate, level: progress.readingLevel, attempts: 0, correct: 0 }]
            : progress.levelHistory,
    };

    const reading = isReadingSkill(record.skill);
    if (reading && record.wordId) {
        next.missedWords = record.firstTry
            ? recordMastery(progress.missedWords, record.wordId)
            : recordMiss(progress.missedWords, record.wordId);
    }

    // Only at-level reading answers are promotion evidence.
    if (!reading || !record.atLevel) {
        return { progress: next, levelChange: null };
    }

    const window = [...progress.window, record.firstTry ? 1 as const : 0 as const].slice(-WINDOW_SIZE);
    const correct = window.reduce((sum: number, v) => sum + v, 0);
    const accuracy = correct / window.length;
    const level = progress.readingLevel;

    const fastTrack = level <= FAST_TRACK_MAX_LEVEL
        && window.length === FAST_TRACK_STREAK
        && correct === FAST_TRACK_STREAK;
    const promoteRule = window.length >= PROMOTE_MIN_ATTEMPTS && accuracy >= PROMOTE_ACCURACY;
    const demoteRule = window.length >= PROMOTE_MIN_ATTEMPTS && accuracy < DEMOTE_ACCURACY;

    if (!fastTrack && !promoteRule && !demoteRule) {
        next.window = window;
        return { progress: next, levelChange: null };
    }

    // The rule fired. The window ALWAYS resets here — including at the floor
    // and cap where the level cannot move. Without that reset, a kid parked at
    // level 0 with a failing window (or level 6 with a passing one) would
    // re-satisfy the rule on every subsequent answer.
    next.window = [];

    const to = (fastTrack || promoteRule)
        ? Math.min(MAX_READING_LEVEL, level + 1)
        : Math.max(0, level - 1);

    if (to === level) {
        return { progress: next, levelChange: null };
    }

    const change: LevelChange = { from: level, to, attempts: window.length, correct };
    next.readingLevel = to;
    next.levelHistory = [
        ...next.levelHistory,
        { date: localDate, level: to, attempts: window.length, correct },
    ].slice(-LEVEL_HISTORY_CAP);

    return { progress: next, levelChange: change };
}

// ---- Persistence hygiene ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) return fallback;
    return Math.min(max, Math.max(min, Math.round(v)));
}

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isLocalDate(v: unknown): v is string {
    return typeof v === 'string' && LOCAL_DATE_PATTERN.test(v);
}

const GAME_IDS = ['snake', 'blocks', 'fruits'] as const;

/** Rebuilt over the known GameId union with clamped counters — a bare cast
 *  here once let `byGame: { quiz: "x" }` NaN-poison the per-game chart. */
function sanitizeByGame(raw: unknown): SkillDayBucket['byGame'] | undefined {
    if (!isPlainObject(raw)) return undefined;
    const clean: NonNullable<SkillDayBucket['byGame']> = {};
    for (const game of GAME_IDS) {
        const entry = raw[game];
        if (!isPlainObject(entry)) continue;
        clean[game] = { a: clampInt(entry.a, 0, 1e6, 0), c: clampInt(entry.c, 0, 1e6, 0) };
    }
    return Object.keys(clean).length > 0 ? clean : undefined;
}

function sanitizeBuckets(raw: unknown): SkillDayBucket[] {
    if (!Array.isArray(raw)) return [];
    const clean: SkillDayBucket[] = [];
    for (const item of raw) {
        if (!isPlainObject(item) || !isLocalDate(item.date)) continue;
        const byGame = sanitizeByGame(item.byGame);
        clean.push({
            date: item.date,
            attempts: clampInt(item.attempts, 0, 1e6, 0),
            firstTry: clampInt(item.firstTry, 0, 1e6, 0),
            offAttempts: clampInt(item.offAttempts, 0, 1e6, 0),
            offFirstTry: clampInt(item.offFirstTry, 0, 1e6, 0),
            ...(byGame ? { byGame } : {}),
        });
    }
    return clean.slice(-DAY_BUCKET_CAP);
}

/**
 * Repairs a persisted `skillProgress` slice of unknown shape. The top-level
 * loader's `{...initialState, ...parsed}` spread replaces this slice
 * wholesale, so a partial or hand-edited blob must be rebuilt field by field
 * (the same treatment settings/cases/missions get) or the reducer crashes on
 * the next answer.
 */
export function sanitizeSkillProgress(raw: unknown): SkillProgress {
    const base = createDefaultSkillProgress();
    if (!isPlainObject(raw)) return base;

    base.readingLevel = clampInt(raw.readingLevel, 0, MAX_READING_LEVEL, 0);

    if (Array.isArray(raw.window)) {
        base.window = raw.window.filter((v): v is 0 | 1 => v === 0 || v === 1).slice(-WINDOW_SIZE);
    }

    if (Array.isArray(raw.levelHistory)) {
        base.levelHistory = raw.levelHistory
            .filter((e): e is Record<string, unknown> => isPlainObject(e) && isLocalDate(e.date))
            .map(e => ({
                date: e.date as string,
                level: clampInt(e.level, 0, MAX_READING_LEVEL, 0),
                attempts: clampInt(e.attempts, 0, WINDOW_SIZE, 0),
                correct: clampInt(e.correct, 0, WINDOW_SIZE, 0),
            }))
            .slice(-LEVEL_HISTORY_CAP);
    }

    if (isPlainObject(raw.missedWords)) {
        for (const [word, count] of Object.entries(raw.missedWords)) {
            // clampInt (not a bare typeof check): JSON smuggles Infinity as 1e999,
            // and an Infinity count is never "coldest", so it could never be evicted.
            if (typeof count === 'number' && count > 0 && word.length <= 64) {
                base.missedWords[word] = clampInt(count, 1, 1e6, 1);
            }
            if (Object.keys(base.missedWords).length >= MISSED_WORDS_CAP) break;
        }
    }

    if (isPlainObject(raw.days)) {
        for (const skill of ALL_SKILL_IDS) {
            base.days[skill] = sanitizeBuckets(raw.days[skill]);
        }
        // Unknown skill keys are dropped by construction.
    }

    return base;
}

/**
 * The activity-log entry for a level change. Deliberately neutral: the log
 * button sits in the kid-reachable top bar, so the message carries no level
 * number — the exact level lives only in the parent Learning Progress view.
 */
export function makeLevelChangeLog(change: LevelChange, timestampIso: string): ActivityLogEntry {
    return {
        id: `auto-reading-level-${timestampIso}-${change.to}`,
        timestamp: timestampIso,
        icon: '📖',
        message: 'Practice adjusted',
        type: 'system',
        colorKey: 'system',
        source: 'auto',
    };
}
