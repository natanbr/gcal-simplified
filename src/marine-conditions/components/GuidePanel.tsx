import React from 'react';
import type { ActivityProfile } from '../types';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    activity?: ActivityProfile;
}

export const GuidePanel: React.FC<Props> = ({ isOpen, onClose, activity = 'diving' }) => {
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                className="marine-guide-overlay"
                data-testid="guide-overlay"
                onClick={onClose}
            />

            {/* Panel */}
            <div className="marine-guide-panel" data-testid="guide-panel">
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mc-cyan)', marginBottom: 4 }}>
                            {activity === 'spearfishing' ? "Spearfisher's Reference" : "Diver's Reference"}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--mc-text)' }}>
                            Quick Guide
                        </div>
                    </div>
                    <button
                        data-testid="guide-close-btn"
                        onClick={onClose}
                        style={{
                            width: 32, height: 32,
                            borderRadius: '50%',
                            border: '1px solid var(--mc-border)',
                            background: 'transparent',
                            color: 'var(--mc-text-muted)',
                            cursor: 'pointer',
                            fontSize: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Sections */}
                <GuideSection
                    emoji="💧"
                    title="Slack Water"
                    color="var(--mc-teal)"
                    items={[
                        'Current speed near 0 kn — optimal entry/exit',
                        'Occurs between Flood and Ebb cycles',
                        'Typically lasts 20–60 minutes depending on location',
                        'High Tide slack = better visibility + more marine life',
                    ]}
                />

                <GuideSection
                    emoji="🌊"
                    title="Tidal Currents"
                    color="var(--mc-amber)"
                    items={[
                        'Max Flood ↑ — current flowing inland, can be strong (>2 kn)',
                        'Max Ebb ↓ — current flowing seaward, equally strong',
                        'Above 1.5 kn is considered challenging for most divers',
                        'Swell height affects entry/exit difficulty at shore sites',
                    ]}
                />

                <GuideSection
                    emoji="👁"
                    title="Visibility"
                    color="var(--mc-blue)"
                    items={[
                        'Estimated from rain, wind, and current data',
                        'Lower current + lower wind = better clarity',
                        'High tide generally brings cleaner, saltier water',
                        'Recent rain can reduce visibility for 24–48h',
                    ]}
                />

                <GuideSection
                    emoji="⚠️"
                    title="Safety Notes"
                    color="var(--mc-danger)"
                    items={[
                        'Always dive with a buddy and surface marker buoy',
                        'Check local Coast Guard notices for vessel traffic',
                        'Conditions are forecasts — always verify on-site',
                        'This app does not replace formal dive training',
                    ]}
                />

                {/* Spearfishing tactical tips — shown only on spearfishing tab */}
                {activity === 'spearfishing' && (
                    <GuideSection
                        emoji="🎯"
                        title="Spearfishing Tactical Tips"
                        color="var(--mc-teal)"
                        items={[
                            "Steep Slope: If current ramps 0→ 3kn within 30 min, your safe window is shorter than 75 min — set a 45 min alarm and exit early.",
                            "Up-Current Entry: Always enter the water swimming into the current. Let it push you back to your exit point — never fight a ripping ebb.",
                            "Post-Rain Delay: After heavy rain (>15mm/24h), wait 24–48h for runoff sediment to clear. Visibility can drop to <2m in bays and river mouths.",
                            "15-Minute Safety Buffer: Set a hard alarm 15 minutes after slack water. When it rings, end your dive regardless of conditions — ramp-up is faster than it looks.",
                        ]}
                    />
                )}

                {/* Data sources note */}
                <div style={{
                    marginTop: 24,
                    padding: '12px',
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--mc-text-dim)',
                    lineHeight: 1.6,
                }}>
                    <strong style={{ color: 'var(--mc-text-muted)' }}>Data:</strong> Canadian Hydrographic Service (CHS) official tide and current tables, supplemented by Open-Meteo marine forecasts.
                </div>
            </div>
        </>
    );
};

// ── Section ───────────────────────────────────────────────────────────────────

const GuideSection: React.FC<{ emoji: string; title: string; color: string; items: string[] }> = ({
    emoji, title, color, items,
}) => (
    <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 16 }}>{emoji}</span>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{title}</div>
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {items.map((item, i) => (
                <li key={i} style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--mc-text-muted)', lineHeight: 1.5 }}>
                    <span style={{ color, flexShrink: 0, marginTop: 1 }}>·</span>
                    {item}
                </li>
            ))}
        </ul>
    </div>
);
