// ============================================================
// Word Bank — structural integrity tests. The reading questions
// are only as good as this data; every rule here is a curation
// contract the generators rely on.
// ============================================================

import { describe, it, expect } from 'vitest';
import { WORDS, CONFUSABLE_EMOJI_GROUPS } from './wordBank';
import { MINIMAL_PAIRS, LONG_WORD_DISTRACTORS } from './minimalPairs';

const wordSet = new Set(WORDS.map(w => w.word));

describe('word bank integrity', () => {
    it('has no duplicate words and no duplicate emoji', () => {
        expect(wordSet.size).toBe(WORDS.length);
        const emoji = WORDS.map(w => w.emoji);
        expect(new Set(emoji).size).toBe(emoji.length);
    });

    it('is lowercase a-z throughout, with a non-empty emoji per word', () => {
        for (const { word, emoji } of WORDS) {
            expect(word).toMatch(/^[a-z]+$/);
            expect(emoji.length).toBeGreaterThan(0);
        }
    });

    it('offers at least 6 initial-letter families of 4+ words (level-1 fuel)', () => {
        const families = new Map<string, number>();
        for (const { word } of WORDS) {
            families.set(word[0], (families.get(word[0]) ?? 0) + 1);
        }
        const big = [...families.values()].filter(n => n >= 4);
        expect(big.length).toBeGreaterThanOrEqual(6);
    });

    it('minimal pairs: keys exist, same length, exactly one letter differs, no self/dups', () => {
        expect(Object.keys(MINIMAL_PAIRS).length).toBeGreaterThanOrEqual(20);
        for (const [target, pairs] of Object.entries(MINIMAL_PAIRS)) {
            expect(wordSet.has(target), `MINIMAL_PAIRS key '${target}' missing from WORDS`).toBe(true);
            expect(pairs.length).toBeGreaterThanOrEqual(3);
            expect(new Set(pairs).size).toBe(pairs.length);
            for (const pair of pairs) {
                expect(pair).not.toBe(target);
                expect(pair.length, `'${pair}' vs '${target}' length`).toBe(target.length);
                const diffs = [...target].filter((ch, i) => ch !== pair[i]).length;
                expect(diffs, `'${pair}' must differ from '${target}' in exactly one position`).toBe(1);
            }
        }
    });

    it('every 5-6 letter word has 3+ long-word distractors, none self or duplicated', () => {
        for (const { word } of WORDS.filter(w => w.word.length >= 5)) {
            const distractors = LONG_WORD_DISTRACTORS[word];
            expect(distractors, `'${word}' has no LONG_WORD_DISTRACTORS entry`).toBeDefined();
            expect(distractors.length).toBeGreaterThanOrEqual(3);
            expect(new Set(distractors).size).toBe(distractors.length);
            expect(distractors).not.toContain(word);
        }
        for (const key of Object.keys(LONG_WORD_DISTRACTORS)) {
            expect(wordSet.has(key), `LONG_WORD_DISTRACTORS key '${key}' missing from WORDS`).toBe(true);
        }
    });

    it('confusable groups only reference real words', () => {
        for (const group of CONFUSABLE_EMOJI_GROUPS) {
            expect(group.length).toBeGreaterThanOrEqual(2);
            for (const member of group) {
                expect(wordSet.has(member), `confusable member '${member}' missing from WORDS`).toBe(true);
            }
        }
    });
});
