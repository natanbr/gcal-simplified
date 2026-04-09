import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import { parseSafe } from '../utils/dateUtils';
import type { DiveWindow, MarineConditionsSnapshot } from '../types';

interface Props {
    window: DiveWindow | null;
    snapshot: MarineConditionsSnapshot;
    onClose: () => void;
    locationName: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
    if (score >= 70) return 'var(--mc-good)';
    if (score >= 40) return 'var(--mc-caution)';
    return 'var(--mc-danger)';
}
function scoreLabel(score: number) {
    if (score >= 70) return 'GOOD';
    if (score >= 40) return 'FAIR';
    return 'POOR';
}
function windBeaufort(kn: number): string {
    if (kn < 1)  return 'Calm';
    if (kn < 7)  return 'Light breeze';
    if (kn < 14) return 'Gentle–moderate';
    if (kn < 22) return 'Fresh–strong';
    return 'Gale / Storm';
}
function currentRating(kn: number): { label: string; color: string } {
    if (kn < 0.2) return { label: 'Minimal — ideal entry', color: 'var(--mc-good)' };
    if (kn < 0.5) return { label: 'Low — comfortable',    color: 'var(--mc-good)' };
    if (kn < 1.0) return { label: 'Moderate — manageable',color: 'var(--mc-caution)' };
    return         { label: 'Strong — challenging',        color: 'var(--mc-danger)' };
}
function visibilityLabel(m?: number): string {
    if (!m) return '—';
    if (m >= 8000) return `${(m / 1000).toFixed(0)} km — Excellent`;
    if (m >= 5000) return `${(m / 1000).toFixed(1)} km — Good`;
    if (m >= 3000) return `${(m / 1000).toFixed(1)} km — Fair`;
    return `${(m / 1000).toFixed(1)} km — Poor`;
}
function visibilityColor(q?: 'GOOD' | 'FAIR' | 'POOR'): string {
    if (q === 'GOOD') return 'var(--mc-good)';
    if (q === 'FAIR') return 'var(--mc-caution)';
    return 'var(--mc-danger)';
}

// ── component ─────────────────────────────────────────────────────────────────

export const DiveWindowDetailPanel: React.FC<Props> = ({ window: w, snapshot, onClose, locationName }) => {
    // Derived safely — all guarded by the {w && (...)} block below
    const slackDate = parseSafe(w?.slackTime);
    const startDate = parseSafe(w?.windowStart);
    const endDate   = parseSafe(w?.windowEnd);
    const score     = w?.activityScore.diving ?? 0;
    const cr        = currentRating(w?.currentSpeed ?? 0);

    return (
        <AnimatePresence>
            {w && (
                <>
                    {/* Animated Backdrop */}
                    <motion.div
                        key="detail-backdrop"
                        className="marine-guide-overlay"
                        data-testid="detail-overlay"
                        onClick={onClose}
                        style={{ zIndex: 210 }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />

                    {/* Animated Panel — centered modal */}
                    <motion.div
                        key="detail-panel"
                        className="marine-detail-modal"
                        data-testid="dive-detail-panel"
                        initial={{ opacity: 0, scale: 0.94, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: 8 }}
                        transition={{ type: 'spring', damping: 30, stiffness: 380, mass: 0.7 }}
                    >
                {/* ── Header ─────────────────────────────────────────────────── */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--mc-cyan)', marginBottom: 4 }}>
                            Dive Window Details
                        </div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--mc-text)', fontFamily: 'Space Grotesk, monospace' }}>
                            {format(startDate, 'HH:mm')} – {format(endDate, 'HH:mm')}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--mc-text-muted)', marginTop: 2 }}>
                            {format(slackDate, 'EEEE, MMM d')} · {locationName}
                        </div>
                    </div>
                    <button
                        data-testid="detail-close-btn"
                        onClick={onClose}
                        style={{
                            width: 32, height: 32, borderRadius: '50%',
                            border: '1px solid var(--mc-border)',
                            background: 'transparent',
                            color: 'var(--mc-text-muted)',
                            cursor: 'pointer', fontSize: 18,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                        }}
                    >✕</button>
                </div>

                {/* ── Dive Quality Score ─────────────────────────────────────── */}
                <div className="marine-card p-4" style={{ marginBottom: 16, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--mc-text-dim)' }}>
                            Dive Quality
                        </span>
                        <span style={{ fontSize: 16, fontWeight: 800, color: scoreColor(score), letterSpacing: '0.06em' }}>
                            {scoreLabel(score)}
                        </span>
                    </div>
                    <div style={{ height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                        <div style={{ height: '100%', width: `${score}%`, background: scoreColor(score), borderRadius: 99, transition: 'width 0.5s ease' }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.6 }}>
                        Score {score}/100 — based on current speed and tide position at peak slack.
                        Higher high tide + lower current = better visibility and marine life activity.
                    </div>
                </div>

                {/* ── Timing ─────────────────────────────────────────────────── */}
                <DetailSection emoji="⏱" title="Timing" color="var(--mc-cyan)">
                    <DetailRow label="Window"        value={`${format(startDate, 'HH:mm')} – ${format(endDate, 'HH:mm')}`} mono />
                    <DetailRow label="Slack peak at" value={format(slackDate, 'HH:mm')}   mono />
                    <DetailRow label="Duration"      value={`${w.duration} min`}            mono />
                    <DetailRow label="Daylight"      value={w.isDaylight ? '✅ Yes' : '🌙 No (night)'} color={w.isDaylight ? 'var(--mc-good)' : 'var(--mc-text-dim)'} />
                </DetailSection>

                {/* ── Tidal Current ──────────────────────────────────────────── */}
                <DetailSection emoji="⚡" title="Tidal Current" color="var(--mc-teal)">
                    <DetailRow label="Speed at slack" value={`${w.currentSpeed.toFixed(2)} kn`} mono />
                    <DetailRow label="Assessment"     value={cr.label} color={cr.color} />
                    <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.5 }}>
                        Entry / exit recommended between <strong style={{ color: 'var(--mc-text-muted)' }}>{format(startDate, 'HH:mm')}</strong> and <strong style={{ color: 'var(--mc-text-muted)' }}>{format(endDate, 'HH:mm')}</strong> while speed stays below 0.5 kn.
                    </div>
                </DetailSection>

                {/* ── Tide ───────────────────────────────────────────────────── */}
                <DetailSection emoji="🌊" title="Tide" color="var(--mc-blue)">
                    <DetailRow label="Height at slack" value={`${w.tideHeight.toFixed(2)} m`}     mono />
                    <DetailRow label="Type"            value={w.isHighTide ? 'High Tide' : 'Low Tide'} color={w.isHighTide ? 'var(--mc-blue)' : 'var(--mc-teal)'} />
                    {w.isHighTide && (
                        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mc-good)', lineHeight: 1.5 }}>
                            ✅ High tide slack — cleaner, saltier water inflow typically improves underwater visibility.
                        </div>
                    )}
                </DetailSection>

                {/* ── Swell ──────────────────────────────────────────────────── */}
                <DetailSection emoji="〰️" title="Swell" color="var(--mc-amber)">
                    {snapshot.swellHeight != null ? (
                        <>
                            <DetailRow label="Height" value={`${snapshot.swellHeight.toFixed(1)} m`} mono />
                            {snapshot.swellPeriod  ? <DetailRow label="Period" value={`${snapshot.swellPeriod.toFixed(0)} s`} mono /> : null}
                            {snapshot.swellDirection ? <DetailRow label="Direction" value={snapshot.swellDirection} /> : null}
                            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.5 }}>
                                {snapshot.swellHeight < 0.6
                                    ? '✅ Calm swell — easy entry/exit at most sites.'
                                    : snapshot.swellHeight < 1.2
                                    ? '⚠️ Moderate swell — check shore conditions before entry.'
                                    : '⚠️ Significant swell — shore entry may be difficult or unsafe.'
                                }
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--mc-text-dim)' }}>No swell data available for this window.</div>
                    )}
                </DetailSection>

                {/* ── Wind ───────────────────────────────────────────────────── */}
                <DetailSection emoji="💨" title="Wind" color="var(--mc-coral)">
                    {snapshot.windSpeed != null ? (
                        <>
                            <DetailRow label="Speed"     value={`${snapshot.windSpeed.toFixed(1)} kn`} mono />
                            {snapshot.windGust     ? <DetailRow label="Gusts"     value={`${snapshot.windGust.toFixed(1)} kn`} mono /> : null}
                            {snapshot.windDirection ? <DetailRow label="Direction" value={snapshot.windDirection} /> : null}
                            <DetailRow label="Conditions" value={windBeaufort(snapshot.windSpeed)} color={snapshot.windSpeed < 14 ? 'var(--mc-good)' : 'var(--mc-caution)'} />
                        </>
                    ) : (
                        <div style={{ fontSize: 12, color: 'var(--mc-text-dim)' }}>Wind data unavailable.</div>
                    )}
                </DetailSection>

                {/* ── Visibility ─────────────────────────────────────────────── */}
                <DetailSection emoji="👁" title="Underwater Visibility (est.)" color="var(--mc-blue)">
                    <DetailRow
                        label="Estimate"
                        value={visibilityLabel(snapshot.visibilityEst)}
                        color={visibilityColor(snapshot.visibilityQuality)}
                    />
                    {snapshot.waterTemp != null && (
                        <DetailRow label="Water Temp" value={`${snapshot.waterTemp.toFixed(1)} °C`} mono />
                    )}
                    {snapshot.airTempC != null && (
                        <DetailRow label="Air Temp" value={`${snapshot.airTempC.toFixed(1)} °C`} mono />
                    )}
                    {snapshot.airFeelsLikeC != null && snapshot.airTempC !== snapshot.airFeelsLikeC && (
                        <DetailRow
                            label="Feels like"
                            value={`${snapshot.airFeelsLikeC.toFixed(1)} °C`}
                            mono
                            color={snapshot.airFeelsLikeC < 5 ? 'var(--mc-coral)' : snapshot.airFeelsLikeC < 10 ? 'var(--mc-amber)' : undefined}
                        />
                    )}
                    <div style={{ marginTop: 6, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.5 }}>
                        In-water visibility estimated from wind speed and swell height — not surface/atmospheric visibility.
                        Actual underwater visibility depends on recent rain, plankton blooms, and site conditions.
                        {!w.isDaylight && (
                            <span style={{ color: 'var(--mc-danger)' }}> Night diving — visibility effectively zero without a dive light.</span>
                        )}
                    </div>
                </DetailSection>

                {/* ── Score breakdown ────────────────────────────────────────── */}
                <DetailSection emoji="🎯" title="Score Breakdown" color="var(--mc-text-muted)">
                    <div style={{ fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Current speed component</span>
                            <span style={{ fontFamily: 'Space Grotesk, monospace', color: 'var(--mc-text)' }}>
                                {Math.round(Math.max(0, 50 - (w.currentSpeed / 0.5) * 50))}/50
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Tide height component</span>
                            <span style={{ fontFamily: 'Space Grotesk, monospace', color: 'var(--mc-text)' }}>
                                ~{Math.round(score - Math.max(0, 50 - (w.currentSpeed / 0.5) * 50))}/50
                            </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 4, paddingTop: 4 }}>
                            <strong style={{ color: 'var(--mc-text-muted)' }}>Total</strong>
                            <span style={{ fontFamily: 'Space Grotesk, monospace', fontWeight: 700, color: scoreColor(score) }}>{score}/100</span>
                        </div>
                    </div>
                </DetailSection>

                        {/* Safety footer */}
                        <div style={{ marginTop: 20, padding: '10px 12px', background: 'rgba(255,180,171,0.06)', border: '1px solid rgba(255,180,171,0.15)', borderRadius: 8, fontSize: 11, color: 'var(--mc-text-dim)', lineHeight: 1.6 }}>
                            ⚠️ Conditions are model forecasts. Always verify on-site. Dive within your training and experience.
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

// ── Sub-components ─────────────────────────────────────────────────────────────

const DetailSection: React.FC<{ emoji: string; title: string; color: string; children: React.ReactNode }> = ({
    emoji, title, color, children,
}) => (
    <div style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>{emoji}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color, letterSpacing: '0.04em' }}>{title}</span>
        </div>
        <div style={{ paddingLeft: 6 }}>{children}</div>
    </div>
);

const DetailRow: React.FC<{ label: string; value: string; color?: string; mono?: boolean }> = ({
    label, value, color, mono,
}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5, fontSize: 12 }}>
        <span style={{ color: 'var(--mc-text-dim)' }}>{label}</span>
        <span style={{
            color: color || 'var(--mc-text)',
            fontFamily: mono ? 'Space Grotesk, monospace' : 'Inter, system-ui',
            fontWeight: mono ? 600 : 500,
        }}>{value}</span>
    </div>
);
