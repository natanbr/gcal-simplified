// ============================================================
// Quiz Lab — question metadata readout (dev only)
// The attribution the kid never sees: kind, skill, level, wordId.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { QuizQuestion } from '../../games/quiz/types';
import { codeText, MONO, mutedNote } from './labStyles';

interface LabQuestionMetaProps {
    question: QuizQuestion | null;
    /** null until the question is answered once. */
    firstAttempt: boolean | null;
}

function promptSummary(question: QuizQuestion): string {
    if (question.kind === 'numeric') return question.text;
    switch (question.prompt.display) {
        case 'word': return `word "${question.prompt.text}" → pick the picture`;
        case 'emoji': return `${question.prompt.emoji} → pick the word`;
        case 'gap': return `${question.prompt.before}_${question.prompt.after} + ${question.prompt.emoji}`;
    }
}

function rows(question: QuizQuestion): [string, string][] {
    const shared: [string, string][] = [
        ['kind', question.kind],
        ['skill', question.skill],
        ['level', String(question.level)],
        ['prompt', promptSummary(question)],
    ];
    return question.kind === 'numeric'
        ? [...shared, ['answer', String(question.answer)]]
        : [
            ...shared,
            ['wordId', question.wordId],
            ['answer', question.choices[question.correctIndex]?.label ?? '—'],
            ['choices', question.choices.map(c => c.label).join(' · ')],
        ];
}

export function LabQuestionMeta({ question, firstAttempt }: LabQuestionMetaProps) {
    if (!question) return <div style={mutedNote}>Drawing a question…</div>;

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: 'auto 1fr',
            gap: '4px 12px',
            padding: 12,
            borderRadius: 12,
            background: 'var(--mc-bg)',
            border: '1px solid var(--mc-border)',
        }}>
            {rows(question).map(([label, value]) => (
                <div key={label} style={{ display: 'contents' }}>
                    <span style={{ ...mutedNote, fontFamily: MONO }}>{label}</span>
                    <span style={{ ...codeText, wordBreak: 'break-word' }}>{value}</span>
                </div>
            ))}
            <span style={{ ...mutedNote, fontFamily: MONO }}>attempt</span>
            <span style={codeText}>
                {firstAttempt === null
                    ? 'unanswered'
                    : firstAttempt ? 'first try ✅ (would count)' : 'first try ❌ (would not count)'}
            </span>
        </div>
    );
}
