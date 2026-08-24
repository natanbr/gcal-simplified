// ============================================================
// Quiz Lab — hand-rolled bar list (dev only)
// Six small bars do not justify a charting library (recharts was
// dropped from package.json for exactly this reason).
// ⚠️  Internal to src/mission-control/ only.
// ============================================================

import type { Bucket } from './labSampling';
import { barFill, barTrack, MONO, mutedNote } from './labStyles';

interface LabBarListProps {
    buckets: Bucket[];
    total: number;
    color: string;
    /** Show each bar's share as a percentage as well as the raw count. */
    showShare?: boolean;
    /** Cap the rows rendered; the remainder is summarised in one line. */
    limit?: number;
    emptyLabel?: string;
}

export function LabBarList({
    buckets, total, color, showShare = true, limit, emptyLabel = 'No samples',
}: LabBarListProps) {
    if (buckets.length === 0) return <div style={mutedNote}>{emptyLabel}</div>;

    const peak = Math.max(...buckets.map(b => b.count), 1);
    const shown = limit ? buckets.slice(0, limit) : buckets;
    const hidden = buckets.length - shown.length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {shown.map(bucket => (
                <div key={bucket.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                        width: 116,
                        flexShrink: 0,
                        fontFamily: MONO,
                        fontSize: 11,
                        color: 'var(--mc-text)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        {bucket.label}
                    </span>
                    <div style={barTrack}>
                        <div style={barFill(bucket.count / peak, color)} />
                    </div>
                    <span style={{ width: 74, flexShrink: 0, textAlign: 'right', fontFamily: MONO, fontSize: 11, color: 'var(--mc-text-muted)' }}>
                        {bucket.count}
                        {showShare && total > 0 && ` · ${Math.round((bucket.count / total) * 100)}%`}
                    </span>
                </div>
            ))}
            {hidden > 0 && (
                <div style={mutedNote}>+ {hidden} more with fewer draws</div>
            )}
        </div>
    );
}
