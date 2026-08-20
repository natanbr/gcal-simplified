// ============================================================
// Mission Control — Quiz Engine Session Hook
// The store-facing brain behind the in-game quizzes: mixes math
// and reading questions, adapts to the invisible reading level,
// re-queues missed words, applies the mercy rule, and records
// every answer. Created ONCE in MissionControl and injected into
// the game overlays as a prop, so game modules stay store-free.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useMemo, useRef } from 'react';
import { useMCDispatch, useMCState } from '../store/useMCStore';
import { getLocalDateString } from '../store/behaviorSync';
import { generateMathQuestion } from '../games/quiz/additionQuiz';
import {
    computeReadingShare,
    generateReadingQuestion,
    MERCY_MISS_THRESHOLD,
    recentAccuracy,
    REQUEUE_AFTER_QUESTIONS,
    sampleReadingLevel,
    WEIGHTING_LOOKBACK_DAYS,
} from '../games/quiz/quizEngine';
import type { QuizEngineApi, QuizQuestion } from '../games/quiz/types';
import { MATH_SKILL_IDS, READING_SKILL_IDS, type GameId, type SkillProgress } from '../skills/types';

interface RequeueEntry {
    wordId: string;
    level: number;
    countdown: number;
}

interface EngineSession {
    lastWordId: string | null;
    requeue: RequeueEntry[];
    /** One re-queue per word per game session — a second miss just stays in the stats. */
    requeuedWords: Set<string>;
    /** Consecutive first-attempt reading misses inside the current quiz. */
    mercyMisses: number;
}

function freshSession(): EngineSession {
    return { lastWordId: null, requeue: [], requeuedWords: new Set(), mercyMisses: 0 };
}

function currentReadingShare(progress: SkillProgress): number {
    const since = getLocalDateString(new Date(Date.now() - WEIGHTING_LOOKBACK_DAYS * 86_400_000));
    const reading = recentAccuracy(READING_SKILL_IDS.map(s => progress.days[s] ?? []), since);
    const math = recentAccuracy(MATH_SKILL_IDS.map(s => progress.days[s] ?? []), since);
    return computeReadingShare(reading, math);
}

export function useQuizEngine(): QuizEngineApi {
    const state = useMCState();
    const dispatch = useMCDispatch();

    // Refs keep the generator referentially stable while always reading fresh
    // values — the overlay regenerates its question on generator identity, so
    // an unstable generator would swap questions under the kid mid-answer.
    const progressRef = useRef(state.skillProgress);
    progressRef.current = state.skillProgress;

    const gameIdRef = useRef<GameId>('snake');
    const difficultyRef = useRef({ mathLevel: 0, stage: 0 });
    const sessionRef = useRef<EngineSession>(freshSession());

    const beginSession = useCallback((gameId: GameId) => {
        gameIdRef.current = gameId;
        sessionRef.current = freshSession();
    }, []);

    const setDifficulty = useCallback((mathLevel: number, stage: number) => {
        difficultyRef.current = { mathLevel, stage };
    }, []);

    const generator = useCallback((): QuizQuestion => {
        const rng = Math.random;
        const session = sessionRef.current;
        const progress = progressRef.current;
        const { mathLevel, stage } = difficultyRef.current;

        for (const entry of session.requeue) entry.countdown -= 1;

        const mercy = session.mercyMisses >= MERCY_MISS_THRESHOLD;
        if (mercy || rng() >= currentReadingShare(progress)) {
            return generateMathQuestion(mathLevel, rng);
        }

        const due = session.requeue.find(entry => entry.countdown <= 0);
        let question;
        if (due) {
            session.requeue = session.requeue.filter(entry => entry !== due);
            question = generateReadingQuestion(due.level, rng, { forceWordId: due.wordId });
        } else {
            const sampled = sampleReadingLevel(progress.readingLevel, stage, rng);
            question = generateReadingQuestion(sampled.level, rng, {
                excludeWordId: session.lastWordId ?? undefined,
            });
        }
        session.lastWordId = question.wordId;
        return question;
    }, []);

    const onAnswered = useCallback((question: QuizQuestion, firstTry: boolean) => {
        const session = sessionRef.current;
        if (question.kind === 'choice') {
            if (firstTry) {
                session.mercyMisses = 0;
            } else {
                session.mercyMisses += 1;
                if (!session.requeuedWords.has(question.wordId)) {
                    session.requeuedWords.add(question.wordId);
                    session.requeue.push({
                        wordId: question.wordId,
                        level: question.level,
                        countdown: REQUEUE_AFTER_QUESTIONS,
                    });
                }
            }
        }

        dispatch({
            type: 'RECORD_QUIZ_ANSWER',
            skill: question.skill,
            level: question.level,
            atLevel: question.kind === 'numeric'
                ? true
                : question.level === progressRef.current.readingLevel,
            firstTry,
            ...(question.kind === 'choice' ? { wordId: question.wordId } : {}),
            gameId: gameIdRef.current,
            origin: 'local',
        });
    }, [dispatch]);

    const notifyQuizClosed = useCallback(() => {
        // The mercy rule is scoped to one quiz: a fresh quiz starts clean.
        sessionRef.current.mercyMisses = 0;
    }, []);

    return useMemo(
        () => ({ generator, beginSession, setDifficulty, onAnswered, notifyQuizClosed }),
        [generator, beginSession, setDifficulty, onAnswered, notifyQuizClosed],
    );
}
