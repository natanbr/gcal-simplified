// ============================================================
// Quiz Module — Reading Question Generators
// Pure functions: (level, rng) → ChoiceQuizQuestion. The level
// table below IS the reading ladder from the approved plan.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import type { ChoiceQuizQuestion, QuizChoice } from '../types';
import type { ReadingSkillId } from '../../../skills/types';
import { WORDS, CONFUSABLE_EMOJI_GROUPS, type WordEntry } from './wordBank';
import { MINIMAL_PAIRS, LONG_WORD_DISTRACTORS } from './minimalPairs';

/** Injectable randomness: () => [0, 1). Threaded through every pick/shuffle. */
export type Rng = () => number;

const VOWELS = 'aeiou';
const CONSONANT_POOL = 'bcdfghlmnprstw'.split('');

const byWord = new Map(WORDS.map(w => [w.word, w]));
const SHORT = WORDS.filter(w => w.word.length <= 4);
const LONG = WORDS.filter(w => w.word.length >= 5);

/** word → the set of words whose emoji could be mistaken for its own. */
const confusableWith = new Map<string, Set<string>>();
for (const group of CONFUSABLE_EMOJI_GROUPS) {
    for (const member of group) {
        const set = confusableWith.get(member) ?? new Set<string>();
        for (const other of group) if (other !== member) set.add(other);
        confusableWith.set(member, set);
    }
}

function clash(a: string, b: string): boolean {
    return confusableWith.get(a)?.has(b) ?? false;
}

/** Depth-first pick of `count` entries that pairwise avoid emoji confusion. */
function pickNonConfusable(candidates: WordEntry[], count: number): WordEntry[] | null {
    const chosen: WordEntry[] = [];
    const walk = (start: number): boolean => {
        if (chosen.length === count) return true;
        for (let i = start; i < candidates.length; i++) {
            const cand = candidates[i];
            if (chosen.some(c => clash(c.word, cand.word))) continue;
            chosen.push(cand);
            if (walk(i + 1)) return true;
            chosen.pop();
        }
        return false;
    };
    return walk(0) ? chosen : null;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function pick<T>(items: readonly T[], rng: Rng): T {
    return items[Math.floor(rng() * items.length)];
}

/** L1 fuel: short words with a provably valid same-initial distractor triple. */
const L1_TARGETS = SHORT.filter(target => {
    const family = WORDS.filter(w =>
        w.word !== target.word && w.word[0] === target.word[0] && !clash(w.word, target.word));
    return pickNonConfusable(family, 3) !== null;
});

const L3_TARGETS = SHORT.filter(w => (MINIMAL_PAIRS[w.word]?.length ?? 0) >= 3);

/** 3-letter consonant-vowel-consonant shapes — the middle-vowel gap pool. */
const L5_TARGETS = WORDS.filter(w =>
    w.word.length === 3 &&
    VOWELS.includes(w.word[1]) &&
    !VOWELS.includes(w.word[0]) &&
    !VOWELS.includes(w.word[2]));

export function levelSkill(level: number): ReadingSkillId {
    if (level <= 1 || level >= 6) return 'read-word-pic';
    if (level <= 3) return 'read-pic-word';
    return 'read-missing-letter';
}

interface GenerateOptions {
    /** Serve THIS word (the miss re-queue). */
    forceWordId?: string;
    /** Never serve this word (no identical target twice in a row). */
    excludeWordId?: string;
}

function pickTarget(pool: WordEntry[], rng: Rng, opts: GenerateOptions): WordEntry {
    if (opts.forceWordId) {
        const forced = byWord.get(opts.forceWordId);
        if (forced) return forced;
    }
    const eligible = pool.filter(w => w.word !== opts.excludeWordId);
    return pick(eligible.length > 0 ? eligible : pool, rng);
}

/** Assemble the shuffled 4-choice set and locate the target. */
function finish(
    level: number,
    skill: ReadingSkillId,
    target: WordEntry,
    prompt: ChoiceQuizQuestion['prompt'],
    correct: QuizChoice,
    distractors: QuizChoice[],
    rng: Rng,
): ChoiceQuizQuestion {
    const choices = shuffle([correct, ...distractors], rng);
    return {
        kind: 'choice',
        skill,
        level,
        wordId: target.word,
        prompt,
        choices,
        correctIndex: choices.findIndex(c => c.label === correct.label),
    };
}

function emojiChoices(target: WordEntry, candidates: WordEntry[], rng: Rng): QuizChoice[] {
    const safe = candidates.filter(w => w.word !== target.word && !clash(w.word, target.word));
    const triple = pickNonConfusable(shuffle(safe, rng), 3);
    // The curated pools guarantee a triple exists; the fallback keeps the
    // generator total if curation ever regresses (integrity tests catch it).
    const three = triple ?? safe.slice(0, 3);
    return three.map(w => ({ label: w.emoji, render: 'emoji' as const }));
}

function wordToPicture(level: number, rng: Rng, opts: GenerateOptions): ChoiceQuizQuestion {
    const sameInitial = level >= 1;
    const pool = level >= 6 ? LONG : (sameInitial ? L1_TARGETS : SHORT);
    const target = pickTarget(pool, rng, opts);

    let candidates: WordEntry[];
    if (sameInitial && level < 6) {
        candidates = WORDS.filter(w => w.word[0] === target.word[0]);
    } else if (level >= 6) {
        candidates = LONG;
    } else {
        candidates = WORDS.filter(w => w.word[0] !== target.word[0]);
    }

    return finish(
        level,
        'read-word-pic',
        target,
        { display: 'word', text: target.word },
        { label: target.emoji, render: 'emoji' },
        emojiChoices(target, candidates, rng),
        rng,
    );
}

function pictureToWord(level: number, rng: Rng, opts: GenerateOptions): ChoiceQuizQuestion {
    const minimal = level === 3;
    const pool = level >= 6 ? LONG.filter(w => LONG_WORD_DISTRACTORS[w.word]) : (minimal ? L3_TARGETS : SHORT);
    const target = pickTarget(pool, rng, opts);

    let words: string[];
    if (level >= 6 && LONG_WORD_DISTRACTORS[target.word]) {
        words = shuffle(LONG_WORD_DISTRACTORS[target.word], rng).slice(0, 3);
    } else if (minimal && MINIMAL_PAIRS[target.word]) {
        words = shuffle(MINIMAL_PAIRS[target.word], rng).slice(0, 3);
    } else {
        // Clearly-different words: distinct initials, from the short pool.
        words = [];
        const used = new Set([target.word[0]]);
        for (const w of shuffle(SHORT, rng)) {
            if (words.length === 3) break;
            if (w.word === target.word || used.has(w.word[0])) continue;
            used.add(w.word[0]);
            words.push(w.word);
        }
    }

    return finish(
        level,
        'read-pic-word',
        target,
        { display: 'emoji', emoji: target.emoji },
        { label: target.word, render: 'word' },
        words.map(w => ({ label: w, render: 'word' as const })),
        rng,
    );
}

function missingLetter(level: number, rng: Rng, opts: GenerateOptions): ChoiceQuizQuestion {
    const vowelGap = level >= 5;
    const pool = vowelGap ? L5_TARGETS : SHORT;
    const target = pickTarget(pool, rng, opts);
    const word = target.word;

    let gapIndex: number;
    let letterPool: string[];
    if (vowelGap) {
        gapIndex = 1;
        letterPool = VOWELS.split('');
    } else {
        gapIndex = rng() < 0.5 ? 0 : word.length - 1;
        letterPool = CONSONANT_POOL;
    }

    const correctLetter = word[gapIndex];
    const wrong = shuffle(letterPool.filter(l => l !== correctLetter), rng).slice(0, 3);

    return finish(
        level,
        'read-missing-letter',
        target,
        {
            display: 'gap',
            before: word.slice(0, gapIndex),
            after: word.slice(gapIndex + 1),
            emoji: target.emoji,
        },
        { label: correctLetter, render: 'letter' },
        wrong.map(l => ({ label: l, render: 'letter' as const })),
        rng,
    );
}

/**
 * The reading ladder. L6 mixes the two recognition modes over long words;
 * the missing-letter mechanic stays at L4/L5 where the short CVC words live.
 */
export function generateReadingQuestion(
    level: number,
    rng: Rng,
    opts: GenerateOptions = {},
): ChoiceQuizQuestion {
    const clamped = Math.max(0, Math.min(6, Math.round(level)));
    switch (clamped) {
        case 0:
        case 1:
            return wordToPicture(clamped, rng, opts);
        case 2:
        case 3:
            return pictureToWord(clamped, rng, opts);
        case 4:
        case 5:
            return missingLetter(clamped, rng, opts);
        default:
            return rng() < 0.5
                ? wordToPicture(6, rng, opts)
                : pictureToWord(6, rng, opts);
    }
}
