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

    /**
     * The **pending** question: the one most recently served that has received
     * zero `onAnswered` calls. A question is parked here the moment it is served
     * and leaves only when it is answered — so if the quiz closes first (the ✕ on
     * the opt-in quizzes, or quitting the game), it is still sitting here, and
     * the next quiz to open on ANY surface is served it before anything new is
     * sampled. Cancelling is therefore not a reroll.
     *
     * Three deliberate properties:
     * - **Exempt from `beginSession`.** It is not part of `EngineSession`, so the
     *   session reset does not clear it. It has to survive: the blocks rescue
     *   quiz remounts between the cancel and the reopen and opening another game
     *   calls `beginSession`, so a slot that cleared there would leave the reroll
     *   loophole exactly as wide as it was. Cross-game carry is the point — a
     *   dodge must not be laundered by switching games.
     * - **A first-tap miss is not pending.** `onAnswered` already fired, so the
     *   miss is recorded and the re-queue (`REQUEUE_AFTER_QUESTIONS`) owns that
     *   word. Nothing is handled twice.
     * - **In-memory only.** Engine session state; never persisted, never in
     *   `mc-state-v5`, never near `skillProgress`.
     */
    const pendingRef = useRef<QuizQuestion | null>(null);

    const beginSession = useCallback((gameId: GameId) => {
        gameIdRef.current = gameId;
        // NOTE: pendingRef is deliberately NOT reset here — see its declaration.
        sessionRef.current = freshSession();
        // Difficulty must not leak between games: snake at minute 6 sets
        // level 3, and a blocks session opened next would otherwise serve
        // its first unlock quiz at snake's difficulty.
        difficultyRef.current = { mathLevel: 0, stage: 0 };
    }, []);

    const setDifficulty = useCallback((mathLevel: number, stage: number) => {
        difficultyRef.current = { mathLevel, stage };
    }, []);

    const generator = useCallback((): QuizQuestion => {
        const rng = Math.random;
        const session = sessionRef.current;
        const progress = progressRef.current;
        const { mathLevel, stage } = difficultyRef.current;

        // The pending question wins before ANY sampling: back out of a hard
        // question and you get that exact question back, at its own level, past
        // the mercy rule and past the difficulty reset. Returning here — above
        // the countdown tick — is load-bearing twice over: the question already
        // ticked the re-queue when it was first served, so re-serving must not
        // burn a second tick, and that is also what makes a duplicated
        // generator() call (React StrictMode's dev double-invoke) harmless.
        const pending = pendingRef.current;
        if (pending) {
            if (pending.kind === 'choice') session.lastWordId = pending.wordId;
            return pending;
        }

        for (const entry of session.requeue) entry.countdown -= 1;

        const mercy = session.mercyMisses >= MERCY_MISS_THRESHOLD;
        if (mercy || rng() >= currentReadingShare(progress)) {
            const math = generateMathQuestion(mathLevel, rng);
            pendingRef.current = math;
            return math;
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
        pendingRef.current = question;
        return question;
    }, []);

    const onAnswered = useCallback((question: QuizQuestion, firstTry: boolean) => {
        const session = sessionRef.current;
        // Any answer settles the pending slot — including a wrong first tap,
        // which the re-queue takes over from here.
        pendingRef.current = null;
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
        // pendingRef is untouched on purpose: an unanswered question at close
        // time IS the pending question, and clearing it here would be the reroll.
        sessionRef.current.mercyMisses = 0;
    }, []);

    return useMemo(
        () => ({ generator, beginSession, setDifficulty, onAnswered, notifyQuizClosed }),
        [generator, beginSession, setDifficulty, onAnswered, notifyQuizClosed],
    );
}
