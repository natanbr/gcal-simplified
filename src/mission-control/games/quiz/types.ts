// ============================================================
// Quiz Module — Shared Types
// Extensible question/generator system for in-game quizzes.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import type { GameId, MathSkillId, ReadingSkillId } from '../../skills/types';

/**
 * The bare math question a leaf generator produces (e.g. "7 + 5 = ?").
 * The engine stamps `kind`/`skill`/`level` when serving it.
 */
export interface NumericQuestionCore {
    text: string;
    answer: number;
}

/** A numpad-answered math question, fully attributed for stats. */
export interface NumericQuizQuestion extends NumericQuestionCore {
    kind: 'numeric';
    skill: MathSkillId;
    level: number;
}

/** Any question the quiz overlay can show. Discriminated on `kind`. */
export type QuizQuestion = NumericQuizQuestion | ChoiceQuizQuestion;

/**
 * A function that produces a random QuizQuestion.
 * Each generator type (addition, multiplication, etc.) implements this.
 */
export type QuizGenerator = () => QuizQuestion;

/**
 * Shared feedback state for the overlay and its answer panels.
 * 'found' = the right answer located after a wrong tap — celebrated softly,
 * but it fills no dot and a fresh question follows.
 */
export type QuizFeedback = 'correct' | 'found' | 'wrong' | null;

/**
 * The per-game-session quiz brain, injected from MissionControl so game
 * modules stay store-free. Implemented by useQuizEngine (mission-control/
 * hooks); games import only this type.
 */
export interface QuizEngineApi {
    /** Referentially stable across renders — safe in QuizOverlay's effect deps. */
    generator: QuizGenerator;
    beginSession(gameId: GameId): void;
    setDifficulty(mathLevel: number, stage: number): void;
    onAnswered(question: QuizQuestion, firstTry: boolean): void;
    notifyQuizClosed(): void;
}

// ---- Reading (choice) questions ----

export type ChoicePrompt =
    | { display: 'word'; text: string }                              // word → picture
    | { display: 'emoji'; emoji: string }                            // picture → word
    | { display: 'gap'; before: string; after: string; emoji: string }; // missing letter

export interface QuizChoice {
    label: string;
    render: 'emoji' | 'word' | 'letter';
}

/** A tap-to-answer reading question (4 choices, exactly one correct). */
export interface ChoiceQuizQuestion {
    kind: 'choice';
    skill: ReadingSkillId;
    level: number;
    /** The target word's id — feeds the miss re-queue and hardest-words stats. */
    wordId: string;
    prompt: ChoicePrompt;
    choices: QuizChoice[];
    correctIndex: number;
}
