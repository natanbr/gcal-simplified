import React from 'react';
import type { MarineConditionsSnapshot } from '../types';

interface Props {
    snapshot: MarineConditionsSnapshot;
    isLoading: boolean;
    stationName?: string;
    isSuspect?: boolean;
}

export const ConditionsPanel: React.FC<Props> = ({ snapshot, isLoading, stationName, isSuspect }) => {
    return (
        <div
            data-testid="conditions-panel"
            style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}
        >
            <div className="marine-section-label">Conditions Now</div>

            {stationName && (
                <div style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--mc-text-dim)',
                    marginBottom: 12,
                }}>
                    {stationName}
                </div>
            )}

            {isSuspect && (
                <div style={{
                    background: 'rgba(255,185,95,0.1)',
                    border: '1px solid rgba(255,185,95,0.3)',
                    borderRadius: 8,
                    padding: '6px 10px',
                    marginBottom: 12,
                    fontSize: 11,
                    color: 'var(--mc-caution)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                }}>
                    ⚠ Station data may be stale
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <ConditionCard
                    label="Swell"
                    icon="🌊"
                    value={snapshot.swellHeight != null ? `${snapshot.swellHeight.toFixed(1)}m` : '—'}
                    sub={snapshot.swellPeriod != null ? `${snapshot.swellPeriod.toFixed(0)}s period` : undefined}
                    sub2={snapshot.swellDirection}
                    isLoading={isLoading}
                />
                <ConditionCard
                    label="Water Temp"
                    icon="🌡"
                    value={snapshot.waterTemp != null ? `${snapshot.waterTemp.toFixed(1)}°C` : '—'}
                    isLoading={isLoading}
                />
                <ConditionCard
                    label="Wind"
                    icon="💨"
                    value={snapshot.windSpeed != null ? `${Math.round(snapshot.windSpeed)}kn` : '—'}
                    sub={snapshot.windGust != null ? `Gusts ${Math.round(snapshot.windGust)}kn` : undefined}
                    sub2={snapshot.windDirection}
                    isLoading={isLoading}
                />
                <ConditionCard
                    label="Water Viz (est.)"
                    icon="👁"
                    value={
                        snapshot.visibilityEst != null
                            ? snapshot.visibilityEst >= 1000
                                ? `${(snapshot.visibilityEst / 1000).toFixed(1)}km underwater`
                                : `${Math.round(snapshot.visibilityEst)}m underwater`
                            : '—'
                    }
                    quality={snapshot.visibilityQuality}
                    isLoading={isLoading}
                />
            </div>
        </div>
    );
};

// ── Sub-component ─────────────────────────────────────────────────────────────

interface CardProps {
    label: string;
    icon: string;
    value: string;
    sub?: string;
    sub2?: string;
    quality?: 'GOOD' | 'FAIR' | 'POOR';
    isLoading: boolean;
}

const qualityColor: Record<string, string> = {
    GOOD: 'var(--mc-good)',
    FAIR: 'var(--mc-caution)',
    POOR: 'var(--mc-danger)',
};

const ConditionCard: React.FC<CardProps> = ({ label, icon, value, sub, sub2, quality, isLoading }) => (
    <div
        className="marine-card"
        style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}
    >
        <div style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--mc-text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
                {label}
            </div>
            {isLoading ? (
                <div style={{ height: 18, width: 60, background: 'rgba(255,255,255,0.07)', borderRadius: 4 }} />
            ) : (
                <>
                    <div
                        className="marine-data"
                        style={{
                            fontSize: 18,
                            fontWeight: 700,
                            color: quality ? qualityColor[quality] : 'var(--mc-text)',
                            lineHeight: 1.1,
                        }}
                    >
                        {value}
                    </div>
                    {(sub || sub2) && (
                        <div style={{ fontSize: 10, color: 'var(--mc-text-muted)', marginTop: 2 }}>
                            {[sub, sub2].filter(Boolean).join(' · ')}
                        </div>
                    )}
                    {quality && (
                        <div className={`marine-quality-${quality.toLowerCase()}`} style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', marginTop: 2 }}>
                            {quality}
                        </div>
                    )}
                </>
            )}
        </div>
    </div>
);
