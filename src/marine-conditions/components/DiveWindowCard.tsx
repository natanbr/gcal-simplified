import React from 'react';
import { format } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import type { DiveWindow } from '../types';

interface Props {
    window: DiveWindow;
    onSelect?: (w: DiveWindow) => void;
}

function scoreColor(score: number): string {
    if (score >= 70) return 'var(--mc-good)';
    if (score >= 40) return 'var(--mc-caution)';
    return 'var(--mc-danger)';
}

function scoreLabel(score: number): string {
    if (score >= 70) return 'GOOD';
    if (score >= 40) return 'FAIR';
    return 'POOR';
}

function scoreExplain(w: DiveWindow): string {
    const lines: string[] = [];

    // Current
    if (w.currentSpeed < 0.2) lines.push('⚡ Minimal current');
    else if (w.currentSpeed < 0.5) lines.push('⚡ Low current');
    else lines.push('⚡ Moderate current');

    // Tide
    if (w.isHighTide) lines.push('🌊 High tide (best visibility)');
    else lines.push('🌊 Low tide');

    // Daylight
    if (!w.isDaylight) lines.push('🌙 Before sunrise / after sunset');

    return lines.join('  ·  ');
}

/**
 * Humanizes a duration in minutes:
 * 45  min  → "45 min window"
 * 60  min  → "1h window"
 * 90  min  → "1h 30min window"
 * 120 min  → "2h window"
 */
function formatDuration(mins: number): string {
    if (mins < 60) return `${mins} min window`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h window` : `${h}h ${m}min window`;
}

export const DiveWindowCard: React.FC<Props> = ({ window: w, onSelect }) => {
    const slackDate   = parseSafe(w.slackTime);
    const startDate   = parseSafe(w.windowStart);
    const endDate     = parseSafe(w.windowEnd);
    const isOptimal   = w.isHighTide && w.isDaylight;
    const score       = w.activityScore.diving;
    const label       = scoreLabel(score);
    const color       = scoreColor(score);

    return (
        <div
            data-testid="dive-window-card"
            className={`marine-card p-4 ${isOptimal ? 'marine-window-optimal' : ''}`}
            style={{ marginBottom: 10 }}
        >
            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--mc-text)' }}>
                            {format(slackDate, 'EEE, MMM d')}
                        </span>

                        {w.isHighTide ? (
                            <span className="marine-badge marine-badge-high">High Tide</span>
                        ) : (
                            <span className="marine-badge marine-badge-low">Low Tide</span>
                        )}
                        {!w.isDaylight && (
                            <span style={{ fontSize: 9, color: 'var(--mc-text-dim)' }}>🌙</span>
                        )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mc-text-muted)' }}>
                        Tide: {w.tideHeight.toFixed(1)}m
                    </div>
                </div>

                {/* Time range */}
                <div style={{ textAlign: 'right' }}>
                    <div
                        className="marine-data"
                        style={{ fontSize: 18, fontWeight: 700, color: 'var(--mc-text)', lineHeight: 1 }}
                    >
                        {format(startDate, 'HH:mm')}–{format(endDate, 'HH:mm')}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--mc-text-muted)', marginTop: 2 }}>
                        {formatDuration(w.duration)}
                    </div>
                </div>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                <Stat label="Current at slack" value={`${w.currentSpeed.toFixed(1)} kn`} color="var(--mc-teal)" />
                <Stat label="Slack at" value={format(slackDate, 'HH:mm')} />
            </div>

            {/* Quality bar + label */}
            <div style={{ marginBottom: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                    <span style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--mc-text-dim)',
                    }}>
                        Dive Quality
                    </span>
                    <span style={{ fontSize: 12, fontWeight: 800, color, letterSpacing: '0.06em' }}>
                        {label}
                    </span>
                </div>
                <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%',
                        width: `${score}%`,
                        background: color,
                        borderRadius: 99,
                        transition: 'width 0.4s ease',
                    }} />
                </div>
            </div>

            {/* Factors breakdown + See more */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(255,255,255,0.05)',
                paddingTop: 8,
                marginTop: 4,
            }}>
                <div style={{ fontSize: 10, color: 'var(--mc-text-dim)', lineHeight: 1.5, flex: 1 }}>
                    {scoreExplain(w)}
                </div>
                {onSelect && (
                    <button
                        data-testid="dive-window-see-more"
                        onClick={() => onSelect(w)}
                        style={{
                            marginLeft: 10,
                            padding: '3px 8px',
                            background: 'transparent',
                            border: '1px solid var(--mc-border-bright)',
                            borderRadius: 6,
                            color: 'var(--mc-cyan)',
                            fontSize: 10,
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            letterSpacing: '0.04em',
                            transition: 'background 150ms',
                            flexShrink: 0,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mc-cyan-glow)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                        See more →
                    </button>
                )}
            </div>
        </div>
    );
};

const Stat: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
    <div style={{
        background: 'rgba(255,255,255,0.03)',
        borderRadius: 8,
        padding: '6px 8px',
    }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)', marginBottom: 2 }}>
            {label}
        </div>
        <div className="marine-data" style={{ fontSize: 13, fontWeight: 700, color: color || 'var(--mc-text)' }}>
            {value}
        </div>
    </div>
);
