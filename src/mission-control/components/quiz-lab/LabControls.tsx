// ============================================================
// Quiz Lab — family + level picker (dev only)
// Reading L0–L6, math L0–L3; the ranges come from labSampling so
// adding a rung to a ladder does not need an edit here.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { LAB_FAMILIES, levelsFor, type LabFamily } from './labSampling';
import { chip, mutedNote, panel, panelTitle } from './labStyles';

interface LabControlsProps {
    family: LabFamily;
    level: number;
    onFamilyChange: (family: LabFamily) => void;
    onLevelChange: (level: number) => void;
}

/**
 * Deliberately vague about what each rung contains: the ladders are the
 * generators, and a hint that restated them would go stale the next time one is
 * rebalanced. The distribution panel is the answer instead.
 */
const LADDER_HINT: Record<LabFamily, string> = {
    reading: 'Seven rungs over three question shapes — the mix below shows which shape this rung serves.',
    math: 'Add / subtract / multiply, mixed per rung by additionQuiz.ts — the mix below shows the current split.',
};

export function LabControls({ family, level, onFamilyChange, onLevelChange }: LabControlsProps) {
    return (
        <section style={{ ...panel, gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span style={panelTitle}>Family</span>
                {LAB_FAMILIES.map(entry => (
                    <button
                        key={entry.id}
                        type="button"
                        aria-pressed={family === entry.id}
                        style={chip(family === entry.id)}
                        onClick={() => onFamilyChange(entry.id)}
                    >
                        {entry.label}
                    </button>
                ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ ...panelTitle, marginRight: 4 }}>Level</span>
                {levelsFor(family).map(candidate => (
                    <button
                        key={candidate}
                        type="button"
                        aria-pressed={level === candidate}
                        aria-label={`Level ${candidate}`}
                        style={chip(level === candidate)}
                        onClick={() => onLevelChange(candidate)}
                    >
                        L{candidate}
                    </button>
                ))}
            </div>

            <div style={mutedNote}>{LADDER_HINT[family]}</div>
        </section>
    );
}
