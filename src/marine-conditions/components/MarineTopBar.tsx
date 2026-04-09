import React from 'react';
import type { ActivityProfile } from '../types';

interface Props {
    activity: ActivityProfile;
    onActivityChange: (a: ActivityProfile) => void;
    onBack: () => void;
    onGuide: () => void;
    onDebug?: () => void;
    locationName: string;
}

export const MarineTopBar: React.FC<Props> = ({
    activity, onActivityChange, onBack, onGuide, onDebug, locationName,
}) => {
    return (
        <div
            className="marine-topbar"
            data-testid="marine-topbar"
            style={{
                height: 56,
                display: 'flex',
                alignItems: 'center',
                padding: '0 20px',
                gap: 16,
                flexShrink: 0,
            }}
        >
            {/* Back */}
            <button
                data-testid="marine-back-btn"
                onClick={onBack}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--mc-text-muted)',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '4px 8px 4px 2px',
                    borderRadius: 6,
                    transition: 'color 150ms',
                    fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--mc-text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--mc-text-muted)')}
            >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M10 3L5 8L10 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Back
            </button>

            {/* Title + location */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'var(--mc-text)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                }}>
                    <span style={{ color: 'var(--mc-cyan)', fontSize: 16 }}>⚓</span>
                    Marine Conditions
                    <span style={{
                        fontSize: 11,
                        color: 'var(--mc-text-dim)',
                        fontWeight: 500,
                        letterSpacing: '0.06em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}>
                        — {locationName}
                    </span>
                </div>
            </div>

            {/* Activity Switcher */}
            <ActivitySwitcher activity={activity} onChange={onActivityChange} />

            {/* Guide / Help */}
            <button
                data-testid="marine-guide-btn"
                onClick={onGuide}
                style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '1px solid var(--mc-border-bright)',
                    background: 'transparent',
                    color: 'var(--mc-cyan)',
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 150ms, box-shadow 150ms',
                    flexShrink: 0,
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.background = 'var(--mc-cyan-glow)';
                    e.currentTarget.style.boxShadow = '0 0 10px var(--mc-cyan-glow)';
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.boxShadow = 'none';
                }}
                title="Diver's Guide"
            >
                ?
            </button>

            {/* Debug Panel — dev only */}
            {onDebug && (
                <button
                    data-testid="marine-debug-btn"
                    onClick={onDebug}
                    style={{
                        width: 32,
                        height: 32,
                        borderRadius: '50%',
                        border: '1px solid rgba(255,185,95,0.4)',
                        background: 'transparent',
                        color: 'rgba(255,185,95,0.85)',
                        cursor: 'pointer',
                        fontSize: 14,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'background 150ms, box-shadow 150ms',
                        flexShrink: 0,
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255,185,95,0.12)';
                        e.currentTarget.style.boxShadow = '0 0 10px rgba(255,185,95,0.2)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.boxShadow = 'none';
                    }}
                    title="Data Verification (Debug)"
                >
                    🔬
                </button>
            )}
        </div>
    );
};

// ── Inline ActivitySwitcher (also exported for standalone use + tests) ────────

interface SwitcherProps {
    activity: ActivityProfile;
    onChange: (a: ActivityProfile) => void;
}

export const ActivitySwitcher: React.FC<SwitcherProps> = ({ activity, onChange }) => (
    <div className="marine-pill" data-testid="activity-switcher">
        <button
            className={`marine-pill-tab ${activity === 'diving' ? 'active' : ''}`}
            onClick={() => onChange('diving')}
            data-testid="activity-diving"
        >
            🤿 Diving
        </button>
        <button
            className={`marine-pill-tab locked`}
            data-testid="activity-surfing"
            disabled
            title="Surfing mode coming soon"
        >
            🏄 Surfing
        </button>
    </div>
);
