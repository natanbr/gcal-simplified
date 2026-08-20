// ============================================================
// Quiz Module — Numeric Answer Panel
// Question row + inline answer box + kid-friendly numpad.
// Owns the typed-input state and keyboard handling; the overlay
// owns correctness/feedback. Extracted from QuizOverlay.tsx.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { NumericQuizQuestion, QuizFeedback } from './types';
import { NumpadButton } from './NumpadButton';

interface NumericPanelProps {
    question: NumericQuizQuestion;
    feedback: QuizFeedback;
    /** Any fresh input after a wrong answer clears the ✗ marker. */
    onDirty: () => void;
    onSubmit: (answer: number) => void;
}

export function NumericPanel({ question, feedback, onDirty, onSubmit }: NumericPanelProps) {
    const [input, setInput] = useState('');

    // Fresh question → fresh input box.
    useEffect(() => {
        setInput('');
    }, [question]);

    // A wrong submit clears the typed digits (the ✗ shows in their place).
    useEffect(() => {
        if (feedback === 'wrong') setInput('');
    }, [feedback]);

    const handleDigit = useCallback((digit: string) => {
        if (feedback === 'correct') return; // No input during the success flash
        setInput(prev => {
            if (prev.length >= 3) return prev; // Max 3 digits
            return prev + digit;
        });
        onDirty();
    }, [feedback, onDirty]);

    const handleBackspace = useCallback(() => {
        setInput(prev => prev.slice(0, -1));
        onDirty();
    }, [onDirty]);

    const handleSubmit = useCallback(() => {
        if (!input) return;
        onSubmit(parseInt(input, 10));
    }, [input, onSubmit]);

    // Keyboard support for the numpad
    useEffect(() => {
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
    }, [handleDigit, handleBackspace, handleSubmit]);

    // Split question text: "14 + 2 = ?" → questionPart = "14 + 2", answer replaces "?"
    const questionPart = question.text.replace(/\s*=\s*\?$/, '');

    const answerBorder = feedback === 'correct' ? 'var(--mc-quiz-correct)'
        : feedback === 'wrong' ? 'var(--mc-quiz-wrong)'
            : 'rgba(255,255,255,0.25)';
    const answerBg = feedback === 'correct' ? 'rgba(74,222,128,0.25)'
        : feedback === 'wrong' ? 'rgba(239,68,68,0.25)'
            : 'rgba(255,255,255,0.08)';

    return (
        <>
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
                    color: 'var(--mc-quiz-text-soft)',
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
                    color: 'var(--mc-quiz-text)',
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
                                style={{ color: 'var(--mc-quiz-wrong)', fontSize: 22 }}
                            >
                                ✗
                            </motion.span>
                        )}
                        {feedback === null && (
                            <span>{input || <span style={{ color: 'var(--mc-quiz-text-dim)' }}>?</span>}</span>
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
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => (
                    <NumpadButton key={d} label={d} onClick={() => handleDigit(d)} />
                ))}
                <NumpadButton label="⌫" onClick={handleBackspace} variant="action" />
                <NumpadButton label="0" onClick={() => handleDigit('0')} />
                <NumpadButton label="✓" onClick={handleSubmit} variant="submit" />
            </div>
        </>
    );
}
