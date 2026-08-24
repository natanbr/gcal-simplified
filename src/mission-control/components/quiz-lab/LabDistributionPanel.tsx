// ============================================================
// Quiz Lab — distribution panel (dev only)
// N real draws at one setting. This is the half a single sample
// cannot answer: "am I actually getting enough hard questions?"
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import { useMemo } from 'react';
import { LabBarList } from './LabBarList';
import { DEFAULT_SAMPLE_SIZE, sampleDistribution, type LabFamily } from './labSampling';
import { actionButton, codeText, mutedNote, panel, panelTitle, SERIES } from './labStyles';

interface LabDistributionPanelProps {
    family: LabFamily;
    level: number;
    /** Bumped by the caller to force a fresh draw of the same setting. */
    resampleSeq: number;
    onResample: () => void;
    sampleSize?: number;
}

export function LabDistributionPanel({
    family, level, resampleSeq, onResample, sampleSize = DEFAULT_SAMPLE_SIZE,
}: LabDistributionPanelProps) {
    const distribution = useMemo(
        () => sampleDistribution(family, level, sampleSize),
        // resampleSeq is a deliberate cache-buster: same setting, new draw.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [family, level, sampleSize, resampleSeq],
    );

    return (
        <section style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={panelTitle}>Distribution · {distribution.total} draws</span>
                <button type="button" style={actionButton} onClick={onResample}>🎲 Resample</button>
            </div>

            <div style={panelTitle}>Question mix</div>
            <LabBarList buckets={distribution.skills} total={distribution.total} color={SERIES[0]} />

            <div style={{ ...panelTitle, marginTop: 6 }}>{distribution.detailTitle}</div>
            {distribution.stats && (
                <div style={codeText}>
                    min {distribution.stats.min} · median {distribution.stats.median} · max {distribution.stats.max}
                </div>
            )}
            {distribution.distinctWords !== null && (
                <div style={codeText}>{distribution.distinctWords} distinct words</div>
            )}
            <LabBarList
                buckets={distribution.detail}
                total={distribution.total}
                color={SERIES[1]}
                showShare={family === 'math'}
                limit={family === 'reading' ? 12 : undefined}
            />

            <div style={mutedNote}>
                Drawn straight from the same generator the games call, with no engine in
                between — no level mixing, no mercy rule, no re-queue. This is the raw
                shape of one rung.
            </div>
        </section>
    );
}
