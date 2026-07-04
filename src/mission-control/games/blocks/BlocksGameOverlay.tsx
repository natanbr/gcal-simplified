import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BlocksCanvas } from './BlocksCanvas';
import { useBlocksGame } from './useBlocksGame';

interface BlocksGameOverlayProps {
    open: boolean;
    onClose: (score: number) => void;
}

export function BlocksGameOverlay({ open, onClose }: BlocksGameOverlayProps) {
    const {
        gameState, startGame, resetGame, placeShape, 
        triggerRescueQuiz, submitQuizAnswer, refreshRescueShape
    } = useBlocksGame();

    const scoreRef = useRef(0);
    scoreRef.current = gameState.score;

    // Reset when opening
    const prevOpen = useRef(false);
    useEffect(() => {
        if (open && !prevOpen.current) {
            resetGame();
        }
        prevOpen.current = open;
    }, [open, resetGame]);

    // Keyboard ESC to close
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose(scoreRef.current);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            style={{
                position: 'fixed', inset: 0, zIndex: 1000,
                background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
        >
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                style={{
                    background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    border: '2px solid rgba(56, 189, 248, 0.15)',
                    borderRadius: 28,
                    padding: '24px 32px 32px',
                    width: 'min(1250px, 95vw)',
                    height: 'min(900px, 95vh)',
                    boxShadow: '0 25px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
                    display: 'flex', flexDirection: 'column', gap: 18,
                    position: 'relative', overflow: 'hidden'
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
                        <span style={{ fontSize: 24 }}>🚀</span>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 18, fontWeight: 900, color: '#f8fafc', letterSpacing: '0.02em', fontFamily: "'Nunito', sans-serif" }}>
                                Space Rescue
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                                Clean space debris & save the astronaut
                            </span>
                        </div>
                    </div>

                    <button
                        onClick={() => onClose(gameState.score)}
                        style={{
                            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '50%',
                            width: 32, height: 32, cursor: 'pointer', color: '#94a3b8', fontSize: 14,
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Score / Status HUD */}
                <div style={{ display: 'flex', gap: 16, width: '100%', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: '8px 16px', border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Altitude</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#38bdf8' }}>{gameState.altitude} / 200m</span>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Score</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#a78bfa' }}>{gameState.score}</span>
                    </div>
                    <div style={{ width: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                        <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Level</span>
                        <span style={{ fontSize: 18, fontWeight: 900, color: '#fbbf24' }}>{gameState.level}</span>
                    </div>
                </div>

                {/* Game Main Body */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
                    {gameState.phase === 'waiting' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                            <span style={{ fontSize: 64, animation: 'bounce 2s infinite' }}>🧑‍🚀</span>
                            <span style={{ fontSize: 18, fontWeight: 800, color: '#f8fafc', textAlign: 'center' }}>
                                Help the Baby Astronaut launch to safety!
                            </span>
                            <button
                                onClick={startGame}
                                style={{
                                    background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                                    color: '#ffffff', border: 'none', borderRadius: 16,
                                    padding: '12px 32px', fontSize: 18, fontWeight: 900,
                                    cursor: 'pointer', boxShadow: '0 4px 14px rgba(56, 189, 248, 0.4)'
                                }}
                            >
                                Play Game! 🚀
                            </button>
                        </div>
                    ) : (
                        <BlocksCanvas
                            gameState={gameState}
                            placeShape={placeShape}
                            triggerRescueQuiz={triggerRescueQuiz}
                            submitQuizAnswer={submitQuizAnswer}
                            refreshRescueShape={refreshRescueShape}
                        />
                    )}
                </div>

                {/* Victory Modal Overlay */}
                <AnimatePresence>
                    {gameState.phase === 'victory' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute', inset: 0, zIndex: 1100,
                                background: 'rgba(15, 23, 42, 0.95)', display: 'flex',
                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20
                            }}
                        >
                            <span style={{ fontSize: 72, margin: 0 }}>🧑‍🚀🛸🎉</span>
                            <h2 style={{ fontSize: 28, fontWeight: 900, color: '#4ade80', margin: 0, fontFamily: "'Nunito', sans-serif" }}>
                                Mission Complete!
                            </h2>
                            <p style={{ color: '#94a3b8', fontSize: 14, textAlign: 'center', maxWidth: 300, margin: 0 }}>
                                You cleared the debris and saved the baby astronaut!
                            </p>
                            <button
                                onClick={() => onClose(gameState.score)}
                                style={{
                                    background: 'linear-gradient(135deg, #4ade80, #16a34a)',
                                    color: '#ffffff', border: 'none', borderRadius: 16,
                                    padding: '12px 36px', fontSize: 18, fontWeight: 900,
                                    cursor: 'pointer', boxShadow: '0 4px 14px rgba(74, 222, 128, 0.4)'
                                }}
                            >
                                Collect Bonus! 🏆
                            </button>
                        </motion.div>
                    )}

                    {/* Game Over Modal Overlay */}
                    {gameState.phase === 'game-over' && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            style={{
                                position: 'absolute', inset: 0, zIndex: 1100,
                                background: 'rgba(15, 23, 42, 0.95)', display: 'flex',
                                flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20
                            }}
                        >
                            <span style={{ fontSize: 64, margin: 0 }}>☄️💥👾</span>
                            <h2 style={{ fontSize: 26, fontWeight: 900, color: '#ef4444', margin: 0 }}>
                                Mission Failed
                            </h2>
                            <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
                                Space debris clogged the path! Score: {gameState.score}
                            </p>
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button
                                    onClick={resetGame}
                                    style={{
                                        background: 'rgba(255,255,255,0.1)',
                                        color: '#f8fafc', border: '1px solid rgba(255,255,255,0.2)',
                                        borderRadius: 16, padding: '12px 24px', fontSize: 16,
                                        fontWeight: 800, cursor: 'pointer'
                                    }}
                                >
                                    Try Again 🔄
                                </button>
                                <button
                                    onClick={() => onClose(gameState.score)}
                                    style={{
                                        background: 'rgba(255,255,255,0.05)',
                                        color: '#94a3b8', border: 'none',
                                        borderRadius: 16, padding: '12px 24px', fontSize: 16,
                                        fontWeight: 800, cursor: 'pointer'
                                    }}
                                >
                                    Close ✕
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>
        </motion.div>
    );
}
