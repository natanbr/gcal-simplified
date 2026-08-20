// ============================================================
// Reading question generators — level-contract tests.
// Every level's distractor rule from the approved plan is
// asserted here across many seeded draws (interval-mapped RNG,
// no statistical assertions).
// ============================================================

import { describe, it, expect } from 'vitest';
import { generateReadingQuestion, type Rng } from './readingQuestions';
import { WORDS, CONFUSABLE_EMOJI_GROUPS } from './wordBank';
import { MINIMAL_PAIRS, LONG_WORD_DISTRACTORS } from './minimalPairs';
import type { ChoiceQuizQuestion } from '../types';

const byWord = new Map(WORDS.map(w => [w.word, w]));
const byEmoji = new Map(WORDS.map(w => [w.emoji, w]));

/** Deterministic LCG so every draw is reproducible. */
function seeded(seed: number): Rng {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function draws(level: number, count = 120): ChoiceQuizQuestion[] {
    return Array.from({ length: count }, (_, i) => generateReadingQuestion(level, seeded(i * 7 + 1)));
}

function expectStructure(q: ChoiceQuizQuestion, level: number) {
    expect(q.kind).toBe('choice');
    expect(q.level).toBe(level);
    expect(q.choices).toHaveLength(4);
    expect(new Set(q.choices.map(c => c.label)).size).toBe(4);
    expect(q.correctIndex).toBeGreaterThanOrEqual(0);
    expect(q.correctIndex).toBeLessThan(4);
    expect(q.wordId).toMatch(/^[a-z]+$/); // lowercase everywhere
}

function confusableClash(labels: string[]): boolean {
    for (const group of CONFUSABLE_EMOJI_GROUPS) {
        const hits = labels.filter(label => {
            const word = byEmoji.get(label)?.word;
            return word !== undefined && group.includes(word);
        });
        if (hits.length > 1) return true;
    }
    return false;
}

describe('generateReadingQuestion — level contracts', () => {
    it('L0: word prompt, emoji choices, distractors start with DIFFERENT letters', () => {
        for (const q of draws(0)) {
            expectStructure(q, 0);
            expect(q.skill).toBe('read-word-pic');
            if (q.prompt.display !== 'word') throw new Error('L0 prompt must be a word');
            expect(q.prompt.text).toBe(q.wordId);
            expect(q.choices.every(c => c.render === 'emoji')).toBe(true);
            expect(q.choices[q.correctIndex].label).toBe(byWord.get(q.wordId)!.emoji);
            for (let i = 0; i < 4; i++) {
                if (i === q.correctIndex) continue;
                const word = byEmoji.get(q.choices[i].label)!.word;
                expect(word[0], `L0 distractor '${word}' shares '${q.wordId}' initial`).not.toBe(q.wordId[0]);
            }
        }
    });

    it('L1: emoji choices, distractors share the target\'s FIRST letter', () => {
        for (const q of draws(1)) {
            expectStructure(q, 1);
            expect(q.skill).toBe('read-word-pic');
            for (let i = 0; i < 4; i++) {
                if (i === q.correctIndex) continue;
                const word = byEmoji.get(q.choices[i].label)!.word;
                expect(word[0], `L1 distractor '${word}' must start like '${q.wordId}'`).toBe(q.wordId[0]);
            }
        }
    });

    it('L2: emoji prompt, word choices with distinct first letters', () => {
        const confusableWith = new Map<string, Set<string>>();
        for (const group of CONFUSABLE_EMOJI_GROUPS) {
            for (const member of group) {
                const set = confusableWith.get(member) ?? new Set<string>();
                for (const other of group) if (other !== member) set.add(other);
                confusableWith.set(member, set);
            }
        }
        for (const q of draws(2)) {
            expectStructure(q, 2);
            expect(q.skill).toBe('read-pic-word');
            if (q.prompt.display !== 'emoji') throw new Error('L2 prompt must be an emoji');
            expect(q.prompt.emoji).toBe(byWord.get(q.wordId)!.emoji);
            expect(q.choices.every(c => c.render === 'word')).toBe(true);
            expect(q.choices[q.correctIndex].label).toBe(q.wordId);
            const initials = q.choices.map(c => c.label[0]);
            expect(new Set(initials).size, 'L2 choices must not share initials').toBe(4);
            // Fairness: a "ship" distractor under a ⛵ prompt is a right answer
            // marked wrong — distractors must not name the prompt's picture.
            for (const choice of q.choices) {
                expect(
                    confusableWith.get(q.wordId)?.has(choice.label) ?? false,
                    `'${choice.label}' also names the '${q.wordId}' picture`,
                ).toBe(false);
            }
        }
    });

    it('L3: minimal-pair distractors drawn from the curated pair set', () => {
        for (const q of draws(3)) {
            expectStructure(q, 3);
            expect(q.skill).toBe('read-pic-word');
            const pairs = MINIMAL_PAIRS[q.wordId];
            expect(pairs, `L3 target '${q.wordId}' must have curated pairs`).toBeDefined();
            for (let i = 0; i < 4; i++) {
                if (i === q.correctIndex) continue;
                expect(pairs).toContain(q.choices[i].label);
            }
        }
    });

    it('L4: first/last letter gap; the correct letter rebuilds the word', () => {
        for (const q of draws(4)) {
            expectStructure(q, 4);
            expect(q.skill).toBe('read-missing-letter');
            if (q.prompt.display !== 'gap') throw new Error('L4 prompt must be a gap');
            expect(q.prompt.before === '' || q.prompt.after === '').toBe(true);
            expect(q.choices.every(c => c.render === 'letter' && c.label.length === 1)).toBe(true);
            const rebuilt = q.prompt.before + q.choices[q.correctIndex].label + q.prompt.after;
            expect(rebuilt).toBe(q.wordId);
            expect(q.prompt.emoji).toBe(byWord.get(q.wordId)!.emoji);
        }
    });

    it('L5: middle-vowel gap with vowel-only choices', () => {
        for (const q of draws(5)) {
            expectStructure(q, 5);
            expect(q.skill).toBe('read-missing-letter');
            if (q.prompt.display !== 'gap') throw new Error('L5 prompt must be a gap');
            expect(q.prompt.before.length).toBeGreaterThan(0);
            expect(q.prompt.after.length).toBeGreaterThan(0);
            expect(q.choices.every(c => 'aeiou'.includes(c.label))).toBe(true);
            const rebuilt = q.prompt.before + q.choices[q.correctIndex].label + q.prompt.after;
            expect(rebuilt).toBe(q.wordId);
        }
    });

    it('L6: 5+ letter targets, in both directions across seeds', () => {
        const all = draws(6, 200);
        const displays = new Set<string>();
        for (const q of all) {
            expectStructure(q, 6);
            expect(q.wordId.length).toBeGreaterThanOrEqual(5);
            displays.add(q.prompt.display);
            if (q.prompt.display === 'emoji') {
                expect(q.skill).toBe('read-pic-word');
                for (let i = 0; i < 4; i++) {
                    if (i === q.correctIndex) continue;
                    expect(LONG_WORD_DISTRACTORS[q.wordId]).toContain(q.choices[i].label);
                }
            } else {
                expect(q.skill).toBe('read-word-pic');
            }
        }
        expect(displays).toEqual(new Set(['word', 'emoji']));
    });

    it('never co-presents two glance-confusable emoji in one choice set', () => {
        for (const level of [0, 1, 6]) {
            for (const q of draws(level, 200)) {
                if (q.choices[0].render !== 'emoji') continue;
                expect(
                    confusableClash(q.choices.map(c => c.label)),
                    `confusable emoji pair in one set: ${q.choices.map(c => c.label).join(' ')}`,
                ).toBe(false);
            }
        }
    });

    it('honors forceWordId (re-queue) and excludeWordId (no repeat target)', () => {
        const forced = generateReadingQuestion(3, seeded(42), { forceWordId: 'dog' });
        expect(forced.wordId).toBe('dog');

        for (let seed = 0; seed < 50; seed++) {
            const q = generateReadingQuestion(0, seeded(seed), { excludeWordId: 'cat' });
            expect(q.wordId).not.toBe('cat');
        }
    });

    it('is deterministic for a given seed and clamps out-of-range levels', () => {
        const a = generateReadingQuestion(2, seeded(7));
        const b = generateReadingQuestion(2, seeded(7));
        expect(a).toEqual(b);

        expect(generateReadingQuestion(-3, seeded(1)).level).toBe(0);
        expect(generateReadingQuestion(99, seeded(1)).level).toBe(6);
    });

});
