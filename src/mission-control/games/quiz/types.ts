// ============================================================
// Quiz Module — Shared Types
// Extensible question/generator system for in-game quizzes.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

/**
 * A single quiz question shown to the player.
 * `text` is the human-readable question string (e.g. "7 + 5 = ?").
 * `answer` is the numeric correct answer.
 */
export interface QuizQuestion {
    text: string;
    answer: number;
}

/**
 * A function that produces a random QuizQuestion.
 * Each generator type (addition, multiplication, etc.) implements this.
 */
export type QuizGenerator = () => QuizQuestion;

/** Shared feedback state for the overlay and its answer panels. */
export type QuizFeedback = 'correct' | 'wrong' | null;

// ---- Reading (choice) questions ----

import type { ReadingSkillId } from '../../skills/types';

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
