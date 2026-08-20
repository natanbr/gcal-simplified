// ============================================================
// Quiz Module — Quiz Overlay Component
// The shared revive-quiz shell: dark card, title, progress dots,
// fireworks, and the correctness/feedback state machine. The
// answer UI itself lives in per-kind panels (NumericPanel).
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { QuizQuestion, QuizGenerator, QuizFeedback } from './types';
import { Fireworks } from './Fireworks';
import { NumericPanel } from './NumericPanel';

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
    const [feedback, setFeedback] = useState<QuizFeedback>(null);

    // Generate new question when overlay opens or after a correct answer
    useEffect(() => {
        if (open) {
            setQuestion(generator());
            setFeedback(null);
        }
    }, [open, currentCorrect, generator]);

    const handleSubmit = useCallback((answer: number) => {
        if (answer === question.answer) {
            setFeedback('correct');
        } else {
            setFeedback('wrong');
        }
    }, [question]);

    const handleDirty = useCallback(() => {
        setFeedback(prev => (prev === 'wrong' ? null : prev));
    }, []);

    // Success dwell: let the ✅ flash land, then report up. Effect-scoped so
    // closing the overlay mid-dwell cancels the timeout instead of firing
    // onCorrect into an unmounted game.
    useEffect(() => {
        if (feedback !== 'correct') return;
        const timer = setTimeout(() => {
            onCorrect();
            setFeedback(null);
        }, 600);
        return () => clearTimeout(timer);
    }, [feedback, onCorrect]);

    if (!open) return null;

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
                    background: 'linear-gradient(145deg, var(--mc-quiz-surface-hi), var(--mc-quiz-surface-lo))',
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
                    color: 'var(--mc-quiz-text)',
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
                                    ? 'var(--mc-quiz-correct)'
                                    : 'rgba(255,255,255,0.15)',
                                border: '2px solid rgba(255,255,255,0.2)',
                                transition: 'background 0.3s',
                            }}
                        />
                    ))}
                    <span style={{
                        fontSize: 12,
                        color: 'var(--mc-quiz-text-muted)',
                        fontWeight: 700,
                        marginLeft: 4,
                        fontFamily: "'Nunito', sans-serif",
                    }}>
                        {currentCorrect}/{requiredCorrect}
                    </span>
                </div>

                <NumericPanel
                    question={question}
                    feedback={feedback}
                    onDirty={handleDirty}
                    onSubmit={handleSubmit}
                />
            </motion.div>
        </motion.div>
    );
}
