// ============================================================
// useQuizEngine — session behavior: stable generator identity,
// recording payloads, the mercy rule, the miss re-queue, and the
// pending (served-but-unanswered) anti-reroll slot.
//
// Convention: generator() re-serves an unanswered question by
// design, so a test that wants a FRESH draw must answer the
// previous one first — exactly as QuizOverlay does, which only
// regenerates after an answer.
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useQuizEngine } from './useQuizEngine';
import { createDefaultSkillProgress } from '../skills/types';
import type { ChoiceQuizQuestion } from '../games/quiz/types';
import type { MCState } from '../types';

const mockDispatch = vi.fn();
let mockState: Pick<MCState, 'skillProgress'>;

vi.mock('../store/useMCStore', () => ({
    useMCState: () => mockState,
    useMCDispatch: () => mockDispatch,
}));

function choiceQuestion(wordId: string, level = 1): ChoiceQuizQuestion {
    return {
        kind: 'choice',
        skill: 'read-pic-word',
        level,
        wordId,
        prompt: { display: 'emoji', emoji: '🐶' },
        choices: [
            { label: wordId, render: 'word' },
            { label: 'a', render: 'word' },
            { label: 'b', render: 'word' },
            { label: 'c', render: 'word' },
        ],
        correctIndex: 0,
    };
}

describe('useQuizEngine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockState = { skillProgress: createDefaultSkillProgress() };
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('keeps the generator referentially stable across store updates', () => {
        const { result, rerender } = renderHook(() => useQuizEngine());
        const first = result.current.generator;

        mockState = { skillProgress: { ...createDefaultSkillProgress(), readingLevel: 3 } };
        rerender();

        expect(result.current.generator).toBe(first);
        expect(result.current).toBe(result.current); // api object memoized
    });

    it('records a fully attributed answer for the active game', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('blocks');

        result.current.onAnswered(choiceQuestion('dog', 1), false);

        expect(mockDispatch).toHaveBeenCalledWith({
            type: 'RECORD_QUIZ_ANSWER',
            skill: 'read-pic-word',
            level: 1,
            atLevel: false, // question level 1, kid is at 0
            firstTry: false,
            wordId: 'dog',
            gameId: 'blocks',
            origin: 'local',
        });
    });

    it('switches the rest of the quiz to math after two consecutive reading misses', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');

        result.current.onAnswered(choiceQuestion('dog'), false);
        result.current.onAnswered(choiceQuestion('cat'), false);

        for (let i = 0; i < 6; i++) {
            const question = result.current.generator();
            expect(question.kind).toBe('numeric');
            result.current.onAnswered(question, true); // clears the pending slot
        }

        // The mercy scope ends with the quiz.
        result.current.notifyQuizClosed();
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // forces the reading branch
        expect(result.current.generator().kind).toBe('choice');
    });

    it('re-serves a missed word as the third question after the miss, once per session', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // always reading

        result.current.onAnswered(choiceQuestion('dog', 1), false);
        result.current.notifyQuizClosed(); // keep mercy out of this test's way

        const first = result.current.generator() as ChoiceQuizQuestion;
        result.current.onAnswered(first, true);
        const second = result.current.generator() as ChoiceQuizQuestion;
        result.current.onAnswered(second, true);
        const third = result.current.generator() as ChoiceQuizQuestion;

        expect(first.wordId).not.toBe('dog');
        expect(second.wordId).not.toBe('dog');
        expect(third.wordId).toBe('dog');
        expect(third.level).toBe(1); // served at the level it was missed

        // A second miss on the re-queued word does NOT re-queue it forever.
        result.current.onAnswered(third, false);
        result.current.notifyQuizClosed();
        const after: ChoiceQuizQuestion[] = [];
        for (let i = 0; i < 4; i++) {
            const question = result.current.generator() as ChoiceQuizQuestion;
            after.push(question);
            result.current.onAnswered(question, true);
        }
        expect(after.every(q => q.kind === 'choice')).toBe(true);
        expect(after.filter(q => q.wordId === 'dog')).toHaveLength(0);
    });

    it('steers the mix toward the weaker family, end to end', () => {
        const today = new Date();
        const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        const bucket = (attempts: number, firstTry: number) =>
            [{ date: localDate, attempts, firstTry, offAttempts: 0, offFirstTry: 0 }];

        // Reading weak (50%), math strong (100%) → reading share clamps to 0.60.
        mockState = {
            skillProgress: {
                ...createDefaultSkillProgress(),
                days: {
                    ...createDefaultSkillProgress().days,
                    'read-pic-word': bucket(10, 5),
                    'math-add': bucket(10, 10),
                },
            },
        };
        const { result, rerender } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');

        // 0.55 sits between the base share (0.5) and the weak-reading share
        // (0.6): with the weighting wired, this roll serves READING. If the
        // arguments were swapped or the share hardcoded, it would serve math.
        vi.spyOn(Math, 'random').mockReturnValue(0.55);
        const weighted = result.current.generator();
        expect(weighted.kind).toBe('choice');
        result.current.onAnswered(weighted, true); // so the next draw is a fresh sample

        // Without evidence, the same roll falls on the math side of the base 0.5.
        vi.restoreAllMocks();
        mockState = { skillProgress: createDefaultSkillProgress() };
        rerender();
        vi.spyOn(Math, 'random').mockReturnValue(0.55);
        expect(result.current.generator().kind).toBe('numeric');
    });

    it('beginSession resets the leftover difficulty from the previous game', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        result.current.setDifficulty(3, 3);
        vi.spyOn(Math, 'random').mockReturnValue(0.99); // always math
        const hard = result.current.generator();
        expect(hard.level).toBe(3);
        result.current.onAnswered(hard, true); // answered, so nothing is carried

        // Closing snake and opening blocks must not inherit snake's level 3.
        result.current.beginSession('blocks');
        expect(result.current.generator().level).toBe(0);
    });

    it('beginSession resets the miss queue and mercy state', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        result.current.onAnswered(choiceQuestion('dog'), false);
        result.current.onAnswered(choiceQuestion('cat'), false);

        result.current.beginSession('fruits');
        vi.spyOn(Math, 'random').mockReturnValue(0.1);
        const question = result.current.generator() as ChoiceQuizQuestion;
        expect(question.kind).toBe('choice');
        expect(question.wordId).not.toBe('dog'); // queue gone with the old session
    });

    // ---- Anti-reroll: the pending (served-but-unanswered) question ----

    it('re-serves a question the kid backed out of, before sampling anything new', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('blocks');
        const rng = vi.spyOn(Math, 'random');

        rng.mockReturnValue(0.1); // reading side of the mix
        const served = result.current.generator();
        expect(served.kind).toBe('choice');

        // The kid taps the ✕ without answering.
        result.current.notifyQuizClosed();

        // Sampling would now hand out a math question — the pending slot wins.
        rng.mockReturnValue(0.99);
        expect(result.current.generator()).toBe(served);
    });

    it('does not launder a dodged question by switching games', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('blocks');
        const rng = vi.spyOn(Math, 'random');

        rng.mockReturnValue(0.1);
        const dodged = result.current.generator();
        result.current.notifyQuizClosed();

        // DELIBERATE, NOT A BUG: there is one engine instance for all games
        // (created in MCLayout), so a question cancelled in blocks is served in
        // fruits. Quitting the game must not be a cheaper reroll than the ✕.
        // beginSession resets session state and difficulty — the pending slot is
        // exempt on purpose; if it were cleared here the loophole would survive.
        result.current.beginSession('fruits');

        rng.mockReturnValue(0.99);
        expect(result.current.generator()).toBe(dodged);
    });

    it('serves the carried question at its own level, past the difficulty reset', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        result.current.setDifficulty(3, 3);
        vi.spyOn(Math, 'random').mockReturnValue(0.99); // always math

        const served = result.current.generator();
        expect(served.level).toBe(3);
        result.current.notifyQuizClosed();

        // beginSession drops difficulty to 0, but the pending slot holds the
        // exact question — not a permission to re-sample it at an easier level.
        result.current.beginSession('blocks');
        const next = result.current.generator();
        expect(next).toBe(served);
        expect(next.level).toBe(3);
    });

    it('does not treat a first-tap miss as pending — the re-queue already owns it', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('fruits');
        vi.spyOn(Math, 'random').mockReturnValue(0.1);

        const served = result.current.generator() as ChoiceQuizQuestion;
        result.current.onAnswered(served, false); // wrong first tap, then ✕
        result.current.notifyQuizClosed();

        const next = result.current.generator() as ChoiceQuizQuestion;
        expect(next).not.toBe(served);
        expect(next.wordId).not.toBe(served.wordId);
    });

    it('clears the pending slot on any answer', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('fruits');
        vi.spyOn(Math, 'random').mockReturnValue(0.1);

        const served = result.current.generator();
        result.current.notifyQuizClosed();
        result.current.onAnswered(choiceQuestion('zzz', 1), true);

        expect(result.current.generator()).not.toBe(served);
    });

    it('re-serving is idempotent — it burns no re-queue countdown tick', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // always reading

        result.current.onAnswered(choiceQuestion('dog', 1), false); // dog queued
        result.current.notifyQuizClosed(); // keep mercy out of this test's way

        const first = result.current.generator() as ChoiceQuizQuestion;
        // A second generator() call with nothing answered — StrictMode's dev
        // double-invoke, or a reopen — must hand back the same question and
        // must NOT advance the countdown toward dog.
        expect(result.current.generator()).toBe(first);
        result.current.onAnswered(first, true);

        const second = result.current.generator() as ChoiceQuizQuestion;
        result.current.onAnswered(second, true);
        const third = result.current.generator() as ChoiceQuizQuestion;

        expect(second.wordId).not.toBe('dog');
        expect(third.wordId).toBe('dog'); // still the 3rd distinct question
    });
});
