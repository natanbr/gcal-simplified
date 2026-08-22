// ============================================================
// Blocks Game — Rescue Quiz Layer
// A pure positioning shell for the engine-driven QuizOverlay
// shown while the golden-shape unlock quiz is active: it lifts
// the quiz above the tray/rescue slot and outsets it 12px past
// the board. The dim + blur belong to QuizOverlay itself, which
// fills this shell via `position: absolute; inset: 0` — do not
// re-add a second backdrop here (two stacked backdrop-filters
// cost two blur passes for one visible result).
// Extracted from BlocksCanvas to keep it inside its size ratchet.
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
        <div style={{ position: 'absolute', inset: -12, zIndex: 1000 }}>
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
    );
}
