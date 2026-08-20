// ============================================================
// useQuizEngine — session behavior: stable generator identity,
// recording payloads, the mercy rule, and the miss re-queue.
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
            expect(result.current.generator().kind).toBe('numeric');
        }

        // The mercy scope ends with the quiz.
        result.current.notifyQuizClosed();
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // forces the reading branch
        expect(result.current.generator().kind).toBe('choice');
    });

    it('re-serves a missed word after exactly three intervening questions, once per session', () => {
        const { result } = renderHook(() => useQuizEngine());
        result.current.beginSession('snake');
        vi.spyOn(Math, 'random').mockReturnValue(0.1); // always reading

        result.current.onAnswered(choiceQuestion('dog', 1), false);
        result.current.notifyQuizClosed(); // keep mercy out of this test's way

        const first = result.current.generator() as ChoiceQuizQuestion;
        const second = result.current.generator() as ChoiceQuizQuestion;
        const third = result.current.generator() as ChoiceQuizQuestion;

        expect(first.wordId).not.toBe('dog');
        expect(second.wordId).not.toBe('dog');
        expect(third.wordId).toBe('dog');
        expect(third.level).toBe(1); // served at the level it was missed

        // A second miss on the re-queued word does NOT re-queue it forever.
        result.current.onAnswered(third, false);
        result.current.notifyQuizClosed();
        const after = [
            result.current.generator() as ChoiceQuizQuestion,
            result.current.generator() as ChoiceQuizQuestion,
            result.current.generator() as ChoiceQuizQuestion,
            result.current.generator() as ChoiceQuizQuestion,
        ];
        expect(after.every(q => q.kind === 'choice')).toBe(true);
        expect(after.filter(q => q.wordId === 'dog')).toHaveLength(0);
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
});
