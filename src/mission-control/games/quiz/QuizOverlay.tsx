// ============================================================
// Quiz Module — Quiz Overlay Component
// Reusable in-game quiz UI with a kid-friendly numpad.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { QuizQuestion, QuizGenerator } from './types';
import { Fireworks } from './Fireworks';
import { NumpadButton } from './NumpadButton';

interface QuizOverlayProps {
    open: boolean;
    requiredCorrect: number;
    currentCorrect: number;
    generator: QuizGenerator;
    onCorrect: () => void;
    title?: string;
}

export function QuizOverlay({
    open,
    requiredCorrect,
    currentCorrect,
    generator,
    onCorrect,
    title = 'Answer to Revive!',
}: QuizOverlayProps) {
    const [question, setQuestion] = useState<QuizQuestion>(() => generator());
    const [input, setInput] = useState('');
    const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);

    // Generate new question when overlay opens or after a correct answer
    useEffect(() => {
        if (open) {
            setQuestion(generator());
            setInput('');
            setFeedback(null);
        }
    }, [open, currentCorrect, generator]);

    const handleDigit = useCallback((digit: string) => {
        if (feedback === 'correct') return; // Don't allow input during success flash
        setInput(prev => {
            if (prev.length >= 3) return prev; // Max 3 digits
            return prev + digit;
        });
        setFeedback(null);
    }, [feedback]);

    const handleBackspace = useCallback(() => {
        setInput(prev => prev.slice(0, -1));
        setFeedback(null);
    }, []);

    const handleSubmit = useCallback(() => {
        if (!input) return;
        const answer = parseInt(input, 10);
        if (answer === question.answer) {
            setFeedback('correct');
            setTimeout(() => {
                onCorrect();
                setInput('');
                setFeedback(null);
            }, 600);
        } else {
            setFeedback('wrong');
            setInput('');
        }
    }, [input, question, onCorrect]);

    // Keyboard support for numpad
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key >= '0' && e.key <= '9') {
                handleDigit(e.key);
            } else if (e.key === 'Backspace') {
                handleBackspace();
            } else if (e.key === 'Enter') {
                handleSubmit();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open, handleDigit, handleBackspace, handleSubmit]);

    if (!open) return null;

    // Split question text: "14 + 2 = ?" → questionPart = "14 + 2", answer replaces "?"
    const questionPart = question.text.replace(/\s*=\s*\?$/, '');

    // Answer box border/bg based on feedback
    const answerBorder = feedback === 'correct' ? '#4ade80'
        : feedback === 'wrong' ? '#ef4444'
            : 'rgba(255,255,255,0.25)';
    const answerBg = feedback === 'correct' ? 'rgba(74,222,128,0.25)'
        : feedback === 'wrong' ? 'rgba(239,68,68,0.25)'
            : 'rgba(255,255,255,0.08)';

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(15, 23, 42, 0.88)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 20,
                backdropFilter: 'blur(4px)',
            }}
        >
            <motion.div
                initial={{ scale: 0.85, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                style={{
                    background: 'linear-gradient(145deg, #1e293b, #0f172a)',
                    borderRadius: 28,
                    border: '2px solid rgba(148,163,184,0.2)',
                    padding: '32px 36px 36px',
                    margin: 40,
                    width: 'min(440px, calc(90vw - 80px))',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 14,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    position: 'relative' as const,
                    overflow: 'hidden',
                }}
            >
                {/* Fireworks on correct answer */}
                <Fireworks trigger={feedback === 'correct'} />

                {/* Title */}
                <div style={{
                    fontSize: 18,
                    fontWeight: 900,
                    color: '#f8fafc',
                    fontFamily: "'Nunito', sans-serif",
                    textAlign: 'center',
                }}>
                    {title}
                </div>

                {/* Progress dots — compact */}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {Array.from({ length: requiredCorrect }, (_, i) => (
                        <div
                            key={i}
                            style={{
                                width: 14,
                                height: 14,
                                borderRadius: '50%',
                                background: i < currentCorrect
                                    ? '#4ade80'
                                    : 'rgba(255,255,255,0.15)',
                                border: '2px solid rgba(255,255,255,0.2)',
                                transition: 'background 0.3s',
                            }}
                        />
                    ))}
                    <span style={{
                        fontSize: 12,
                        color: '#94a3b8',
                        fontWeight: 700,
                        marginLeft: 4,
                        fontFamily: "'Nunito', sans-serif",
                    }}>
                        {currentCorrect}/{requiredCorrect}
                    </span>
                </div>

                {/* Question + inline answer */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 14,
                    padding: '24px 0',
                    flexWrap: 'nowrap',
                }}>
                    {/* Question text e.g. "14 + 2 =" */}
                    <span style={{
                        fontSize: 52,
                        fontWeight: 900,
                        color: '#e2e8f0',
                        fontFamily: "'Nunito', sans-serif",
                        letterSpacing: '0.03em',
                        whiteSpace: 'nowrap',
                    }}>
                        {questionPart} =
                    </span>

                    {/* Inline answer box */}
                    <div style={{
                        minWidth: 88,
                        height: 68,
                        borderRadius: 16,
                        background: answerBg,
                        border: `2px solid ${answerBorder}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 44,
                        fontWeight: 900,
                        color: '#f8fafc',
                        fontFamily: "'Nunito', sans-serif",
                        transition: 'all 0.2s',
                        padding: '0 12px',
                    }}>
                        <AnimatePresence mode="popLayout">
                            {feedback === 'correct' && (
                                <motion.span
                                    key="check"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    style={{ fontSize: 32 }}
                                >
                                    ✅
                                </motion.span>
                            )}
                            {feedback === 'wrong' && (
                                <motion.span
                                    key="wrong"
                                    initial={{ x: -10 }}
                                    animate={{ x: [0, -6, 6, -4, 4, 0] }}
                                    transition={{ duration: 0.4 }}
                                    style={{ color: '#ef4444', fontSize: 22 }}
                                >
                                    ✗
                                </motion.span>
                            )}
                            {feedback === null && (
                                <span>{input || <span style={{ color: '#475569' }}>?</span>}</span>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Numpad — large touch-friendly buttons */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    width: '100%',
                    maxWidth: 300,
                }}>
                    {['1','2','3','4','5','6','7','8','9'].map(d => (
                        <NumpadButton key={d} label={d} onClick={() => handleDigit(d)} />
                    ))}
                    <NumpadButton label="⌫" onClick={handleBackspace} variant="action" />
                    <NumpadButton label="0" onClick={() => handleDigit('0')} />
                    <NumpadButton label="✓" onClick={handleSubmit} variant="submit" />
                </div>
            </motion.div>
        </motion.div>
    );
}
