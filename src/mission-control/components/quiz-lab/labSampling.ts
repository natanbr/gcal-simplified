// ============================================================
// Quiz Lab — sampling core (dev only)
// Pure functions over the REAL generators. Nothing here reproduces
// generator logic: `generateLabQuestion` is a one-line call, and the
// distribution is measured from its output. If a generator is
// rebalanced, this file needs no edit and the numbers move.
//
// Deliberately store-free: the lab must never write skillProgress,
// so it calls the generators directly instead of useQuizEngine.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { generateMathQuestion, MAX_MATH_LEVEL } from '../../games/quiz/additionQuiz';
import { MAX_READING_LEVEL } from '../../skills/types';
// The sanctioned door: reading content is private to games/quiz/reading/.
import { generateReadingQuestion } from '../../games/quiz/quizEngine';
import type { QuizQuestion } from '../../games/quiz/types';

export type LabFamily = 'reading' | 'math';

export const LAB_FAMILIES: readonly { id: LabFamily; label: string; maxLevel: number }[] = [
    { id: 'reading', label: '📖 Reading', maxLevel: MAX_READING_LEVEL },
    { id: 'math', label: '➕ Math', maxLevel: MAX_MATH_LEVEL },
];

export const DEFAULT_SAMPLE_SIZE = 200;

export function maxLevelFor(family: LabFamily): number {
    return LAB_FAMILIES.find(f => f.id === family)?.maxLevel ?? 0;
}

export function levelsFor(family: LabFamily): number[] {
    return Array.from({ length: maxLevelFor(family) + 1 }, (_, i) => i);
}

export function generateLabQuestion(
    family: LabFamily,
    level: number,
    rng: () => number = Math.random,
): QuizQuestion {
    return family === 'math'
        ? generateMathQuestion(level, rng)
        : generateReadingQuestion(level, rng);
}

export interface Bucket {
    key: string;
    label: string;
    count: number;
}

export interface LabDistribution {
    total: number;
    /** add/sub/mul, or the three reading shapes — whichever the family has. */
    skills: Bucket[];
    /** Answer bins (math) or per-word counts (reading). */
    detail: Bucket[];
    detailTitle: string;
    /** Answer spread — math only; reading has no numeric axis. */
    stats: { min: number; median: number; max: number } | null;
    /** Distinct words drawn — reading only. */
    distinctWords: number | null;
}

const SKILL_LABELS: Record<string, string> = {
    'math-add': '➕ Addition',
    'math-sub': '➖ Subtraction',
    'math-mul': '✖️ Multiplication',
    'read-word-pic': 'word → picture',
    'read-pic-word': 'picture → word',
    'read-missing-letter': 'missing letter',
};

function tally(keys: string[], label: (key: string) => string): Bucket[] {
    const counts = new Map<string, number>();
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()]
        .map(([key, count]) => ({ key, label: label(key), count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** ~8 equal-width bins across the observed range — readable at L0 and L3 alike. */
const BIN_TARGET = 8;

function binAnswers(answers: number[]): Bucket[] {
    if (answers.length === 0) return [];
    const min = Math.min(...answers);
    const max = Math.max(...answers);
    const span = max - min + 1;
    const width = Math.max(1, Math.ceil(span / BIN_TARGET));
    const binCount = Math.ceil(span / width);

    const counts = new Array<number>(binCount).fill(0);
    for (const answer of answers) counts[Math.floor((answer - min) / width)] += 1;

    return counts.map((count, i) => {
        const low = min + i * width;
        const high = Math.min(max, low + width - 1);
        const label = low === high ? `${low}` : `${low}–${high}`;
        return { key: label, label, count };
    });
}

function median(sorted: number[]): number {
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Draws `size` real questions and measures what came out. A single sample
 * cannot answer "am I getting enough hard questions?" — this can.
 */
export function sampleDistribution(
    family: LabFamily,
    level: number,
    size: number = DEFAULT_SAMPLE_SIZE,
    rng: () => number = Math.random,
): LabDistribution {
    const questions = Array.from({ length: size }, () => generateLabQuestion(family, level, rng));
    const skills = tally(questions.map(q => q.skill), key => SKILL_LABELS[key] ?? key);

    if (family === 'math') {
        const answers = questions.map(q => (q.kind === 'numeric' ? q.answer : 0));
        const sorted = [...answers].sort((a, b) => a - b);
        return {
            total: questions.length,
            skills,
            detail: binAnswers(answers),
            detailTitle: 'Answer spread',
            stats: { min: sorted[0], median: median(sorted), max: sorted[sorted.length - 1] },
            distinctWords: null,
        };
    }

    const wordIds = questions.map(q => (q.kind === 'choice' ? q.wordId : ''));
    const words = tally(wordIds, key => key);
    return {
        total: questions.length,
        skills,
        detail: words,
        detailTitle: 'Words drawn',
        stats: null,
        distinctWords: words.length,
    };
}
