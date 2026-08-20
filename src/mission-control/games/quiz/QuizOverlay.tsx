// ============================================================
// Quiz Module — Quiz Overlay Component
// The shared revive-quiz shell: dark card, title, progress dots,
// fireworks, and the correctness/feedback state machine. Answer
// UI lives in per-kind panels (NumericPanel / ChoicePanel).
//
// Scoring contract: `onAnswered` fires at the FIRST-attempt
// moment (first tap / first submit) so a miss is recorded even
// if the game is closed right after. The revive dot (`onCorrect`)
// fills only on a clean first-attempt success for choice
// questions; math keeps its retry-until-solved dot behavior.
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { QuizQuestion, QuizGenerator, QuizFeedback } from './types';
import { Fireworks } from './Fireworks';
import { NumericPanel } from './NumericPanel';
import { ChoicePanel } from './ChoicePanel';

/** Wrong-tap freeze on choice questions — tap-spam must be slower than reading. */
const WRONG_TAP_LOCK_MS = 1500;
/** Success flash dwell before the next step (matches the numpad's feel). */
const SUCCESS_DWELL_MS = 600;

interface QuizOverlayProps {
    open: boolean;
    requiredCorrect: number;
    currentCorrect: number;
    generator: QuizGenerator;
    onCorrect: () => void;
    /** Recording hook — fired once per question at the first-attempt moment. */
    onAnswered?: (question: QuizQuestion, firstTry: boolean) => void;
    /** Renders a ✕ — only the opt-in quizzes (blocks unlock, fruits delete) pass this. */
    onCancel?: () => void;
    /** Fired when the overlay closes — lets the engine end its mercy scope. */
    onClosed?: () => void;
    title?: string;
}

export function QuizOverlay({
    open,
    requiredCorrect,
    currentCorrect,
    generator,
    onCorrect,
    onAnswered,
    onCancel,
    onClosed,
    title = 'Answer to Revive!',
}: QuizOverlayProps) {
    const [question, setQuestion] = useState<QuizQuestion | null>(null);
    const [feedback, setFeedback] = useState<QuizFeedback>(null);
    const [deadChoices, setDeadChoices] = useState<number[]>([]);
    const [inputLocked, setInputLocked] = useState(false);
    /** Bumped to force a fresh question when the dot did NOT fill (a 'found'). */
    const [questionSeq, setQuestionSeq] = useState(0);
    /** First attempt consumed for the current question (recording moment). */
    const answeredRef = useRef(false);

    // A new question whenever the overlay opens, a dot fills, or a 'found'
    // resolves. Generation happens here (never in render) because the engine's
    // generator advances session state per call.
    useEffect(() => {
        if (!open) return;
        setQuestion(generator());
        setFeedback(null);
        setDeadChoices([]);
        setInputLocked(false);
        answeredRef.current = false;
    }, [open, currentCorrect, generator, questionSeq]);

    // Closing ends the engine's mercy scope for this quiz.
    const wasOpen = useRef(open);
    useEffect(() => {
        if (wasOpen.current && !open) onClosed?.();
        wasOpen.current = open;
    }, [open, onClosed]);

    // Success dwell: let the flash land, then report up / move on. Effect-
    // scoped so closing mid-dwell cancels instead of firing into an unmounted
    // game.
    useEffect(() => {
        if (feedback !== 'correct' && feedback !== 'found') return;
        const timer = setTimeout(() => {
            if (feedback === 'correct') {
                onCorrect();
                setFeedback(null);
            } else {
                setQuestionSeq(seq => seq + 1);
            }
        }, SUCCESS_DWELL_MS);
        return () => clearTimeout(timer);
    }, [feedback, onCorrect]);

    // Wrong-tap freeze (choice questions only).
    useEffect(() => {
        if (!inputLocked) return;
        const timer = setTimeout(() => setInputLocked(false), WRONG_TAP_LOCK_MS);
        return () => clearTimeout(timer);
    }, [inputLocked]);

    const handleNumericSubmit = useCallback((answer: number) => {
        if (!question || question.kind !== 'numeric') return;
        const correct = answer === question.answer;
        if (!answeredRef.current) {
            answeredRef.current = true;
            onAnswered?.(question, correct);
        }
        setFeedback(correct ? 'correct' : 'wrong');
    }, [question, onAnswered]);

    const handleDirty = useCallback(() => {
        setFeedback(prev => (prev === 'wrong' ? null : prev));
    }, []);

    const handlePick = useCallback((index: number) => {
        if (!question || question.kind !== 'choice') return;
        if (inputLocked || feedback === 'correct' || feedback === 'found') return;
        if (deadChoices.includes(index)) return;

        const correct = index === question.correctIndex;
        const firstAttempt = !answeredRef.current;
        if (firstAttempt) {
            answeredRef.current = true;
            onAnswered?.(question, correct);
        }

        if (correct) {
            // A clean first tap fills the dot; a later find celebrates softly
            // and a fresh question follows — it never counts.
            setFeedback(firstAttempt ? 'correct' : 'found');
        } else {
            setDeadChoices(prev => [...prev, index]);
            setInputLocked(true);
        }
    }, [question, inputLocked, feedback, deadChoices, onAnswered]);

    if (!open || !question) return null;

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
                {/* Fireworks only on a counted (first-attempt) success */}
                <Fireworks trigger={feedback === 'correct'} />

                {/* Cancel — opt-in quizzes only; backing out costs nothing */}
                {onCancel && (
                    <button
                        aria-label="Cancel"
                        onClick={onCancel}
                        style={{
                            position: 'absolute',
                            top: 10,
                            right: 12,
                            background: 'rgba(255,255,255,0.08)',
                            border: '1.5px solid rgba(148,163,184,0.3)',
                            borderRadius: 10,
                            width: 34,
                            height: 34,
                            fontSize: 15,
                            fontWeight: 800,
                            color: 'var(--mc-quiz-text-muted)',
                            cursor: 'pointer',
                        }}
                    >
                        ✕
                    </button>
                )}

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

                {question.kind === 'numeric' ? (
                    <NumericPanel
                        question={question}
                        feedback={feedback}
                        onDirty={handleDirty}
                        onSubmit={handleNumericSubmit}
                    />
                ) : (
                    <ChoicePanel
                        question={question}
                        feedback={feedback}
                        deadChoices={deadChoices}
                        locked={inputLocked}
                        onPick={handlePick}
                    />
                )}
            </motion.div>
        </motion.div>
    );
}
