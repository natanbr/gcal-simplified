// ============================================================
// Snake Game — Full-Screen Overlay
// Entry-point component rendered by MissionControl.
// Composes SnakeCanvas + QuizOverlay + game HUD.
// ⚠️  Internal to src/mission-control/games/snake/ only.
// ============================================================

import './snake.css';
import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SnakeCanvas } from './SnakeCanvas';
import { useSnakeGame } from './useSnakeGame';
import { QuizOverlay } from '../quiz/QuizOverlay';
import { generateAdditionQuestion } from '../quiz/additionQuiz';
import { INITIAL_LIVES, QUIZ_QUESTIONS_TO_REVIVE } from './types';

interface SnakeGameOverlayProps {
    open: boolean;
    onClose: (score: number) => void;
}

export function SnakeGameOverlay({ open, onClose }: SnakeGameOverlayProps) {
    const { gameState, onQuizCorrect, resetGame, debugRef } = useSnakeGame(open);
    const scoreRef = useRef(0);
    scoreRef.current = gameState.score;

    // Reset game when overlay opens
    const prevOpen = useRef(false);
    useEffect(() => {
        if (open && !prevOpen.current) {
            resetGame();
        }
        prevOpen.current = open;
    }, [open, resetGame]);

    const handleClose = useCallback(() => {
        onClose(scoreRef.current);
    }, [onClose]);

    // Allow playing again after game-over by pressing arrow keys
    useEffect(() => {
        if (!open || gameState.phase !== 'game-over') return;
        const handler = (e: KeyboardEvent) => {
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                resetGame();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, gameState.phase, resetGame]);

    // ESC to close
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') handleClose();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, handleClose]);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="snake-overlay-backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.div
                        className="snake-overlay-container"
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    >
                        {/* ── Header ── */}
                        <div className="snake-overlay-header">
                            <div className="snake-overlay-title">
                                🐍 Snake Game
                            </div>

                            <div className="snake-overlay-stats">
                                {/* Score */}
                                <div className="snake-stat snake-stat-score">
                                    🍎 {gameState.score}
                                </div>

                                {/* Lives */}
                                <div className="snake-lives">
                                    {Array.from({ length: INITIAL_LIVES }, (_, i) => (
                                        <span key={i}>
                                            {i < gameState.lives ? '❤️' : '🖤'}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <button
                                className="snake-overlay-close"
                                onClick={handleClose}
                            >
                                ✕ Close
                            </button>
                        </div>

                        {/* ── Game Area ── */}
                        <div className="snake-overlay-body">
                            <SnakeCanvas gameState={gameState} debugRef={debugRef} />

                            {/* Quiz overlay for revival */}
                            <QuizOverlay
                                open={gameState.phase === 'quiz-revive'}
                                requiredCorrect={QUIZ_QUESTIONS_TO_REVIVE}
                                currentCorrect={gameState.quizCorrectCount}
                                livesRemaining={gameState.lives}
                                totalLives={INITIAL_LIVES}
                                generator={generateAdditionQuestion}
                                onCorrect={onQuizCorrect}
                                title="🧠 Answer to Revive!"
                            />
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
