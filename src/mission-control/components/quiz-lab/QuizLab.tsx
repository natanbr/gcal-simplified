// ============================================================
// Quiz Lab — DEV-ONLY question inspector
// Reached at ?lab=1, gated on import.meta.env.DEV in App.tsx so a
// production build has no route to it at all.
//
// Why it exists: the only way to see a level-3 math question used to
// be surviving six minutes of snake. This plays any question at any
// level on demand, and shows what 200 draws of that setting actually
// look like.
//
// Deliberately store-free — no MCStoreProvider, no scheduler, no
// bridges — so it adds nothing to the always-mounted tree and cannot
// write to the child's real skillProgress.
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useState } from 'react';
import { LabControls } from './LabControls';
import { LabDistributionPanel } from './LabDistributionPanel';
import { LabLevelMapPanel } from './LabLevelMapPanel';
import { LabSamplePanel } from './LabSamplePanel';
import { maxLevelFor, type LabFamily } from './labSampling';
import { mutedNote } from './labStyles';
// The lab renders outside <MissionControl>, so it loads the token sheet itself.
import '../../styles/mc.css';

export function QuizLab() {
    const [family, setFamily] = useState<LabFamily>('reading');
    const [level, setLevel] = useState(0);
    const [resampleSeq, setResampleSeq] = useState(0);

    const selectFamily = (next: LabFamily) => {
        setFamily(next);
        setLevel(current => Math.min(current, maxLevelFor(next)));
    };

    return (
        // .mc-tokens declares the --mc-* properties WITHOUT .mc-root's
        // full-viewport reset, which is what a scrolling page needs.
        <div
            className="mc-tokens"
            style={{
                minHeight: '100vh',
                background: 'var(--mc-bg)',
                color: 'var(--mc-text)',
                fontFamily: "'Nunito', system-ui, sans-serif",
                padding: '28px 32px 56px',
                overflowY: 'auto',
            }}
        >
            <header style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                <h1 style={{ fontSize: 26, fontWeight: 900, margin: 0 }}>🧪 Quiz Lab</h1>
                <span style={{
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: 'var(--mc-amber)',
                    color: 'var(--mc-text)',
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.08em',
                }}>
                    DEV ONLY
                </span>
                <span style={mutedNote}>?lab=1 · never reachable in a production build</span>
            </header>

            <LabControls
                family={family}
                level={level}
                onFamilyChange={selectFamily}
                onLevelChange={setLevel}
            />

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
                gap: 20,
                marginTop: 20,
                alignItems: 'start',
            }}>
                <LabSamplePanel family={family} level={level} />
                <LabDistributionPanel
                    family={family}
                    level={level}
                    resampleSeq={resampleSeq}
                    onResample={() => setResampleSeq(seq => seq + 1)}
                />
                <LabLevelMapPanel highlightLevel={level} dimmed={family === 'reading'} />
            </div>
        </div>
    );
}
