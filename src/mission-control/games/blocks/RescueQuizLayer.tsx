// ============================================================
// Blocks Game — Rescue Quiz Layer
// A positioning shell + instant dim for the engine-driven
// QuizOverlay shown while the golden-shape unlock quiz is active:
// it lifts the quiz above the tray/rescue slot and outsets it
// 12px past the board.
//
// The `background` here is load-bearing, NOT a duplicate backdrop.
// QuizOverlay returns null until a passive effect generates its
// question, and then fades its own backdrop in from opacity 0 over
// ~300ms — so without this static fill the first painted frames
// after `rescueQuizActive` flips show the full-colour board through
// the incoming quiz card. This plain rgba fill is free and covers
// frame 0; the child's dim + single 4px blur ride on top of it
// (resting dim composites to ~0.95, matching the victory/game-over
// modals in BlocksGameOverlay).
//
// Never add `backdropFilter` here — two stacked backdrop-filters
// cost two blur passes for one visible result, which is what
// 052ba98 removed. Guarded by RescueQuizLayer.test.tsx.
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
        <div style={{
            position: 'absolute',
            inset: -12,
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.6)',
        }}>
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
