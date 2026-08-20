// ============================================================
// Quiz Module — Choice Answer Panel (reading questions)
// Word/emoji/gap prompt + a 2×2 grid of big tappable choices.
// The overlay owns attempt state; this panel is presentation +
// input (taps and the 1–4 keys).
// ⚠️  Internal to src/mission-control/games/quiz/ only.
// ============================================================

import { useEffect } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ChoiceQuizQuestion, QuizFeedback } from './types';

interface ChoicePanelProps {
    question: ChoiceQuizQuestion;
    feedback: QuizFeedback;
    /** Indices of wrong choices already tapped — greyed out and locked. */
    deadChoices: number[];
    /** True during the wrong-tap freeze (tap-spam is slower than reading). */
    locked: boolean;
    onPick: (index: number) => void;
}

function Prompt({ question }: { question: ChoiceQuizQuestion }) {
    const prompt = question.prompt;
    const wordStyle = {
        fontSize: 52,
        fontWeight: 900,
        color: 'var(--mc-quiz-text-soft)',
        fontFamily: "'Nunito', sans-serif",
        letterSpacing: '0.05em',
    } as const;

    if (prompt.display === 'word') {
        return <div style={{ ...wordStyle, padding: '12px 0 4px' }}>{prompt.text}</div>;
    }
    if (prompt.display === 'emoji') {
        return <div style={{ fontSize: 76, lineHeight: 1.15, padding: '6px 0 2px' }}>{prompt.emoji}</div>;
    }
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 0 2px' }}>
            <span style={{ fontSize: 56, lineHeight: 1.1 }}>{prompt.emoji}</span>
            <span style={{ ...wordStyle, display: 'inline-flex', alignItems: 'center' }}>
                {prompt.before}
                <span style={{
                    display: 'inline-flex',
                    width: 44,
                    height: 56,
                    margin: '0 4px',
                    borderRadius: 12,
                    background: 'rgba(255,255,255,0.08)',
                    border: '2px dashed rgba(255,255,255,0.35)',
                }} />
                {prompt.after}
            </span>
        </div>
    );
}

const CHOICE_FONT = { emoji: 40, word: 26, letter: 34 } as const;

export function ChoicePanel({ question, feedback, deadChoices, locked, onPick }: ChoicePanelProps) {
    const reducedMotion = useReducedMotion();

    // Snake is played on the keyboard — keys 1-4 answer without reaching for
    // the mouse. Guarding here mirrors the tap path; onPick re-guards anyway.
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const index = parseInt(e.key, 10) - 1;
            if (index >= 0 && index < 4) onPick(index);
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onPick]);

    const solved = feedback === 'correct' || feedback === 'found';

    return (
        <>
            <Prompt question={question} />

            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                width: '100%',
                maxWidth: 300,
                marginTop: 6,
            }}>
                {question.choices.map((choice, index) => {
                    const dead = deadChoices.includes(index);
                    const revealed = solved && index === question.correctIndex;
                    return (
                        <motion.button
                            key={`${question.wordId}-${index}`}
                            whileTap={dead || locked || solved ? undefined : { scale: 0.92 }}
                            animate={dead && !reducedMotion ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                            transition={{ duration: 0.35 }}
                            onClick={() => onPick(index)}
                            disabled={dead || locked || solved}
                            style={{
                                position: 'relative',
                                minHeight: 72,
                                borderRadius: 16,
                                border: revealed
                                    ? '2px solid var(--mc-quiz-correct)'
                                    : dead
                                        ? '2px solid rgba(239,68,68,0.55)'
                                        : '2px solid rgba(148,163,184,0.35)',
                                background: revealed
                                    ? 'rgba(74,222,128,0.28)'
                                    : dead
                                        ? 'rgba(239,68,68,0.12)'
                                        : 'rgba(255,255,255,0.07)',
                                opacity: dead ? 0.45 : 1,
                                color: 'var(--mc-quiz-text)',
                                fontSize: CHOICE_FONT[choice.render],
                                fontWeight: 800,
                                fontFamily: "'Nunito', sans-serif",
                                letterSpacing: choice.render === 'word' ? '0.04em' : undefined,
                                cursor: dead || locked || solved ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                lineHeight: 1.15,
                                padding: '8px 6px',
                            }}
                        >
                            {choice.label}
                            {dead && (
                                <span style={{
                                    position: 'absolute',
                                    top: 4,
                                    right: 8,
                                    fontSize: 13,
                                    color: 'var(--mc-quiz-wrong)',
                                }}>
                                    ✗
                                </span>
                            )}
                        </motion.button>
                    );
                })}
            </div>
        </>
    );
}
