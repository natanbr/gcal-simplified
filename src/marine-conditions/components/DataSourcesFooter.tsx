import React from 'react';
import type { TideData } from '../types';

interface Props {
    tides: TideData | null;
    isError: boolean;
    isSuspect: boolean;
}

/** Returns status based on the details string the backend writes. */
function sourceStatus(details: string): 'ok' | 'warning' | 'error' {
    if (details.startsWith('Warning:') || details.includes('Modeled')) return 'warning';
    return 'ok';
}

const STATUS_CHIP: Record<'ok' | 'warning' | 'error', { label: string; color: string; bg: string }> = {
    ok:      { label: 'OK',      color: 'var(--mc-good)',   bg: 'rgba(78,222,163,0.10)' },
    warning: { label: 'WARN',    color: 'var(--mc-amber)',  bg: 'rgba(255,185,95,0.10)' },
    error:   { label: 'FAILED',  color: 'var(--mc-danger)', bg: 'rgba(255,180,171,0.10)' },
};

const StatusChip: React.FC<{ status: 'ok' | 'warning' | 'error' }> = ({ status }) => {
    const { label, color, bg } = STATUS_CHIP[status];
    return (
        <span style={{
            display: 'inline-block',
            fontSize: 8,
            fontWeight: 800,
            letterSpacing: '0.1em',
            padding: '1px 5px',
            borderRadius: 3,
            background: bg,
            color,
            border: `1px solid ${color}33`,
            marginLeft: 4,
            verticalAlign: 'middle',
        }}>
            {label}
        </span>
    );
};

export const DataSourcesFooter: React.FC<Props> = ({ tides, isError, isSuspect }) => (
    <div
        className="marine-footer"
        data-testid="data-sources-footer"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
    >
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            {isError && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ color: 'var(--mc-text-muted)' }}>Marine data</span>
                    <StatusChip status="error" />
                </span>
            )}

            {!isError && tides?.sources?.map((s, i) => {
                const status = sourceStatus(s.details);
                return (
                    <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                        <span style={{ color: 'var(--mc-text-muted)' }}>{s.name}: </span>
                        <span
                            style={{ fontFamily: 'Space Grotesk, monospace' }}
                            title={status === 'warning' ? s.details : undefined}
                        >
                            {/* On warning, abbreviate the long details text */}
                            {status === 'warning' ? 'Modeled data' : s.details}
                        </span>
                        <StatusChip status={status} />
                    </span>
                );
            })}

            {!isError && (!tides?.sources || tides.sources.length === 0) && (
                <span style={{ color: 'var(--mc-text-dim)' }}>Awaiting data…</span>
            )}
        </div>

        {isSuspect && !isError && (
            <span style={{ color: 'var(--mc-suspect)', marginLeft: 16, whiteSpace: 'nowrap' }}>
                ⚠ Data quality suspect
            </span>
        )}
    </div>
);
