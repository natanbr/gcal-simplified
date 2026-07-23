// ============================================================
// Fruit Merge — Full-Screen Overlay
// Entry-point component rendered by MissionControl.
// Composes FruitMergeCanvas + QuizOverlay + game HUD.
// ============================================================

import { useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FruitMergeCanvas } from './FruitMergeCanvas';
import { useFruitMergeGame } from './useFruitMergeGame';
import { QuizOverlay } from '../quiz/QuizOverlay';
import {
    generateAdditionQuestion, generateSubtractionQuestion,
    generateMultiplicationQuestion,
} from '../quiz/additionQuiz';
import { FRUIT_TYPES, GAME_TIME_MS } from './types';

interface FruitMergeGameOverlayProps {
    open: boolean;
    onClose: (score: number) => void;
}

/** Quiz difficulty based on fruit tier being deleted. */
function generateDeleteQuestion(tier: number) {
    if (tier <= 1) return generateAdditionQuestion(10);
    if (tier <= 3) {
        return Math.random() < 0.5
            ? generateAdditionQuestion(20)
            : generateSubtractionQuestion(15);
    }
    return generateMultiplicationQuestion(4);
}

export function FruitMergeGameOverlay({ open, onClose }: FruitMergeGameOverlayProps) {
    const {
        gameState, engineRef, fruitMapRef, mergeEffectsRef,
        startGame, resetGame, dropFruit, setDropX,
        enterDeleteMode, cancelDeleteMode, selectFruitForDelete,
        onDeleteQuizCorrect, getDeleteTier,
    } = useFruitMergeGame(open);

    const scoreRef = useRef(0);
    scoreRef.current = gameState.score;

    // Reset when overlay opens
    const prevOpen = useRef(false);
    useEffect(() => {
        if (open && !prevOpen.current) resetGame();
        prevOpen.current = open;
    }, [open, resetGame]);

    const handleClose = useCallback(() => {
        onClose(scoreRef.current);
    }, [onClose]);

    // ESC to close / cancel delete mode
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (gameState.phase === 'selecting-delete') {
                    cancelDeleteMode();
                } else {
                    handleClose();
                }
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, gameState.phase, handleClose, cancelDeleteMode]);

    const formatTime = (ms: number) => {
        const totalSec = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isTimeLow = gameState.timeRemainingMs <= 30000 && gameState.timeRemainingMs > 0;
    const isEnded = gameState.phase === 'game-over' || gameState.phase === 'time-up';
    const elapsedMs = GAME_TIME_MS - gameState.timeRemainingMs;
    const deleteTier = getDeleteTier();

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
                        className="bg-gradient-to-br from-slate-800 to-slate-900 border-2 border-emerald-400/15 rounded-[28px] shadow-[0_25px_80px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.06)] flex flex-col overflow-hidden w-[90vw] h-[90vh]"
                        initial={{ scale: 0.88, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.92, opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                    >
                        {/* ── Header ── */}
                        <div className="flex items-center justify-between py-3.5 px-5 border-b border-white/5">
                            <div className="font-sans text-[18px] font-black text-slate-50 flex items-center gap-2 tracking-[0.02em]">
                                🍉 Fruit Merge
                            </div>

                            <div className="flex items-center gap-4">
                                {/* Next fruit */}
                                <div className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-3 py-1 border border-white/5">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Next</span>
                                    <span className="text-[20px]">{FRUIT_TYPES[gameState.nextDropTier].emoji}</span>
                                </div>

                                {/* Score */}
                                <div className="font-sans text-[15px] font-extrabold flex items-center gap-[5px] text-amber-400">
                                    ⭐ {gameState.score}
                                </div>

                                {/* Highest tier */}
                                <div className="font-sans text-[15px] font-extrabold flex items-center gap-[5px] text-emerald-400">
                                    {/* highestTier can reach FRUIT_TYPES.length (10) when two
                                        watermelons merge — clamp so the crown never indexes past
                                        the last fruit and crashes the header. */}
                                    👑 {FRUIT_TYPES[Math.min(gameState.highestTier, FRUIT_TYPES.length - 1)].emoji}
                                </div>

                                {/* Delete button */}
                                {(gameState.phase === 'playing' || gameState.phase === 'selecting-delete') && (
                                    <button
                                        className={`rounded-xl py-1.5 px-3 font-sans text-[13px] font-extrabold cursor-pointer transition-all duration-200 border-[1.5px] ${
                                            gameState.phase === 'selecting-delete'
                                                ? 'bg-red-500/30 border-red-500/50 text-red-200 animate-pulse'
                                                : 'bg-orange-500/15 border-orange-500/35 text-orange-300 hover:bg-orange-500/30'
                                        }`}
                                        onClick={gameState.phase === 'selecting-delete' ? cancelDeleteMode : enterDeleteMode}
                                    >
                                        {gameState.phase === 'selecting-delete' ? '✕ Cancel' : '🧠 Delete Fruit'}
                                    </button>
                                )}

                                {/* Timer */}
                                <div className={`font-sans text-[15px] font-extrabold flex items-center gap-[5px] ${isTimeLow ? 'text-red-400 animate-pulse' : 'text-sky-400'}`}>
                                    ⏱️ {formatTime(gameState.timeRemainingMs)}
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
                            <FruitMergeCanvas
                                gameState={gameState}
                                engineRef={engineRef}
                                fruitMapRef={fruitMapRef}
                                mergeEffectsRef={mergeEffectsRef}
                                onDropXChange={setDropX}
                                onDrop={dropFruit}
                                onFruitClick={selectFruitForDelete}
                            />

                            {/* Start button */}
                            {gameState.phase === 'waiting' && (
                                <div className="absolute inset-0 flex items-center justify-center z-10">
                                    <button
                                        className="bg-emerald-500 hover:bg-emerald-400 text-white font-black text-lg py-3 px-10 rounded-2xl transition-colors shadow-lg"
                                        onClick={startGame}
                                    >
                                        ▶ Play
                                    </button>
                                </div>
                            )}

                            {/* Delete quiz overlay */}
                            <QuizOverlay
                                open={gameState.phase === 'quiz-delete'}
                                requiredCorrect={1}
                                currentCorrect={0}
                                generator={() => generateDeleteQuestion(deleteTier)}
                                onCorrect={onDeleteQuizCorrect}
                                title={`🧠 Delete ${FRUIT_TYPES[deleteTier].emoji} ${FRUIT_TYPES[deleteTier].name}?`}
                            />

                            {/* End screen overlay */}
                            {isEnded && (
                                <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50 rounded-[28px]">
                                    <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 text-center max-w-sm">
                                        <div className="text-5xl mb-4">
                                            {gameState.phase === 'time-up' ? '⏰' : '💥'}
                                        </div>
                                        <h2 className="text-2xl font-black text-white mb-2">
                                            {gameState.phase === 'time-up' ? "Time's Up!" : 'Game Over'}
                                        </h2>
                                        <div className="text-6xl my-4">
                                            {FRUIT_TYPES[Math.min(gameState.highestTier, FRUIT_TYPES.length - 1)].emoji}
                                        </div>
                                        <p className="text-slate-400 text-sm mb-1">Largest fruit reached</p>
                                        <p className="text-emerald-400 font-bold text-lg mb-3">
                                            {FRUIT_TYPES[Math.min(gameState.highestTier, FRUIT_TYPES.length - 1)].name}
                                        </p>
                                        <p className="text-slate-400 mb-1">
                                            Score: <span className="text-amber-400 font-bold">{gameState.score}</span>
                                        </p>
                                        <p className="text-slate-500 text-sm mb-6">
                                            {gameState.mergeCount} merges in {formatTime(elapsedMs)}
                                        </p>
                                        <div className="flex gap-3 justify-center">
                                            <button
                                                className="bg-emerald-500 hover:bg-emerald-400 text-white font-bold py-2.5 px-6 rounded-xl transition-colors"
                                                onClick={startGame}
                                            >
                                                Play Again
                                            </button>
                                            <button
                                                className="bg-slate-600 hover:bg-slate-500 text-white font-bold py-2.5 px-6 rounded-xl transition-colors"
                                                onClick={handleClose}
                                            >
                                                Done
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
