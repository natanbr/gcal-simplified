// ============================================================
// Snake Game — Full-Screen Overlay
// Entry-point component rendered by MissionControl.
// Composes SnakeCanvas + QuizOverlay + game HUD.
// ⚠️  Internal to src/mission-control/games/snake/ only.
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SnakeCanvas } from './SnakeCanvas';
import { useSnakeGame } from './useSnakeGame';
import { QuizOverlay } from '../quiz/QuizOverlay';
import { generateLevelQuestion } from '../quiz/additionQuiz';
import { INITIAL_LIVES, QUIZ_QUESTIONS_TO_REVIVE, GameLevel, LEVEL_LABELS } from './types';

interface SnakeGameOverlayProps {
    open: boolean;
    onClose: (score: number) => void;
}

export function SnakeGameOverlay({ open, onClose }: SnakeGameOverlayProps) {
    const { gameState, onQuizCorrect, resetGame, setLevel, debugRef } = useSnakeGame(open);
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
                handleClose();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, gameState.phase, handleClose]);

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
                    className="fixed inset-0 z-[1000] bg-black/85 flex items-center justify-center"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.div
                        className="bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-blue-400/15 rounded-[28px] shadow-[0_25px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col overflow-hidden w-[90vw] h-[90vh]"
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between py-3.5 px-5 border-b border-white/5">
                            <div className="font-sans text-[18px] font-black text-slate-50 flex items-center gap-2 tracking-[0.02em]">
                                🐍 Snake Game
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Level Selector */}
                                <div className="flex items-center bg-slate-800/50 rounded-lg p-1 border border-white/5 mr-2">
                                    {([0, 1, 2, 3] as GameLevel[]).map(lvl => (
                                        <button
                                            key={lvl}
                                            onClick={() => setLevel(lvl)}
                                            disabled={gameState.phase !== 'waiting'}
                                            className={`
                                                px-2.5 py-1 text-xs font-bold rounded-md transition-all
                                                ${gameState.level === lvl 
                                                    ? 'bg-blue-500 text-white shadow-sm' 
                                                    : 'text-slate-400 hover:text-slate-200'}
                                                ${gameState.phase !== 'waiting' && gameState.level !== lvl ? 'opacity-30 cursor-not-allowed' : ''}
                                            `}
                                        >
                                            {LEVEL_LABELS[lvl]}
                                        </button>
                                    ))}
                                </div>

                                {/* Score */}
                                <div className="font-sans text-[15px] font-extrabold flex items-center gap-[5px] text-amber-400">
                                    🍎 {gameState.score}
                                </div>

                                {/* Lives */}
                                <div className="flex gap-[3px] text-[16px]">
                                    {Array.from({ length: INITIAL_LIVES }, (_, i) => (
                                        <span key={i}>
                                            {i < gameState.lives ? '❤️' : '🖤'}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            <button
                                className="bg-red-500/15 border-[1.5px] border-red-500/35 rounded-xl py-1.5 px-3.5 font-sans text-[13px] font-extrabold text-red-300 cursor-pointer transition-all duration-200 hover:bg-red-500/30 hover:text-red-200"
                                onClick={handleClose}
                            >
                                ✕ Close
                            </button>
                        </div>

                        {/* ── Game Area ── */}
                        <div className="relative flex items-center justify-center p-4 flex-1 min-h-0 overflow-hidden">
                            <SnakeCanvas gameState={gameState} debugRef={debugRef} />

                            {/* Quiz overlay for revival */}
                            <QuizOverlay
                                open={gameState.phase === 'quiz-revive'}
                                requiredCorrect={QUIZ_QUESTIONS_TO_REVIVE}
                                currentCorrect={gameState.quizCorrectCount}
                                livesRemaining={gameState.lives}
                                totalLives={INITIAL_LIVES}
                                generator={() => generateLevelQuestion(gameState.level)}
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
