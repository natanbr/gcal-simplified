// ============================================================
// Quiz Lab — live sample panel (dev only)
// Renders the REAL QuizOverlay so the feel is honest: same tap
// targets, same wrong-tap freeze, same feedback dwell. Nothing is
// re-implemented for the lab.
//
// Remount-by-key is load-bearing: QuizOverlay only regenerates when
// `${currentCorrect}:${questionSeq}` changes, so a fresh generator
// reference alone would silently show the same question. Reroll and
// every setting change therefore change the key.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useCallback, useEffect, useState } from 'react';
import { QuizOverlay } from '../../games/quiz/QuizOverlay';
import type { QuizQuestion } from '../../games/quiz/types';
import { generateLabQuestion, type LabFamily } from './labSampling';
import { LabQuestionMeta } from './LabQuestionMeta';
import { actionButton, mutedNote, panel, panelTitle } from './labStyles';

/** Matches the games' revive quiz, so the progress dots read the same. */
const REQUIRED_CORRECT = 3;

interface LabSamplePanelProps {
    family: LabFamily;
    level: number;
}

export function LabSamplePanel({ family, level }: LabSamplePanelProps) {
    const [rerollSeq, setRerollSeq] = useState(0);
    const [currentCorrect, setCurrentCorrect] = useState(0);
    const [question, setQuestion] = useState<QuizQuestion | null>(null);
    const [firstAttempt, setFirstAttempt] = useState<boolean | null>(null);

    // A setting change restarts the dot cycle rather than inheriting it.
    useEffect(() => { setCurrentCorrect(0); }, [family, level]);

    // The lab's only window onto the question: QuizOverlay builds it inside its
    // own effect, so the wrapper captures it on the way past.
    const generator = useCallback(() => {
        const next = generateLabQuestion(family, level);
        setQuestion(next);
        setFirstAttempt(null);
        return next;
    }, [family, level]);

    const handleCorrect = useCallback(
        () => setCurrentCorrect(done => (done + 1) % REQUIRED_CORRECT),
        [],
    );

    // Recording only — the lab never touches the store, so no answer here can
    // reach the child's real skillProgress.
    const handleAnswered = useCallback(
        (_question: QuizQuestion, wasFirstTry: boolean) => setFirstAttempt(wasFirstTry),
        [],
    );

    const reroll = useCallback(() => {
        setCurrentCorrect(0);
        setRerollSeq(seq => seq + 1);
    }, []);

    return (
        <section style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={panelTitle}>Live sample</span>
                <button type="button" style={actionButton} onClick={reroll}>🔄 Reroll</button>
            </div>

            <div style={{
                position: 'relative',
                minHeight: 460,
                borderRadius: 18,
                overflow: 'hidden',
                background: 'var(--mc-quiz-surface-lo)',
                border: '1px solid var(--mc-border)',
            }}>
                <QuizOverlay
                    key={`${family}:${level}:${rerollSeq}`}
                    open
                    requiredCorrect={REQUIRED_CORRECT}
                    currentCorrect={currentCorrect}
                    generator={generator}
                    onCorrect={handleCorrect}
                    onAnswered={handleAnswered}
                    title={`${family === 'math' ? 'Math' : 'Reading'} · level ${level}`}
                />
            </div>

            <LabQuestionMeta question={question} firstAttempt={firstAttempt} />

            <div style={mutedNote}>
                The real overlay, answered for real — but with no store behind it. Nothing
                here is recorded, and no reading level moves.
            </div>
        </section>
    );
}
