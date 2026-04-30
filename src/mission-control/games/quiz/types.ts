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
