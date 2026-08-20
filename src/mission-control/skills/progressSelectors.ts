// ============================================================
// Mission Control — Learning Progress Selectors (pure)
// Chart-ready derivations over the skillProgress slice. All
// date inputs are LOCAL YYYY-MM-DD strings; nothing here reads
// the clock — callers pass "today".
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import {
    READING_SKILL_IDS,
    MATH_SKILL_IDS,
    type GameId,
    type LevelHistoryEntry,
    type ReadingSkillId,
    type SkillDayBucket,
    type SkillProgress,
} from './types';

/** Whole days between two YYYY-MM-DD strings (b − a). */
export function daysBetween(a: string, b: string): number {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

function shiftDate(date: string, days: number): string {
    const [y, m, d] = date.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + days));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

// ---- Reading momentum (the "stock graph") ----

export interface MomentumPoint {
    date: string;
    /** Day's at-level net: first-try successes minus misses. */
    net: number;
    /** Running total — the line the parent reads. */
    cum: number;
}

/** Aggregates AT-LEVEL outcomes across all three reading skills per day
 *  (the reading level is global, so momentum sums the whole family). */
export function momentumSeries(progress: SkillProgress, sinceDate: string): MomentumPoint[] {
    const byDate = new Map<string, number>();
    for (const skill of READING_SKILL_IDS) {
        for (const bucket of progress.days[skill] ?? []) {
            if (bucket.date < sinceDate || bucket.attempts === 0) continue;
            const net = 2 * bucket.firstTry - bucket.attempts;
            byDate.set(bucket.date, (byDate.get(bucket.date) ?? 0) + net);
        }
    }
    const points = [...byDate.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, net]) => ({ date, net, cum: 0 }));
    let cum = 0;
    for (const point of points) {
        cum += point.net;
        point.cum = cum;
    }
    return points;
}

// ---- Level-up log ("how long and what triggered it") ----

export interface LevelUpRow {
    date: string;
    level: number;
    attempts: number;
    correct: number;
    /** Days spent at the previous level; null when the history was truncated. */
    daysAtPrev: number | null;
}

/** Newest first. The seed entry (index 0, attempts 0) anchors the first
 *  duration and is not itself a row. */
export function levelUpRows(levelHistory: readonly LevelHistoryEntry[]): LevelUpRow[] {
    const rows: LevelUpRow[] = [];
    for (let i = 1; i < levelHistory.length; i++) {
        const entry = levelHistory[i];
        const prev = levelHistory[i - 1];
        rows.push({
            date: entry.date,
            level: entry.level,
            attempts: entry.attempts,
            correct: entry.correct,
            daysAtPrev: daysBetween(prev.date, entry.date),
        });
    }
    return rows.reverse();
}

// ---- Weekly at-level accuracy per reading skill ----

export interface WeeklyAccuracyPoint {
    /** First day of the 7-day window (local). */
    weekStart: string;
    accuracy: number | null; // null = no attempts that week
    attempts: number;
}

export function weeklyAccuracy(
    buckets: readonly SkillDayBucket[],
    today: string,
    weeks = 8,
): WeeklyAccuracyPoint[] {
    const points: WeeklyAccuracyPoint[] = [];
    for (let w = weeks - 1; w >= 0; w--) {
        const start = shiftDate(today, -(w * 7 + 6));
        const end = shiftDate(today, -(w * 7));
        let attempts = 0;
        let firstTry = 0;
        for (const bucket of buckets) {
            if (bucket.date < start || bucket.date > end) continue;
            attempts += bucket.attempts;
            firstTry += bucket.firstTry;
        }
        points.push({
            weekStart: start,
            attempts,
            accuracy: attempts > 0 ? firstTry / attempts : null,
        });
    }
    return points;
}

// ---- Daily practice volume (reading vs math) ----

export interface VolumeDay {
    date: string;
    reading: number;
    math: number;
}

export function dailyVolume(progress: SkillProgress, today: string, days = 14): VolumeDay[] {
    const result: VolumeDay[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const date = shiftDate(today, -i);
        let reading = 0;
        let math = 0;
        for (const skill of READING_SKILL_IDS) {
            const bucket = (progress.days[skill] ?? []).find(b => b.date === date);
            if (bucket) reading += bucket.attempts + bucket.offAttempts;
        }
        for (const skill of MATH_SKILL_IDS) {
            const bucket = (progress.days[skill] ?? []).find(b => b.date === date);
            if (bucket) math += bucket.attempts + bucket.offAttempts;
        }
        result.push({ date, reading, math });
    }
    return result;
}

// ---- Per-game totals ----

export function perGameTotals(progress: SkillProgress): Record<GameId, number> {
    const totals: Record<GameId, number> = { snake: 0, blocks: 0, fruits: 0 };
    for (const buckets of Object.values(progress.days)) {
        for (const bucket of buckets) {
            for (const [game, counts] of Object.entries(bucket.byGame ?? {})) {
                totals[game as GameId] += counts?.a ?? 0;
            }
        }
    }
    return totals;
}

// ---- Hardest words ----

export function hardestWords(missedWords: Record<string, number>, top = 5): Array<{ word: string; misses: number }> {
    return Object.entries(missedWords)
        .map(([word, misses]) => ({ word, misses }))
        .sort((a, b) => b.misses - a.misses || (a.word < b.word ? -1 : 1))
        .slice(0, top);
}

// ---- Needs-work callout ----

/** Minimum recent at-level outcomes before a skill may be flagged — two bad
 *  answers on day one must not brand a skill "needs work". */
export const NEEDS_WORK_MIN_ATTEMPTS = 10;
/** Only accuracy below this is worth a callout at all. */
export const NEEDS_WORK_THRESHOLD = 0.75;

export function needsWork(
    progress: SkillProgress,
    sinceDate: string,
): { skill: ReadingSkillId; accuracy: number } | null {
    let worst: { skill: ReadingSkillId; accuracy: number } | null = null;
    for (const skill of READING_SKILL_IDS) {
        let attempts = 0;
        let firstTry = 0;
        for (const bucket of progress.days[skill] ?? []) {
            if (bucket.date < sinceDate) continue;
            attempts += bucket.attempts;
            firstTry += bucket.firstTry;
        }
        if (attempts < NEEDS_WORK_MIN_ATTEMPTS) continue;
        const accuracy = firstTry / attempts;
        if (accuracy >= NEEDS_WORK_THRESHOLD) continue;
        if (worst === null || accuracy < worst.accuracy) worst = { skill, accuracy };
    }
    return worst;
}
