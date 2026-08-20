// ============================================================
// Blocks Game — Rescue Quiz Layer
// The blurred backdrop + engine-driven QuizOverlay shown while
// the golden-shape unlock quiz is active. Extracted from
// BlocksCanvas to keep it inside its size ratchet.
// ⚠️  Internal to src/mission-control/games/blocks/ only.
// ============================================================

import { QuizOverlay } from '../quiz/QuizOverlay';
import type { QuizEngineApi } from '../quiz/types';

interface RescueQuizLayerProps {
    engine: QuizEngineApi;
    onSolved: () => void;
    onCancel: () => void;
}

export function RescueQuizLayer({ engine, onSolved, onCancel }: RescueQuizLayerProps) {
    return (
        <div style={{
            position: 'absolute',
            inset: -12,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 28,
        }}>
            <div style={{ width: 420 }}>
                <QuizOverlay
                    open={true}
                    requiredCorrect={1}
                    currentCorrect={0}
                    generator={engine.generator}
                    onAnswered={engine.onAnswered}
                    onClosed={engine.notifyQuizClosed}
                    onCancel={onCancel}
                    onCorrect={onSolved}
                    title="🔓 Solve to Unlock the Golden Shape!"
                />
            </div>
        </div>
    );
}
